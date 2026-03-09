"""Workflow CRUD routes."""

from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from flint.api.dependencies import get_db_pool, get_executor
from flint.api.schemas import (
    CreateWorkflowRequest,
    WorkflowListResponse,
    WorkflowResponse,
)
from flint.storage.repositories.workflow_repo import WorkflowRepository

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/workflows", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    body: CreateWorkflowRequest,
    pool: Annotated[object, Depends(get_db_pool)],
    executor: Annotated[object, Depends(get_executor)],
) -> WorkflowResponse:
    """Create a workflow from NL description or DAG JSON."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]

    if body.description:
        from flint.parser.nl_parser import parse_workflow
        try:
            dag = await parse_workflow(body.description)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    else:
        dag = body.dag.model_dump()  # type: ignore[union-attr]

    if body.schedule is not None:
        dag["schedule"] = body.schedule
        dag["timezone"] = body.timezone

    workflow = await repo.create(dag)

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
    pool: Annotated[object, Depends(get_db_pool)],
    limit: int = 50,
    offset: int = 0,
) -> WorkflowListResponse:
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    workflows, total = await repo.list(limit=limit, offset=offset)
    return WorkflowListResponse(
        workflows=[_to_response(w) for w in workflows],
        total=total,
    )


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
) -> WorkflowResponse:
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    workflow = await repo.get(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_response(workflow)


@router.delete("/workflows/{workflow_id}", status_code=204)
async def delete_workflow(
    workflow_id: uuid.UUID,
    pool: Annotated[object, Depends(get_db_pool)],
) -> None:
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    deleted = await repo.delete(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
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
    )
