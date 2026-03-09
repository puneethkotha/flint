"""
Calibration Tracker — what separates a real system from a gimmick.

After every real run that was preceded by a simulation, we compare:
  predicted_output ≈ actual_output?
  predicted_confidence calibrated?  (if we said 80%, were we right 80% of the time?)

This gives us a Brier score per node type, per workflow, and globally.
Over time, Flint can honestly say: "Our HTTP predictions are 91% accurate."

That's not a marketing claim — it's a measured, tracked number.
THIS is what makes ML engineers trust the system.

Drop into: flint/simulation/calibration.py
"""

from __future__ import annotations

import json
import math
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from flint.observability.logging import get_logger

logger = get_logger(__name__)


class CalibrationTracker:
    """
    Tracks prediction accuracy over time.

    Every simulation stores its predictions. When the real run finishes,
    we call record_outcome() to compare predicted vs actual and compute
    accuracy metrics.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_outcome(
        self,
        simulation_id: uuid.UUID,
        job_id:        uuid.UUID,
        actual_node_outputs: dict[str, Any],  # {node_id: actual_output}
    ) -> dict:
        """
        Called after the real job completes. Compares predictions to actuals.
        Updates calibration_records table.
        Returns a summary of accuracy for this run.
        """
        # Fetch simulation predictions
        result = await self.db.execute(
            text("SELECT node_predictions FROM workflow_simulations WHERE id = :id"),
            {"id": str(simulation_id)},
        )
        row = result.fetchone()
        if not row:
            return {}

        predictions = row[0] or []
        records = []

        for pred in predictions:
            node_id = pred.get("node_id")
            actual  = actual_node_outputs.get(node_id)
            if actual is None:
                continue

            predicted_output = pred.get("predicted_output", {})
            confidence       = pred.get("confidence", 0.5)

            # Compute structural similarity (are the keys the same?)
            shape_match = self._shape_similarity(predicted_output, actual)

            # Compute value similarity (rough, for non-sensitive fields)
            value_match = self._value_similarity(predicted_output, actual)

            # Combined accuracy: 60% shape, 40% value
            accuracy = shape_match * 0.6 + value_match * 0.4

            # Brier score component: (predicted_prob - outcome)^2
            # We treat accuracy > 0.7 as "prediction was correct" (binary)
            correct = 1.0 if accuracy >= 0.7 else 0.0
            brier   = (confidence - correct) ** 2

            records.append({
                "simulation_id": str(simulation_id),
                "job_id":        str(job_id),
                "node_id":       node_id,
                "predicted_confidence": confidence,
                "shape_accuracy":       shape_match,
                "value_accuracy":       value_match,
                "overall_accuracy":     accuracy,
                "brier_score":          brier,
                "correct":              correct > 0.5,
                "recorded_at":          datetime.utcnow(),
            })

        if records:
            for r in records:
                await self.db.execute(
                    text("""
                    INSERT INTO simulation_calibration_records
                        (simulation_id, job_id, node_id, predicted_confidence,
                         shape_accuracy, value_accuracy, overall_accuracy,
                         brier_score, correct, recorded_at)
                    VALUES
                        (:simulation_id, :job_id, :node_id, :predicted_confidence,
                         :shape_accuracy, :value_accuracy, :overall_accuracy,
                         :brier_score, :correct, :recorded_at)
                    """),
                    r,
                )
            await self.db.commit()

        avg_accuracy = (
            sum(r["overall_accuracy"] for r in records) / len(records)
            if records else 0.0
        )
        avg_brier = (
            sum(r["brier_score"] for r in records) / len(records)
            if records else 0.5
        )

        logger.info(
            "calibration_recorded",
            simulation_id=str(simulation_id),
            nodes=len(records),
            avg_accuracy=round(avg_accuracy, 3),
            brier_score=round(avg_brier, 3),
        )

        return {
            "nodes_evaluated": len(records),
            "avg_accuracy":    round(avg_accuracy, 3),
            "brier_score":     round(avg_brier, 3),
            "well_calibrated": avg_brier < 0.2,  # Brier < 0.2 = well calibrated
        }

    async def get_accuracy(self, workflow_id: uuid.UUID) -> float | None:
        """
        Get our historical prediction accuracy for this specific workflow.
        Returns None if we have < 5 data points (not enough to be meaningful).
        """
        result = await self.db.execute(
            text("""
            SELECT AVG(cr.overall_accuracy), COUNT(*)
            FROM simulation_calibration_records cr
            JOIN workflow_simulations ws ON cr.simulation_id::text = ws.id::text
            WHERE ws.workflow_id = :wf_id
            """),
            {"wf_id": str(workflow_id)},
        )
        row = result.fetchone()
        if not row or (row[1] or 0) < 5:
            return None
        return round(float(row[0] or 0), 3)

    async def get_global_stats(self) -> dict:
        """
        Global calibration stats across all workflows.
        This is what Flint displays on the benchmarks page.
        """
        result = await self.db.execute(
            text("""
            SELECT
                AVG(overall_accuracy)  as avg_accuracy,
                AVG(brier_score)       as avg_brier,
                COUNT(*)               as total_predictions,
                SUM(CASE WHEN correct THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as correct_rate
            FROM simulation_calibration_records
            WHERE recorded_at > NOW() - INTERVAL '30 days'
            """)
        )
        row = result.fetchone()
        if not row:
            return {}

        return {
            "avg_accuracy":      round(float(row[0] or 0), 3),
            "avg_brier_score":   round(float(row[1] or 0.5), 3),
            "total_predictions": int(row[2] or 0),
            "correct_rate":      round(float(row[3] or 0), 3),
            "well_calibrated":   (row[1] or 1.0) < 0.25,
            "window":            "last_30_days",
        }

    # ---------------------------------------------------------------------------
    # Similarity metrics
    # ---------------------------------------------------------------------------

    def _shape_similarity(self, predicted: Any, actual: Any) -> float:
        """
        Compare the STRUCTURE of two outputs (keys, types, nesting).
        Doesn't compare values — just shape. Returns 0–1.
        """
        if type(predicted) != type(actual):
            return 0.0

        if isinstance(predicted, dict) and isinstance(actual, dict):
            if not predicted and not actual:
                return 1.0
            all_keys = set(predicted) | set(actual)
            if not all_keys:
                return 1.0
            matching = sum(
                1 for k in all_keys
                if k in predicted and k in actual
                and type(predicted[k]) == type(actual[k])
            )
            return matching / len(all_keys)

        if isinstance(predicted, list) and isinstance(actual, list):
            if len(predicted) == 0 and len(actual) == 0:
                return 1.0
            # Compare lengths (within 2x = good shape match)
            if len(actual) == 0:
                return 0.0
            ratio = min(len(predicted), len(actual)) / max(len(predicted), len(actual))
            return ratio

        # Primitive types — shape matches if types match (already checked)
        return 1.0

    def _value_similarity(self, predicted: Any, actual: Any) -> float:
        """
        Compare VALUES, ignoring exact match for dynamic fields (IDs, timestamps).
        Compares things like: status codes, boolean flags, approximate numeric ranges.
        """
        if predicted == actual:
            return 1.0

        if isinstance(predicted, dict) and isinstance(actual, dict):
            scores = []
            for k in predicted:
                if k in actual:
                    # Skip likely-dynamic fields
                    if any(dyn in k.lower() for dyn in ("id", "timestamp", "created", "updated", "token", "nonce")):
                        continue
                    scores.append(self._value_similarity(predicted[k], actual[k]))
            return sum(scores) / len(scores) if scores else 0.5

        if isinstance(predicted, (int, float)) and isinstance(actual, (int, float)):
            # Within 20% of actual = good value prediction
            if actual == 0:
                return 1.0 if predicted == 0 else 0.0
            ratio = min(predicted, actual) / max(predicted, actual)
            return ratio if ratio >= 0.8 else 0.0

        if isinstance(predicted, str) and isinstance(actual, str):
            # Exact match for short strings (status codes, etc.)
            if len(predicted) < 20:
                return 1.0 if predicted == actual else 0.0
            # For longer strings: rough overlap
            pred_words = set(predicted.lower().split())
            actual_words = set(actual.lower().split())
            if not actual_words:
                return 0.0
            overlap = len(pred_words & actual_words) / len(actual_words)
            return min(overlap, 1.0)

        if isinstance(predicted, bool) and isinstance(actual, bool):
            return 1.0 if predicted == actual else 0.0

        return 0.0
