from typing import Optional
import base64
import hashlib
import hmac
import os
import secrets
import time

_TOKEN_EXPIRY = int(os.getenv("TOKEN_EXPIRY_SECONDS", str(60 * 60 * 24)))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_b64, digest_b64 = stored_hash.split("$", maxsplit=1)
        salt = base64.b64decode(salt_b64.encode())
        expected_digest = base64.b64decode(digest_b64.encode())
    except Exception:
        return False

    candidate_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return hmac.compare_digest(candidate_digest, expected_digest)


def _get_secret() -> str:
    secret = os.getenv("AUTH_SECRET", "")
    if not secret or secret == "dev-only-change-me":
        raise RuntimeError(
            "AUTH_SECRET env var must be set to a long random string. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    return secret


def create_access_token(user_id: str, expires_in_seconds: int = _TOKEN_EXPIRY) -> str:
    expiry = int(time.time()) + expires_in_seconds
    payload = f"{user_id}:{expiry}"
    signature = hmac.new(
        _get_secret().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{signature}"


def decode_access_token(token: str) -> Optional[str]:
    parts = token.split(":")
    if len(parts) != 3:
        return None

    user_id, expiry_raw, signature = parts
    payload = f"{user_id}:{expiry_raw}"
    expected_signature = hmac.new(
        _get_secret().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        expiry = int(expiry_raw)
    except ValueError:
        return None

    if expiry < int(time.time()):
        return None

    return user_id
