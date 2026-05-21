from __future__ import annotations

import logging
from typing import Optional

from services.auth import decode_access_token
from services.dispute_timers import cancel_dispute_timeout
from services.game_state import (
    add_player_to_state,
    apply_place,
    apply_pass,
    apply_recycle,
    apply_resign,
    apply_resolve_dispute,
)
from services.room import active_game_rooms
from sockets import sio, socket_manager

logger = logging.getLogger(__name__)


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
    print("connect: sid=%s user_id=%s", sid, user_id)


@sio.event
async def disconnect(sid):
    user_id = socket_manager.remove(sid)
    logger.info("disconnect: sid=%s user_id=%s", sid, user_id)


@sio.event
async def joinGame(sid, data):
    print(f"joinGame: sid={sid} data={data}", sid, data)
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

    logger.info("joinGame: room=%s sid=%s", game_id, sid)
    await sio.enter_room(sid, game_id)
    await sio.emit("joined_game", {"sid": sid, "room": game_id}, room=game_id)

    # Add the joining player to game state (no-op if already present), then
    # broadcast the full state so all clients in the room re-render.
    user_id = socket_manager.get_user(sid)
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
    if not await _require_auth(sid, "subscribe_error"):
        return
    if not isinstance(data, dict):
        return
    game_id = data.get("game_id", "")
    if isinstance(game_id, str) and game_id and game_id in active_game_rooms:
        await sio.enter_room(sid, game_id)
        logger.info("subscribe_game: room=%s sid=%s", game_id, sid)


@sio.event
async def unsubscribe_game(sid, data):
    """Leave a socket room previously joined via subscribe_game."""
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
    print(f"play_move: sid={sid} data={data}")
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

    try:
        if move_type == "place":
            tiles = data.get("tiles")
            if not isinstance(tiles, list) or not tiles:
                await sio.emit("play_error", {"message": "tiles (list) is required for a place move."}, to=sid)
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

        else:
            await sio.emit("play_error", {"message": f"Unknown move_type '{move_type}'. Expected: place, pass, recycle, resign."}, to=sid)
            return

        logger.info("play_move: room=%s user=%s type=%s error=%s", game_id, user_id, move_type, error)

        if error:
            await sio.emit("play_error", {"message": error}, to=sid)
            if state:
                await sio.emit("game_state", {"game_id": game_id, **state}, to=sid)
        else:
            await sio.emit("play_move_ok", {"message": "Move accepted.", "move_type": move_type}, to=sid)
            await sio.emit("game_state", {"game_id": game_id, **state}, room=game_id)

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
