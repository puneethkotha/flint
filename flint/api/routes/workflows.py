"""Workflow CRUD routes."""

from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from flint.api.dependencies import get_db_pool, get_executor
from flint.storage.audit import get_client_ip, get_trace_id, log_audit
from flint.api.routes.versions import save_workflow_version
from flint.moderation import check_content, check_dag_content
from flint.api.schemas import (
    CreateWorkflowRequest,
    SecretsResponse,
    SetSecretsRequest,
    UpdateScheduleRequest,
    UpdateWebhookRequest,
    WorkflowListResponse,
    WorkflowResponse,
)
from flint.storage.repositories.workflow_repo import WorkflowRepository

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/workflows", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    request: Request,
    body: CreateWorkflowRequest,
    pool: Annotated[object, Depends(get_db_pool)],
    executor: Annotated[object, Depends(get_executor)],
) -> WorkflowResponse:
    """Create a workflow from NL description or DAG JSON."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]

    if body.description:
        block_reason = check_content(body.description)
        if block_reason:
            raise HTTPException(status_code=400, detail=block_reason)
        from flint.parser.nl_parser import parse_workflow
        try:
            dag = await parse_workflow(body.description)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    else:
        dag_dict = body.dag.model_dump()  # type: ignore[union-attr]
        block_reason = check_dag_content(dag_dict)
        if block_reason:
            raise HTTPException(status_code=400, detail=block_reason)
        dag = dag_dict

    if body.schedule is not None:
        dag["schedule"] = body.schedule
        dag["timezone"] = body.timezone

    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.create(
        dag,
        workflow_secrets=body.workflow_secrets or None,
        webhook_url=body.webhook_url,
        user_id=uid,
    )

    await save_workflow_version(pool, workflow.id, workflow.dag_json, change_summary="Initial version")

    if workflow.schedule:
        from flint.engine.scheduler import schedule_workflow
        schedule_workflow(
            str(workflow.id),
            workflow.schedule,
            workflow.timezone or "UTC",
            executor=executor,
            db_pool=pool,
        )
    logger.info("workflow_created", workflow_id=str(workflow.id))
    await log_audit(
        pool,
        "workflow.create",
        "workflow",
        str(workflow.id),
        details={"name": workflow.name, "schedule": workflow.schedule},
        ip_address=get_client_ip(request),
        trace_id=get_trace_id(request),
    )

    if body.run_immediately:
        import asyncio
        job_id = str(uuid.uuid4())
        async with pool.acquire() as conn:  # type: ignore[attr-defined]
            await conn.execute(
                """INSERT INTO jobs (id, workflow_id, status, trigger_type)
                   VALUES ($1,$2,'queued','manual')""",
                uuid.UUID(job_id), workflow.id,
            )
        asyncio.create_task(executor.execute_dag(dag, job_id))  # type: ignore[attr-defined]

    return _to_response(workflow)


@router.get("/workflows", response_model=WorkflowListResponse)
async def list_workflows(
    request: Request,
    pool: Annotated[object, Depends(get_db_pool)],
    limit: int = 50,
    offset: int = 0,
    search: str | None = Query(None, description="Search by name or description"),
) -> WorkflowListResponse:
    """List workflows with pagination and optional search. When authenticated, returns only user's workflows."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflows, total = await repo.list(limit=limit, offset=offset, search=search, user_id=uid)
    return WorkflowListResponse(
        workflows=[_to_response(w) for w in workflows],
        total=total,
    )


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    request: Request,
    workflow_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
) -> WorkflowResponse:
    """Get a single workflow by ID. When authenticated, must own the workflow."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_response(workflow)


@router.patch("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow_schedule(
    request: Request,
    workflow_id: uuid.UUID,
    body: UpdateScheduleRequest,
    pool: Annotated[object, Depends(get_db_pool)],
    executor: Annotated[object, Depends(get_executor)],
) -> WorkflowResponse:
    """Update workflow schedule (cron). Set schedule=null to unschedule."""
    from flint.engine.scheduler import schedule_workflow, unschedule_workflow

    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    ok = await repo.update_schedule(
        workflow_id, body.schedule, body.timezone
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to update schedule")

    if body.schedule:
        schedule_workflow(
            str(workflow_id),
            body.schedule,
            body.timezone,
            executor=executor,
            db_pool=pool,
        )
    else:
        unschedule_workflow(str(workflow_id))

    workflow = await repo.get(workflow_id, user_id=uid)
    await log_audit(
        pool,
        "workflow.update_schedule",
        "workflow",
        str(workflow_id),
        details={"schedule": body.schedule, "timezone": body.timezone},
        ip_address=get_client_ip(request),
        trace_id=get_trace_id(request),
    )
    return _to_response(workflow)


@router.patch("/workflows/{workflow_id}/webhook", response_model=WorkflowResponse)
async def update_workflow_webhook(
    request: Request,
    workflow_id: uuid.UUID,
    body: UpdateWebhookRequest,
    pool: Annotated[object, Depends(get_db_pool)],
) -> WorkflowResponse:
    """Set or clear webhook URL for job completion/failure callbacks."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    await repo.update_webhook(workflow_id, body.webhook_url)
    workflow = await repo.get(workflow_id, user_id=uid)
    await log_audit(
        pool,
        "workflow.update_webhook",
        "workflow",
        str(workflow_id),
        details={"webhook_url_set": bool(body.webhook_url)},
        ip_address=get_client_ip(request),
        trace_id=get_trace_id(request),
    )
    return _to_response(workflow)


