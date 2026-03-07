"""HTTP task — performs an async HTTP request via httpx."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task

logger = structlog.get_logger(__name__)


@register_task("http")
class HttpTask(BaseTask):
    """
    Performs an HTTP request.

    config:
        url: str                  — required
        method: str               — default GET
        headers: dict             — optional
        body: dict | str          — optional request body
        params: dict              — optional query params
        timeout: int              — seconds, default 30
        expected_status: list[int]— default [200, 201, 202, 204]
    """

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        url: str = self.config.get("url", "")
        if not url:
            raise TaskExecutionError("http task requires config.url")

        method: str = self.config.get("method", "GET").upper()
        headers: dict[str, str] = self.config.get("headers", {})
        body: Any = self.config.get("body")
        params: dict[str, Any] = self.config.get("params", {})
        timeout: int = self.config.get("timeout", 30)
        expected_statuses: list[int] = self.config.get(
            "expected_status", [200, 201, 202, 204]
        )

        # Simple template substitution from context
        url = _render_template(url, context)
        if isinstance(body, str):
            body = _render_template(body, context)

        logger.info("http_task_start", task_id=self.id, method=method, url=url)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body if isinstance(body, dict) else None,
                    content=body.encode() if isinstance(body, str) else None,
                    params=params,
                )
        except httpx.TimeoutException as exc:
            raise TaskExecutionError(f"HTTP timeout after {timeout}s: {exc}") from exc
        except httpx.ConnectError as exc:
            raise TaskExecutionError(f"HTTP connection error: {exc}") from exc

        if response.status_code not in expected_statuses:
            raise TaskExecutionError(
                f"HTTP {method} {url} returned {response.status_code}",
                status_code=response.status_code,
            )

        try:
            response_body = response.json()
        except Exception:
            response_body = response.text

        logger.info(
            "http_task_complete",
            task_id=self.id,
            status_code=response.status_code,
        )
        return {
            "status": "ok",
            "status_code": response.status_code,
            "body": response_body,
            "headers": dict(response.headers),
            "url": str(response.url),
        }


def _render_template(template: str, context: dict[str, Any]) -> str:
    """Simple {{key}} template substitution from context."""
    import re

    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        parts = key.split(".")
        val: Any = context
        for part in parts:
            if isinstance(val, dict):
                val = val.get(part, match.group(0))
            else:
                return match.group(0)
        return str(val)

    return re.sub(r"\{\{(.+?)\}\}", replace, template)
