from __future__ import annotations

import json
import os
from typing import Optional

import redis.asyncio as aioredis

_redis: Optional[aioredis.Redis] = None

# Game state keys expire after 2 hours — long enough for any Scrabble game
_STATE_TTL = 7200


async def connect_to_redis() -> None:
    global _redis
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    _redis = await aioredis.from_url(url, decode_responses=True)


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not connected")
    return _redis


async def cache_state(game_id: str, state: dict) -> None:
    r = get_redis()
    await r.setex(f"game:{game_id}:state", _STATE_TTL, json.dumps(state, default=str))


async def get_cached_state(game_id: str) -> Optional[dict]:
    r = get_redis()
    raw = await r.get(f"game:{game_id}:state")
    return json.loads(raw) if raw else None


async def evict_state(game_id: str) -> None:
    r = get_redis()
    await r.delete(f"game:{game_id}:state")
