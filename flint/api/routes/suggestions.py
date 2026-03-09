"""Personalized suggestions for Agent — from user's workflow history."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from flint.api.dependencies import get_db_pool
from flint.api.jwt_utils import decode_jwt
from flint.storage.repositories.workflow_repo import WorkflowRepository

router = APIRouter()

DEFAULT_SUGGESTIONS = [
    "Send me a daily 9am Slack summary of new GitHub issues",
    "Every hour, check our API latency and alert if > 500ms",
    "Fetch top HN posts and email them every Monday morning",
]


def _get_user_from_request(request: Request) -> dict | None:
    """Extract user from JWT if present. None otherwise."""
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    payload = decode_jwt(token)
    if payload and "sub" in payload:
        return payload
    return None


@router.get("/suggestions")
async def get_suggestions(
    request: Request,
    pool: Annotated[object, Depends(get_db_pool)],
) -> dict:
    """
    Return 3 workflow suggestions for the Agent empty state.
    When authenticated: returns user's recent workflow descriptions (personalized).
    When anonymous or no history: returns defaults.
    """
    user = _get_user_from_request(request)
    if not user:
        return {"suggestions": DEFAULT_SUGGESTIONS}

    uid = uuid.UUID(user["sub"])
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    workflows, _ = await repo.list(limit=10, offset=0, user_id=uid)

    # Extract descriptions from recent workflows (prefer description, fallback to name)
    seen: set[str] = set()
    personalized: list[str] = []
    for w in workflows:
        text = (w.description or w.name or "").strip()
        if text and text not in seen and len(text) > 10:
            seen.add(text)
            personalized.append(text[:120] + ("..." if len(text) > 120 else ""))
            if len(personalized) >= 3:
                break

    # Pad with defaults if needed
    result = list(personalized)
    for d in DEFAULT_SUGGESTIONS:
        if len(result) >= 3:
            break
        if d not in result:
            result.append(d)

    return {"suggestions": result[:3]}
