"""Abstract base class for all Flint task types."""

from __future__ import annotations

import abc
from typing import Any


class TaskExecutionError(Exception):
    """Raised when a task fails execution."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class BaseTask(abc.ABC):
    """
    Abstract base for all task types.

    A task definition comes from the DAG JSON and contains:
      id, type, name, config, depends_on, timeout_seconds,
      retry_policy, corruption_checks
    """

    def __init__(self, task_def: dict[str, Any]) -> None:
        self.id: str = task_def["id"]
        self.type: str = task_def["type"]
        self.name: str = task_def.get("name", self.id)
        self.config: dict[str, Any] = task_def.get("config", {})
        self.depends_on: list[str] = task_def.get("depends_on", []) or []
        self.timeout_seconds: int = task_def.get("timeout_seconds", 300)
        self.retry_policy: dict[str, Any] = task_def.get("retry_policy", {})
        self.corruption_checks: dict[str, Any] = task_def.get("corruption_checks", {})

    @abc.abstractmethod
    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """
        Execute the task and return its output as a dict.

        Args:
            context: dict containing upstream task outputs keyed by task_id

        Returns:
            dict with at least {"status": "ok"} and any task-specific output

        Raises:
            TaskExecutionError: on execution failure
        """

    def get_input(self, context: dict[str, Any]) -> dict[str, Any]:
        """Extract relevant upstream outputs for this task."""
        result: dict[str, Any] = {}
        for dep_id in self.depends_on:
            if dep_id in context:
                result[dep_id] = context[dep_id]
        return result

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(id={self.id!r}, type={self.type!r})"


TASK_REGISTRY: dict[str, type[BaseTask]] = {}


def register_task(task_type: str) -> Any:
    """Decorator to register a task class by type string."""

    def decorator(cls: type[BaseTask]) -> type[BaseTask]:
        TASK_REGISTRY[task_type] = cls
        return cls

    return decorator


def create_task(task_def: dict[str, Any]) -> BaseTask:
    """Factory: create the right BaseTask subclass from a task definition dict."""
    task_type = task_def.get("type", "")
    cls = TASK_REGISTRY.get(task_type)
    if cls is None:
        raise ValueError(f"Unknown task type: '{task_type}'. Known: {list(TASK_REGISTRY)}")
    return cls(task_def)
