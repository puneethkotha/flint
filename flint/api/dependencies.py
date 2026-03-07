"""FastAPI dependency injection."""

from __future__ import annotations

from typing import Any

from fastapi import Request


async def get_db_pool(request: Request) -> Any:
    """Inject the asyncpg connection pool."""
    return request.app.state.db_pool


async def get_redis(request: Request) -> Any:
    """Inject the aioredis client."""
    return request.app.state.redis


async def get_executor(request: Request) -> Any:
    """Inject the DAGExecutor instance."""
    return request.app.state.executor
