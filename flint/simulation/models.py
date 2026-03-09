"""Simulation data models — break circular imports."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from flint.simulation.risk_analyzer import Risk


class ConfidenceBasis(str, Enum):
    HISTORICAL_HIGH = "historical_high_volume"
    HISTORICAL_MED = "historical_medium_volume"
    HISTORICAL_LOW = "historical_low_volume"
    CLAUDE_KNOWLEDGE = "claude_api_knowledge"
    SANDBOX_EXEC = "sandbox_execution"
    DETERMINISTIC = "deterministic"
    PROPAGATED_ONLY = "propagated_uncertainty"


@dataclass
class NodeSimulation:
    node_id: str
    node_type: str
    predicted_output: dict
    raw_confidence: float
    propagated_confidence: float
    confidence_basis: ConfidenceBasis
    historical_run_count: int
    risks: list[Risk]
    warnings: list[str]
    predicted_duration_ms: int
    simulation_note: str


@dataclass
class CostEstimate:
    simulation_cost_usd: float
    real_run_cost_usd: float
    token_cost_usd: float
    external_api_cost_usd: float
    compute_cost_usd: float
    breakdown: list[dict]


@dataclass
class SimulationResult:
    simulation_id: uuid.UUID
    workflow_id: uuid.UUID
    workflow_name: str
    overall_confidence: float
    confidence_summary: str
    nodes: list[NodeSimulation]
    risks: list[Risk]
    cost_estimate: CostEstimate
    predicted_duration_ms: int
    total_nodes: int
    safe_to_run: bool
    simulation_duration_ms: int
    created_at: datetime
    calibration_accuracy: float | None
