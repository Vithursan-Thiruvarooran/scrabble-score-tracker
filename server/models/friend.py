from typing import Literal

from pydantic import BaseModel


class AddFriendRequest(BaseModel):
    friendId: str


class AcceptFriendRequest(BaseModel):
    id: str


class FriendCreate(BaseModel):
    userId: str
    friendId: str
    status: Literal["pending", "accepted"] = "pending"


class FriendOut(BaseModel):
    id: str
    userId: str
    friendId: str
    status: Literal["pending", "accepted"]
