"""
Base predictor — all node predictors inherit from this.

Drop into: flint/simulation/predictors/base.py
"""

from __future__ import annotations

import math
import uuid
from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from flint.simulation.confidence import ConfidencePropagator


class BasePredictor(ABC):
    """
    Abstract base for all node-type predictors.
    Provides shared DB query helpers and confidence utilities.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.propagator = ConfidencePropagator()

    @abstractmethod
    async def predict(
        self,
        node_id:          str,
        node_type:        str,
        config:           dict,
        workflow_id:      uuid.UUID,
        upstream_context: dict,
        input_data:       dict,
    ) -> Any:  # returns NodeSimulation
        ...

    # ---------------------------------------------------------------------------
    # Shared DB helpers
    # ---------------------------------------------------------------------------

    async def get_historical_runs(
        self,
        workflow_id: uuid.UUID,
        node_id:     str,
        limit:       int = 100,
    ) -> list[dict]:
        """
        Fetch recent successful task executions for this node.
        Returns list of {input_data, output_data, duration_ms, status}.
        """
        result = await self.db.execute(
            text("""
                SELECT te.input_data, te.output_data, te.duration_ms, te.status
                FROM task_executions te
                JOIN jobs j ON te.job_id = j.id
                WHERE j.workflow_id = :wf_id
                  AND te.task_id = :node_id
                  AND te.status = 'completed'
                  AND te.output_data IS NOT NULL
                ORDER BY te.completed_at DESC
                LIMIT :limit
            """),
            {"wf_id": str(workflow_id), "node_id": node_id, "limit": limit},
        )
        rows = result.fetchall()
        return [
            {
                "input":    r[0] or {},
                "output":   r[1] or {},
                "duration": r[2] or 500,
                "status":   r[3],
            }
            for r in rows
        ]

    def confidence_from_runs(self, runs: list[dict]) -> float:
        """Compute confidence from volume + consistency of historical runs."""
        n = len(runs)
        if n == 0:
            return 0.0

        # Volume confidence
        volume_conf = 1.0 - 0.5 * math.exp(-n / 20.0)

        # Consistency: do outputs have the same top-level keys?
        if n >= 2:
            key_sets = [frozenset(r["output"].keys()) for r in runs if isinstance(r["output"], dict)]
            if key_sets:
                most_common_keys = max(set(key_sets), key=key_sets.count)
                consistency = key_sets.count(most_common_keys) / len(key_sets)
            else:
                consistency = 0.5
        else:
            consistency = 0.6   # single run — some uncertainty

        return round(min(volume_conf * math.sqrt(consistency), 0.98), 4)

    def most_common_output(self, runs: list[dict]) -> dict:
        """Return the most frequently seen output structure from historical runs."""
        if not runs:
            return {}
        # Use the most recent run's output as the representative
        # (Most recent is most likely to match current behavior)
        return runs[0]["output"]

    def avg_duration(self, runs: list[dict]) -> int:
        """Average execution duration in ms from historical runs."""
        if not runs:
            return 500
        durations = [r["duration"] for r in runs if r.get("duration")]
        return int(sum(durations) / len(durations)) if durations else 500
