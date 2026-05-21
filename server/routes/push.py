import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from db import get_db
from models import PushSubscriptionPayload
from routes.auth import get_current_user

router = APIRouter(prefix="/push")


@router.get("/public-key")
async def get_vapid_public_key():
    return {"publicKey": os.getenv("VAPID_PUBLIC_KEY", "")}


@router.post("/subscribe", status_code=201)
async def subscribe_push(payload: PushSubscriptionPayload, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    now = datetime.now(timezone.utc)
    await db.push_subscriptions.update_one(
        {"user_id": user_id, "endpoint": payload.endpoint},
        {
            "$set": {"p256dh": payload.p256dh, "auth": payload.auth, "updated_at": now},
            "$setOnInsert": {"user_id": user_id, "endpoint": payload.endpoint, "created_at": now},
        },
        upsert=True,
    )
    return {"status": "subscribed"}


@router.delete("/subscribe", status_code=200)
async def unsubscribe_push(payload: PushSubscriptionPayload, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    await db.push_subscriptions.delete_one({"user_id": user_id, "endpoint": payload.endpoint})
    return {"status": "unsubscribed"}
