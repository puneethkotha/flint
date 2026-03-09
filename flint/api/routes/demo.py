"""Demo run: one-time execution without storing. Rate limited per IP."""

from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from flint.api.dependencies import get_db_pool, get_executor, get_redis
from flint.api.schemas import ParseRequest
from flint.moderation import check_content
from flint.storage.audit import get_client_ip

logger = structlog.get_logger(__name__)
router = APIRouter()

DEMO_KEY_PREFIX = "flint:demo:"
DEMO_TTL_SECONDS = 86400  # 24 hours


@router.post("/demo/run")
async def demo_run(
    request: Request,
    body: ParseRequest,
    pool: Annotated[object, Depends(get_db_pool)],
    executor: Annotated[object, Depends(get_executor)],
    redis: Annotated[object, Depends(get_redis)],
) -> dict:
    """
    Run a workflow once as a demo. Nothing is stored. Rate limit: 1 per IP per 24h.
    Use this for anonymous users to try the product without signing in.
    """
    from flint.parser.nl_parser import parse_workflow

    ip = get_client_ip(request) or "0.0.0.0"
    key = f"{DEMO_KEY_PREFIX}{ip}"

    try:
        exists = await redis.get(key)
        if exists:
            raise HTTPException(
                status_code=429,
                detail="Demo limit reached. You get one free run per day. Sign in to run unlimited workflows.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("demo_redis_check_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="Demo service unavailable") from exc

    block_reason = check_content(body.description)
    if block_reason:
        raise HTTPException(status_code=400, detail=block_reason)

    try:
        dag = await parse_workflow(body.description)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    job_id = str(uuid.uuid4())
    result = await executor.execute_dag(dag, job_id, is_shadow=True)

    try:
        await redis.setex(key, DEMO_TTL_SECONDS, "1")
    except Exception as exc:
        logger.warning("demo_redis_set_failed", error=str(exc))

    task_outputs = {
        tid: {"status": r.status, "output": r.output, "error": r.error}
        for tid, r in result.task_results.items()
    }
    output_data = {
        tid: r.output
        for tid, r in result.task_results.items()
        if r.status == "completed"
    }
    return {
        "status": result.status,
        "duration_ms": result.duration_ms,
        "error": result.error,
        "task_results": task_outputs,
        "output_data": output_data,
        "dag": dag,
    }
