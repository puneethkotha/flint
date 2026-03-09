"""Dataclasses mirroring the PostgreSQL schema."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Workflow:
    id: uuid.UUID
    name: str
    dag_json: dict[str, Any]
    description: str | None = None
    schedule: str | None = None
    timezone: str = "UTC"
    tags: list[str] = field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    status: str = "active"
    version: int = 1

    @classmethod
    def from_record(cls, record: Any) -> "Workflow":
        import json

        dag = record["dag_json"]
        if isinstance(dag, str):
            dag = json.loads(dag)
        return cls(
            id=record["id"],
            name=record["name"],
            dag_json=dag,
            description=record["description"],
            schedule=record["schedule"],
            timezone=record["timezone"] or "UTC",
            tags=list(record["tags"] or []),
            created_at=record["created_at"],
            updated_at=record["updated_at"],
            status=record["status"],
            version=record["version"],
        )


@dataclass
class WorkflowVersion:
    """Immutable snapshot of a workflow definition at each save."""
    id: uuid.UUID
    workflow_id: uuid.UUID
    version_number: int
    definition: dict[str, Any]
    change_summary: str | None = None
    created_at: datetime | None = None
    avg_execution_ms: int | None = None

    @classmethod
    def from_record(cls, record: Any) -> "WorkflowVersion":
        import json
        defn = record["definition"]
        if isinstance(defn, str):
            defn = json.loads(defn)
        return cls(
            id=record["id"],
            workflow_id=record["workflow_id"],
            version_number=record["version_number"],
            definition=defn,
            change_summary=record.get("change_summary"),
            created_at=record.get("created_at"),
            avg_execution_ms=record.get("avg_execution_ms"),
        )


@dataclass
class Job:
    id: uuid.UUID
    workflow_id: uuid.UUID
    trigger_type: str
    status: str = "pending"
    triggered_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    input_data: dict[str, Any] = field(default_factory=dict)
    output_data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    idempotency_key: str | None = None
    failure_analysis: dict[str, Any] | None = None

    @classmethod
    def from_record(cls, record: Any) -> "Job":
        import json

        def parse_json(v: Any) -> dict[str, Any]:
            if isinstance(v, str):
                return json.loads(v)
            return dict(v) if v else {}

        return cls(
            id=record["id"],
            workflow_id=record["workflow_id"],
            trigger_type=record["trigger_type"],
            status=record["status"],
            triggered_at=record["triggered_at"],
            started_at=record["started_at"],
            completed_at=record["completed_at"],
            duration_ms=record["duration_ms"],
            input_data=parse_json(record["input_data"]),
            output_data=parse_json(record["output_data"]),
            error=record["error"],
            idempotency_key=record["idempotency_key"],
            failure_analysis=record.get("failure_analysis"),
        )


@dataclass
class TaskExecution:
    id: uuid.UUID
    job_id: uuid.UUID
    task_id: str
    task_type: str
    attempt_number: int = 1
    status: str = "pending"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    input_data: dict[str, Any] = field(default_factory=dict)
    output_data: dict[str, Any] = field(default_factory=dict)
    output_validated: bool = False
    validation_passed: bool | None = None
    error: str | None = None
    retry_reason: str | None = None
    failure_type: str | None = None

    @classmethod
    def from_record(cls, record: Any) -> "TaskExecution":
        import json

        def parse_json(v: Any) -> dict[str, Any]:
            if isinstance(v, str):
                return json.loads(v)
            return dict(v) if v else {}

        return cls(
            id=record["id"],
            job_id=record["job_id"],
            task_id=record["task_id"],
            task_type=record["task_type"],
            attempt_number=record["attempt_number"],
            status=record["status"],
            started_at=record["started_at"],
            completed_at=record["completed_at"],
            duration_ms=record["duration_ms"],
            input_data=parse_json(record["input_data"]),
            output_data=parse_json(record["output_data"]),
            output_validated=record["output_validated"] or False,
            validation_passed=record["validation_passed"],
            error=record["error"],
            retry_reason=record["retry_reason"],
            failure_type=record["failure_type"],
        )


@dataclass
class CorruptionEvent:
    id: uuid.UUID
    task_execution_id: uuid.UUID
    check_type: str
    detected_at: datetime | None = None
    expected: Any = None
    actual: Any = None
    severity: str = "error"
    action_taken: str | None = None
