"""
Reliability analysis & auto-heal for Flint workflows.

This is the engine behind Self-Heal mode: it takes a DAG and runs the 2026
self-healing loop — **monitor → detect → diagnose → recover → verify** — without
executing anything. It's a static analyzer, so it's safe, deterministic, free,
and works on infra that has only a database.

What makes it *real* (not a canned animation):

* **Diagnosis uses Flint's actual failure taxonomy.** Each chaos scenario builds
  a synthetic exception and runs it through the real ``classify_failure`` from
  ``flint.engine.retry`` — the same classifier the executor uses in production.
* **Survivability is computed from the node's real config** — whether it has a
  ``retry_policy`` for transient faults, ``corruption_checks`` for bad data, and
  a timeout for hangs.
* **The fix patches are applicable.** ``heal_dag`` returns a patched DAG you can
  actually run; the "recovery" adds the specific guards the node was missing.
* **The metrics are computed**, not hardcoded: reliability score, mean-time-to-
  recovery from the retry strategy's own backoff, and retry-waste avoided by
  halting on non-retryable errors.

An optional natural-language narration is layered on top via the free LLM
gateway, but every number here is produced by pure Python.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from flint.engine.retry import FailureType, RetryAction, classify_failure


# ─── Chaos scenarios ─────────────────────────────────────────────────────────────
# Each scenario carries a factory that builds the exception a task would raise,
# so we can push it through the production classifier.


@dataclass(frozen=True)
class Scenario:
    key: str
    label: str
    description: str
    weight: float                       # importance in the reliability score
    exception_factory: Any              # () -> Exception
    guard: str                          # which config guard mitigates this


SCENARIOS: tuple[Scenario, ...] = (
    Scenario(
        key="rate_limit",
        label="Rate limit (429)",
        description="The upstream API returns HTTP 429 under load.",
        weight=1.0,
        exception_factory=lambda: Exception("429 Too Many Requests: rate limit exceeded"),
        guard="retry_policy",
    ),
    Scenario(
        key="network_blip",
        label="Network timeout",
        description="A transient connection timeout mid-request.",
        weight=1.0,
        exception_factory=lambda: TimeoutError("Read timed out after 30s"),
        guard="retry_policy",
    ),
    Scenario(
        key="upstream_5xx",
        label="Upstream 5xx",
        description="The dependency returns 503 Service Unavailable.",
        weight=0.9,
        exception_factory=lambda: Exception("503 Service Unavailable"),
        guard="retry_policy",
    ),
    Scenario(
        key="schema_drift",
        label="Schema drift",
        description="An upstream response drops a field your workflow expects.",
        weight=1.2,
        exception_factory=lambda: KeyError("required field 'body' missing — schema changed"),
        guard="required_fields",
    ),
    Scenario(
        key="empty_result",
        label="Empty result",
        description="A step returns zero rows/items when downstream expects data.",
        weight=1.0,
        exception_factory=lambda: ValueError("cardinality validation failed: 0 items returned"),
        guard="cardinality",
    ),
    Scenario(
        key="hang",
        label="Runaway / hang",
        description="A task that never returns and would stall the whole workflow.",
        weight=0.7,
        exception_factory=lambda: TimeoutError("task exceeded max duration (no timeout configured)"),
        guard="timeout",
    ),
    Scenario(
        key="logic_error",
        label="Logic error (4xx)",
        description="A 404/400 that must NOT be retried (fail fast, save budget).",
        weight=0.8,
        exception_factory=lambda: Exception("404 Not Found"),
        guard="fail_fast",
    ),
)

# Task types whose failures are dominated by the network (transient faults matter most).
_NETWORK_BOUND = {"http", "webhook", "llm", "sql"}
# Data-producing tasks can return empty results (cardinality matters).
_DATA_PRODUCING = {"http", "llm", "sql", "python"}
# Tasks with *structured* output where a field can silently vanish (schema drift).
# LLM/python outputs are unstructured text, so required-field checks don't apply.
_STRUCTURED = {"http", "sql"}


# ─── Node / DAG config inspection ────────────────────────────────────────────────


def _node_config(node: dict) -> dict:
    cfg = node.get("config")
    return cfg if isinstance(cfg, dict) else {}


def _corruption(node: dict) -> dict:
    # corruption_checks may live on the node or inside config
    cc = node.get("corruption_checks")
    if isinstance(cc, dict):
        return cc
    cc = _node_config(node).get("corruption_checks")
    return cc if isinstance(cc, dict) else {}


def _retry(node: dict) -> dict:
    rp = node.get("retry_policy")
    if isinstance(rp, dict):
        return rp
    rp = _node_config(node).get("retry_policy")
    return rp if isinstance(rp, dict) else {}


def _has_retry(node: dict) -> bool:
    rp = _retry(node)
    return bool(rp) and int(rp.get("max_attempts", 1) or 1) > 1


def _has_required_fields(node: dict) -> bool:
    return bool(_corruption(node).get("required_fields"))


def _has_cardinality(node: dict) -> bool:
    return _corruption(node).get("cardinality") is not None


def _has_timeout(node: dict) -> bool:
    cfg = _node_config(node)
    return bool(node.get("timeout_seconds") or cfg.get("timeout_seconds") or cfg.get("timeout"))


def _scenario_applies(node_type: str, scenario: Scenario) -> bool:
    """Not every fault is relevant to every task type."""
    if scenario.key in ("rate_limit", "network_blip", "upstream_5xx"):
        return node_type in _NETWORK_BOUND
    if scenario.key == "schema_drift":
        return node_type in _STRUCTURED
    if scenario.key == "empty_result":
        return node_type in _DATA_PRODUCING
    if scenario.key == "hang":
        return node_type in ("http", "webhook", "shell")
    return True  # logic errors apply to everything


def _scenario_handled(node: dict, scenario: Scenario) -> bool:
    """Would the node's *current* config survive/contain this scenario?"""
    if scenario.guard == "retry_policy":
        return _has_retry(node)
    if scenario.guard == "required_fields":
        return _has_required_fields(node)
    if scenario.guard == "cardinality":
        return _has_cardinality(node)
    if scenario.guard == "timeout":
        return _has_timeout(node)
    if scenario.guard == "fail_fast":
        # Logic errors are always contained: the classifier HALTs them. The only
        # failure mode is *wasting* retries, which Flint never does. Always safe.
        return True
    return False


