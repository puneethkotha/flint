"""Pydantic v2 request/response schemas for the Flint API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Workflow schemas ─────────────────────────────────────────────────────────

class TaskNodeSchema(BaseModel):
    """A single task node in a workflow DAG."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "id": "task-1",
            "name": "Fetch data",
            "type": "http",
            "depends_on": [],
            "timeout_seconds": 300,
            "config": {"url": "https://api.example.com/data"},
            "retry_policy": {},
            "corruption_checks": {},
        }],
    })
    id: str
    name: str = ""
    type: Literal["http", "shell", "python", "sql", "llm", "webhook", "AGENT"]
    depends_on: list[str] = Field(default_factory=list)
    timeout_seconds: int = 300
    config: dict[str, Any] = Field(default_factory=dict)
    retry_policy: dict[str, Any] = Field(default_factory=dict)
    corruption_checks: dict[str, Any] = Field(default_factory=dict)


class DAGSchema(BaseModel):
    """Directed Acyclic Graph definition for a workflow."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "name": "Daily sync",
            "description": "Sync data from API to database",
            "schedule": "0 9 * * *",
            "timezone": "UTC",
            "tags": ["etl", "daily"],
            "nodes": [
                {"id": "fetch", "name": "Fetch", "type": "http", "depends_on": []},
                {"id": "transform", "name": "Transform", "type": "python", "depends_on": ["fetch"]},
            ],
        }],
    })
    name: str
    description: str = ""
    schedule: str | None = None
    timezone: str = "UTC"
    tags: list[str] = Field(default_factory=list)
    nodes: list[TaskNodeSchema]


class CreateWorkflowRequest(BaseModel):
    """Create a workflow from either NL description or direct DAG JSON."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [
            {"description": "Every day at 9am fetch data from API and save to database", "run_immediately": False},
            {"dag": {"name": "Manual ETL", "description": "", "nodes": [{"id": "step1", "name": "Extract", "type": "http", "depends_on": []}]}, "run_immediately": True},
        ],
    })
    description: str | None = None
    dag: DAGSchema | None = None
    run_immediately: bool = False
    schedule: str | None = None
    timezone: str = "UTC"
    webhook_url: str | None = None
    workflow_secrets: dict[str, str] = Field(default_factory=dict)

    @field_validator("description", "dag", mode="before")
    @classmethod
    def at_least_one(cls, v: Any, info: Any) -> Any:
        return v

    def model_post_init(self, __context: Any) -> None:
        if not self.description and not self.dag:
            raise ValueError("Either 'description' or 'dag' is required")


class WorkflowResponse(BaseModel):
    """Workflow metadata and DAG definition."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Daily sync",
            "description": "Sync data from API",
            "dag_json": {"name": "Daily sync", "nodes": []},
            "schedule": "0 9 * * *",
            "timezone": "UTC",
            "tags": ["etl"],
            "status": "active",
            "version": 1,
            "created_at": "2025-01-15T09:00:00Z",
            "updated_at": "2025-01-15T09:00:00Z",
        }],
    })
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
    webhook_url: str | None = None


class WorkflowListResponse(BaseModel):
    """Paginated list of workflows."""
    workflows: list[WorkflowResponse]
    total: int


class UpdateScheduleRequest(BaseModel):
    """Update workflow schedule (cron expression). Set schedule=null to unschedule."""
    schedule: str | None = None
    timezone: str = "UTC"


class UpdateWebhookRequest(BaseModel):
    """Set or clear webhook URL for job completion/failure callbacks."""
    webhook_url: str | None = None


class SetSecretsRequest(BaseModel):
    """Set workflow secrets. Keys are secret names; values are secret values (masked in responses)."""
    secrets: dict[str, str] = Field(default_factory=dict)


class SecretsResponse(BaseModel):
    """Workflow secret keys (values masked)."""
    keys: list[str] = Field(default_factory=list)


# ── Job schemas ──────────────────────────────────────────────────────────────

class TriggerJobRequest(BaseModel):
    """Input for triggering a workflow run."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"input_data": {"source": "api"}, "idempotency_key": "run-abc123"}],
    })
    input_data: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None


class TriggerJobResponse(BaseModel):
    """Response when a job is triggered."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"job_id": "550e8400-e29b-41d4-a716-446655440000", "status": "queued", "status_url": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000"}],
    })
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
    failure_analysis: dict[str, Any] | None = None


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int


# ── Export/Import schemas ─────────────────────────────────────────────────────

class ExportWorkflowItem(BaseModel):
    """Single workflow for export."""
    id: uuid.UUID
    name: str
    description: str | None
    dag_json: dict[str, Any]
    schedule: str | None
    timezone: str
    tags: list[str]
    webhook_url: str | None = None


class ExportResponse(BaseModel):
    """Export payload for backup or migration."""
    workflows: list[ExportWorkflowItem]
    exported_at: datetime


class ImportRequest(BaseModel):
    """Import workflows from backup. Creates new workflows with new IDs."""
    workflows: list[ExportWorkflowItem]


# ── Parse schemas ────────────────────────────────────────────────────────────

class ParseRequest(BaseModel):
    """Plain English workflow description to parse into DAG JSON."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"description": "Fetch data from https://api.example.com/data, transform it with Python, then save to the database"}],
    })
    description: str = Field(..., min_length=5, max_length=5000)


class ParseResponse(BaseModel):
    """Parsed DAG with metadata."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"dag": {"name": "Parsed workflow", "nodes": []}, "node_count": 3, "estimated_duration_seconds": 60, "warnings": []}],
    })
    dag: dict[str, Any]
    node_count: int
    estimated_duration_seconds: int | None = None
    warnings: list[str] = Field(default_factory=list)


# ── Health schema ────────────────────────────────────────────────────────────

class ComponentHealth(BaseModel):
    """Health status of a single component (db, redis, kafka)."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"status": "ok", "latency_ms": 2.5, "error": None}],
    })
    status: str  # "ok" | "error"
    latency_ms: float | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    """Overall system health with per-component status."""
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"status": "ok", "version": "1.0.0", "components": {"db": {"status": "ok"}, "redis": {"status": "ok"}}, "timestamp": "2025-01-15T09:00:00Z"}],
    })
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
