"""JWT encode/decode for user sessions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from flint.config import get_settings


def create_jwt(user_id: str, email: str, name: str | None = None, avatar_url: str | None = None) -> str:
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


def decode_jwt(token: str) -> dict | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.flint_secret_key, algorithms=["HS256"])
    except Exception:
        return None
