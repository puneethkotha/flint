"""Pytest configuration and shared fixtures."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_dag() -> dict[str, Any]:
    return {
        "name": "Test Workflow",
        "description": "A test workflow",
        "schedule": None,
        "timezone": "UTC",
        "tags": ["test"],
        "nodes": [
            {
                "id": "task_a",
                "name": "Task A",
                "type": "python",
                "depends_on": [],
                "timeout_seconds": 10,
                "config": {
                    "code": "async def run(context):\n    return {'value': 42}"
                },
                "retry_policy": {},
                "corruption_checks": {},
            },
            {
                "id": "task_b",
                "name": "Task B",
                "type": "python",
                "depends_on": ["task_a"],
                "timeout_seconds": 10,
                "config": {
                    "code": "async def run(context):\n    v = context.get('task_a', {}).get('value', 0)\n    return {'doubled': v * 2}"
                },
                "retry_policy": {},
                "corruption_checks": {},
            },
        ],
    }


@pytest.fixture
def mock_pool() -> MagicMock:
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(), __aexit__=AsyncMock()))
    return pool
