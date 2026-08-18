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

# The anonymous demo runs untrusted, user-described DAGs. Restrict it to task
# types that cannot execute arbitrary code on the server. shell/python/sql/AGENT
# are blocked here (they remain available to authenticated, self-hosted users).
DEMO_SAFE_TASK_TYPES = {"http", "llm", "webhook"}


def _unsafe_task_types(dag: dict) -> set[str]:
    types = set()
    for node in dag.get("nodes", []) or []:
        if isinstance(node, dict):
            t = str(node.get("type", "")).lower()
            if t and t not in DEMO_SAFE_TASK_TYPES:
                types.add(t)
    return types


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

    # Rate limit (best-effort — never fail the request if the store hiccups).
    try:
        if await redis.get(key):
            raise HTTPException(
                status_code=429,
                detail="Demo limit reached. You get one free run per day. Sign in to run unlimited workflows.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("demo_rate_check_skipped", error=str(exc))

    block_reason = check_content(body.description)
    if block_reason:
        raise HTTPException(status_code=400, detail=block_reason)

    try:
        dag = await parse_workflow(body.description)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Safety gate: the public demo executes only non-code task types.
    unsafe = _unsafe_task_types(dag)
    if unsafe:
        raise HTTPException(
            status_code=422,
            detail=(
                f"This workflow uses task types not allowed in the public demo "
                f"({', '.join(sorted(unsafe))}). The demo runs http, llm and webhook "
                f"tasks only. Sign in or self-host to run shell/python/sql/agent tasks."
            ),
        )

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
