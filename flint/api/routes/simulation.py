"""
Simulation API Routes.

POST /api/v1/workflows/{id}/simulate   — run a simulation
GET  /api/v1/simulations/{id}          — get simulation result
POST /api/v1/simulations/{id}/calibrate — record real-run outcome for calibration
GET  /api/v1/simulations/stats/global  — global accuracy stats

Drop into: flint/api/routes/simulation.py

Add to flint/api/app.py:
    from flint.api.routes import simulation
    app.include_router(simulation.router, prefix="/api/v1", tags=["simulation"])
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from flint.api.dependencies import get_db
from flint.simulation.engine import SimulationEngine, SimulationResult
from flint.simulation.calibration import CalibrationTracker
from flint.observability.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SimulateRequest(BaseModel):
    input_data: dict | None = None
    include_calibration: bool = True  # include historical accuracy stats


class NodeSimulationResponse(BaseModel):
    node_id:               str
    node_type:             str
    predicted_output:      dict
    raw_confidence:        float
    propagated_confidence: float
    confidence_basis:      str
    historical_run_count:  int
    risks:                 list[dict]
    warnings:              list[str]
    predicted_duration_ms: int
    simulation_note:       str
    confidence_label:      str
    confidence_color:      str


class CostEstimateResponse(BaseModel):
    simulation_cost_usd:   float
    real_run_cost_usd:     float
    token_cost_usd:        float
    external_api_cost_usd: float
    compute_cost_usd:      float
    breakdown:             list[dict]


class SimulationResponse(BaseModel):
    simulation_id:         str
    workflow_id:           str
    workflow_name:         str
    overall_confidence:    float
    confidence_summary:    str
    nodes:                 list[NodeSimulationResponse]
    risks:                 list[dict]
    cost_estimate:         CostEstimateResponse
    predicted_duration_ms: int
    total_nodes:           int
    safe_to_run:           bool
    simulation_duration_ms: int
    created_at:            datetime
    calibration_accuracy:  float | None
    # Summary counts for UI badges
    critical_risk_count:   int
    warning_count:         int
    high_confidence_nodes: int


class CalibrateRequest(BaseModel):
    job_id:              str
    actual_node_outputs: dict[str, Any]  # {node_id: actual_output}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/workflows/{workflow_id}/simulate", response_model=SimulationResponse)
async def simulate_workflow(
    workflow_id: uuid.UUID,
    req: SimulateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a full simulation of this workflow.
    Returns predicted outputs, confidence scores, risks, and cost estimates
    without making any real API calls or database writes.
    """
    # Load workflow
    result = await db.execute(
        text("SELECT id, name, dag_json FROM workflows WHERE id = :id"),
        {"id": str(workflow_id)},
    )
    wf = result.fetchone()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    dag = wf[2]
    if not dag or not dag.get("nodes"):
        raise HTTPException(
            status_code=422,
            detail="Workflow has no nodes — create a workflow with a valid DAG first",
        )

    logger.info("simulation_request", workflow_id=str(workflow_id))

    engine = SimulationEngine(db)
    sim: SimulationResult = await engine.simulate(
        workflow_id=workflow_id,
        dag=dag,
        input_data=req.input_data,
    )

    from flint.simulation.confidence import ConfidencePropagator
    cp = ConfidencePropagator()

    return SimulationResponse(
        simulation_id=str(sim.simulation_id),
        workflow_id=str(sim.workflow_id),
        workflow_name=sim.workflow_name,
        overall_confidence=sim.overall_confidence,
        confidence_summary=sim.confidence_summary,
        nodes=[
            NodeSimulationResponse(
                node_id=n.node_id,
                node_type=n.node_type,
                predicted_output=n.predicted_output,
                raw_confidence=n.raw_confidence,
                propagated_confidence=n.propagated_confidence,
                confidence_basis=n.confidence_basis.value,
                historical_run_count=n.historical_run_count,
                risks=[
                    {
                        "level":    r.level.value,
                        "category": r.category.value,
                        "message":  r.message,
                        "detail":   r.detail,
                        "can_simulate_safely": r.can_simulate_safely,
                        "suggested_action":    r.suggested_action,
                    }
                    for r in n.risks
                ],
                warnings=n.warnings,
                predicted_duration_ms=n.predicted_duration_ms,
                simulation_note=n.simulation_note,
                confidence_label=cp.confidence_label(n.propagated_confidence),
                confidence_color=cp.confidence_color(n.propagated_confidence),
            )
            for n in sim.nodes
        ],
        risks=[
            {
                "level":    r.level.value,
                "category": r.category.value,
                "node_id":  r.node_id,
                "message":  r.message,
                "detail":   r.detail,
                "can_simulate_safely":   r.can_simulate_safely,
                "suggested_action":      r.suggested_action,
            }
            for r in sim.risks
        ],
        cost_estimate=CostEstimateResponse(
            simulation_cost_usd=sim.cost_estimate.simulation_cost_usd,
            real_run_cost_usd=sim.cost_estimate.real_run_cost_usd,
            token_cost_usd=sim.cost_estimate.token_cost_usd,
            external_api_cost_usd=sim.cost_estimate.external_api_cost_usd,
            compute_cost_usd=sim.cost_estimate.compute_cost_usd,
            breakdown=sim.cost_estimate.breakdown,
        ),
        predicted_duration_ms=sim.predicted_duration_ms,
        total_nodes=sim.total_nodes,
        safe_to_run=sim.safe_to_run,
        simulation_duration_ms=sim.simulation_duration_ms,
        created_at=sim.created_at,
        calibration_accuracy=sim.calibration_accuracy,
        critical_risk_count=sum(1 for r in sim.risks if r.level.value == "critical"),
        warning_count=sum(1 for r in sim.risks if r.level.value == "warning"),
        high_confidence_nodes=sum(1 for n in sim.nodes if n.propagated_confidence >= 0.80),
    )


@router.post("/simulations/{simulation_id}/calibrate")
async def record_calibration(
    simulation_id: uuid.UUID,
    req: CalibrateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Called automatically after a real job completes (preceded by a simulation).
    Compares predicted outputs to actual outputs and records accuracy.
    This is what makes Flint's confidence scores trustworthy over time.
    """
    tracker = CalibrationTracker(db)
    summary = await tracker.record_outcome(
        simulation_id=simulation_id,
        job_id=uuid.UUID(req.job_id),
        actual_node_outputs=req.actual_node_outputs,
    )
    return {"status": "recorded", "summary": summary}


@router.get("/simulations/stats/global")
async def global_simulation_stats(db: AsyncSession = Depends(get_db)):
    """
    Global calibration accuracy across all simulations.
    Shows how accurate Flint's predictions actually are.
    """
    tracker = CalibrationTracker(db)
    stats = await tracker.get_global_stats()
    return {
        "calibration": stats,
        "message": (
            "Well calibrated — predictions are reliable"
            if stats.get("well_calibrated")
            else "Building calibration data — run more workflows to improve accuracy"
        ),
    }
