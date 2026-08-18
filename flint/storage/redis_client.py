"""
Redis async client with a transparent in-memory fallback.

Flint uses Redis for agent session/history, the agent SSE event queue, and the
demo rate-limiter. On a single-instance deployment where Redis isn't reachable
(e.g. a free-tier host without a Redis add-on), we fall back to an in-process
store so those features keep working instead of returning 500/503.

The fallback is single-instance only — it is NOT shared across replicas and is
lost on restart. That's the right trade-off for the free demo: a working Agent
mode beats a "correct" one that's simply down. When a real ``REDIS_URL`` is
reachable, the genuine client is used and nothing changes.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog

from flint.config import get_settings

logger = structlog.get_logger(__name__)

_client: Any | None = None
_using_fallback = False


class InMemoryRedis:
    """
    Minimal async, decode_responses=True Redis stand-in.

    Implements only the surface Flint actually uses: get/set/setex/delete/expire/
    incr and the list ops rpush/blpop (for the agent SSE queue). Values are stored
    as strings to mirror ``decode_responses=True``.
    """

    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._expiry: dict[str, float] = {}
        self._lists: dict[str, list[str]] = {}

    # ── internal helpers ──
    def _expired(self, key: str) -> bool:
        exp = self._expiry.get(key)
        if exp is not None and time.monotonic() > exp:
            self._kv.pop(key, None)
            self._expiry.pop(key, None)
            self._lists.pop(key, None)
            return True
        return False

    # ── string ops ──
    async def get(self, key: str) -> str | None:
        if self._expired(key):
            return None
        return self._kv.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None, **_: Any) -> bool:
        self._kv[key] = str(value)
        if ex is not None:
            self._expiry[key] = time.monotonic() + ex
        return True

    async def setex(self, key: str, ttl: int, value: Any) -> bool:
        return await self.set(key, value, ex=ttl)

    async def incr(self, key: str) -> int:
        if self._expired(key):
            current = 0
        else:
            current = int(self._kv.get(key, "0"))
        current += 1
        self._kv[key] = str(current)
        return current

    async def expire(self, key: str, ttl: int) -> bool:
        if key in self._kv or key in self._lists:
            self._expiry[key] = time.monotonic() + ttl
            return True
        return False

    async def delete(self, *keys: str) -> int:
        removed = 0
        for key in keys:
            if key in self._kv or key in self._lists:
                removed += 1
            self._kv.pop(key, None)
            self._expiry.pop(key, None)
            self._lists.pop(key, None)
        return removed

    # ── list ops (agent SSE queue) ──
    async def rpush(self, key: str, *values: str) -> int:
        self._expired(key)
        lst = self._lists.setdefault(key, [])
        lst.extend(str(v) for v in values)
        return len(lst)

    async def blpop(self, key: str, timeout: float = 0.0) -> tuple[str, str] | None:
        """Block until an item is available or ``timeout`` seconds elapse."""
        deadline = time.monotonic() + (timeout or 0.0)
        while True:
            self._expired(key)
            lst = self._lists.get(key)
            if lst:
                return key, lst.pop(0)
            if timeout and time.monotonic() >= deadline:
                return None
            if not timeout:
                return None
            await asyncio.sleep(0.02)

    # ── misc ──
    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:  # parity with redis.asyncio
        self._kv.clear()
        self._expiry.clear()
        self._lists.clear()


async def _try_real_redis() -> Any | None:
    """Create and ping a real Redis client. Return it if healthy, else None."""
    try:
        from redis.asyncio import from_url

        settings = get_settings()
        client = await from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        # A short ping proves reachability before we commit to it.
        await asyncio.wait_for(client.ping(), timeout=2.0)
        return client
    except Exception as exc:
        logger.warning("redis_unavailable_using_memory", error=str(exc))
        return None


async def get_redis() -> Any:
    """
    Return the global client, creating it on first use.

    Prefers a reachable Redis server; otherwise transparently uses an in-memory
    fallback so agent/demo features keep working on infra without Redis.
    """
    global _client, _using_fallback
    if _client is None:
        real = await _try_real_redis()
        if real is not None:
            _client = real
            _using_fallback = False
            logger.info("redis_client_ready", mode="redis")
        else:
            _client = InMemoryRedis()
            _using_fallback = True
            logger.info("redis_client_ready", mode="in-memory-fallback")
    return _client


def is_using_fallback() -> bool:
    """True when the in-memory fallback is active (no real Redis)."""
    return _using_fallback


async def close_redis() -> None:
    """Close the connection."""
    global _client, _using_fallback
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
        _client = None
        _using_fallback = False
        logger.info("redis_client_closed")


async def ping_redis() -> bool:
    """Check connectivity (in-memory fallback always reports healthy)."""
    try:
        client = await get_redis()
        return bool(await client.ping())
    except Exception as exc:
        logger.warning("redis_ping_failed", error=str(exc))
        return False