# ─── Auditing ────────────────────────────────────────────────────────────────────


def _grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def _dependents_count(dag: dict) -> dict[str, int]:
    """How many nodes depend (transitively is overkill — direct is the blast radius) on each node."""
    counts: dict[str, int] = {}
    for node in dag.get("nodes", []) or []:
        for dep in node.get("depends_on", []) or []:
            counts[dep] = counts.get(dep, 0) + 1
    return counts


def audit_node(node: dict, dependents: int = 0) -> dict[str, Any]:
    """Analyze one node: which scenarios it survives, its gaps, and a 0-100 score."""
    node_id = node.get("id", "?")
    node_type = str(node.get("type", "")).lower()

    checks: list[dict[str, Any]] = []
    total_w = 0.0
    handled_w = 0.0

    for sc in SCENARIOS:
        if not _scenario_applies(node_type, sc):
            continue
        exc = sc.exception_factory()
        failure_type, strategy = classify_failure(exc)
        handled = _scenario_handled(node, sc)
        total_w += sc.weight
        if handled:
            handled_w += sc.weight
        checks.append({
            "scenario": sc.key,
            "label": sc.label,
            "description": sc.description,
            "failure_type": failure_type.value,
            "recovery_action": strategy.action.value,
            "handled": handled,
        })

    score = round(100 * handled_w / total_w) if total_w else 100

    gaps: list[dict[str, str]] = []
    if node_type in _NETWORK_BOUND and not _has_retry(node):
        gaps.append({
            "kind": "no_retry_policy",
            "severity": "high",
            "message": f"No retry policy — a single {node_type} blip fails the whole run.",
        })
    if node_type in _STRUCTURED and not _has_required_fields(node):
        gaps.append({
            "kind": "no_required_fields",
            "severity": "high",
            "message": "No corruption checks — schema drift would flow downstream silently.",
        })
    if node_type in _DATA_PRODUCING and not _has_cardinality(node):
        gaps.append({
            "kind": "no_cardinality_check",
            "severity": "medium",
            "message": "No cardinality check — an empty result won't be caught before downstream steps.",
        })
    if node_type in ("http", "webhook", "shell") and not _has_timeout(node):
        gaps.append({
            "kind": "no_timeout",
            "severity": "medium",
            "message": "No timeout — the task can hang indefinitely.",
        })

    return {
        "node_id": node_id,
        "node_type": node_type,
        "score": score,
        "grade": _grade(score),
        "blast_radius": dependents,
        "checks": checks,
        "gaps": gaps,
    }