@router.put("/workflows/{workflow_id}/secrets", response_model=SecretsResponse)
async def set_workflow_secrets(
    request: Request,
    workflow_id: uuid.UUID,
    body: SetSecretsRequest,
    pool: Annotated[object, Depends(get_db_pool)],
) -> SecretsResponse:
    """Set workflow secrets. Values are masked in responses."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    await repo.set_secrets(workflow_id, body.secrets)
    await log_audit(
        pool,
        "workflow.set_secrets",
        "workflow",
        str(workflow_id),
        details={"keys": list(body.secrets.keys())},
        ip_address=get_client_ip(request),
        trace_id=get_trace_id(request),
    )
    return SecretsResponse(keys=list(body.secrets.keys()))


@router.get("/workflows/{workflow_id}/secrets", response_model=SecretsResponse)
async def get_workflow_secret_keys(
    request: Request,
    workflow_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
) -> SecretsResponse:
    """List workflow secret keys (values are never returned)."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return SecretsResponse(keys=list(workflow.workflow_secrets.keys()))


@router.delete("/workflows/{workflow_id}", status_code=204)
async def delete_workflow(
    request: Request,
    workflow_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
) -> None:
    """Delete a workflow by ID. Unschedule if currently scheduled."""
    from flint.engine.scheduler import unschedule_workflow

    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    user_id = getattr(request.state, "user", None)
    uid = uuid.UUID(user_id["sub"]) if user_id else None
    workflow = await repo.get(workflow_id, user_id=uid)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    unschedule_workflow(str(workflow_id))
    deleted = await repo.delete(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await log_audit(
        pool,
        "workflow.delete",
        "workflow",
        str(workflow_id),
        details={"name": workflow.name},
        ip_address=get_client_ip(request),
        trace_id=get_trace_id(request),
    )
    logger.info("workflow_deleted", workflow_id=str(workflow_id))


def _to_response(workflow: object) -> WorkflowResponse:
    from flint.storage.models import Workflow
    w: Workflow = workflow  # type: ignore[assignment]
    return WorkflowResponse(
        id=w.id,
        name=w.name,
        description=w.description,
        dag_json=w.dag_json,
        schedule=w.schedule,
        timezone=w.timezone,
        tags=w.tags,
        status=w.status,
        version=w.version,
        created_at=w.created_at,
        updated_at=w.updated_at,
        webhook_url=w.webhook_url,
    )
