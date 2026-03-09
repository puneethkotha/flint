"""Fire webhook callbacks on job completion or failure."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


async def fire_webhook(
    webhook_url: str,
    job_id: uuid.UUID,
    workflow_id: uuid.UUID,
    status: str,
    *,
    error: str | None = None,
    duration_ms: int | None = None,
    output_data: dict[str, Any] | None = None,
) -> None:
    """
    POST to webhook_url with job completion payload. Runs in background, does not block.
    """
    payload = {
        "job_id": str(job_id),
        "workflow_id": str(workflow_id),
        "status": status,
        "error": error,
        "duration_ms": duration_ms,
        "output_data": output_data or {},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "webhook_failed",
                    url=webhook_url,
                    status=resp.status_code,
                    body=resp.text[:200],
                )
            else:
                logger.info("webhook_delivered", url=webhook_url, job_id=str(job_id))
    except Exception as exc:
        logger.warning("webhook_error", url=webhook_url, error=str(exc))


def fire_webhook_background(
    webhook_url: str,
    job_id: uuid.UUID,
    workflow_id: uuid.UUID,
    status: str,
    *,
    error: str | None = None,
    duration_ms: int | None = None,
    output_data: dict[str, Any] | None = None,
) -> None:
    """Schedule webhook delivery in background; does not block caller."""
    asyncio.create_task(
        fire_webhook(
            webhook_url,
            job_id,
            workflow_id,
            status,
            error=error,
            duration_ms=duration_ms,
            output_data=output_data,
        )
    )
