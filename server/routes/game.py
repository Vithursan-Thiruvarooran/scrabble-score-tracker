import asyncio
from typing import List, Optional
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db
from models import ChallengeResponse, GameBase, GameMove, GameOut, GameState
from routes.auth import get_current_user
from services.game_state import build_initial_state, get_game_state
from services.push import send_challenge_notification
from services.redis_cache import evict_state
from services.room import add_active_room, remove_active_room
from sockets import sio, socket_manager
from utils.helpers import is_participant, spawn, validate_object_id
from utils.game_out import games_to_out, build_game_out

router = APIRouter(prefix="/game", dependencies=[Depends(get_current_user)])


@router.post("/create", response_model=GameOut, status_code=201)
async def create_game(payload: GameBase, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])

    if payload.opponent == user_id:
        raise HTTPException(status_code=400, detail="Cannot create a game against yourself.")
    opponent_oid = validate_object_id(payload.opponent, "opponent id")
    db = get_db()
    if not await db.users.find_one({"_id": opponent_oid}):
        raise HTTPException(status_code=404, detail="Opponent not found.")

    sids = socket_manager.get_sids(user_id)
    if not sids:
        raise HTTPException(status_code=400, detail="No active socket connection.")

    initial_state = build_initial_state(
        creator_id=user_id,
        disputes=payload.disputes,
        dispute_timeout=payload.dispute_timeout,
        dictionary=payload.dictionary,
    )
    initial_state_for_db = {k: v for k, v in initial_state.items() if k != "game_moves"}

    result = await db.games.insert_one({
        "opponent": payload.opponent,
        "dictionary": payload.dictionary,
        "board_type": payload.board_type,
        "turn_timer": payload.turn_timer,
        "duration": payload.duration,
        "timeIncrement": payload.timeIncrement,
        "online": payload.online,
        "disputes": payload.disputes,
        "user": user_id,
        "completed": False,
        "winner": None,
        "loser": None,
        "userScore": 0,
        "opponentScore": 0,
        "date": datetime.now(),
        "invitation_status": "pending",
        "game_state": initial_state_for_db,
    })

    game_id = str(result.inserted_id)
    # Save the initial move to db.moves for cold-load reconstruction.
    # Roll back the game document if this fails so the two writes stay in sync.
    initial_move = initial_state["game_moves"][0]
    try:
        await db.moves.insert_one({"game_id": game_id, "user_id": None, **initial_move})
    except Exception:
        await db.games.delete_one({"_id": result.inserted_id})
        raise HTTPException(status_code=500, detail="Failed to initialise game. Please try again.")
    await add_active_room(game_id)

    for sid in sids:
        await sio.enter_room(sid, game_id)
    await sio.emit("game_created", {"room": game_id}, to=sids[0])
    await sio.emit("joined_game", {"sid": sids[0], "room": game_id}, to=sids[0])

    # Notify opponent in real-time if online, and via push if subscribed
    opponent_sids = socket_manager.get_sids(payload.opponent)
    creator_name = current_user.get("firstname") or current_user.get("email", "Someone")
    if opponent_sids:
        await sio.emit(
            "game_challenge",
            {"game_id": game_id, "challenger_name": creator_name},
            to=opponent_sids[0],
        )
    spawn(send_challenge_notification(payload.opponent, game_id, creator_name))

    game_doc = await db.games.find_one({"_id": result.inserted_id})
    results = await games_to_out([game_doc], db)
    return results[0]


@router.get("/mine", response_model=List[GameOut])
async def get_my_games(
    completed: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    current_user=Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    db = get_db()
    query: dict = {"$or": [{"user": user_id}, {"opponent": user_id}]}
    if completed is not None:
        query["completed"] = completed
    games = await db.games.find(query).sort("date", -1).skip(skip).limit(limit).to_list(length=limit)
    return await games_to_out(games, db)


@router.get("/user/{user_id}", response_model=List[GameOut])
async def get_games_by_user(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    validate_object_id(user_id, "user id")
    db = get_db()
    query = {"$or": [{"user": user_id}, {"opponent": user_id}]}
    games = await db.games.find(query).sort("date", -1).skip(skip).limit(limit).to_list(length=limit)
    return await games_to_out(games, db)


@router.get("/{game_id}/state", response_model=GameState)
async def get_game_state_route(game_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    oid = validate_object_id(game_id, "game id")
    game = await db.games.find_one({"_id": oid})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    if not is_participant(game, user_id):
        raise HTTPException(status_code=403, detail="You are not a participant in this game.")
    state = await get_game_state(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game state not found.")
    return GameState(game_id=game_id, **state)


@router.get("/{game_id}/moves", response_model=List[GameMove])
async def get_game_moves(game_id: str, current_user=Depends(get_current_user), move_type: Optional[str] = None):
    user_id = str(current_user["_id"])
    db = get_db()
    oid = validate_object_id(game_id, "game id")
    game = await db.games.find_one({"_id": oid})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    if not is_participant(game, user_id):
        raise HTTPException(status_code=403, detail="You are not a participant in this game.")
    query: dict = {"game_id": game_id}
    if move_type:
        query["move_type"] = move_type
    docs = await db.moves.find(query, {"_id": 0}).sort("move_number", 1).to_list(length=None)
    return [GameMove(**doc) for doc in docs]


@router.get("/{game_id}", response_model=GameOut)
async def get_game(game_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    oid = validate_object_id(game_id, "game id")
    game = await db.games.find_one({"_id": oid})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    if not is_participant(game, user_id):
        raise HTTPException(status_code=403, detail="You are not a participant in this game.")
    results = await games_to_out([game], db)
    return results[0]


@router.post("/{game_id}/respond", response_model=GameOut)
async def respond_to_challenge(game_id: str, payload: ChallengeResponse, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    oid = validate_object_id(game_id, "game id")
    game = await db.games.find_one({"_id": oid})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    if game.get("opponent") != user_id:
        raise HTTPException(status_code=403, detail="Only the opponent can respond to this challenge.")
    if game.get("invitation_status") != "pending":
        raise HTTPException(status_code=400, detail="Challenge has already been responded to.")

    if payload.accept:
        await db.games.update_one({"_id": oid}, {"$set": {"invitation_status": "accepted"}})
        await sio.emit("game_accepted", {"game_id": game_id}, room=game_id)
    else:
        await db.games.update_one(
            {"_id": oid},
            {"$set": {"invitation_status": "rejected", "completed": True}},
        )
        await remove_active_room(game_id)
        await evict_state(game_id)
        await sio.emit("game_cancelled", {"game_id": game_id, "reason": "rejected"}, room=game_id)

    game_doc = await db.games.find_one({"_id": oid})
    results = await games_to_out([game_doc], db)
    return results[0]
