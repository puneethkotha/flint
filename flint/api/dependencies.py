"""FastAPI dependency injection."""

from __future__ import annotations

from typing import Any, AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_db_pool(request: Request) -> Any:
    """Inject the asyncpg connection pool."""
    return request.app.state.db_pool


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Inject SQLAlchemy AsyncSession (for simulation module)."""
    async with request.app.state.sa_async_session() as session:
        yield session


async def get_redis(request: Request) -> Any:
    """Inject the aioredis client."""
    return request.app.state.redis


async def get_executor(request: Request) -> Any:
    """Inject the DAGExecutor instance."""
    return request.app.state.executor
