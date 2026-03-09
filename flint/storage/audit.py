"""Audit logging for compliance and trust."""

from __future__ import annotations

import json
from typing import Any

import structlog
from asyncpg import Pool

logger = structlog.get_logger(__name__)


async def log_audit(
    pool: Pool,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    *,
    actor_id: str | None = None,
    actor_type: str = "api_key",
    ip_address: str | None = None,
    trace_id: str | None = None,
) -> None:
    """
    Append an audit log entry. Fire-and-forget; errors are logged but not raised.
    """
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO audit_logs
                   (actor_id, actor_type, action, resource_type, resource_id, details, ip_address, trace_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                actor_id,
                actor_type,
                action,
                resource_type,
                resource_id,
                json.dumps(details or {}),
                ip_address,
                trace_id,
            )
    except Exception as exc:
        logger.warning("audit_log_failed", action=action, error=str(exc))


def get_client_ip(request: Any) -> str | None:
    """Extract client IP from request (X-Forwarded-For or direct)."""
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if hasattr(request, "client") and request.client:
        return request.client.host
    return None


def get_trace_id(request: Any) -> str | None:
    """Get trace_id from request state or header."""
    if request is None:
        return None
    if hasattr(request.state, "trace_id"):
        return getattr(request.state, "trace_id", None)
    return request.headers.get("X-Trace-ID")
