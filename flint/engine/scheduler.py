"""APScheduler cron wrapper for scheduled workflow execution."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = structlog.get_logger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


async def start_scheduler() -> None:
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("scheduler_started")


async def stop_scheduler() -> None:
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")


def schedule_workflow(
    workflow_id: str,
    cron_expression: str,
    timezone: str = "UTC",
    executor: Any = None,
    db_pool: Any = None,
) -> str:
    """
    Register a workflow for cron execution.

    Returns the APScheduler job ID.
    """
    scheduler = get_scheduler()
    job_id = f"workflow_{workflow_id}"

    # Remove existing job if re-scheduling
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    # Parse cron: "0 9 * * *" → 5-field standard cron
    parts = cron_expression.strip().split()
    if len(parts) == 5:
        minute, hour, day, month, day_of_week = parts
    elif len(parts) == 6:
        _, minute, hour, day, month, day_of_week = parts
    else:
        raise ValueError(f"Invalid cron expression: {cron_expression!r}")

    trigger = CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone=timezone,
    )

    scheduler.add_job(
        func=_trigger_workflow,
        trigger=trigger,
        id=job_id,
        name=f"Flint workflow {workflow_id}",
        kwargs={
            "workflow_id": workflow_id,
            "executor": executor,
            "db_pool": db_pool,
        },
        replace_existing=True,
        misfire_grace_time=60,
    )

    logger.info(
        "workflow_scheduled",
        workflow_id=workflow_id,
        cron=cron_expression,
        timezone=timezone,
    )
    return job_id


def unschedule_workflow(workflow_id: str) -> None:
    """Remove a workflow from the cron schedule."""
    scheduler = get_scheduler()
    job_id = f"workflow_{workflow_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("workflow_unscheduled", workflow_id=workflow_id)


async def _trigger_workflow(
    workflow_id: str,
    executor: Any = None,
    db_pool: Any = None,
) -> None:
    """Called by APScheduler to trigger a scheduled workflow execution."""
    logger.info("scheduled_trigger", workflow_id=workflow_id)

    if db_pool is None or executor is None:
        logger.warning("scheduler_no_executor", workflow_id=workflow_id)
        return

    try:
        async with db_pool.acquire() as conn:
            workflow_row = await conn.fetchrow(
                "SELECT id, dag_json FROM workflows WHERE id=$1 AND status='active'",
                uuid.UUID(workflow_id),
            )
            if workflow_row is None:
                logger.warning("scheduled_workflow_not_found", workflow_id=workflow_id)
                return

            import json as _json

            dag = workflow_row["dag_json"]
            if isinstance(dag, str):
                dag = _json.loads(dag)

            job_id_str = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO jobs (id, workflow_id, status, trigger_type)
                   VALUES ($1,$2,'queued','cron')""",
                uuid.UUID(job_id_str), uuid.UUID(workflow_id),
            )

        await executor.execute_dag(dag, job_id_str)
    except Exception as exc:
        logger.error("scheduled_trigger_failed", workflow_id=workflow_id, error=str(exc))