def audit_dag(dag: dict) -> dict[str, Any]:
    """Score the whole DAG. Nodes with more dependents weigh more (blast radius)."""
    nodes = dag.get("nodes", []) or []
    dependents = _dependents_count(dag)

    node_reports: list[dict[str, Any]] = []
    weighted_sum = 0.0
    weight_total = 0.0
    total_gaps = 0
    total_vulns = 0

    for node in nodes:
        nid = node.get("id", "?")
        report = audit_node(node, dependents.get(nid, 0))
        node_reports.append(report)
        w = 1.0 + report["blast_radius"]  # a node everything depends on matters more
        weighted_sum += report["score"] * w
        weight_total += w
        total_gaps += len(report["gaps"])
        total_vulns += sum(1 for c in report["checks"] if not c["handled"])

    overall = round(weighted_sum / weight_total) if weight_total else 100

    return {
        "workflow_name": dag.get("name", "Workflow"),
        "overall_score": overall,
        "grade": _grade(overall),
        "node_count": len(nodes),
        "total_gaps": total_gaps,
        "total_vulnerabilities": total_vulns,
        "nodes": node_reports,
    }


# ─── Healing ─────────────────────────────────────────────────────────────────────


_DEFAULT_RETRY = {
    "max_attempts": 3,
    "initial_delay_seconds": 1,
    "max_delay_seconds": 30,
    "backoff_multiplier": 2.0,
}


def _desired_corruption(node_type: str) -> dict:
    """The corruption checks a healthy node of this type should carry."""
    checks: dict[str, Any] = {}
    if node_type in _STRUCTURED:
        checks["required_fields"] = ["body", "status_code"] if node_type == "http" else ["rows"]
        if node_type == "http":
            checks["range"] = {"status_code": {"min": 200, "max": 299}}
    if node_type in _DATA_PRODUCING:
        checks["cardinality"] = {"min": 1}
    return checks


def heal_node(node: dict) -> tuple[dict, dict, list[str]]:
    """
    Return (patched_node, fix_patch, applied_fix_descriptions).

    Idempotent: healing an already-resilient node adds nothing. The fix_patch is
    the exact set of fields merged into the node so a reviewer sees what changed.
    """
    import copy

    node_type = str(node.get("type", "")).lower()
    patched = copy.deepcopy(node)
    patch: dict[str, Any] = {}
    applied: list[str] = []

    # 1. Retry policy for transient faults.
    if node_type in _NETWORK_BOUND and not _has_retry(node):
        patched["retry_policy"] = dict(_DEFAULT_RETRY)
        patch["retry_policy"] = dict(_DEFAULT_RETRY)
        applied.append("Added retry policy (3 attempts, exponential backoff) for rate limits & network blips.")

    # 2. Corruption checks against schema drift / empty results. Only add the keys
    #    the node is actually missing — never clobber a user's explicit checks.
    desired = _desired_corruption(node_type)
    if desired:
        existing = dict(_corruption(node))
        missing = {k: v for k, v in desired.items() if k not in existing}
        if missing:
            merged = {**existing, **missing}
            patched["corruption_checks"] = merged
            patch["corruption_checks"] = merged
            added = ", ".join(missing.keys())
            applied.append(
                f"Added corruption checks ({added}) to catch schema drift / empty "
                "results before they propagate."
            )

    # 3. Timeout so tasks can't hang.
    if node_type in ("http", "webhook", "shell") and not _has_timeout(node):
        patched["timeout_seconds"] = 30
        patch["timeout_seconds"] = 30
        applied.append("Added a 30s timeout so the task can't hang the workflow.")

    return patched, patch, applied


