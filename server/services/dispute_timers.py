from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_tasks: dict[str, asyncio.Task] = {}


def schedule_dispute_timeout(
    game_id: str,
    timeout: int,
    resolve_fn,   # apply_resolve_dispute coroutine function
    emit_fn,      # sio.emit coroutine function
) -> None:
    cancel_dispute_timeout(game_id)

    async def _auto_accept() -> None:
        try:
            await asyncio.sleep(timeout)
            # Shield the resolve call so that task cancellation (from a concurrent
            # human resolve_dispute) cannot interrupt _persist mid-write and leave
            # MongoDB committed but the Redis cache stale.
            state, error = await asyncio.shield(
                resolve_fn(game_id, resolver_id=None, dispute=False)
            )
            if state and not error:
                await emit_fn("game_state", {"game_id": game_id, **state}, room=game_id)
                logger.info("dispute auto-accepted for game %s", game_id)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.exception("dispute auto-accept error for game %s: %s", game_id, exc)
        finally:
            _tasks.pop(game_id, None)

    _tasks[game_id] = asyncio.create_task(_auto_accept())
    logger.info("dispute timer scheduled: game=%s timeout=%ds", game_id, timeout)


def cancel_dispute_timeout(game_id: str) -> None:
    task = _tasks.pop(game_id, None)
    if task and not task.done():
        task.cancel()
        logger.info("dispute timer cancelled: game=%s", game_id)


def cancel_all() -> None:
    for game_id, task in list(_tasks.items()):
        if not task.done():
            task.cancel()
    _tasks.clear()
    logger.info("all dispute timers cancelled")
