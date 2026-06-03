import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor

from pywebpush import webpush, WebPushException

from db import get_db

_executor = ThreadPoolExecutor(max_workers=4)

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.getenv("VAPID_CONTACT_EMAIL", "mailto:admin@example.com")
_BASE_PATH = os.getenv("APP_BASE_PATH", "").rstrip("/")


async def _send_push_to_user(user_id: str, payload_dict: dict) -> None:
    """Send a push notification to all subscriptions for user_id. Fire-and-forget; never raises."""
    if not VAPID_PRIVATE_KEY:
        return
    try:
        db = get_db()
        subscriptions = await db.push_subscriptions.find({"user_id": user_id}).to_list(None)
        if not subscriptions:
            return

        payload = json.dumps(payload_dict)
        stale_ids = []
        loop = asyncio.get_event_loop()

        def _send(sub: dict):
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_SUBJECT},
                )
            except WebPushException as exc:
                if exc.response is not None and exc.response.status_code in (404, 410):
                    return sub["_id"]
            except Exception:
                pass
            return None

        for sub in subscriptions:
            stale_id = await loop.run_in_executor(_executor, _send, sub)
            if stale_id is not None:
                stale_ids.append(stale_id)

        if stale_ids:
            await db.push_subscriptions.delete_many({"_id": {"$in": stale_ids}})

    except Exception:
        pass


async def send_turn_notification(user_id: str, game_id: str) -> None:
    """Notify user_id that it is their turn in game_id."""
    await _send_push_to_user(user_id, {
        "title": "Your turn!",
        "body": "Your opponent has played. It's your move.",
        "url": f"{_BASE_PATH}/game/{game_id}",
        "game_id": game_id,
    })


async def send_challenge_notification(user_id: str, game_id: str, challenger_name: str) -> None:
    """Notify user_id they have been challenged by challenger_name."""
    await _send_push_to_user(user_id, {
        "title": "New challenge!",
        "body": f"{challenger_name} challenged you to a game.",
        "url": f"{_BASE_PATH}/game/{game_id}",
        "game_id": game_id,
    })


async def send_nudge_notification(user_id: str, game_id: str) -> None:
    """Notify user_id that their opponent is waiting for them to move."""
    await _send_push_to_user(user_id, {
        "title": "Your move!",
        "body": "Your opponent is waiting. Don't keep them hanging!",
        "url": f"{_BASE_PATH}/game/{game_id}",
        "game_id": game_id,
    })
