from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from models import GameBase, GameOut, GameState
from routes.auth import get_current_user
from services.game_state import build_initial_state, get_game_state
from services.room import active_game_rooms
from sockets import sio, socket_manager
from utils.helpers import user_doc_to_out, validate_object_id

router = APIRouter(prefix="/game", dependencies=[Depends(get_current_user)])


async def _fetch_user_out(db, user_id: str):
    oid = validate_object_id(user_id, "user id")
    doc = await db.users.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return user_doc_to_out(doc)


async def _doc_to_game_out(game: dict, db) -> GameOut:
    return GameOut(
        id=str(game["_id"]),
        user=await _fetch_user_out(db, game["user"]),
        opponent=await _fetch_user_out(db, game["opponent"]),
        duration=game["duration"],
        timeIncrement=game["timeIncrement"],
        completed=game.get("completed", False),
        winner=game.get("winner"),
        loser=game.get("loser"),
        userScore=game.get("userScore", 0),
        opponentScore=game.get("opponentScore", 0),
        date=game.get("date"),
        time=game.get("time"),
    )


@router.post("/create", response_model=GameOut, status_code=201)
async def create_game(payload: GameBase, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])

    sids = socket_manager.get_sids(user_id)
    if not sids:
        raise HTTPException(status_code=400, detail="No active socket connection.")

    db = get_db()
    result = await db.games.insert_one({
        "opponent": payload.opponent,
        "duration": payload.duration,
        "timeIncrement": payload.timeIncrement,
        "user": user_id,
        "completed": False,
        "winner": None,
        "loser": None,
        "userScore": 0,
        "opponentScore": 0,
        "date": datetime.now(),
        "time": datetime.now(),
        "game_state": build_initial_state(user_id),
    })

    game_id = str(result.inserted_id)
    active_game_rooms.add(game_id)

    for sid in sids:
        await sio.enter_room(sid, game_id)
    await sio.emit("game_created", {"room": game_id}, to=sids[0])
    await sio.emit("joined_game", {"sid": sids[0], "room": game_id}, to=sids[0])

    game_doc = await db.games.find_one({"_id": result.inserted_id})
    return await _doc_to_game_out(game_doc, db)


@router.get("/mine", response_model=List[GameOut])
async def get_my_games(current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    games = await db.games.find({"$or": [{"user": user_id}, {"opponent": user_id}]}).to_list(length=None)
    return [await _doc_to_game_out(game, db) for game in games]


@router.get("/user/{user_id}", response_model=List[GameOut])
async def get_games_by_user(user_id: str):
    db = get_db()
    games = await db.games.find({"user": user_id}).to_list(length=None)
    return [await _doc_to_game_out(game, db) for game in games]


@router.get("/{game_id}/state", response_model=GameState)
async def get_game_state_route(game_id: str):
    state = await get_game_state(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game state not found.")
    return GameState(game_id=game_id, **state)


@router.get("/{game_id}", response_model=GameOut)
async def get_game(game_id: str):
    db = get_db()
    oid = validate_object_id(game_id, "game id")
    game = await db.games.find_one({"_id": oid})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    return await _doc_to_game_out(game, db)
