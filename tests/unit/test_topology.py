"""Tests for Kahn's topological sort."""

import pytest
from flint.engine.topology import FlintCycleError, topological_sort


def make_node(id: str, depends_on: list[str] | None = None) -> dict:
    return {"id": id, "type": "python", "depends_on": depends_on or []}


def test_empty_dag():
    assert topological_sort([]) == []


def test_single_node():
    result = topological_sort([make_node("a")])
    assert len(result) == 1
    assert result[0][0]["id"] == "a"


def test_linear_chain():
    nodes = [
        make_node("a"),
        make_node("b", ["a"]),
        make_node("c", ["b"]),
    ]
    batches = topological_sort(nodes)
    assert len(batches) == 3
    assert batches[0][0]["id"] == "a"
    assert batches[1][0]["id"] == "b"
    assert batches[2][0]["id"] == "c"


def test_parallel_batch():
    # a → [b, c] in parallel → d
    nodes = [
        make_node("a"),
        make_node("b", ["a"]),
        make_node("c", ["a"]),
        make_node("d", ["b", "c"]),
    ]
    batches = topological_sort(nodes)
    assert len(batches) == 3
    assert batches[0][0]["id"] == "a"
    parallel_ids = {n["id"] for n in batches[1]}
    assert parallel_ids == {"b", "c"}
    assert batches[2][0]["id"] == "d"


def test_cycle_detection():
    nodes = [
        make_node("a", ["c"]),
        make_node("b", ["a"]),
        make_node("c", ["b"]),
    ]
    with pytest.raises(FlintCycleError):
        topological_sort(nodes)


def test_diamond_dag():
    nodes = [
        make_node("a"),
        make_node("b", ["a"]),
        make_node("c", ["a"]),
        make_node("d", ["b", "c"]),
        make_node("e", ["d"]),
    ]
    batches = topological_sort(nodes)
    assert batches[0][0]["id"] == "a"
    parallel = {n["id"] for n in batches[1]}
    assert parallel == {"b", "c"}
    assert batches[2][0]["id"] == "d"
    assert batches[3][0]["id"] == "e"


def test_unknown_dependency_raises():
    nodes = [make_node("a", ["nonexistent"])]
    with pytest.raises(ValueError, match="Unknown dependency"):
        topological_sort(nodes)


def test_all_parallel():
    nodes = [make_node(str(i)) for i in range(5)]
    batches = topological_sort(nodes)
    assert len(batches) == 1
    assert len(batches[0]) == 5
