import os

import socketio

from sockets.manager import SocketManager

_redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
_mgr = socketio.AsyncRedisManager(_redis_url)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[],  # CORS is handled by FastAPI's CORSMiddleware
    client_manager=_mgr,
)

socket_manager = SocketManager()
