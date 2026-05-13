import socketio

from sockets.manager import SocketManager

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[],  # CORS is handled by FastAPI's CORSMiddleware
)

socket_manager = SocketManager()
