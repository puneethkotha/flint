"""Redis async client using redis[asyncio]."""

import structlog
from redis.asyncio import Redis, from_url

from flint.config import get_settings

logger = structlog.get_logger(__name__)

_redis: Redis | None = None


async def get_redis() -> Redis:
    """Return the global Redis client, creating it if needed."""
    global _redis
    if _redis is None:
        settings = get_settings()
        logger.info("creating_redis_client", url=settings.redis_url)
        _redis = await from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis


async def close_redis() -> None:
    """Close the Redis connection."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("redis_client_closed")


async def ping_redis() -> bool:
    """Check Redis connectivity."""
    try:
        client = await get_redis()
        result = await client.ping()
        return bool(result)
    except Exception as exc:
        logger.warning("redis_ping_failed", error=str(exc))
        return False
