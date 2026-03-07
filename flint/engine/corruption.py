"""Output corruption detection — 5 validation checks per task."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class ValidationResult:
    check_type: str
    passed: bool
    message: str = ""
    expected: Any = None
    actual: Any = None


class CorruptionDetector:
    """
    Validates task outputs against per-task corruption_checks config.

    Supported checks (all optional, configured via task.corruption_checks):
        cardinality:      {"min": int, "max": int}
        required_fields:  ["field1", "field2"]
        non_nullable_fields: ["field1"]
        range:            {"field_name": {"min": num, "max": num}}
        freshness:        {"field": "timestamp_field", "max_age_seconds": int}
    """

    def validate(
        self, task: Any, output: dict[str, Any]
    ) -> list[ValidationResult]:
        """Run all configured checks and return results."""
        checks: dict[str, Any] = getattr(task, "corruption_checks", {}) or {}
        results: list[ValidationResult] = []

        if not checks:
            return results

        if "cardinality" in checks:
            results.append(self._check_cardinality(output, checks["cardinality"]))

        if "required_fields" in checks:
            results.append(
                self._check_required_fields(output, checks["required_fields"])
            )

        if "non_nullable_fields" in checks:
            results.append(
                self._check_non_nullable(output, checks["non_nullable_fields"])
            )

        if "range" in checks:
            results.extend(self._check_range(output, checks["range"]))

        if "freshness" in checks:
            results.append(self._check_freshness(output, checks["freshness"]))

        return results

    def _check_cardinality(
        self, output: dict[str, Any], config: dict[str, int]
    ) -> ValidationResult:
        """Check 1: len(output) or len(output['items']) within min/max."""
        min_count: int = config.get("min", 0)
        max_count: int = config.get("max", 1_000_000)
        field_name: str = config.get("field", "")

        if field_name and field_name in output:
            target = output[field_name]
        else:
            target = output

        try:
            actual_len = len(target)
        except TypeError:
            return ValidationResult(
                check_type="cardinality",
                passed=False,
                message=f"Cannot determine length of output type {type(target).__name__}",
                expected={"min": min_count, "max": max_count},
                actual=None,
            )

        passed = min_count <= actual_len <= max_count
        return ValidationResult(
            check_type="cardinality",
            passed=passed,
            message="" if passed else f"Length {actual_len} outside [{min_count}, {max_count}]",
            expected={"min": min_count, "max": max_count},
            actual=actual_len,
        )

    def _check_required_fields(
        self, output: dict[str, Any], fields: list[str]
    ) -> ValidationResult:
        """Check 2: required keys present in output dict."""
        if not isinstance(output, dict):
            return ValidationResult(
                check_type="required_fields",
                passed=False,
                message=f"Output is not a dict: {type(output).__name__}",
                expected=fields,
                actual=None,
            )

        missing = [f for f in fields if f not in output]
        passed = len(missing) == 0
        return ValidationResult(
            check_type="required_fields",
            passed=passed,
            message="" if passed else f"Missing required fields: {missing}",
            expected=fields,
            actual=list(output.keys()),
        )

    def _check_non_nullable(
        self, output: dict[str, Any], fields: list[str]
    ) -> ValidationResult:
        """Check 3: specified fields must not be None."""
        if not isinstance(output, dict):
            return ValidationResult(
                check_type="non_nullable_fields",
                passed=False,
                message=f"Output is not a dict: {type(output).__name__}",
            )

        null_fields = [f for f in fields if output.get(f) is None]
        passed = len(null_fields) == 0
        return ValidationResult(
            check_type="non_nullable_fields",
            passed=passed,
            message="" if passed else f"Null values in non-nullable fields: {null_fields}",
            expected="non-null",
            actual={f: output.get(f) for f in null_fields},
        )

    def _check_range(
        self, output: dict[str, Any], range_config: dict[str, dict[str, float]]
    ) -> list[ValidationResult]:
        """Check 4: numeric fields within specified bounds."""
        results = []
        if not isinstance(output, dict):
            return [
                ValidationResult(
                    check_type="range",
                    passed=False,
                    message=f"Output is not a dict: {type(output).__name__}",
                )
            ]

        for field_name, bounds in range_config.items():
            min_val = bounds.get("min", float("-inf"))
            max_val = bounds.get("max", float("inf"))
            actual = output.get(field_name)

            if actual is None:
                results.append(
                    ValidationResult(
                        check_type="range",
                        passed=False,
                        message=f"Field '{field_name}' not found in output",
                        expected={"min": min_val, "max": max_val},
                        actual=None,
                    )
                )
                continue

            try:
                numeric = float(actual)
                passed = min_val <= numeric <= max_val
                results.append(
                    ValidationResult(
                        check_type="range",
                        passed=passed,
                        message=""
                        if passed
                        else f"Field '{field_name}' value {numeric} outside [{min_val}, {max_val}]",
                        expected={"min": min_val, "max": max_val},
                        actual=numeric,
                    )
                )
            except (TypeError, ValueError):
                results.append(
                    ValidationResult(
                        check_type="range",
                        passed=False,
                        message=f"Field '{field_name}' is not numeric: {actual!r}",
                        expected={"min": min_val, "max": max_val},
                        actual=actual,
                    )
                )

        return results

    def _check_freshness(
        self, output: dict[str, Any], config: dict[str, Any]
    ) -> ValidationResult:
        """Check 5: timestamp field within max_age_seconds of now."""
        field_name: str = config.get("field", "timestamp")
        max_age: int = config.get("max_age_seconds", 3600)

        if not isinstance(output, dict) or field_name not in output:
            return ValidationResult(
                check_type="freshness",
                passed=False,
                message=f"Timestamp field '{field_name}' not found in output",
                expected={"max_age_seconds": max_age},
                actual=None,
            )

        ts_value = output[field_name]
        now = datetime.now(tz=timezone.utc)

        try:
            if isinstance(ts_value, str):
                ts = datetime.fromisoformat(ts_value.replace("Z", "+00:00"))
            elif isinstance(ts_value, (int, float)):
                ts = datetime.fromtimestamp(ts_value, tz=timezone.utc)
            elif isinstance(ts_value, datetime):
                ts = ts_value
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
            else:
                raise ValueError(f"Unsupported timestamp type: {type(ts_value)}")

            age_seconds = (now - ts).total_seconds()
            passed = abs(age_seconds) <= max_age
            return ValidationResult(
                check_type="freshness",
                passed=passed,
                message=""
                if passed
                else f"Timestamp age {age_seconds:.1f}s exceeds max {max_age}s",
                expected={"max_age_seconds": max_age},
                actual={"age_seconds": age_seconds, "timestamp": str(ts_value)},
            )
        except (ValueError, TypeError, OSError) as exc:
            return ValidationResult(
                check_type="freshness",
                passed=False,
                message=f"Cannot parse timestamp '{ts_value}': {exc}",
                expected={"max_age_seconds": max_age},
                actual=ts_value,
            )


corruption_detector = CorruptionDetector()
