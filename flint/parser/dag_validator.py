"""DAG validation: acyclic check + valid task types + schema."""

from __future__ import annotations

from typing import Any

from flint.engine.topology import FlintCycleError, topological_sort

VALID_TASK_TYPES = {"http", "shell", "python", "webhook", "sql", "llm"}


class DAGValidationError(Exception):
    """Raised when DAG structure is invalid."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__(f"DAG validation failed: {errors}")


def validate_dag(dag: dict[str, Any]) -> None:
    """
    Validate a parsed DAG dict.

    Raises DAGValidationError with a list of all errors found.
    """
    errors: list[str] = []

    if not isinstance(dag, dict):
        raise DAGValidationError(["DAG must be a JSON object"])

    if not dag.get("name"):
        errors.append("DAG must have a 'name' field")

    nodes = dag.get("nodes")
    if not nodes:
        errors.append("DAG must have at least one node in 'nodes'")
        raise DAGValidationError(errors)

    if not isinstance(nodes, list):
        errors.append("'nodes' must be a list")
        raise DAGValidationError(errors)

    node_ids: set[str] = set()
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"Node at index {i} must be an object")
            continue

        node_id = node.get("id")
        if not node_id:
            errors.append(f"Node at index {i} missing required 'id'")
            continue

        if node_id in node_ids:
            errors.append(f"Duplicate node id: '{node_id}'")
        node_ids.add(node_id)

        node_type = node.get("type")
        if not node_type:
            errors.append(f"Node '{node_id}' missing required 'type'")
        elif node_type not in VALID_TASK_TYPES:
            errors.append(
                f"Node '{node_id}' has invalid type '{node_type}'. "
                f"Valid types: {sorted(VALID_TASK_TYPES)}"
            )

        depends_on = node.get("depends_on", [])
        if depends_on and not isinstance(depends_on, list):
            errors.append(f"Node '{node_id}' depends_on must be a list")

    if errors:
        raise DAGValidationError(errors)

    # Validate all dependency references exist
    for node in nodes:
        for dep in node.get("depends_on", []) or []:
            if dep not in node_ids:
                errors.append(
                    f"Node '{node['id']}' depends on unknown node '{dep}'"
                )

    if errors:
        raise DAGValidationError(errors)

    # Check for cycles using Kahn's algorithm
    try:
        topological_sort(nodes)
    except FlintCycleError as exc:
        errors.append(str(exc))
        raise DAGValidationError(errors) from exc

    if errors:
        raise DAGValidationError(errors)
