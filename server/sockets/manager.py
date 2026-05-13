from __future__ import annotations

from typing import Optional


class SocketManager:
    """Tracks authenticated socket connections: user_id → {sid, ...}."""

    def __init__(self) -> None:
        self._user_sids: dict[str, set[str]] = {}
        self._sid_user: dict[str, str] = {}

    def add(self, user_id: str, sid: str) -> None:
        self._user_sids.setdefault(user_id, set()).add(sid)
        self._sid_user[sid] = user_id

    def remove(self, sid: str) -> Optional[str]:
        """Remove a sid, clean up its user mapping, and return the user_id."""
        user_id = self._sid_user.pop(sid, None)
        if user_id is not None:
            sids = self._user_sids.get(user_id)
            if sids is not None:
                sids.discard(sid)
                if not sids:
                    del self._user_sids[user_id]
        return user_id

    def get_sids(self, user_id: str) -> list[str]:
        return list(self._user_sids.get(user_id, set()))

    def get_user(self, sid: str) -> Optional[str]:
        return self._sid_user.get(sid)

    def is_online(self, user_id: str) -> bool:
        return bool(self._user_sids.get(user_id))
