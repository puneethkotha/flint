"""Tests for DAGExecutor."""

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from flint.engine.executor import DAGExecutor


@pytest.fixture
def executor():
    return DAGExecutor(
        db_pool=None,
        redis_client=None,
        kafka_producer=None,
        ws_manager=None,
    )


def make_python_dag(nodes_code: list[tuple[str, list[str], str]]) -> dict[str, Any]:
    """Helper to build a DAG from (id, depends_on, code) tuples."""
    return {
        "name": "Test",
        "nodes": [
            {
                "id": node_id,
                "type": "python",
                "depends_on": deps,
                "timeout_seconds": 10,
                "config": {"code": code},
                "retry_policy": {},
                "corruption_checks": {},
            }
            for node_id, deps, code in nodes_code
        ],
    }


@pytest.mark.asyncio
async def test_single_task_execution(executor):
    dag = make_python_dag([
        ("task_a", [], "async def run(context):\n    return {'value': 42}")
    ])
    result = await executor.execute_dag(dag, "job-1")
    assert result.status == "completed"
    assert result.task_results["task_a"].status == "completed"
    assert result.task_results["task_a"].output["value"] == 42


@pytest.mark.asyncio
async def test_sequential_tasks_pass_context(executor):
    dag = make_python_dag([
        ("task_a", [], "async def run(context):\n    return {'x': 10}"),
        ("task_b", ["task_a"], "async def run(context):\n    x = context.get('task_a', {}).get('x', 0)\n    return {'y': x * 2}"),
    ])
    result = await executor.execute_dag(dag, "job-2")
    assert result.status == "completed"
    assert result.task_results["task_b"].output["y"] == 20


@pytest.mark.asyncio
async def test_parallel_tasks_run_concurrently(executor):
    import time
    dag = make_python_dag([
        ("task_a", [], "import asyncio\nasync def run(context):\n    await asyncio.sleep(0.05)\n    return {'done': True}"),
        ("task_b", [], "import asyncio\nasync def run(context):\n    await asyncio.sleep(0.05)\n    return {'done': True}"),
    ])
    start = time.monotonic()
    result = await executor.execute_dag(dag, "job-3")
    elapsed = time.monotonic() - start
    assert result.status == "completed"
    # Should be ~0.05s not ~0.10s if parallel
    assert elapsed < 0.15


@pytest.mark.asyncio
async def test_failed_task_halts_dag(executor):
    dag = make_python_dag([
        ("task_a", [], "async def run(context):\n    raise ValueError('deliberate failure')"),
        ("task_b", ["task_a"], "async def run(context):\n    return {'ran': True}"),
    ])
    result = await executor.execute_dag(dag, "job-4")
    assert result.status == "failed"
    assert result.task_results["task_a"].status == "failed"
    # task_b should not have run
    assert "task_b" not in result.task_results


@pytest.mark.asyncio
async def test_corruption_halts_dag(executor):
    dag = {
        "name": "Test",
        "nodes": [
            {
                "id": "task_a",
                "type": "python",
                "depends_on": [],
                "timeout_seconds": 10,
                "config": {"code": "async def run(context):\n    return {'value': 5}"},
                "retry_policy": {},
                "corruption_checks": {
                    "range": {"value": {"min": 100, "max": 200}}
                },
            },
            {
                "id": "task_b",
                "type": "python",
                "depends_on": ["task_a"],
                "timeout_seconds": 10,
                "config": {"code": "async def run(context):\n    return {'ran': True}"},
                "retry_policy": {},
                "corruption_checks": {},
            },
        ],
    }
    result = await executor.execute_dag(dag, "job-5")
    assert result.status == "failed"
    assert result.corruption_detected


@pytest.mark.asyncio
async def test_cyclic_dag_fails(executor):
    dag = {
        "name": "Cyclic",
        "nodes": [
            {"id": "a", "type": "python", "depends_on": ["c"], "timeout_seconds": 10,
             "config": {"code": "async def run(ctx): return {}"}, "retry_policy": {}, "corruption_checks": {}},
            {"id": "b", "type": "python", "depends_on": ["a"], "timeout_seconds": 10,
             "config": {"code": "async def run(ctx): return {}"}, "retry_policy": {}, "corruption_checks": {}},
            {"id": "c", "type": "python", "depends_on": ["b"], "timeout_seconds": 10,
             "config": {"code": "async def run(ctx): return {}"}, "retry_policy": {}, "corruption_checks": {}},
        ],
    }
    result = await executor.execute_dag(dag, "job-6")
    assert result.status == "failed"
    assert "Cycle" in (result.error or "")
