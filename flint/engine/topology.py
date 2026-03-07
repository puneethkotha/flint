"""Kahn's algorithm for topological sort returning parallel execution batches."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any


class FlintCycleError(Exception):
    """Raised when a cycle is detected in the DAG."""


def topological_sort(nodes: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """
    Kahn's algorithm producing execution batches.

    Returns a list of batches where each batch can run in parallel.
    Batch[0] has no dependencies, Batch[1] depends only on Batch[0], etc.

    Raises FlintCycleError if a cycle is detected.
    """
    if not nodes:
        return []

    node_map: dict[str, dict[str, Any]] = {n["id"]: n for n in nodes}

    # Build in-degree map and adjacency list
    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}
    dependents: dict[str, list[str]] = defaultdict(list)

    for node in nodes:
        deps: list[str] = node.get("depends_on", []) or []
        for dep_id in deps:
            if dep_id not in node_map:
                raise ValueError(f"Unknown dependency '{dep_id}' in node '{node['id']}'")
            in_degree[node["id"]] += 1
            dependents[dep_id].append(node["id"])

    # Initialize queue with zero-in-degree nodes
    queue: deque[str] = deque(
        node_id for node_id, degree in in_degree.items() if degree == 0
    )

    batches: list[list[dict[str, Any]]] = []
    processed = 0

    while queue:
        # Collect all nodes in the current batch (same level)
        batch_size = len(queue)
        batch_ids = [queue.popleft() for _ in range(batch_size)]
        batch = [node_map[nid] for nid in batch_ids]
        batches.append(batch)
        processed += len(batch)

        for node_id in batch_ids:
            for dependent_id in dependents[node_id]:
                in_degree[dependent_id] -= 1
                if in_degree[dependent_id] == 0:
                    queue.append(dependent_id)

    if processed != len(nodes):
        cycle_nodes = [nid for nid, deg in in_degree.items() if deg > 0]
        raise FlintCycleError(
            f"Cycle detected in DAG. Nodes involved: {cycle_nodes}"
        )

    return batches


def get_execution_order(nodes: list[dict[str, Any]]) -> list[str]:
    """Return a flat list of task IDs in valid execution order."""
    batches = topological_sort(nodes)
    return [node["id"] for batch in batches for node in batch]


def validate_dag_acyclic(nodes: list[dict[str, Any]]) -> bool:
    """Return True if the DAG is acyclic, False if it has a cycle."""
    try:
        topological_sort(nodes)
        return True
    except FlintCycleError:
        return False
