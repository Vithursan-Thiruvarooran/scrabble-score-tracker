from __future__ import annotations

from contextlib import asynccontextmanager
from typing import cast

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from db import connect_to_mongo, close_mongo_connection, get_db
from services.dictionary import load_dictionaries
from services.redis_cache import connect_to_redis, close_redis
from services.room import active_game_rooms
from sockets import sio
import sockets.game  # noqa: F401 — registers socket event handlers
from routes.auth import router as auth_router
from routes.game import router as game_router
from routes.users import router as users_router
from routes.push import router as push_router


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

    # Restore in-memory room set from DB so active games survive server restarts
    active = await db.games.find({"completed": False}, {"_id": 1}).to_list(length=None)
    for doc in active:
        active_game_rooms.add(str(doc["_id"]))

    yield

    await close_redis()
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
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


@app.get("/")
async def root():
    print("GET /")
    return {"foo": "hello message from server"}
