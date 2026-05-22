from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import cast

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.types import ASGIApp

from db import connect_to_mongo, close_mongo_connection, get_db
from services.dictionary import load_dictionaries
from services.redis_cache import connect_to_redis, close_redis, get_redis
from limiter import limiter
from services.dispute_timers import cancel_all as cancel_all_dispute_timers
from services.room import active_game_rooms
from sockets import sio
import sockets.game  # noqa: F401 — registers socket event handlers
from routes.auth import router as auth_router
from routes.game import router as game_router
from routes.users import router as users_router
from routes.push import router as push_router

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

_cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
_cors_origins = (
    [o.strip() for o in _cors_raw.split(",") if o.strip()]
    if _cors_raw
    else [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    connect_to_mongo()
    await connect_to_redis()
    load_dictionaries()

    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.moves.create_index([("game_id", 1), ("move_number", 1)], unique=True)
    await db.games.create_index([("user", 1), ("completed", 1)])
    await db.games.create_index([("opponent", 1), ("completed", 1)])
    await db.push_subscriptions.create_index("user_id")
    await db.push_subscriptions.create_index([("user_id", 1), ("endpoint", 1)], unique=True)
    await db.games.create_index([("date", -1)])

    # Restore in-memory room set from DB so active games survive server restarts
    active = await db.games.find({"completed": False}, {"_id": 1}).to_list(length=None)
    for doc in active:
        active_game_rooms.add(str(doc["_id"]))

    yield

    cancel_all_dispute_timers()
    await close_redis()
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

socket_app = socketio.ASGIApp(sio)
app.mount("/socket.io", cast(ASGIApp, socket_app))

app.include_router(auth_router)
app.include_router(game_router)
app.include_router(users_router)
app.include_router(push_router)


@app.get("/health")
async def health():
    status: dict = {"status": "ok", "db": "ok", "cache": "ok"}
    try:
        await get_db().command("ping")
    except Exception:
        status["db"] = "error"
        status["status"] = "degraded"
    try:
        await get_redis().ping()
    except Exception:
        status["cache"] = "error"
        status["status"] = "degraded"
    if status["status"] != "ok":
        raise HTTPException(status_code=503, detail=status)
    return status
