"""DAGExecutor — the heart of Flint. Async parallel DAG execution."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import structlog

from flint.engine.corruption import CorruptionDetector, ValidationResult, corruption_detector
from flint.engine.retry import FailureType, RetryExecutor, classify_failure
from flint.engine.tasks.base import BaseTask, TaskExecutionError, create_task
from flint.engine.topology import FlintCycleError, topological_sort

# Import all task types to register them
import flint.engine.tasks  # noqa: F401

logger = structlog.get_logger(__name__)


@dataclass
class TaskResult:
    task_id: str
    status: str  # "completed" | "failed" | "skipped"
    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    failure_type: str | None = None
    duration_ms: int = 0
    attempt_number: int = 1
    validation_passed: bool | None = None


@dataclass
class ExecutionResult:
    job_id: str
    status: str  # "completed" | "failed" | "halted"
    task_results: dict[str, TaskResult] = field(default_factory=dict)
    error: str | None = None
    duration_ms: int = 0
    corruption_detected: bool = False


class DAGExecutor:
    """Executes a DAG workflow asynchronously with parallel batches."""

    def __init__(
        self,
        db_pool: Any = None,
        redis_client: Any = None,
        kafka_producer: Any = None,
        ws_manager: Any = None,
    ) -> None:
        self.db_pool = db_pool
        self.redis_client = redis_client
        self.kafka_producer = kafka_producer
        self.ws_manager = ws_manager
        self.corruption_detector = corruption_detector
        self.retry_executor = RetryExecutor()

    async def execute_dag(
        self, dag: dict[str, Any], job_id: str
    ) -> ExecutionResult:
        """
        Execute a DAG workflow.

        1. Topological sort → execution batches
        2. For each batch: asyncio.gather all tasks in parallel
        3. After each task: validate output, handle corruption
        4. Pass outputs downstream via context
        """
        start_time = time.monotonic()
        nodes: list[dict[str, Any]] = dag.get("nodes", [])
        task_results: dict[str, TaskResult] = {}
        context: dict[str, Any] = {}  # task_id → output dict

        logger.info("dag_execution_start", job_id=job_id, node_count=len(nodes))
        await self._update_job_status(job_id, "running")

        try:
            batches = topological_sort(nodes)
        except FlintCycleError as exc:
            await self._update_job_status(job_id, "failed", error=str(exc))
            return ExecutionResult(
                job_id=job_id,
                status="failed",
                error=str(exc),
                duration_ms=int((time.monotonic() - start_time) * 1000),
            )

        for batch_index, batch in enumerate(batches):
            logger.info(
                "batch_start",
                job_id=job_id,
                batch=batch_index,
                tasks=[n["id"] for n in batch],
            )

            # Execute all tasks in this batch in parallel
            results = await asyncio.gather(
                *[self._execute_task_with_retry(node, job_id, context) for node in batch],
                return_exceptions=True,
            )

            # Process results
            halt = False
            for node, result in zip(batch, results):
                task_id = node["id"]

                if isinstance(result, Exception):
                    failure_type, _ = classify_failure(result)
                    task_result = TaskResult(
                        task_id=task_id,
                        status="failed",
                        error=str(result),
                        failure_type=failure_type.value,
                    )
                    task_results[task_id] = task_result
                    await self._persist_task_result(job_id, task_result)
                    await self._broadcast(job_id, task_id, "failed")
                    halt = True
                    continue

                task_result = result

                # Validate output
                task_obj = create_task(node)
                validations = self.corruption_detector.validate(task_obj, task_result.output)
                validation_passed = all(v.passed for v in validations)
                task_result.validation_passed = validation_passed

                if not validation_passed:
                    failed = [v for v in validations if not v.passed]
                    logger.warning(
                        "corruption_detected",
                        job_id=job_id,
                        task_id=task_id,
                        checks=[v.check_type for v in failed],
                    )
                    await self._handle_corruption(
                        job_id, task_id, task_result.output, validations
                    )
                    task_result.status = "failed"
                    task_result.error = f"Corruption detected: {[v.message for v in failed]}"
                    task_results[task_id] = task_result
                    await self._persist_task_result(job_id, task_result)
                    await self._broadcast(job_id, task_id, "failed")
                    halt = True
                    continue

                task_results[task_id] = task_result
                context[task_id] = task_result.output
                await self._persist_task_result(job_id, task_result)
                await self._broadcast(job_id, task_id, "completed")
                logger.info("task_complete", job_id=job_id, task_id=task_id)

            if halt:
                duration_ms = int((time.monotonic() - start_time) * 1000)
                await self._update_job_status(
                    job_id, "failed", output_data=self._collect_outputs(task_results)
                )
                return ExecutionResult(
                    job_id=job_id,
                    status="failed",
                    task_results=task_results,
                    duration_ms=duration_ms,
                    corruption_detected=any(
                        r.validation_passed is False for r in task_results.values()
                    ),
                )

        duration_ms = int((time.monotonic() - start_time) * 1000)
        output_data = self._collect_outputs(task_results)
        await self._update_job_status(
            job_id, "completed", output_data=output_data, duration_ms=duration_ms
        )
        logger.info("dag_execution_complete", job_id=job_id, duration_ms=duration_ms)

        return ExecutionResult(
            job_id=job_id,
            status="completed",
            task_results=task_results,
            duration_ms=duration_ms,
        )

    async def _execute_task_with_retry(
        self,
        node: dict[str, Any],
        job_id: str,
        context: dict[str, Any],
    ) -> TaskResult:
        """Execute a single task with retry logic."""
        task = create_task(node)
        retry_policy = task.retry_policy or {}
        start_time = time.monotonic()
        attempt = 1

        await self._update_task_status(job_id, task.id, "running", attempt)
        await self._broadcast(job_id, task.id, "running")

        async def attempt_fn() -> TaskResult:
            nonlocal attempt
            try:
                output = await asyncio.wait_for(
                    task.execute(context), timeout=task.timeout_seconds
                )
                duration_ms = int((time.monotonic() - start_time) * 1000)
                return TaskResult(
                    task_id=task.id,
                    status="completed",
                    output=output,
                    duration_ms=duration_ms,
                    attempt_number=attempt,
                )
            except (TaskExecutionError, asyncio.TimeoutError) as exc:
                raise exc
            except Exception as exc:
                raise TaskExecutionError(str(exc)) from exc

        async def on_retry(att: int, failure_type: FailureType, delay: float) -> None:
            nonlocal attempt
            attempt = att + 1
            logger.warning(
                "task_retry",
                job_id=job_id,
                task_id=task.id,
                attempt=attempt,
                failure_type=failure_type.value,
                delay=delay,
            )
            await self._update_task_status(
                job_id, task.id, "running", attempt,
                retry_reason=f"attempt {attempt} after {failure_type.value}"
            )

        return await self.retry_executor.run_with_retry(
            attempt_fn,
            task_config=retry_policy,
            attempt_callback=on_retry,
        )

    async def _update_job_status(
        self,
        job_id: str,
        status: str,
        error: str | None = None,
        output_data: dict[str, Any] | None = None,
        duration_ms: int | None = None,
    ) -> None:
        """Update job status in DB if pool available."""
        if self.db_pool is None:
            return
        try:
            now = datetime.now(tz=timezone.utc)
            async with self.db_pool.acquire() as conn:
                if status == "running":
                    await conn.execute(
                        "UPDATE jobs SET status=$1, started_at=$2 WHERE id=$3",
                        status, now, uuid.UUID(job_id),
                    )
                else:
                    await conn.execute(
                        """UPDATE jobs SET status=$1, completed_at=$2,
                           error=$3, output_data=$4, duration_ms=$5 WHERE id=$6""",
                        status, now, error,
                        json.dumps(output_data or {}),
                        duration_ms, uuid.UUID(job_id),
                    )
        except Exception as exc:
            logger.warning("job_status_update_failed", job_id=job_id, error=str(exc))

    async def _update_task_status(
        self,
        job_id: str,
        task_id: str,
        status: str,
        attempt: int = 1,
        retry_reason: str | None = None,
    ) -> None:
        """Upsert task execution status in DB."""
        if self.db_pool is None:
            return
        try:
            now = datetime.now(tz=timezone.utc)
            async with self.db_pool.acquire() as conn:
                existing = await conn.fetchrow(
                    "SELECT id FROM task_executions WHERE job_id=$1 AND task_id=$2 AND attempt_number=$3",
                    uuid.UUID(job_id), task_id, attempt,
                )
                if existing is None:
                    await conn.execute(
                        """INSERT INTO task_executions
                           (job_id, task_id, task_type, attempt_number, status, started_at)
                           VALUES ($1,$2,$3,$4,$5,$6)""",
                        uuid.UUID(job_id), task_id, "unknown", attempt, status, now,
                    )
                elif status == "running":
                    await conn.execute(
                        "UPDATE task_executions SET status=$1, started_at=$2 WHERE id=$3",
                        status, now, existing["id"],
                    )
        except Exception as exc:
            logger.warning(
                "task_status_update_failed",
                job_id=job_id,
                task_id=task_id,
                error=str(exc),
            )

    async def _persist_task_result(
        self, job_id: str, result: TaskResult
    ) -> None:
        """Write final task result to DB."""
        if self.db_pool is None:
            return
        try:
            now = datetime.now(tz=timezone.utc)
            async with self.db_pool.acquire() as conn:
                existing = await conn.fetchrow(
                    """SELECT id FROM task_executions
                       WHERE job_id=$1 AND task_id=$2 AND attempt_number=$3""",
                    uuid.UUID(job_id), result.task_id, result.attempt_number,
                )
                if existing:
                    await conn.execute(
                        """UPDATE task_executions
                           SET status=$1, completed_at=$2, duration_ms=$3,
                               output_data=$4, error=$5, output_validated=$6,
                               validation_passed=$7, failure_type=$8
                           WHERE id=$9""",
                        result.status, now, result.duration_ms,
                        json.dumps(result.output), result.error,
                        result.validation_passed is not None,
                        result.validation_passed, result.failure_type,
                        existing["id"],
                    )
        except Exception as exc:
            logger.warning(
                "task_result_persist_failed",
                job_id=job_id,
                task_id=result.task_id,
                error=str(exc),
            )

    async def _handle_corruption(
        self,
        job_id: str,
        task_id: str,
        output: dict[str, Any],
        validations: list[ValidationResult],
    ) -> None:
        """Record corruption events in DB and publish to Kafka."""
        if self.db_pool is None:
            return
        try:
            async with self.db_pool.acquire() as conn:
                exec_row = await conn.fetchrow(
                    "SELECT id FROM task_executions WHERE job_id=$1 AND task_id=$2 ORDER BY attempt_number DESC LIMIT 1",
                    uuid.UUID(job_id), task_id,
                )
                if exec_row is None:
                    return
                for v in validations:
                    if not v.passed:
                        await conn.execute(
                            """INSERT INTO corruption_events
                               (task_execution_id, check_type, expected, actual, action_taken)
                               VALUES ($1,$2,$3,$4,$5)""",
                            exec_row["id"], v.check_type,
                            json.dumps(v.expected), json.dumps(v.actual),
                            "halt_downstream",
                        )
        except Exception as exc:
            logger.warning("corruption_event_persist_failed", job_id=job_id, error=str(exc))

    async def _broadcast(self, job_id: str, task_id: str, status: str) -> None:
        """Broadcast task status update via WebSocket manager and Kafka."""
        msg = {
            "type": "task_update",
            "job_id": job_id,
            "task_id": task_id,
            "status": status,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        if self.ws_manager is not None:
            try:
                await self.ws_manager.broadcast_job(job_id, msg)
            except Exception:
                pass

        if self.kafka_producer is not None:
            try:
                from flint.streaming.producer import publish_event
                from flint.streaming.topics import TOPIC_TASK_EVENTS
                await publish_event(TOPIC_TASK_EVENTS, msg, key=job_id)
            except Exception:
                pass

    def _collect_outputs(self, task_results: dict[str, TaskResult]) -> dict[str, Any]:
        """Collect all completed task outputs."""
        return {
            tid: r.output
            for tid, r in task_results.items()
            if r.status == "completed"
        }
