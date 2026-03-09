"""
Phase 5b: Self-Healing Pipelines.

When a workflow fails 3x in a row, Flint:
  1. Analyzes the failure pattern
  2. Proposes a fix via Claude
  3. Creates a new workflow version
  4. Runs it in shadow mode (parallel, results not saved to main job)
  5. If shadow succeeds → promotes the fixed version automatically

HOW TO INTEGRATE:
  In the job completion handler (e.g. scheduler or API after a job fails),
  after persisting a failed job:
      from flint.engine.self_healing import SelfHealingEngine
      healer = SelfHealingEngine(pool=pool, workflow_id=job.workflow_id)
      await healer.check_and_heal()
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import anthropic
from asyncpg import Pool

from flint.config import get_settings
from flint.observability.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Number of consecutive failures before triggering self-healing
FAILURE_THRESHOLD = 3


class SelfHealingEngine:
    """
    Monitors workflow failure patterns and auto-proposes + tests fixes.
    Uses asyncpg pool (not SQLAlchemy).
    """

    def __init__(self, pool: Pool, workflow_id: uuid.UUID):
        self.pool = pool
        self.workflow_id = workflow_id

    async def check_and_heal(self) -> bool:
        """
        Check if the workflow has failed FAILURE_THRESHOLD times in a row.
        If so, run the full healing cycle. Returns True if healing was triggered.
        """
        consecutive_failures = await self._count_consecutive_failures()
        logger.info(
            "self_healing_check",
            workflow_id=str(self.workflow_id),
            consecutive_failures=consecutive_failures,
        )

        if consecutive_failures < FAILURE_THRESHOLD:
            return False

        logger.warning(
            "self_healing_triggered",
            workflow_id=str(self.workflow_id),
            failures=consecutive_failures,
        )
        await self._run_healing_cycle()
        return True

    async def _count_consecutive_failures(self) -> int:
        """Count how many consecutive failed jobs this workflow has had."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT status FROM jobs
                WHERE workflow_id = $1
                ORDER BY triggered_at DESC
                LIMIT $2
                """,
                self.workflow_id,
                FAILURE_THRESHOLD + 2,
            )
        count = 0
        for row in rows:
            if row["status"] == "failed":
                count += 1
            else:
                break
        return count

    async def _get_workflow(self) -> dict[str, Any] | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, dag_json, description FROM workflows WHERE id = $1",
                self.workflow_id,
            )
        if not row:
            return None
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "dag_json": row["dag_json"],
            "description": row["description"],
        }

    async def _get_last_failure(self) -> dict[str, Any] | None:
        """Get the most recent failed job's error details."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT j.id, j.error, j.failure_analysis,
                       te.task_id, te.task_type, te.error as task_error, te.input_data
                FROM jobs j
                LEFT JOIN task_executions te ON te.job_id = j.id AND te.status = 'failed'
                WHERE j.workflow_id = $1 AND j.status = 'failed'
                ORDER BY j.triggered_at DESC
                LIMIT 1
                """,
                self.workflow_id,
            )
        if not row:
            return None
        return {
            "job_id": str(row["id"]),
            "job_error": row["error"],
            "failure_analysis": row["failure_analysis"],
            "failed_task_id": row["task_id"],
            "failed_task_type": row["task_type"],
            "task_error": row["task_error"],
            "task_input": row["input_data"],
        }

    async def _propose_fix(self, workflow: dict, failure: dict) -> dict | None:
        """Call Claude to propose a fixed DAG definition."""
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        system = (
            "You are a workflow repair agent for Flint. "
            "You receive a failing workflow's DAG definition and the error that caused it to fail. "
            "You must return a fixed DAG JSON that addresses the root cause. "
            "Respond with ONLY the fixed DAG JSON — no markdown, no explanation. "
            "The JSON must be a valid Flint DAG definition."
        )

        user = (
            f"This workflow has failed {FAILURE_THRESHOLD} times in a row.\n\n"
            f"Workflow: {workflow['name']}\n"
            f"Current DAG:\n```json\n{json.dumps(workflow['dag_json'], indent=2)}\n```\n\n"
            f"Failed node: {failure.get('failed_task_id', 'unknown')}\n"
            f"Error: {failure.get('task_error') or failure.get('job_error', 'unknown')}\n\n"
            "Fix the DAG to prevent this failure. Return ONLY the fixed DAG JSON."
        )

        try:
            response = await client.messages.create(
                model="claude-opus-4-6",
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            raw = response.content[0].text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            return json.loads(raw)
        except Exception as e:
            logger.error("self_healing_propose_fix_failed", error=str(e))
            return None

    async def _save_candidate_version(self, fixed_dag: dict) -> int:
        """Save the proposed fix as a new workflow version."""
        async with self.pool.acquire() as conn:
            next_version = await conn.fetchval(
                "SELECT COALESCE(MAX(version_number), 0) + 1 FROM workflow_versions WHERE workflow_id = $1",
                self.workflow_id,
            )
            await conn.execute(
                """
                INSERT INTO workflow_versions (id, workflow_id, version_number, definition, change_summary)
                VALUES ($1, $2, $3, $4, $5)
                """,
                str(uuid.uuid4()),
                self.workflow_id,
                next_version,
                json.dumps(fixed_dag),
                f"Auto-fix by Flint self-healing (after {FAILURE_THRESHOLD} failures)",
            )
        return next_version

    async def _run_shadow_job(self, fixed_dag: dict) -> bool:
        """
        Run the fixed DAG in shadow mode (results not persisted to production).
        Returns True if the shadow job succeeded.
        """
        from flint.engine.executor import DAGExecutor

        logger.info("shadow_job_starting", workflow_id=str(self.workflow_id))
        shadow_job_id = uuid.uuid4()

        try:
            executor = DAGExecutor(db_pool=self.pool)
            result = await executor.execute_dag(
                dag=fixed_dag,
                job_id=str(shadow_job_id),
                is_shadow=True,
            )
            succeeded = result.status == "completed"
            logger.info(
                "shadow_job_finished",
                job_id=str(shadow_job_id),
                succeeded=succeeded,
            )
            return succeeded
        except Exception as e:
            logger.error("self_healing_shadow_error", error=str(e))
            return False

    async def _promote_fix(self, fixed_dag: dict, version_number: int) -> None:
        """Promote the fixed DAG to become the active workflow definition."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE workflows
                SET dag_json = $1, version = $2, updated_at = NOW()
                WHERE id = $3
                """,
                json.dumps(fixed_dag),
                version_number,
                self.workflow_id,
            )
        logger.info(
            "self_healing_promoted",
            workflow_id=str(self.workflow_id),
            version=version_number,
        )

    async def _run_healing_cycle(self) -> None:
        """Full healing cycle: analyze → fix → shadow → promote."""
        workflow = await self._get_workflow()
        if not workflow:
            logger.error("self_healing_workflow_not_found", workflow_id=str(self.workflow_id))
            return

        failure = await self._get_last_failure()
        if not failure:
            return

        # 1. Propose fix
        logger.info("self_healing_proposing_fix", workflow_id=str(self.workflow_id))
        fixed_dag = await self._propose_fix(workflow, failure)
        if not fixed_dag:
            logger.warning("self_healing_no_fix_proposed", workflow_id=str(self.workflow_id))
            return

        # 2. Save as candidate version
        version_number = await self._save_candidate_version(fixed_dag)
        logger.info("self_healing_candidate_saved", version=version_number)

        # 3. Shadow run
        shadow_ok = await self._run_shadow_job(fixed_dag)

        # 4. Promote if shadow succeeded
        if shadow_ok:
            await self._promote_fix(fixed_dag, version_number)
            logger.info(
                "self_healing_complete",
                workflow_id=str(self.workflow_id),
                promoted_version=version_number,
            )
        else:
            logger.warning(
                "self_healing_shadow_failed",
                workflow_id=str(self.workflow_id),
                candidate_version=version_number,
            )
