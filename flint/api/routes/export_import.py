"""Export and import workflows for backup and migration."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from flint.api.dependencies import get_db_pool
from flint.api.schemas import (
    ExportResponse,
    ExportWorkflowItem,
    ImportRequest,
    WorkflowListResponse,
    WorkflowResponse,
)
from flint.storage.repositories.workflow_repo import WorkflowRepository

router = APIRouter()


@router.get("/export", response_model=ExportResponse)
async def export_workflows(
    pool: Annotated[object, Depends(get_db_pool)],
) -> ExportResponse:
    """Export all workflows as JSON for backup or migration."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    workflows, _ = await repo.list(limit=10000, offset=0)

    items = [
        ExportWorkflowItem(
            id=w.id,
            name=w.name,
            description=w.description,
            dag_json=w.dag_json,
            schedule=w.schedule,
            timezone=w.timezone,
            tags=w.tags,
            webhook_url=w.webhook_url,
        )
        for w in workflows
    ]
    return ExportResponse(
        workflows=items,
        exported_at=datetime.now(tz=timezone.utc),
    )


@router.post("/import", response_model=WorkflowListResponse)
async def import_workflows(
    body: ImportRequest,
    pool: Annotated[object, Depends(get_db_pool)],
) -> WorkflowListResponse:
    """Import workflows from backup. Creates new workflows with new IDs. Does not schedule."""
    repo = WorkflowRepository(pool)  # type: ignore[arg-type]
    created = []

    for item in body.workflows:
        dag = {
            "name": item.name,
            "description": item.description or "",
            "nodes": item.dag_json.get("nodes", []),
            "schedule": item.schedule,
            "timezone": item.timezone,
            "tags": item.tags,
        }
        workflow = await repo.create(
            dag,
            webhook_url=item.webhook_url,
        )
        created.append(workflow)

    return WorkflowListResponse(
        workflows=[
            WorkflowResponse(
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
            for w in created
        ],
        total=len(created),
    )
