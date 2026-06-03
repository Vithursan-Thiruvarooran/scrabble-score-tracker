from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from db import get_db
from services.auth import decode_access_token
from services.dispute_timers import cancel_dispute_timeout
from services.redis_cache import evict_state
from services.game_state import (
    add_player_to_state,
    apply_place,
    apply_pass,
    apply_recycle,
    apply_resign,
    apply_resolve_dispute,
    get_game_state,
)
from services.room import active_game_rooms
from services.push import send_turn_notification, send_nudge_notification
from sockets import sio, socket_manager

logger = logging.getLogger(__name__)


async def _close_finished_game(game_id: str) -> None:
    cancel_dispute_timeout(game_id)
    active_game_rooms.discard(game_id)
    await evict_state(game_id)
    logger.info("game finished and closed: room=%s", game_id)


async def _require_auth(sid: str, error_event: str) -> Optional[str]:
    user_id = socket_manager.get_user(sid)
    if not user_id:
        await sio.emit(error_event, {"message": "Not authenticated."}, to=sid)
    return user_id


@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token", "")
    user_id = decode_access_token(token)
    if not user_id:
        raise ConnectionRefusedError("Authentication required.")
    socket_manager.add(user_id, sid)
    logger.info("connect: sid=%s user_id=%s", sid, user_id)


@sio.event
async def disconnect(sid):
    user_id = socket_manager.remove(sid)
    logger.info("disconnect: sid=%s user_id=%s", sid, user_id)


@sio.event
async def joinGame(sid, data):
    if not await _require_auth(sid, "join_error"):
        return

    if not isinstance(data, dict):
        await sio.emit("join_error", {"message": "Invalid payload."}, to=sid)
        return

    game_id = data.get("game_id")
    if not isinstance(game_id, str) or not game_id:
        await sio.emit("join_error", {"message": "Invalid game_id."}, to=sid)
        return

    if game_id not in active_game_rooms:
        await sio.emit("join_error", {"message": "No game found with that code."}, to=sid)
        return

    user_id = socket_manager.get_user(sid)

    # Verify the requesting user is the creator or the invited opponent.
    try:
        db = get_db()
        game_doc = await db.games.find_one({"_id": ObjectId(game_id)})
    except Exception:
        await sio.emit("join_error", {"message": "Invalid game id."}, to=sid)
        return
    if not game_doc:
        await sio.emit("join_error", {"message": "Game not found."}, to=sid)
        return
    if game_doc.get("user") != user_id and game_doc.get("opponent") != user_id:
        await sio.emit("join_error", {"message": "You are not a participant in this game."}, to=sid)
        return

    logger.info("joinGame: room=%s sid=%s", game_id, sid)
    await sio.enter_room(sid, game_id)
    await sio.emit("joined_game", {"sid": sid, "room": game_id}, room=game_id)

    # Add the joining player to game state (no-op if already present), then
    # broadcast the full state so all clients in the room re-render.
    state = await add_player_to_state(game_id, user_id)
    if state is None:
        state = await get_game_state(game_id)
    if state:
        await sio.emit("game_state", {"game_id": game_id, **state}, room=game_id)


@sio.event
async def leaveGame(sid, data):
    if not await _require_auth(sid, "leave_error"):
        return

    if not isinstance(data, dict):
        await sio.emit("leave_error", {"message": "Invalid payload."}, to=sid)
        return

    game_id = data.get("game_id")
    if not isinstance(game_id, str) or not game_id:
        await sio.emit("leave_error", {"message": "Invalid game_id."}, to=sid)
        return

    await sio.leave_room(sid, game_id)

    if game_id in active_game_rooms:
        remaining = list(sio.manager.get_participants("/", game_id))
        if not remaining:
            active_game_rooms.discard(game_id)
            logger.info("leaveGame: room=%s removed (empty)", game_id)
        else:
            await sio.emit("left_game", {"room": game_id}, room=game_id)

    logger.info("leaveGame: room=%s sid=%s", game_id, sid)
    await sio.emit("left_game", {"room": game_id}, to=sid)


@sio.event
async def subscribe_game(sid, data):
    """Join a socket room for passive real-time updates without modifying game state."""
    user_id = await _require_auth(sid, "subscribe_error")
    if not user_id:
        return
    if not isinstance(data, dict):
        return
    game_id = data.get("game_id", "")
    if not isinstance(game_id, str) or not game_id or game_id not in active_game_rooms:
        return
    try:
        db = get_db()
        game_doc = await db.games.find_one({"_id": ObjectId(game_id)})
    except Exception:
        return
    if not game_doc or (game_doc.get("user") != user_id and game_doc.get("opponent") != user_id):
        await sio.emit("subscribe_error", {"message": "You are not a participant in this game."}, to=sid)
        return
    await sio.enter_room(sid, game_id)
    logger.info("subscribe_game: room=%s sid=%s", game_id, sid)


