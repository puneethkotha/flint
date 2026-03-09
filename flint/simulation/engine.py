"""
Workflow Simulation Engine — Digital Twin Execution.

The brain of the simulation system. Runs an entire DAG without touching
real APIs, databases, or external services. Every external call is predicted
using a combination of:
  1. Historical run data (primary signal — grounded, calibrated)
  2. Claude's knowledge of the API/service (secondary signal)
  3. Sandbox execution for safe compute nodes (Python/shell)

Drop into: flint/simulation/engine.py
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import field
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from flint.observability.logging import get_logger
from flint.simulation.confidence import ConfidencePropagator
from flint.simulation.cost_estimator import CostEstimator
from flint.simulation.models import (
    NodeSimulation,
    CostEstimate,
    SimulationResult,
    ConfidenceBasis,
)
from flint.simulation.risk_analyzer import RiskAnalyzer, Risk, RiskLevel
from flint.simulation.calibration import CalibrationTracker
from flint.simulation.predictors.http_predictor import HttpPredictor
from flint.simulation.predictors.sql_predictor import SqlPredictor
from flint.simulation.predictors.llm_predictor import LlmPredictor
from flint.simulation.predictors.python_predictor import PythonPredictor
from flint.simulation.predictors.shell_predictor import ShellPredictor
from flint.simulation.predictors.agent_predictor import AgentPredictor

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Main Engine
# ---------------------------------------------------------------------------

class SimulationEngine:
    """
    Orchestrates full DAG simulation without touching real systems.

    Algorithm:
      1. Topological sort the DAG
      2. For each node (in dependency order):
         a. Collect predicted upstream outputs as context
         b. Route to appropriate predictor
         c. Propagate upstream confidence → node's final confidence
         d. Run risk analyzer
      3. Aggregate: overall confidence, total risk, cost estimate
      4. Return SimulationResult
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.propagator   = ConfidencePropagator()
        self.risk_analyzer = RiskAnalyzer()
        self.cost_estimator = CostEstimator()
        self.calibration   = CalibrationTracker(db)

        # Predictors keyed by node type
        self._predictors = {
            "http":    HttpPredictor(db),
            "sql":     SqlPredictor(db),
            "llm":     LlmPredictor(db),
            "python":  PythonPredictor(db),
            "shell":   ShellPredictor(db),
            "AGENT":   AgentPredictor(db),
            "webhook": HttpPredictor(db),   # webhooks behave like outbound HTTP
        }

    async def simulate(
        self,
        workflow_id: uuid.UUID,
        dag: dict,
        input_data: dict | None = None,
    ) -> SimulationResult:
        """
        Run a full simulation of the DAG. No real API calls are made.
        Returns a complete SimulationResult with confidence, risks, and cost estimates.
        """
        t_start = time.monotonic()
        sim_id  = uuid.uuid4()
        nodes   = dag.get("nodes", [])

        logger.info(
            "simulation_started",
            simulation_id=str(sim_id),
            workflow_id=str(workflow_id),
            node_count=len(nodes),
        )

        # Topological sort
        ordered = self._topological_sort(nodes)

        # Predict each node in order
        node_results:   dict[str, NodeSimulation] = {}
        all_risks:      list[Risk] = []

        for node in ordered:
            node_id   = node["id"]
            node_type = node.get("type", "http")
            deps      = node.get("dependencies", [])
            config    = node.get("config", {})

            # Build context from predicted upstream outputs
            upstream_context = {
                dep_id: node_results[dep_id].predicted_output
                for dep_id in deps
                if dep_id in node_results
            }
            upstream_confidences = [
                node_results[dep_id].propagated_confidence
                for dep_id in deps
                if dep_id in node_results
            ]

            # Get the right predictor
            predictor = self._predictors.get(node_type)
            if predictor is None:
                node_sim = self._unknown_node(node_id, node_type)
            else:
                node_sim = await predictor.predict(
                    node_id=node_id,
                    node_type=node_type,
                    config=config,
                    workflow_id=workflow_id,
                    upstream_context=upstream_context,
                    input_data=input_data or {},
                )

            # Propagate upstream uncertainty
            node_sim.propagated_confidence = self.propagator.propagate(
                raw_confidence=node_sim.raw_confidence,
                upstream_confidences=upstream_confidences,
            )

            # Risk analysis
            node_risks = await self.risk_analyzer.analyze(
                node_id=node_id,
                node_type=node_type,
                config=config,
                predicted_output=node_sim.predicted_output,
                confidence=node_sim.propagated_confidence,
            )
            node_sim.risks = node_risks
            all_risks.extend(node_risks)

            node_results[node_id] = node_sim
            logger.debug(
                "node_simulated",
                node_id=node_id,
                confidence=round(node_sim.propagated_confidence, 3),
                risks=len(node_risks),
            )

        # Overall confidence = geometric mean of propagated confidences
        all_sims = list(node_results.values())
        overall_conf = self.propagator.overall_confidence(
            [n.propagated_confidence for n in all_sims]
        )

        # Cost estimation
        cost = await self.cost_estimator.estimate(
            nodes=nodes,
            node_results=all_sims,
            workflow_id=workflow_id,
        )

        # Total predicted duration (critical path, not sum)
        predicted_ms = self._critical_path_duration(nodes, node_results)

        # Historical calibration accuracy for this workflow
        cal_accuracy = await self.calibration.get_accuracy(workflow_id)

        # Safe to run?
        has_critical = any(r.level == RiskLevel.CRITICAL for r in all_risks)
        safe_to_run  = not has_critical

        sim_duration = int((time.monotonic() - t_start) * 1000)

        result = SimulationResult(
            simulation_id=sim_id,
            workflow_id=workflow_id,
            workflow_name=dag.get("name", "Unnamed"),
            overall_confidence=overall_conf,
            confidence_summary=self._confidence_summary(overall_conf, all_sims),
            nodes=all_sims,
            risks=all_risks,
            cost_estimate=cost,
            predicted_duration_ms=predicted_ms,
            total_nodes=len(nodes),
            safe_to_run=safe_to_run,
            simulation_duration_ms=sim_duration,
            created_at=datetime.utcnow(),
            calibration_accuracy=cal_accuracy,
        )

        # Persist simulation for calibration tracking later
        await self._persist_simulation(result, dag)

        logger.info(
            "simulation_complete",
            simulation_id=str(sim_id),
            overall_confidence=round(overall_conf, 3),
            risks=len(all_risks),
            sim_duration_ms=sim_duration,
        )
        return result

    # ---------------------------------------------------------------------------
    # Internals
    # ---------------------------------------------------------------------------

    def _topological_sort(self, nodes: list[dict]) -> list[dict]:
        """Kahn's algorithm — returns nodes in dependency order."""
        id_to_node = {n["id"]: n for n in nodes}
        in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}
        for n in nodes:
            for dep in n.get("dependencies", []):
                in_degree[n["id"]] = in_degree.get(n["id"], 0) + 1

        queue = [n for n in nodes if in_degree[n["id"]] == 0]
        result = []
        while queue:
            node = queue.pop(0)
            result.append(node)
            for candidate in nodes:
                if node["id"] in candidate.get("dependencies", []):
                    in_degree[candidate["id"]] -= 1
                    if in_degree[candidate["id"]] == 0:
                        queue.append(candidate)
        return result

    def _critical_path_duration(
        self,
        nodes: list[dict],
        results: dict[str, NodeSimulation],
    ) -> int:
        """Return estimated wall-clock duration along the critical (longest) path."""
        earliest_finish: dict[str, int] = {}
        for node in self._topological_sort(nodes):
            nid = node["id"]
            deps = node.get("dependencies", [])
            start = max((earliest_finish.get(d, 0) for d in deps), default=0)
            dur = results[nid].predicted_duration_ms if nid in results else 500
            earliest_finish[nid] = start + dur
        return max(earliest_finish.values(), default=0)

    def _confidence_summary(self, conf: float, sims: list[NodeSimulation]) -> str:
        total_history = sum(s.historical_run_count for s in sims)
        pct = int(conf * 100)
        if conf >= 0.90:
            label = "High confidence"
        elif conf >= 0.70:
            label = "Medium confidence"
        else:
            label = "Low confidence"

        if total_history >= 50:
            return f"{label} — {pct}% (grounded in {total_history} historical runs)"
        elif total_history > 0:
            return f"{label} — {pct}% (partial history: {total_history} runs + Claude knowledge)"
        else:
            return f"{label} — {pct}% (no history — based on Claude API knowledge)"

    def _unknown_node(self, node_id: str, node_type: str) -> NodeSimulation:
        return NodeSimulation(
            node_id=node_id,
            node_type=node_type,
            predicted_output={"status": "unknown"},
            raw_confidence=0.5,
            propagated_confidence=0.5,
            confidence_basis=ConfidenceBasis.CLAUDE_KNOWLEDGE,
            historical_run_count=0,
            risks=[],
            warnings=[f"Unknown node type '{node_type}' — simulation is a best-guess"],
            predicted_duration_ms=1000,
            simulation_note=f"No predictor available for type '{node_type}'",
        )

    async def _persist_simulation(self, result: SimulationResult, dag: dict) -> None:
        """Store simulation for later calibration comparison."""
        try:
            import json
            await self.db.execute(
                text("""
                INSERT INTO workflow_simulations
                    (id, workflow_id, dag_snapshot, overall_confidence,
                     node_predictions, risks, cost_estimate, created_at)
                VALUES (:id, :wf_id, :dag::jsonb, :conf, :nodes::jsonb, :risks::jsonb, :cost::jsonb, :now)
                """),
                {
                    "id": str(result.simulation_id),
                    "wf_id": str(result.workflow_id),
                    "dag": json.dumps(dag),
                    "conf": result.overall_confidence,
                    "nodes": json.dumps([
                        {
                            "node_id": n.node_id,
                            "predicted_output": n.predicted_output,
                            "confidence": n.propagated_confidence,
                        }
                        for n in result.nodes
                    ]),
                    "risks": json.dumps([
                        {"level": r.level.value, "message": r.message, "node_id": r.node_id}
                        for r in result.risks
                    ]),
                    "cost": json.dumps({
                        "real_run_usd": result.cost_estimate.real_run_cost_usd,
                        "simulation_usd": result.cost_estimate.simulation_cost_usd,
                    }),
                    "now": result.created_at,
                },
            )
            await self.db.commit()
        except Exception as e:
            logger.warning("simulation_persist_failed", error=str(e))
