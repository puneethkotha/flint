"""Health check endpoint."""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from flint.api.schemas import ComponentHealth, HealthResponse
from flint import __version__

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check health of all system components."""
    components: dict[str, ComponentHealth] = {}
    overall_ok = True

    # Check DB
    try:
        from flint.storage.database import get_pool
        t0 = time.monotonic()
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        latency = (time.monotonic() - t0) * 1000
        components["db"] = ComponentHealth(status="ok", latency_ms=round(latency, 2))
    except Exception as exc:
        components["db"] = ComponentHealth(status="error", error=str(exc)[:100])
        overall_ok = False

    # Check Redis
    try:
        from flint.storage.redis_client import ping_redis
        t0 = time.monotonic()
        ok = await ping_redis()
        latency = (time.monotonic() - t0) * 1000
        if ok:
            components["redis"] = ComponentHealth(status="ok", latency_ms=round(latency, 2))
        else:
            components["redis"] = ComponentHealth(status="error", error="ping failed")
            overall_ok = False
    except Exception as exc:
        components["redis"] = ComponentHealth(status="error", error=str(exc)[:100])
        overall_ok = False

    # Check Kafka
    try:
        from flint.streaming.producer import get_producer
        producer = await get_producer()
        if producer is not None:
            components["kafka"] = ComponentHealth(status="ok")
        else:
            components["kafka"] = ComponentHealth(
                status="error", error="producer not initialized"
            )
    except Exception as exc:
        components["kafka"] = ComponentHealth(status="error", error=str(exc)[:100])

    status = "ok" if overall_ok else "degraded"

    return HealthResponse(
        status=status,
        version=__version__,
        components=components,
        timestamp=datetime.now(tz=timezone.utc),
    )
