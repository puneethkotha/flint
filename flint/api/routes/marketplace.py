"""Phase 5a: Workflow Marketplace — public gallery to share, fork, and remix workflows."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Annotated

from flint.api.dependencies import get_db_pool

logger = structlog.get_logger(__name__)
router = APIRouter()


class PublishWorkflowRequest(BaseModel):
    workflow_id: uuid.UUID
    author: str
    tags: list[str] = []
    readme: str = ""


class MarketplaceWorkflowResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    author: str
    tags: list[str]
    readme: str
    star_count: int
    fork_count: int
    run_count: int
    avg_duration_ms: int | None
    dag_json: dict
    published_at: Any


class MarketplaceListResponse(BaseModel):
    workflows: list[MarketplaceWorkflowResponse]
    total: int
    page: int
    limit: int


class ForkResponse(BaseModel):
    new_workflow_id: uuid.UUID
    message: str


@router.get("/marketplace", response_model=MarketplaceListResponse)
async def browse_marketplace(
    tag: str | None = Query(None),
    sort: str = Query("stars", enum=["stars", "forks", "newest", "runs"]),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    pool: Annotated[Any, Depends(get_db_pool)],
):
    """Browse community workflows."""
    offset = (page - 1) * limit
    order = {"stars": "star_count DESC", "forks": "fork_count DESC", "newest": "published_at DESC", "runs": "run_count DESC"}.get(sort, "star_count DESC")

    async with pool.acquire() as conn:
        if tag:
            rows = await conn.fetch(
                f"""SELECT id, name, description, author, tags, readme, star_count, fork_count, run_count, avg_duration_ms, dag_json, published_at
                    FROM marketplace_workflows WHERE $1 = ANY(tags) ORDER BY {order} LIMIT $2 OFFSET $3""",
                tag, limit, offset,
            )
            total = await conn.fetchval("SELECT COUNT(*) FROM marketplace_workflows WHERE $1 = ANY(tags)", tag)
        else:
            rows = await conn.fetch(
                f"""SELECT id, name, description, author, tags, readme, star_count, fork_count, run_count, avg_duration_ms, dag_json, published_at
                    FROM marketplace_workflows ORDER BY {order} LIMIT $1 OFFSET $2""",
                limit, offset,
            )
            total = await conn.fetchval("SELECT COUNT(*) FROM marketplace_workflows")

    def parse_dag(v):
        if isinstance(v, str):
            return json.loads(v)
        return v or {}

    return MarketplaceListResponse(
        workflows=[
            MarketplaceWorkflowResponse(
                id=r["id"], name=r["name"], description=r["description"] or "",
                author=r["author"], tags=list(r["tags"] or []), readme=r["readme"] or "",
                star_count=r["star_count"], fork_count=r["fork_count"], run_count=r["run_count"],
                avg_duration_ms=r["avg_duration_ms"], dag_json=parse_dag(r["dag_json"]),
                published_at=r["published_at"],
            )
            for r in rows
        ],
        total=total or 0,
        page=page,
        limit=limit,
    )


@router.post("/marketplace/publish", response_model=MarketplaceWorkflowResponse)
async def publish_workflow(
    req: PublishWorkflowRequest,
    pool: Annotated[Any, Depends(get_db_pool)],
):
    """Publish a workflow to the marketplace."""
    async with pool.acquire() as conn:
        wf = await conn.fetchrow(
            "SELECT id, name, dag_json, description FROM workflows WHERE id = $1",
            req.workflow_id,
        )
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")

        new_id = uuid.uuid4()
        dag = wf["dag_json"]
        if isinstance(dag, str):
            dag = json.loads(dag)
        await conn.execute(
            """INSERT INTO marketplace_workflows (id, name, description, author, tags, readme, dag_json, star_count, fork_count, run_count, published_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, NOW())
               ON CONFLICT (name, author) DO UPDATE SET description = EXCLUDED.description, dag_json = EXCLUDED.dag_json, tags = EXCLUDED.tags, readme = EXCLUDED.readme""",
            new_id, wf["name"], wf["description"] or "", req.author, req.tags, req.readme, json.dumps(dag),
        )

    logger.info("marketplace_published", workflow_id=str(req.workflow_id), author=req.author)
    return MarketplaceWorkflowResponse(
        id=new_id, name=wf["name"], description=wf["description"] or "", author=req.author,
        tags=req.tags, readme=req.readme, star_count=0, fork_count=0, run_count=0, avg_duration_ms=None,
        dag_json=dag if isinstance(dag, dict) else json.loads(dag), published_at=datetime.utcnow(),
    )


@router.post("/marketplace/{marketplace_id}/fork", response_model=ForkResponse)
async def fork_workflow(
    marketplace_id: uuid.UUID,
    pool: Annotated[Any, Depends(get_db_pool)],
):
    """Fork a marketplace workflow into your instance."""
    async with pool.acquire() as conn:
        mwf = await conn.fetchrow(
            "SELECT name, dag_json, description FROM marketplace_workflows WHERE id = $1",
            marketplace_id,
        )
        if not mwf:
            raise HTTPException(status_code=404, detail="Marketplace workflow not found")

        new_id = uuid.uuid4()
        dag = mwf["dag_json"]
        if isinstance(dag, str):
            dag = json.loads(dag)
        await conn.execute(
            """INSERT INTO workflows (id, name, dag_json, description, schedule, timezone, tags, created_at, updated_at, status, version)
               VALUES ($1, $2, $3, $4, NULL, 'UTC', '{}', NOW(), NOW(), 'active', 1)""",
            new_id, f"{mwf['name']} (fork)", json.dumps(dag), mwf["description"] or "",
        )
        await conn.execute(
            "UPDATE marketplace_workflows SET fork_count = fork_count + 1 WHERE id = $1",
            marketplace_id,
        )

    logger.info("marketplace_forked", marketplace_id=str(marketplace_id), new_id=str(new_id))
    return ForkResponse(new_workflow_id=new_id, message=f"Forked '{mwf['name']}' — your copy is ready to edit and run.")


@router.post("/marketplace/{marketplace_id}/star")
async def star_workflow(
    marketplace_id: uuid.UUID,
    pool: Annotated[Any, Depends(get_db_pool)],
):
    """Star a marketplace workflow."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE marketplace_workflows SET star_count = star_count + 1 WHERE id = $1 RETURNING star_count",
            marketplace_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workflow not found")
    return {"star_count": row["star_count"]}