@sio.event
async def unsubscribe_game(sid, data):
    """Leave a socket room previously joined via subscribe_game."""
    if not await _require_auth(sid, "unsubscribe_error"):
        return
    if not isinstance(data, dict):
        return
    game_id = data.get("game_id", "")
    if isinstance(game_id, str) and game_id:
        await sio.leave_room(sid, game_id)
        logger.info("unsubscribe_game: room=%s sid=%s", game_id, sid)


# Real-time move flow:
#   Client → socket.emit("play_move", { game_id, move_type, ... })
#           ↓
#   Server routes by move_type → validates → scores → mutates state
#           ↓
#   Redis fast write → MongoDB persistence
#           ↓
#   Success: "play_move_ok" + "game_state" broadcast to whole room
#   Failure: "play_error" + "game_state" sent back to the caller only
@sio.event
async def play_move(sid, data):
    user_id = await _require_auth(sid, "play_error")
    if not user_id:
        return

    if not isinstance(data, dict):
        await sio.emit("play_error", {"message": "Invalid payload."}, to=sid)
        return

    game_id = data.get("game_id")
    move_type = data.get("move_type")

    if not isinstance(game_id, str) or not game_id:
        await sio.emit("play_error", {"message": "game_id is required."}, to=sid)
        return

    _VALID_MOVE_TYPES = {"place", "pass", "recycle", "resign"}
    if not isinstance(move_type, str) or move_type not in _VALID_MOVE_TYPES:
        await sio.emit("play_error", {"message": "move_type must be one of: place, pass, recycle, resign."}, to=sid)
        return

    try:
        if move_type == "place":
            tiles = data.get("tiles")
            if not isinstance(tiles, list) or not tiles:
                await sio.emit("play_error", {"message": "tiles (list) is required for a place move."}, to=sid)
                return
            for t in tiles:
                if not isinstance(t, dict) or not {"row", "col", "letter"} <= t.keys():
                    await sio.emit("play_error", {"message": "Each tile must have row, col, and letter."}, to=sid)
                    return
                if not isinstance(t["row"], int) or not isinstance(t["col"], int):
                    await sio.emit("play_error", {"message": "Tile row and col must be integers."}, to=sid)
                    return
                if not (0 <= t["row"] <= 14 and 0 <= t["col"] <= 14):
                    await sio.emit("play_error", {"message": "Tile row and col must be in range [0, 14]."}, to=sid)
                    return
                if not isinstance(t["letter"], str) or len(t["letter"]) != 1:
                    await sio.emit("play_error", {"message": "Each tile letter must be a single character."}, to=sid)
                    return
            state, error = await apply_place(game_id, user_id, tiles)

        elif move_type == "pass":
            state, error = await apply_pass(game_id, user_id)

        elif move_type == "recycle":
            tiles = data.get("tiles")
            if not isinstance(tiles, list) or not tiles:
                await sio.emit("play_error", {"message": "tiles (list of letters) is required for a recycle move."}, to=sid)
                return
            if not all(isinstance(t, str) for t in tiles):
                await sio.emit("play_error", {"message": "tiles must be a list of letter strings for a recycle move."}, to=sid)
                return
            state, error = await apply_recycle(game_id, user_id, tiles)

        elif move_type == "resign":
            state, error = await apply_resign(game_id, user_id)

        logger.info("play_move: room=%s user=%s type=%s error=%s", game_id, user_id, move_type, error)

        if error:
            await sio.emit("play_error", {"message": error}, to=sid)
            if state:
                await sio.emit("game_state", {"game_id": game_id, **state}, to=sid)
        else:
            await sio.emit("play_move_ok", {"message": "Move accepted.", "move_type": move_type}, to=sid)
            await sio.emit("game_state", {"game_id": game_id, **state}, room=game_id)
            if state.get("status") == "finished":
                await _close_finished_game(game_id)
            elif state.get("status") == "active":
                next_player = state.get("turn")
                if next_player and next_player != user_id:
                    asyncio.create_task(send_turn_notification(next_player, game_id))

    except Exception as exc:
        logger.exception("play_move unhandled error: room=%s user=%s type=%s: %s", game_id, user_id, move_type, exc)
        await sio.emit("play_error", {"message": "An internal error occurred. Please try again."}, to=sid)


