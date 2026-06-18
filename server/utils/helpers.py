import asyncio
import logging

from bson import ObjectId
from datetime import datetime, timezone
from fastapi import HTTPException

from models.user import UserOut

_logger = logging.getLogger(__name__)


def user_doc_to_out(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        firstname=doc["firstname"],
        lastname=doc["lastname"],
        admin=doc["admin"],
    )


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def is_participant(game: dict, user_id: str) -> bool:
    return game.get("user") == user_id or game.get("opponent") == user_id


def validate_object_id(value: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def spawn(coro) -> asyncio.Task:
    """Fire-and-forget an async coroutine, logging any exception instead of swallowing it."""
    async def _logged():
        try:
            await coro
        except Exception:
            _logger.exception("background task error")
    return asyncio.create_task(_logged())
