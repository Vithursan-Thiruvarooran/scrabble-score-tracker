from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from pymongo.errors import DuplicateKeyError

from db import get_db
from models import TokenOut, UserLogin, UserOut, UserRegister
from services.auth import create_access_token, decode_access_token, hash_password, verify_password
from utils.helpers import user_doc_to_out

router = APIRouter(prefix="/auth")


async def get_current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.replace("Bearer ", "", 1).strip()
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = get_db()
    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")

    return user


def _to_auth_out(user: dict) -> UserOut:
    return UserOut(
        id=str(user["_id"]),
        email=user["email"],
        firstname=user["firstname"],
        lastname=user["lastname"],
        admin=user["admin"],
    )


@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: UserRegister):
    db = get_db()
    doc = payload.model_dump()
    password = doc.pop("password")
    doc["password_hash"] = hash_password(password)

    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Email already exists")

    doc["_id"] = result.inserted_id
    return _to_auth_out(doc)


@router.post("/login", response_model=TokenOut)
async def login(payload: UserLogin):
    db = get_db()
    user = await db.users.find_one({"email": payload.email})

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user["_id"]))
    return TokenOut(access_token=token)


@router.get("/me", response_model=UserOut)
async def me(current_user=Depends(get_current_user)):
    return _to_auth_out(current_user)
