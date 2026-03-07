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
    ) -> tuple[list[Job], int]:
        async with self.pool.acquire() as conn:
            if workflow_id:
                rows = await conn.fetch(
                    """SELECT * FROM jobs WHERE workflow_id=$1
                       ORDER BY triggered_at DESC LIMIT $2 OFFSET $3""",
                    workflow_id, limit, offset,
                )
                total = await conn.fetchval(
                    "SELECT COUNT(*) FROM jobs WHERE workflow_id=$1", workflow_id
                )
            else:
                rows = await conn.fetch(
                    "SELECT * FROM jobs ORDER BY triggered_at DESC LIMIT $1 OFFSET $2",
                    limit, offset,
                )
                total = await conn.fetchval("SELECT COUNT(*) FROM jobs")
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
