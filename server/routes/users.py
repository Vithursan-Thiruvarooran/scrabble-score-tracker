from typing import List

from fastapi import APIRouter, Depends, HTTPException

from db import get_db
from models import AcceptFriendRequest, AddFriendRequest, FriendOut, UserOut
from routes.auth import get_current_user
from utils.helpers import user_doc_to_out, validate_object_id

router = APIRouter(prefix="/users")


def _friend_doc_to_out(doc: dict) -> FriendOut:
    return FriendOut(
        id=str(doc["_id"]),
        userId=doc["userId"],
        friendId=doc["friendId"],
        status=doc["status"],
    )


@router.get("", response_model=List[UserOut])
async def get_all_users(current_user=Depends(get_current_user)):
    db = get_db()
    users = await db.users.find().to_list(length=None)
    return [user_doc_to_out(u) for u in users]


@router.get("/friends", response_model=List[UserOut])
async def get_friends(current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    friendship_docs = await db.friends.find({"userId": user_id, "status": "accepted"}).to_list(length=None)
    friend_oids = [validate_object_id(doc["friendId"], "friend id") for doc in friendship_docs]
    if not friend_oids:
        return []
    users = await db.users.find({"_id": {"$in": friend_oids}}).to_list(length=None)
    return [user_doc_to_out(u) for u in users]


@router.get("/friendRequests", response_model=List[FriendOut])
async def get_friend_requests(current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    docs = await db.friends.find({"friendId": user_id, "status": "pending"}).to_list(length=None)
    return [_friend_doc_to_out(doc) for doc in docs]


@router.post("/addFriend", response_model=FriendOut, status_code=201)
async def add_friend(payload: AddFriendRequest, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])

    if user_id == payload.friendId:
        raise HTTPException(status_code=400, detail="Cannot add yourself as a friend")

    db = get_db()
    friend_oid = validate_object_id(payload.friendId, "friend id")

    if not await db.users.find_one({"_id": friend_oid}):
        raise HTTPException(status_code=404, detail="User not found")

    if await db.friends.find_one({"userId": user_id, "friendId": payload.friendId}):
        raise HTTPException(status_code=409, detail="Friend request already sent")

    result = await db.friends.insert_one({
        "userId": user_id,
        "friendId": payload.friendId,
        "status": "pending",
    })

    return FriendOut(id=str(result.inserted_id), userId=user_id, friendId=payload.friendId, status="pending")


@router.post("/acceptFriend", response_model=FriendOut, status_code=200)
async def accept_friend(payload: AcceptFriendRequest, current_user=Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_db()
    doc_oid = validate_object_id(payload.id, "friend request id")

    request_doc = await db.friends.find_one({"_id": doc_oid, "friendId": user_id, "status": "pending"})
    if not request_doc:
        raise HTTPException(status_code=404, detail="No pending friend request found")

    await db.friends.update_one({"_id": doc_oid}, {"$set": {"status": "accepted"}})

    if not await db.friends.find_one({"userId": user_id, "friendId": request_doc["userId"]}):
        await db.friends.insert_one({
            "userId": user_id,
            "friendId": request_doc["userId"],
            "status": "accepted",
        })

    return FriendOut(id=str(request_doc["_id"]), userId=request_doc["userId"], friendId=user_id, status="accepted")


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str):
    db = get_db()
    oid = validate_object_id(user_id, "user id")
    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_doc_to_out(user)