@sio.event
async def resolve_dispute(sid, data):
    user_id = await _require_auth(sid, "play_error")
    if not user_id:
        return

    if not isinstance(data, dict):
        await sio.emit("play_error", {"message": "Invalid payload."}, to=sid)
        return

    game_id = data.get("game_id")
    if not isinstance(game_id, str) or not game_id:
        await sio.emit("play_error", {"message": "game_id is required."}, to=sid)
        return

    dispute = bool(data.get("dispute", False))

    cancel_dispute_timeout(game_id)
    state, error = await apply_resolve_dispute(game_id, user_id, dispute)

    logger.info("resolve_dispute: room=%s user=%s dispute=%s error=%s", game_id, user_id, dispute, error)

    if error:
        await sio.emit("play_error", {"message": error}, to=sid)
        if state:
            await sio.emit("game_state", {"game_id": game_id, **state}, to=sid)
    else:
        await sio.emit("play_move_ok", {"message": "Dispute resolved.", "move_type": "resolve_dispute"}, to=sid)
        await sio.emit("game_state", {"game_id": game_id, **state}, room=game_id)
        if state.get("status") == "finished":
            await _close_finished_game(game_id)
        elif state.get("status") == "active":
            next_player = state.get("turn")
            if next_player and next_player != user_id:
                asyncio.create_task(send_turn_notification(next_player, game_id))


@sio.event
async def nudge_player(sid, data):
    """Nudge a player to play a move."""
    logger.info("nudge_player: sid=%s data=%s", sid, data)
    user_id = await _require_auth(sid, "nudge_error")
    if not user_id:
        return

    game_id = data.get("game_id") if isinstance(data, dict) else None
    if not isinstance(game_id, str) or not game_id:
        await sio.emit("nudge_error", {"message": "game_id is required."}, to=sid)
        return

    try:
        db = get_db()
        game_doc = await db.games.find_one({"_id": ObjectId(game_id)})
    except Exception:
        await sio.emit("nudge_error", {"message": "Invalid game id."}, to=sid)
        return

    if not game_doc:
        await sio.emit("nudge_error", {"message": "Game not found."}, to=sid)
        return
    if user_id not in (game_doc.get("user"), game_doc.get("opponent")):
        await sio.emit("nudge_error", {"message": "Not a participant."}, to=sid)
        return

    state = await get_game_state(game_id)
    if not state or state.get("status") != "active":
        await sio.emit("nudge_error", {"message": "Game is not active."}, to=sid)
        return

    target_id = state.get("turn")
    if not target_id or target_id == user_id:
        await sio.emit("nudge_error", {"message": "Cannot nudge yourself."}, to=sid)
        return

    real_moves = [m for m in state.get("game_moves", []) if m.get("move_type") != "initial"]
    if not real_moves:
        await sio.emit("nudge_error", {"message": "No moves yet."}, to=sid)
        return

    now = datetime.now(timezone.utc)
    last_move_time = datetime.fromisoformat(real_moves[-1]["timestamp"])
    if last_move_time.tzinfo is None:
        last_move_time = last_move_time.replace(tzinfo=timezone.utc)
    if (now - last_move_time).total_seconds() < 1800:
        await sio.emit("nudge_error", {"message": "Opponent moved recently."}, to=sid)
        return

    nudges = game_doc.get("nudges", {})
    last_nudge_iso = nudges.get(target_id)
    if last_nudge_iso:
        last_nudge_dt = datetime.fromisoformat(last_nudge_iso.replace("Z", "+00:00"))
        if (now - last_nudge_dt).total_seconds() < 1800:
            await sio.emit("nudge_error", {"message": "Player was nudged recently."}, to=sid)
            return

    # Append Z so clients (JavaScript) parse the timestamp as UTC, not local time.
    nudge_time = now.isoformat().replace("+00:00", "Z")
    try:
        await db.games.update_one(
            {"_id": ObjectId(game_id)},
            {"$set": {f"nudges.{target_id}": nudge_time}},
        )
    except Exception:
        logger.exception("nudge_player: DB write failed game=%s", game_id)
        await sio.emit("nudge_error", {"message": "Could not send nudge."}, to=sid)
        return

    asyncio.create_task(send_nudge_notification(target_id, game_id))
    logger.info("nudge_player: room=%s nudger=%s target=%s", game_id, user_id, target_id)
    await sio.emit("nudge_ok", {"nudged_at": nudge_time}, to=sid)