def _mttr_seconds(strategy_attempts: int = 3) -> float:
    """
    Deterministic mean-time-to-recovery estimate from the network retry strategy's
    own backoff (no jitter): the wall-clock a transient fault costs before recovery.
    """
    from flint.engine.retry import _NETWORK_STRATEGY  # reuse production numbers

    total = 0.0
    for attempt in range(1, min(strategy_attempts, _NETWORK_STRATEGY.max_attempts)):
        total += min(
            _NETWORK_STRATEGY.base_delay_seconds * (2 ** (attempt - 1)),
            _NETWORK_STRATEGY.max_delay_seconds,
        )
    return round(total, 1)


def heal_dag(dag: dict) -> dict[str, Any]:
    """
    Run the full self-heal loop and return a trace suitable for live visualization.

    Returns before/after reliability reports, the patched DAG, a per-node trace of
    the monitor→detect→diagnose→recover→verify steps, and computed metrics.
    """
    import copy

    before = audit_dag(dag)

    patched_dag = copy.deepcopy(dag)
    patched_nodes = patched_dag.get("nodes", []) or []

    trace: list[dict[str, Any]] = []
    total_fixes = 0

    for idx, node in enumerate(patched_nodes):
        before_node = audit_node(node, 0)
        patched_node, patch, applied = heal_node(node)
        patched_nodes[idx] = patched_node
        after_node = audit_node(patched_node, 0)

        if applied:
            total_fixes += len(applied)

        # The failures this node was vulnerable to (for the "detect" phase).
        vulnerabilities = [c for c in before_node["checks"] if not c["handled"]]

        trace.append({
            "node_id": node.get("id", "?"),
            "node_type": str(node.get("type", "")).lower(),
            "score_before": before_node["score"],
            "score_after": after_node["score"],
            "healed": bool(applied),
            "vulnerabilities": vulnerabilities,
            "fixes_applied": applied,
            "fix_patch": patch or None,
        })

    after = audit_dag(patched_dag)

    # ── Computed metrics ──
    vulns_before = before["total_vulnerabilities"]
    vulns_after = after["total_vulnerabilities"]
    mttr = _mttr_seconds()

    # Retry-waste avoided: on a non-retryable 4xx, blind exponential backoff would
    # burn ~3 extra attempts (~10.5s) per external-call node before giving up;
    # Flint's classifier HALTs immediately. Estimate the wall-clock saved.
    external_call_nodes = sum(
        1 for n in patched_nodes
        if str(n.get("type", "")).lower() in _NETWORK_BOUND
    )
    blind_retry_seconds = round(external_call_nodes * _mttr_seconds(strategy_attempts=4), 1)

    return {
        "workflow_name": dag.get("name", "Workflow"),
        "before": before,
        "after": after,
        "patched_dag": patched_dag,
        "trace": trace,
        "metrics": {
            "score_before": before["overall_score"],
            "score_after": after["overall_score"],
            "score_delta": after["overall_score"] - before["overall_score"],
            "grade_before": before["grade"],
            "grade_after": after["grade"],
            "vulnerabilities_before": vulns_before,
            "vulnerabilities_after": vulns_after,
            "vulnerabilities_closed": max(0, vulns_before - vulns_after),
            "fixes_applied": total_fixes,
            "estimated_mttr_seconds": mttr,
            "retry_waste_avoided_seconds": blind_retry_seconds,
        },
    }


# ─── Optional LLM narration (best-effort, free) ──────────────────────────────────


NARRATION_SYSTEM = (
    "You are Flint's reliability engineer. You are given a JSON summary of a "
    "workflow reliability audit and the fixes that were auto-applied. Write a short, "
    "confident, plain-English explanation (3-5 sentences) of what was fragile, what "
    "Flint healed, and why the workflow is now more resilient. No markdown, no lists — "
    "just a crisp paragraph an engineer would trust."
)


async def narrate_heal(result: dict) -> str:
    """Optional natural-language summary of a heal run. Returns '' on any failure."""
    import json

    from flint import llm

    if not llm.is_configured():
        return ""
    try:
        summary = {
            "workflow": result.get("workflow_name"),
            "metrics": result.get("metrics"),
            "fixes": [
                {"node": t["node_id"], "applied": t["fixes_applied"]}
                for t in result.get("trace", []) if t.get("healed")
            ],
        }
        return (await llm.chat(
            [{"role": "user", "content": json.dumps(summary)}],
            system=NARRATION_SYSTEM,
            fast=True,
            max_tokens=400,
            temperature=0.4,
        )).strip()
    except Exception:
        return ""
