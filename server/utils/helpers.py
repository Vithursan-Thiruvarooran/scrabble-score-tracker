from bson import ObjectId
from fastapi import HTTPException

from models.user import UserOut


def user_doc_to_out(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        firstname=doc["firstname"],
        lastname=doc["lastname"],
        admin=doc["admin"],
    )


def validate_object_id(value: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
