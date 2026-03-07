"""Lightweight request tracing via structlog context vars."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import structlog


@asynccontextmanager
async def trace_request(
    operation: str, **kwargs: str
) -> AsyncGenerator[str, None]:
    """Context manager that binds a trace_id to all log statements within."""
    trace_id = str(uuid.uuid4())[:8]
    structlog.contextvars.bind_contextvars(trace_id=trace_id, operation=operation, **kwargs)
    try:
        yield trace_id
    finally:
        structlog.contextvars.unbind_contextvars("trace_id", "operation", *kwargs.keys())
