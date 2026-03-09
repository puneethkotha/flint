"""Job trigger and status routes."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from flint.api.dependencies import get_db_pool, get_executor
from flint.api.schemas import (
    JobListResponse,
    JobResponse,
    TaskExecutionResponse,
    TriggerJobRequest,
    TriggerJobResponse,
)
from flint.storage.audit import get_client_ip, get_trace_id, log_audit
from flint.storage.repositories.job_repo import JobRepository
from flint.storage.repositories.task_exec_repo import TaskExecRepository

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/jobs/trigger/{workflow_id}", response_model=TriggerJobResponse)
async def trigger_job(
    request: Request,
    workflow_id: uuid.UUID,
    body: TriggerJobRequest,
    pool: Annotated[object, Depends(get_db_pool)],
    executor: Annotated[object, Depends(get_executor)],
) -> TriggerJobResponse:
    """Trigger immediate execution of a workflow."""
    from flint.storage.repositories.workflow_repo import WorkflowRepository

    wf_repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await wf_repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if workflow.status != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Workflow is {workflow.status}, cannot trigger",
        )

    job_id = str(uuid.uuid4())
    idempotency_key = body.idempotency_key

    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        if idempotency_key:
            existing = await conn.fetchrow(
                "SELECT id FROM jobs WHERE idempotency_key=$1", idempotency_key
            )
            if existing:
                return TriggerJobResponse(
                    job_id=existing["id"],
                    status="duplicate",
                    status_url=f"/api/v1/jobs/{existing['id']}",
                )

        await conn.execute(
            """INSERT INTO jobs (id, workflow_id, status, trigger_type,
               input_data, idempotency_key)
               VALUES ($1,$2,'queued','manual',$3,$4)""",
            uuid.UUID(job_id),
            workflow_id,
            json.dumps(body.input_data),
            idempotency_key,
        )

    logger.info("job_triggered", job_id=job_id, workflow_id=str(workflow_id))
    await log_audit(
        pool,
        "job.trigger",
        "job",
        job_id,
        details={"workflow_id": str(workflow_id), "trigger_type": "manual"},
        ip_address=get_client_ip(request),
        trace_id=get_trace_id(request),
    )

    asyncio.create_task(
        executor.execute_dag(workflow.dag_json, job_id)  # type: ignore[attr-defined]
    )

    return TriggerJobResponse(
        job_id=uuid.UUID(job_id),
        status="queued",
        status_url=f"/api/v1/jobs/{job_id}",
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    request: Request,
    job_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
) -> JobResponse:
    """Get job status and task execution details by job ID. When authenticated, job must belong to user's workflow."""
    job_repo = JobRepository(pool)  # type: ignore[arg-type]
    task_repo = TaskExecRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None

    job = await job_repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        row = await conn.fetchrow(
            "SELECT user_id FROM workflows WHERE id=$1",
            job.workflow_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        if uid:
            if row["user_id"] != uid:
                raise HTTPException(status_code=404, detail="Job not found")
        else:
            if row["user_id"] is not None:
                raise HTTPException(status_code=404, detail="Job not found")

    task_execs = await task_repo.list_for_job(job_id)

    return JobResponse(
        id=job.id,
        workflow_id=job.workflow_id,
        status=job.status,
        trigger_type=job.trigger_type,
        triggered_at=job.triggered_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        duration_ms=job.duration_ms,
        input_data=job.input_data,
        output_data=job.output_data,
        error=job.error,
        failure_analysis=job.failure_analysis,
        task_executions=[
            TaskExecutionResponse(
                id=te.id,
                task_id=te.task_id,
                task_type=te.task_type,
                attempt_number=te.attempt_number,
                status=te.status,
                started_at=te.started_at,
                completed_at=te.completed_at,
                duration_ms=te.duration_ms,
                output_data=te.output_data,
                output_validated=te.output_validated,
                validation_passed=te.validation_passed,
                error=te.error,
                failure_type=te.failure_type,
            )
            for te in task_execs
        ],
    )


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    request: Request,
    pool: Annotated[object, Depends(get_db_pool)],
    workflow_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
    search: str | None = Query(None, description="Search by job ID or workflow name"),
) -> JobListResponse:
    """List jobs with optional filter by workflow ID and search. When authenticated, only user's jobs."""
    job_repo = JobRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    jobs, total = await job_repo.list(
        workflow_id=workflow_id,
        limit=limit,
        offset=offset,
        search=search,
        user_id=uid,
    )
    return JobListResponse(
        jobs=[
            JobResponse(
                id=j.id,
                workflow_id=j.workflow_id,
                status=j.status,
                trigger_type=j.trigger_type,
                triggered_at=j.triggered_at,
                started_at=j.started_at,
                completed_at=j.completed_at,
                duration_ms=j.duration_ms,
                input_data=j.input_data,
                output_data=j.output_data,
                error=j.error,
            )
            for j in jobs
        ],
        total=total,
    )


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(
    request: Request,
    job_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
    stream: bool = Query(False),
    search: str | None = Query(None, description="Filter by task_id or error content"),
) -> StreamingResponse:
    """Return job logs. With ?stream=true uses SSE. Use ?search= to filter by task_id or error."""
    task_repo = TaskExecRepository(pool)  # type: ignore[arg-type]
    job_repo = JobRepository(pool)  # type: ignore[arg-type]

    job = await job_repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        row = await conn.fetchrow(
            "SELECT user_id FROM workflows WHERE id=$1",
            job.workflow_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        uid = uuid.UUID(request.state.user["sub"]) if getattr(request.state, "user", None) else None
        if uid:
            if row["user_id"] != uid:
                raise HTTPException(status_code=404, detail="Job not found")
        else:
            if row["user_id"] is not None:
                raise HTTPException(status_code=404, detail="Job not found")

    async def generate_logs() -> object:
        task_execs = await task_repo.list_for_job(job_id, search=search)
        for te in task_execs:
            log_entry = {
                "task_id": te.task_id,
                "status": te.status,
                "started_at": te.started_at.isoformat() if te.started_at else None,
                "completed_at": te.completed_at.isoformat() if te.completed_at else None,
                "duration_ms": te.duration_ms,
                "error": te.error,
                "output": te.output_data,
            }
            if stream:
                yield f"data: {json.dumps(log_entry)}\n\n"
            else:
                yield json.dumps(log_entry) + "\n"

    media_type = "text/event-stream" if stream else "application/x-ndjson"
    return StreamingResponse(generate_logs(), media_type=media_type)
