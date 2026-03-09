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

    async def create(
        self,
        dag: dict[str, Any],
        workflow_secrets: dict[str, Any] | None = None,
        webhook_url: str | None = None,
        user_id: uuid.UUID | None = None,
    ) -> Workflow:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO workflows (name, description, dag_json, schedule, timezone, tags,
                   workflow_secrets, webhook_url, user_id)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                   RETURNING *""",
                dag.get("name", "Untitled"),
                dag.get("description"),
                json.dumps(dag),
                dag.get("schedule"),
                dag.get("timezone", "UTC"),
                dag.get("tags", []),
                json.dumps(workflow_secrets or {}),
                webhook_url,
                user_id,
            )
        return Workflow.from_record(row)

    async def get(
        self,
        workflow_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
    ) -> Workflow | None:
        async with self.pool.acquire() as conn:
            if user_id:
                row = await conn.fetchrow(
                    "SELECT * FROM workflows WHERE id=$1 AND user_id=$2",
                    workflow_id, user_id,
                )
            else:
                # No user: only allow access to unowned workflows
                row = await conn.fetchrow(
                    "SELECT * FROM workflows WHERE id=$1 AND user_id IS NULL",
                    workflow_id,
                )
        if row is None:
            return None
        return Workflow.from_record(row)

    async def list(
        self,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
        user_id: uuid.UUID | None = None,
    ) -> tuple[list[Workflow], int]:
        parts: list[str] = []
        args: list = []
        if search and search.strip():
            q = "%" + search.strip().replace("%", "\\%").replace("_", "\\_") + "%"
            parts.append(f"(name ILIKE ${len(args)+1} OR description ILIKE ${len(args)+1})")
            args.append(q)
        if user_id:
            n = len(args) + 1
            parts.append(f"user_id=${n}")
            args.append(user_id)
        else:
            # No user: only show unowned workflows (legacy). Logged-in users see their own.
            parts.append("user_id IS NULL")
        where = " AND ".join(parts) if parts else "TRUE"
        args.extend([limit, offset])
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                f"SELECT * FROM workflows WHERE {where} ORDER BY created_at DESC LIMIT ${len(args)-1} OFFSET ${len(args)}",
                *args,
            )
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM workflows WHERE {where}",
                *args[:-2],
            )
        return [Workflow.from_record(r) for r in rows], int(total or 0)

    async def update_status(self, workflow_id: uuid.UUID, status: str) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE workflows SET status=$1, updated_at=NOW() WHERE id=$2",
                status, workflow_id,
            )
        return result == "UPDATE 1"

    async def update_schedule(
        self,
        workflow_id: uuid.UUID,
        schedule: str | None,
        timezone: str = "UTC",
    ) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE workflows SET schedule=$1, timezone=$2, updated_at=NOW() WHERE id=$3",
                schedule, timezone, workflow_id,
            )
        return result == "UPDATE 1"

    async def update_webhook(self, workflow_id: uuid.UUID, webhook_url: str | None) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE workflows SET webhook_url=$1, updated_at=NOW() WHERE id=$2",
                webhook_url, workflow_id,
            )
        return result == "UPDATE 1"

    async def set_secrets(self, workflow_id: uuid.UUID, secrets: dict[str, Any]) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE workflows SET workflow_secrets=$1, updated_at=NOW() WHERE id=$2",
                json.dumps(secrets), workflow_id,
            )
        return result == "UPDATE 1"

    async def get_webhook_url(self, workflow_id: uuid.UUID) -> str | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT webhook_url FROM workflows WHERE id=$1", workflow_id
            )
        return row["webhook_url"] if row else None

    async def delete(self, workflow_id: uuid.UUID) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM workflows WHERE id=$1", workflow_id
            )
        return result == "DELETE 1"
