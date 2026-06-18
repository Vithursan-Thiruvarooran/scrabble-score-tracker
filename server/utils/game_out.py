from __future__ import annotations

from typing import Dict, List

from fastapi import HTTPException

from models import GameOut, GameStateSummary
from utils.helpers import user_doc_to_out, validate_object_id


async def fetch_users_by_ids(db, user_ids: List[str]) -> Dict[str, dict]:
    """Fetch multiple users in a single query, returning a dict keyed by string id."""
    oids = [validate_object_id(uid, "user id") for uid in user_ids]
    docs = await db.users.find({"_id": {"$in": oids}}).to_list(length=None)
    return {str(doc["_id"]): doc for doc in docs}


def build_game_state_summary(game_state_doc: dict) -> GameStateSummary:
    last_move_at = game_state_doc.get("last_move_at")
    if last_move_at is None:
        # Legacy documents still have game_moves embedded
        moves = game_state_doc.get("game_moves", [])
        last_non_initial = next(
            (m for m in reversed(moves) if m.get("move_type") != "initial"),
            None,
        )
        last_move_at = last_non_initial["timestamp"] if last_non_initial else None
    return GameStateSummary(
        turn=game_state_doc.get("turn"),
        status=game_state_doc.get("status", "waiting"),
        last_move_at=last_move_at,
        scores=game_state_doc.get("scores", {}),
    )


def build_game_out(game: dict, user_cache: Dict[str, dict]) -> GameOut:
    user_doc = user_cache.get(game["user"])
    opponent_doc = user_cache.get(game["opponent"])
    if not user_doc or not opponent_doc:
        raise HTTPException(status_code=404, detail="Game participant not found")

    game_state_doc = game.get("game_state")
    game_state_summary = build_game_state_summary(game_state_doc) if game_state_doc else None

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
        nudges=game.get("nudges", {}),
    )


async def games_to_out(games: List[dict], db) -> List[GameOut]:
    """Convert a list of game documents to GameOut, batching the user lookups."""
    user_ids = list({g["user"] for g in games} | {g["opponent"] for g in games})
    user_cache = await fetch_users_by_ids(db, user_ids)
    return [build_game_out(g, user_cache) for g in games]
