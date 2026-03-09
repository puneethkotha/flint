"""OAuth (Google, GitHub) and JWT auth routes."""

from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from flint.api.dependencies import get_db_pool
from flint.config import get_settings

logger = structlog.get_logger(__name__)
router = APIRouter()


class UserInfo(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo


def _get_redirect_uri(request: Request, provider: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/v1/auth/callback/{provider}"


async def _get_or_create_user(pool, provider: str, provider_user_id: str, email: str, name: str | None, avatar_url: str | None):
    """Find or create user by OAuth provider. Returns (user_id, email, name, avatar_url)."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT u.id, u.email, u.name, u.avatar_url FROM users u
               JOIN auth_providers ap ON ap.user_id = u.id
               WHERE ap.provider = $1 AND ap.provider_user_id = $2""",
            provider, provider_user_id,
        )
        if row:
            return str(row["id"]), row["email"], row["name"], row["avatar_url"]
        # Check if user exists by email (link another provider)
        existing = await conn.fetchrow("SELECT id, email, name, avatar_url FROM users WHERE email = $1", email)
        if existing:
            await conn.execute(
                """INSERT INTO auth_providers (user_id, provider, provider_user_id)
                   VALUES ($1, $2, $3) ON CONFLICT (provider, provider_user_id) DO NOTHING""",
                existing["id"], provider, provider_user_id,
            )
            return str(existing["id"]), existing["email"], existing["name"], existing["avatar_url"]
        user_id = uuid.uuid4()
        await conn.execute(
            """INSERT INTO users (id, email, name, avatar_url) VALUES ($1, $2, $3, $4)""",
            user_id, email, name or email.split("@")[0], avatar_url,
        )
        await conn.execute(
            """INSERT INTO auth_providers (user_id, provider, provider_user_id) VALUES ($1, $2, $3)""",
            user_id, provider, provider_user_id,
        )
        return str(user_id), email, name or email.split("@")[0], avatar_url


@router.get("/auth/google")
async def auth_google(request: Request) -> RedirectResponse:
    """Redirect to Google OAuth."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    client = AsyncOAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=_get_redirect_uri(request, "google"),
        scope="openid email profile",
    )
    auth_url, _ = client.create_authorization_url(
        "https://accounts.google.com/o/oauth2/v2/auth",
        prompt="select_account",
    )
    return RedirectResponse(url=auth_url)


@router.get("/auth/github")
async def auth_github(request: Request) -> RedirectResponse:
    """Redirect to GitHub OAuth."""
    settings = get_settings()
    if not settings.github_client_id:
        raise HTTPException(status_code=503, detail="GitHub OAuth not configured")
    client = AsyncOAuth2Client(
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        redirect_uri=_get_redirect_uri(request, "github"),
        scope="user:email read:user",
    )
    auth_url, _ = client.create_authorization_url(
        "https://github.com/login/oauth/authorize",
    )
    return RedirectResponse(url=auth_url)


@router.get("/auth/callback/google")
async def auth_callback_google(
    request: Request,
    pool: Annotated[object, Depends(get_db_pool)],
) -> RedirectResponse:
    """Handle Google OAuth callback, create/find user, redirect with JWT."""
    return await _handle_oauth_callback(request, pool, "google", _fetch_google_user)


@router.get("/auth/callback/github")
async def auth_callback_github(
    request: Request,
    pool: Annotated[object, Depends(get_db_pool)],
) -> RedirectResponse:
    """Handle GitHub OAuth callback, create/find user, redirect with JWT."""
    return await _handle_oauth_callback(request, pool, "github", _fetch_github_user)


async def _fetch_google_user(client: AsyncOAuth2Client, token: dict):
    resp = await client.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        token=token,
    )
    data = resp.json()
    return data.get("sub"), data.get("email"), data.get("name"), data.get("picture")


async def _fetch_github_user(client: AsyncOAuth2Client, token: dict):
    resp = await client.get("https://api.github.com/user", token=token)
    data = resp.json()
    uid = str(data.get("id", ""))
    email = data.get("email")
    if not email:
        er = await client.get("https://api.github.com/user/emails", token=token)
        emails = er.json()
        for e in emails:
            if e.get("primary"):
                email = e.get("email")
                break
        if not email and emails:
            email = emails[0].get("email")
    return uid, email or "", data.get("name"), data.get("avatar_url")


async def _handle_oauth_callback(request: Request, pool, provider: str, fetch_user):
    settings = get_settings()
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    client_id = getattr(settings, f"{provider}_client_id", "")
    client_secret = getattr(settings, f"{provider}_client_secret", "")
    if not client_id:
        raise HTTPException(status_code=503, detail=f"{provider.title()} OAuth not configured")

    token_url = {
        "google": "https://oauth2.googleapis.com/token",
        "github": "https://github.com/login/oauth/access_token",
    }[provider]

    client = AsyncOAuth2Client(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=_get_redirect_uri(request, provider),
    )
    token = await client.fetch_token(
        token_url,
        code=code,
        authorization_response=str(request.url),
    )
    provider_user_id, email, name, avatar_url = await fetch_user(client, token)
    if not email:
        raise HTTPException(status_code=400, detail="Could not get email from provider")

    user_id, email, name, avatar_url = await _get_or_create_user(
        pool, provider, provider_user_id, email, name, avatar_url
    )
    from flint.api.jwt_utils import create_jwt
    jwt_token = create_jwt(user_id, email, name, avatar_url)
    redirect_base = (settings.auth_redirect_base_url or str(request.base_url)).rstrip("/")
    return RedirectResponse(url=f"{redirect_base}/auth/callback#token={jwt_token}")


def _create_jwt(user_id: str, email: str, name: str | None, avatar_url: str | None) -> str:
    import jwt
    from datetime import datetime, timedelta, timezone
    settings = get_settings()
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "avatar_url": avatar_url,
        "exp": datetime.now(tz=timezone.utc) + timedelta(days=7),
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, settings.flint_secret_key, algorithm="HS256")


def _decode_jwt(token: str) -> dict | None:
    from flint.api.jwt_utils import decode_jwt as _decode
    return _decode(token)


@router.get("/auth/me", response_model=UserInfo)
async def auth_me(request: Request) -> UserInfo:
    """Return current user from Bearer JWT. 401 if invalid/missing."""
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth[7:].strip()
    payload = _decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return UserInfo(
        id=payload["sub"],
        email=payload["email"],
        name=payload.get("name"),
        avatar_url=payload.get("avatar_url"),
    )
