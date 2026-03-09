"""Pydantic v2 request/response schemas for the Flint API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ── Workflow schemas ─────────────────────────────────────────────────────────

class TaskNodeSchema(BaseModel):
    id: str
    name: str = ""
    type: str
    depends_on: list[str] = Field(default_factory=list)
    timeout_seconds: int = 300
    config: dict[str, Any] = Field(default_factory=dict)
    retry_policy: dict[str, Any] = Field(default_factory=dict)
    corruption_checks: dict[str, Any] = Field(default_factory=dict)


class DAGSchema(BaseModel):
    name: str
    description: str = ""
    schedule: str | None = None
    timezone: str = "UTC"
    tags: list[str] = Field(default_factory=list)
    nodes: list[TaskNodeSchema]


class CreateWorkflowRequest(BaseModel):
    """Create a workflow from either NL description or direct DAG JSON."""
    description: str | None = None
    dag: DAGSchema | None = None
    run_immediately: bool = False
    schedule: str | None = None
    timezone: str = "UTC"

    @field_validator("description", "dag", mode="before")
    @classmethod
    def at_least_one(cls, v: Any, info: Any) -> Any:
        return v

    def model_post_init(self, __context: Any) -> None:
        if not self.description and not self.dag:
            raise ValueError("Either 'description' or 'dag' is required")


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    dag_json: dict[str, Any]
    schedule: str | None
    timezone: str
    tags: list[str]
    status: str
    version: int
    created_at: datetime | None
    updated_at: datetime | None


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowResponse]
    total: int


# ── Job schemas ──────────────────────────────────────────────────────────────

class TriggerJobRequest(BaseModel):
    input_data: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None


class TriggerJobResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    status_url: str


class TaskExecutionResponse(BaseModel):
    id: uuid.UUID
    task_id: str
    task_type: str
    attempt_number: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    output_data: dict[str, Any]
    output_validated: bool
    validation_passed: bool | None
    error: str | None
    failure_type: str | None


class JobResponse(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    trigger_type: str
    triggered_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    input_data: dict[str, Any]
    output_data: dict[str, Any]
    error: str | None
    task_executions: list[TaskExecutionResponse] = Field(default_factory=list)


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int


# ── Parse schemas ────────────────────────────────────────────────────────────

class ParseRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=5000)


class ParseResponse(BaseModel):
    dag: dict[str, Any]
    node_count: int
    estimated_duration_seconds: int | None = None
    warnings: list[str] = Field(default_factory=list)


# ── Health schema ────────────────────────────────────────────────────────────

class ComponentHealth(BaseModel):
    status: str  # "ok" | "error"
    latency_ms: float | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: str  # "ok" | "degraded" | "error"
    version: str
    components: dict[str, ComponentHealth]
    timestamp: datetime


# ── WebSocket message schema ─────────────────────────────────────────────────

class WSMessage(BaseModel):
    type: str
    job_id: str
    task_id: str | None = None
    status: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = ""
