"""Job repository — asyncpg CRUD."""

from __future__ import annotations

import uuid

import structlog
from asyncpg import Pool

from flint.storage.models import Job

logger = structlog.get_logger(__name__)


class JobRepository:
    def __init__(self, pool: Pool) -> None:
        self.pool = pool

    async def get(self, job_id: uuid.UUID) -> Job | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM jobs WHERE id=$1", job_id)
        if row is None:
            return None
        return Job.from_record(row)

    async def list(
        self,
        workflow_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
        user_id: uuid.UUID | None = None,
    ) -> tuple[list[Job], int]:
        async with self.pool.acquire() as conn:
            parts: list[str] = []
            args: list = []
            if workflow_id:
                parts.append("j.workflow_id=$1")
                args.append(workflow_id)
            if user_id:
                n = len(args) + 1
                parts.append(f"j.workflow_id IN (SELECT id FROM workflows WHERE user_id=${n})")
                args.append(user_id)
            else:
                parts.append("j.workflow_id IN (SELECT id FROM workflows WHERE user_id IS NULL)")
            if search and search.strip():
                q = "%" + search.strip().replace("%", "\\%").replace("_", "\\_") + "%"
                n = len(args) + 1
                parts.append(
                    f"(j.id::text ILIKE ${n} OR j.workflow_id IN "
                    f"(SELECT w.id FROM workflows w WHERE w.name ILIKE ${n}))"
                )
                args.append(q)
            where_sql = " AND ".join(parts) if parts else "TRUE"
            # Use alias j for jobs to avoid ambiguity when subquery references workflows
            count_sql = f"SELECT COUNT(*) FROM jobs j WHERE {where_sql}"
            list_sql = (
                f"SELECT j.* FROM jobs j WHERE {where_sql} "
                f"ORDER BY j.triggered_at DESC LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}"
            )
            total = await conn.fetchval(count_sql, *args)
            rows = await conn.fetch(list_sql, *args, limit, offset)
        return [Job.from_record(r) for r in rows], int(total or 0)

    async def update_status(
        self,
        job_id: uuid.UUID,
        status: str,
        error: str | None = None,
    ) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE jobs SET status=$1, error=$2 WHERE id=$3",
                status, error, job_id,
            )
        return result == "UPDATE 1"
