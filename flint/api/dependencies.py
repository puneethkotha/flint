"""FastAPI dependency injection."""

from __future__ import annotations

from typing import Any, AsyncGenerator

from fastapi import Depends, Request
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from flint.config import get_settings

X_API_KEY = APIKeyHeader(name="X-API-Key", auto_error=False)
HTTP_BEARER = HTTPBearer(auto_error=False)


def _get_user_from_jwt(request: Request) -> dict[str, Any] | None:
    """Extract and validate JWT from Authorization: Bearer. Returns payload or None."""
    from flint.api.jwt_utils import decode_jwt
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    payload = decode_jwt(token)
    if payload and "sub" in payload and "email" in payload:
        return payload
    return None


async def get_current_user_optional(request: Request) -> dict[str, Any] | None:
    """Return user payload from JWT if valid. None otherwise."""
    return _get_user_from_jwt(request)


async def verify_api_key(
    request: Request,
    x_api_key: str | None = Depends(X_API_KEY),
    bearer: HTTPAuthorizationCredentials | None = Depends(HTTP_BEARER),
) -> None:
    """
    Verify API key from X-API-Key header or Authorization: Bearer <key>.
    Bearer can be JWT (user auth) or API key. No-op when FLINT_API_KEY is blank (auth disabled).
    """
    settings = get_settings()
    # Valid JWT counts as auth
    user = _get_user_from_jwt(request)
    if user:
        request.state.user = user
        return
    # API key
    if not settings.flint_api_key:
        return

    key = x_api_key
    if key is None and bearer is not None:
        key = bearer.credentials

    if key != settings.flint_api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


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
