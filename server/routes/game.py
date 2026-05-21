import asyncio
from typing import Dict, List, Optional
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_db
from models import GameBase, GameMove, GameOut, GameState, GameStateSummary
from routes.auth import get_current_user
from services.game_state import build_initial_state, get_game_state
from services.push import send_challenge_notification
from services.redis_cache import evict_state
from services.room import active_game_rooms
from sockets import sio, socket_manager
from utils.helpers import user_doc_to_out, validate_object_id


class ChallengeResponse(BaseModel):
    accept: bool

router = APIRouter(prefix="/game", dependencies=[Depends(get_current_user)])


async def _fetch_users_by_ids(db, user_ids: List[str]) -> Dict[str, dict]:
    """Fetch multiple users in a single query, returning a dict keyed by string id."""
    oids = [validate_object_id(uid, "user id") for uid in user_ids]
    docs = await db.users.find({"_id": {"$in": oids}}).to_list(length=None)
    return {str(doc["_id"]): doc for doc in docs}


def _build_game_state_summary(game_state_doc: dict) -> GameStateSummary:
    moves = game_state_doc.get("game_moves", [])
    last_non_initial = next(
        (m for m in reversed(moves) if m.get("move_type") != "initial"),
        None,
    )
    return GameStateSummary(
        turn=game_state_doc.get("turn"),
        status=game_state_doc.get("status", "waiting"),
        last_move_at=last_non_initial["timestamp"] if last_non_initial else None,
        scores=game_state_doc.get("scores", {}),
    )


def _build_game_out(game: dict, user_cache: Dict[str, dict]) -> GameOut:
    user_doc = user_cache.get(game["user"])
    opponent_doc = user_cache.get(game["opponent"])
    if not user_doc or not opponent_doc:
        raise HTTPException(status_code=404, detail="Game participant not found")

    game_state_doc = game.get("game_state")
    game_state_summary = _build_game_state_summary(game_state_doc) if game_state_doc else None

    return GameOut(
        id=str(game["_id"]),
        user=user_doc_to_out(user_doc),
        opponent=user_doc_to_out(opponent_doc),
        dictionary=game.get("dictionary", "TWL06"),
        board_type=game.get("board_type", "standard"),
        turn_timer=game.get("turn_timer", False),
        duration=game.get("duration"),
        timeIncrement=game.get("timeIncrement"),
        online=game.get("online", True),
        disputes=game.get("disputes", False),
        completed=game.get("completed", False),
        winner=game.get("winner"),
        loser=game.get("loser"),
        userScore=game.get("userScore", 0),
        opponentScore=game.get("opponentScore", 0),
        date=game.get("date"),
        game_state=game_state_summary,
        invitation_status=game.get("invitation_status", "pending"),
    )


async def _games_to_out(games: List[dict], db) -> List[GameOut]:
    """Convert a list of game documents to GameOut, batching the user lookups."""
    user_ids = list({g["user"] for g in games} | {g["opponent"] for g in games})
    user_cache = await _fetch_users_by_ids(db, user_ids)
    return [_build_game_out(g, user_cache) for g in games]


@router.post("/create", response_model=GameOut, status_code=201)
async def create_game(payload: GameBase, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])

    sids = socket_manager.get_sids(user_id)
    if not sids:
        raise HTTPException(status_code=400, detail="No active socket connection.")

    db = get_db()
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
        "game_state": build_initial_state(
            creator_id=user_id,
            disputes=payload.disputes,
            dispute_timeout=getattr(payload, "dispute_timeout", 60),
            dictionary=getattr(payload, "dictionary", "TWL06"),
        ),
    })

    game_id = str(result.inserted_id)
    active_game_rooms.add(game_id)

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
    asyncio.ensure_future(send_challenge_notification(payload.opponent, game_id, creator_name))

    game_doc = await db.games.find_one({"_id": result.inserted_id})
    results = await _games_to_out([game_doc], db)
    return results[0]


@router.get("/mine", response_model=List[GameOut])
async def get_my_games(completed: Optional[bool] = None, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    query: dict = {"$or": [{"user": user_id}, {"opponent": user_id}]}
    if completed is not None:
        query["completed"] = completed
    games = await db.games.find(query).sort("date", -1).to_list(length=None)
    return await _games_to_out(games, db)


@router.get("/user/{user_id}", response_model=List[GameOut])
async def get_games_by_user(user_id: str):
    db = get_db()
    query = {"$or": [{"user": user_id}, {"opponent": user_id}]}
    games = await db.games.find(query).sort("date", -1).to_list(length=None)
    return await _games_to_out(games, db)


@router.get("/{game_id}/state", response_model=GameState)
async def get_game_state_route(game_id: str):
    state = await get_game_state(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game state not found.")
    return GameState(game_id=game_id, **state)


@router.get("/{game_id}/moves", response_model=List[GameMove])
async def get_game_moves(game_id: str, move_type: Optional[str] = None):
    db = get_db()
    query: dict = {"game_id": game_id}
    if move_type:
        query["move_type"] = move_type
    docs = await db.moves.find(query, {"_id": 0}).sort("move_number", 1).to_list(length=None)
    return [GameMove(**doc) for doc in docs]


@router.get("/{game_id}", response_model=GameOut)
async def get_game(game_id: str):
    db = get_db()
    oid = validate_object_id(game_id, "game id")
    game = await db.games.find_one({"_id": oid})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    results = await _games_to_out([game], db)
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
        active_game_rooms.discard(game_id)
        await evict_state(game_id)
        await sio.emit("game_cancelled", {"game_id": game_id, "reason": "rejected"}, room=game_id)

    game_doc = await db.games.find_one({"_id": oid})
    results = await _games_to_out([game_doc], db)
    return results[0]
