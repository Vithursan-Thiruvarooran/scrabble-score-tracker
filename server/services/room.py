from __future__ import annotations

from typing import List

from services.redis_cache import get_redis

_ROOMS_KEY = "active_game_rooms"


async def is_active_room(game_id: str) -> bool:
    return bool(await get_redis().sismember(_ROOMS_KEY, game_id))


async def add_active_room(game_id: str) -> None:
    await get_redis().sadd(_ROOMS_KEY, game_id)


async def remove_active_room(game_id: str) -> None:
    await get_redis().srem(_ROOMS_KEY, game_id)


async def reset_active_rooms(game_ids: List[str]) -> None:
    """Atomically replace the active-rooms set (used on startup to avoid stale entries)."""
    r = get_redis()
    await r.delete(_ROOMS_KEY)
    if game_ids:
        await r.sadd(_ROOMS_KEY, *game_ids)
