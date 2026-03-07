"""Failure classification and retry strategy for Flint tasks."""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from enum import Enum
from typing import Any


class FailureType(Enum):
    RATE_LIMIT = "rate_limit"
    NETWORK = "network"
    LOGIC = "logic"
    DATA = "data"
    UNKNOWN = "unknown"


class RetryAction(Enum):
    RETRY = "retry"
    HALT = "halt"
    WAIT_WINDOW = "wait_window"


@dataclass
class RetryStrategy:
    action: RetryAction
    max_attempts: int = 3
    base_delay_seconds: float = 1.0
    max_delay_seconds: float = 60.0
    jitter: bool = True
    window_reset_seconds: float = 60.0

    def compute_delay(self, attempt: int) -> float:
        """Exponential backoff with optional jitter."""
        if self.action == RetryAction.HALT:
            return 0.0
        if self.action == RetryAction.WAIT_WINDOW:
            delay = self.window_reset_seconds
        else:
            delay = min(
                self.base_delay_seconds * (2 ** (attempt - 1)),
                self.max_delay_seconds,
            )
        if self.jitter:
            delay *= 0.5 + random.random() * 0.5
        return delay


_HALT_STRATEGY = RetryStrategy(action=RetryAction.HALT, max_attempts=1)
_RATE_LIMIT_STRATEGY = RetryStrategy(
    action=RetryAction.WAIT_WINDOW,
    max_attempts=3,
    window_reset_seconds=60.0,
)
_NETWORK_STRATEGY = RetryStrategy(
    action=RetryAction.RETRY,
    max_attempts=5,
    base_delay_seconds=0.5,
    max_delay_seconds=30.0,
)
_UNKNOWN_STRATEGY = RetryStrategy(
    action=RetryAction.RETRY,
    max_attempts=3,
    base_delay_seconds=2.0,
    max_delay_seconds=60.0,
)


def classify_failure(error: Exception) -> tuple[FailureType, RetryStrategy]:
    """
    Classify an exception and return the appropriate retry strategy.

    Classification rules:
    - 429 / RateLimitError              → RATE_LIMIT → wait for window reset
    - connection / timeout / dns / 503  → NETWORK    → retry with backoff
    - 404 / 401 / 403 / syntax / type   → LOGIC      → HALT
    - validation / schema / constraint  → DATA        → HALT
    - everything else                   → UNKNOWN     → exponential backoff
    """
    error_str = str(error).lower()
    error_type = type(error).__name__

    # Rate limit detection
    status_code = getattr(error, "status_code", None) or getattr(
        error, "response", None
    )
    if hasattr(status_code, "status_code"):
        status_code = status_code.status_code

    if (
        isinstance(status_code, int) and status_code == 429
        or "rate_limit" in error_type.lower()
        or "ratelimit" in error_str
        or "429" in error_str
        or "rate limit" in error_str
        or "too many requests" in error_str
    ):
        return FailureType.RATE_LIMIT, _RATE_LIMIT_STRATEGY

    # Logic errors — do not retry
    logic_codes = {400, 401, 403, 404, 405, 422}
    if (
        isinstance(status_code, int) and status_code in logic_codes
        or isinstance(error, (SyntaxError, TypeError, AttributeError, NameError))
        or "syntaxerror" in error_type.lower()
        or "typeerror" in error_type.lower()
        or "attributeerror" in error_type.lower()
        or "404" in error_str
        or "401" in error_str
        or "403" in error_str
        or "not found" in error_str
        or "unauthorized" in error_str
        or "forbidden" in error_str
    ):
        return FailureType.LOGIC, _HALT_STRATEGY

    # Data errors — do not retry
    if (
        isinstance(error, (ValueError, KeyError, IndexError))
        and not _is_network_error(error)
        or "validationerror" in error_type.lower()
        or "schemamismatch" in error_type.lower()
        or "constraint" in error_str
        or "validation" in error_str
        or "schema" in error_str
    ):
        return FailureType.DATA, _HALT_STRATEGY

    # Network errors — retry
    if _is_network_error(error):
        return FailureType.NETWORK, _NETWORK_STRATEGY

    # Unknown — exponential backoff
    return FailureType.UNKNOWN, _UNKNOWN_STRATEGY


def _is_network_error(error: Exception) -> bool:
    """Detect network-level errors."""
    error_str = str(error).lower()
    error_type = type(error).__name__.lower()
    network_types = {
        "connecterror", "connectionerror", "timeouterror", "timeout",
        "connecttimeout", "readtimeout", "dnserror", "gaierror",
        "networkerror", "connectionrefused", "connectionreset",
    }
    network_strings = {
        "connection", "timeout", "dns", "network", "503", "502",
        "504", "unreachable", "refused", "reset", "broken pipe",
    }
    return (
        error_type in network_types
        or isinstance(error, (TimeoutError, ConnectionError, OSError))
        or any(s in error_str for s in network_strings)
    )


class RetryExecutor:
    """Execute a coroutine with automatic retry based on failure classification."""

    async def run_with_retry(
        self,
        coro_factory: Any,
        task_config: dict[str, Any] | None = None,
        attempt_callback: Any = None,
    ) -> Any:
        """
        Execute coro_factory() with retries.

        Args:
            coro_factory: callable returning a coroutine
            task_config: optional retry_policy dict overrides
            attempt_callback: optional async callable(attempt, failure_type, delay)
        """
        config = task_config or {}
        max_attempts_override: int | None = config.get("max_attempts")

        attempt = 1
        last_error: Exception | None = None

        while True:
            try:
                return await coro_factory()
            except Exception as exc:
                last_error = exc
                failure_type, strategy = classify_failure(exc)

                effective_max = max_attempts_override or strategy.max_attempts

                if strategy.action == RetryAction.HALT or attempt >= effective_max:
                    raise

                delay = strategy.compute_delay(attempt)

                if attempt_callback:
                    await attempt_callback(attempt, failure_type, delay)

                await asyncio.sleep(delay)
                attempt += 1

        raise last_error  # unreachable, satisfies type checker
