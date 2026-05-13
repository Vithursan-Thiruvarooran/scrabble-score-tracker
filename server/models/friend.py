from typing import Literal

from pydantic import BaseModel


class FriendCreate(BaseModel):
    userId: str
    friendId: str
    status: Literal["pending", "accepted"] = "pending"


class FriendOut(BaseModel):
    id: str
    userId: str
    friendId: str
    status: Literal["pending", "accepted"]
