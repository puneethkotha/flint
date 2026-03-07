"""Task execution repository — asyncpg CRUD."""

from __future__ import annotations

import uuid

import structlog
from asyncpg import Pool

from flint.storage.models import TaskExecution

logger = structlog.get_logger(__name__)


class TaskExecRepository:
    def __init__(self, pool: Pool) -> None:
        self.pool = pool

    async def list_for_job(self, job_id: uuid.UUID) -> list[TaskExecution]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM task_executions
                   WHERE job_id=$1
                   ORDER BY started_at NULLS LAST, attempt_number""",
                job_id,
            )
        return [TaskExecution.from_record(r) for r in rows]

    async def get_latest(
        self, job_id: uuid.UUID, task_id: str
    ) -> TaskExecution | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT * FROM task_executions
                   WHERE job_id=$1 AND task_id=$2
                   ORDER BY attempt_number DESC LIMIT 1""",
                job_id, task_id,
            )
        if row is None:
            return None
        return TaskExecution.from_record(row)
