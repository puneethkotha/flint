"""Workflow repository — asyncpg CRUD."""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from asyncpg import Pool

from flint.storage.models import Workflow

logger = structlog.get_logger(__name__)


class WorkflowRepository:
    def __init__(self, pool: Pool) -> None:
        self.pool = pool

    async def create(self, dag: dict[str, Any]) -> Workflow:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO workflows (name, description, dag_json, schedule, timezone, tags)
                   VALUES ($1,$2,$3,$4,$5,$6)
                   RETURNING *""",
                dag.get("name", "Untitled"),
                dag.get("description"),
                json.dumps(dag),
                dag.get("schedule"),
                dag.get("timezone", "UTC"),
                dag.get("tags", []),
            )
        return Workflow.from_record(row)

    async def get(self, workflow_id: uuid.UUID) -> Workflow | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workflows WHERE id=$1", workflow_id
            )
        if row is None:
            return None
        return Workflow.from_record(row)

    async def list(
        self, limit: int = 50, offset: int = 0
    ) -> tuple[list[Workflow], int]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM workflows ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                limit, offset,
            )
            total = await conn.fetchval("SELECT COUNT(*) FROM workflows")
        return [Workflow.from_record(r) for r in rows], int(total or 0)

    async def update_status(self, workflow_id: uuid.UUID, status: str) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE workflows SET status=$1, updated_at=NOW() WHERE id=$2",
                status, workflow_id,
            )
        return result == "UPDATE 1"

    async def delete(self, workflow_id: uuid.UUID) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM workflows WHERE id=$1", workflow_id
            )
        return result == "DELETE 1"
