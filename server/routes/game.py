from typing import Dict, List, Optional
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from models import GameBase, GameMove, GameOut, GameState
from routes.auth import get_current_user
from services.game_state import build_initial_state, get_game_state
from services.room import active_game_rooms
from sockets import sio, socket_manager
from utils.helpers import user_doc_to_out, validate_object_id

router = APIRouter(prefix="/game", dependencies=[Depends(get_current_user)])


async def _fetch_users_by_ids(db, user_ids: List[str]) -> Dict[str, dict]:
    """Fetch multiple users in a single query, returning a dict keyed by string id."""
    oids = [validate_object_id(uid, "user id") for uid in user_ids]
    docs = await db.users.find({"_id": {"$in": oids}}).to_list(length=None)
    return {str(doc["_id"]): doc for doc in docs}


def _build_game_out(game: dict, user_cache: Dict[str, dict]) -> GameOut:
    user_doc = user_cache.get(game["user"])
    opponent_doc = user_cache.get(game["opponent"])
    if not user_doc or not opponent_doc:
        raise HTTPException(status_code=404, detail="Game participant not found")
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
        "game_state": build_initial_state(user_id),

    })

    game_id = str(result.inserted_id)
    active_game_rooms.add(game_id)

    for sid in sids:
        await sio.enter_room(sid, game_id)
    await sio.emit("game_created", {"room": game_id}, to=sids[0])
    await sio.emit("joined_game", {"sid": sids[0], "room": game_id}, to=sids[0])

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
