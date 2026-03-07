"""Webhook task — POST a templated payload to a URL."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
import structlog

from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task

logger = structlog.get_logger(__name__)


def _render_value(value: Any, context: dict[str, Any]) -> Any:
    """Recursively render {{template}} placeholders in strings, dicts, lists."""
    if isinstance(value, str):
        return _render_string(value, context)
    if isinstance(value, dict):
        return {k: _render_value(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [_render_value(item, context) for item in value]
    return value


def _render_string(template: str, context: dict[str, Any]) -> str:
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


@register_task("webhook")
class WebhookTask(BaseTask):
    """
    POSTs a JSON payload to a webhook URL.

    config:
        url: str          — required
        payload: dict     — template dict (supports {{task_id.field}} syntax)
        headers: dict     — optional additional headers
        timeout: int      — default 30
        method: str       — default POST
    """

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        url: str = self.config.get("url", "")
        if not url:
            raise TaskExecutionError("webhook task requires config.url")

        url = _render_string(url, context)
        payload: dict[str, Any] = _render_value(
            self.config.get("payload", {}), context
        )
        headers: dict[str, str] = self.config.get("headers", {})
        headers.setdefault("Content-Type", "application/json")
        timeout: int = self.config.get("timeout", 30)
        method: str = self.config.get("method", "POST").upper()

        logger.info("webhook_task_start", task_id=self.id, url=url, method=method)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    json=payload,
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise TaskExecutionError(f"Webhook timeout after {timeout}s") from exc
        except httpx.ConnectError as exc:
            raise TaskExecutionError(f"Webhook connection error: {exc}") from exc

        try:
            resp_body = response.json()
        except Exception:
            resp_body = response.text

        logger.info(
            "webhook_task_complete",
            task_id=self.id,
            status_code=response.status_code,
        )

        if response.status_code >= 400:
            raise TaskExecutionError(
                f"Webhook returned {response.status_code}",
                status_code=response.status_code,
            )

        return {
            "status": "ok",
            "status_code": response.status_code,
            "response": resp_body,
        }
