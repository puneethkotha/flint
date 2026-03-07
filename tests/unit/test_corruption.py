"""Tests for CorruptionDetector."""

from datetime import datetime, timezone

import pytest
from flint.engine.corruption import CorruptionDetector


class FakeTask:
    def __init__(self, corruption_checks: dict):
        self.id = "test_task"
        self.corruption_checks = corruption_checks


detector = CorruptionDetector()


def test_no_checks_returns_empty():
    task = FakeTask({})
    results = detector.validate(task, {"status": "ok"})
    assert results == []


def test_cardinality_pass():
    task = FakeTask({"cardinality": {"min": 1, "max": 10}})
    output = {"a": 1, "b": 2}
    results = detector.validate(task, output)
    assert all(r.passed for r in results)


def test_cardinality_fail_too_few():
    task = FakeTask({"cardinality": {"field": "items", "min": 5}})
    output = {"items": [1, 2]}
    results = detector.validate(task, output)
    assert not results[0].passed
    assert "2" in results[0].message


def test_required_fields_pass():
    task = FakeTask({"required_fields": ["status", "data"]})
    output = {"status": "ok", "data": []}
    results = detector.validate(task, output)
    assert all(r.passed for r in results)


def test_required_fields_fail():
    task = FakeTask({"required_fields": ["status", "missing_field"]})
    output = {"status": "ok"}
    results = detector.validate(task, output)
    assert not results[0].passed
    assert "missing_field" in results[0].message


def test_non_nullable_pass():
    task = FakeTask({"non_nullable_fields": ["name", "value"]})
    output = {"name": "test", "value": 42}
    results = detector.validate(task, output)
    assert all(r.passed for r in results)


def test_non_nullable_fail():
    task = FakeTask({"non_nullable_fields": ["name", "value"]})
    output = {"name": "test", "value": None}
    results = detector.validate(task, output)
    assert not results[0].passed
    assert "value" in results[0].message


def test_range_pass():
    task = FakeTask({"range": {"score": {"min": 0, "max": 100}}})
    output = {"score": 75}
    results = detector.validate(task, output)
    assert all(r.passed for r in results)


def test_range_fail_out_of_bounds():
    task = FakeTask({"range": {"score": {"min": 0, "max": 100}}})
    output = {"score": 150}
    results = detector.validate(task, output)
    assert not results[0].passed


def test_freshness_pass():
    task = FakeTask({"freshness": {"field": "ts", "max_age_seconds": 3600}})
    output = {"ts": datetime.now(tz=timezone.utc).isoformat()}
    results = detector.validate(task, output)
    assert all(r.passed for r in results)


def test_freshness_fail_old_timestamp():
    task = FakeTask({"freshness": {"field": "ts", "max_age_seconds": 60}})
    old_ts = datetime(2000, 1, 1, tzinfo=timezone.utc).isoformat()
    output = {"ts": old_ts}
    results = detector.validate(task, output)
    assert not results[0].passed


def test_multiple_checks_all_pass():
    task = FakeTask({
        "required_fields": ["status", "count"],
        "non_nullable_fields": ["status"],
        "range": {"count": {"min": 0}},
    })
    output = {"status": "ok", "count": 5}
    results = detector.validate(task, output)
    assert all(r.passed for r in results)
    assert len(results) == 3
