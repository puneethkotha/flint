"""Tests for failure classification and retry strategies."""

import pytest
from flint.engine.retry import FailureType, RetryAction, classify_failure


class FakeHTTPError(Exception):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


def test_rate_limit_classification():
    err = FakeHTTPError("Rate limit exceeded", 429)
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.RATE_LIMIT
    assert strategy.action == RetryAction.WAIT_WINDOW


def test_rate_limit_by_message():
    err = Exception("too many requests, please slow down")
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.RATE_LIMIT


def test_logic_404():
    err = FakeHTTPError("Not found", 404)
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.LOGIC
    assert strategy.action == RetryAction.HALT


def test_logic_401():
    err = FakeHTTPError("Unauthorized", 401)
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.LOGIC
    assert strategy.action == RetryAction.HALT


def test_logic_syntax_error():
    try:
        compile("def bad syntax(:", "", "exec")
    except SyntaxError as exc:
        failure_type, strategy = classify_failure(exc)
        assert failure_type == FailureType.LOGIC
        assert strategy.action == RetryAction.HALT


def test_logic_type_error():
    try:
        1 + "a"  # type: ignore
    except TypeError as exc:
        failure_type, strategy = classify_failure(exc)
        assert failure_type == FailureType.LOGIC
        assert strategy.action == RetryAction.HALT


def test_network_connection_error():
    err = ConnectionError("Connection refused")
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.NETWORK
    assert strategy.action == RetryAction.RETRY


def test_network_timeout():
    err = TimeoutError("Connection timed out")
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.NETWORK


def test_unknown_error():
    err = Exception("Something went wrong")
    failure_type, strategy = classify_failure(err)
    assert failure_type == FailureType.UNKNOWN
    assert strategy.action == RetryAction.RETRY


def test_retry_delay_exponential():
    from flint.engine.retry import RetryStrategy, RetryAction
    strategy = RetryStrategy(
        action=RetryAction.RETRY,
        base_delay_seconds=1.0,
        max_delay_seconds=100.0,
        jitter=False,
    )
    assert strategy.compute_delay(1) == 1.0
    assert strategy.compute_delay(2) == 2.0
    assert strategy.compute_delay(3) == 4.0
    assert strategy.compute_delay(10) == 100.0  # capped at max


def test_halt_strategy_no_delay():
    from flint.engine.retry import RetryStrategy, RetryAction
    strategy = RetryStrategy(action=RetryAction.HALT)
    assert strategy.compute_delay(1) == 0.0
