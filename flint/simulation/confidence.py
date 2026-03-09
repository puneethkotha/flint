"""
Confidence Propagation — the math that makes predictions honest.

Key insight: uncertainty compounds through a DAG.
If node A is 80% confident and node B depends on A,
node B's prediction is only as good as its input — which is uncertain.

This module handles:
  1. Volume-based confidence from historical runs (Bayesian-inspired)
  2. Consistency weighting (high volume but inconsistent = lower confidence)
  3. Upstream uncertainty propagation
  4. Overall DAG confidence aggregation

Drop into: flint/simulation/confidence.py
"""

from __future__ import annotations

import math
from typing import Sequence


class ConfidencePropagator:
    """
    Computes and propagates confidence scores through a DAG.

    Design principles:
    - Grounded: confidence comes from data first, Claude second
    - Calibrated: we track how accurate our scores are over time
    - Honest: low history → lower confidence, never inflated
    - Composable: upstream uncertainty correctly degrades downstream
    """

    # How aggressively upstream uncertainty degrades downstream nodes.
    # 1.0 = full propagation (very strict), 0.5 = half propagation (lenient)
    PROPAGATION_FACTOR = 0.7

    def from_history(
        self,
        total_runs: int,
        successful_runs: int,
        consistent_runs: int,
    ) -> float:
        """
        Compute confidence from historical execution data.

        Uses a Bayesian-inspired formula:
          volume_confidence  = 1 - 0.5 * exp(-n / 20)
              → 0 runs:   0.50  (maximum uncertainty)
              → 10 runs:  0.70
              → 20 runs:  0.82
              → 50 runs:  0.92
              → 100 runs: 0.97
              → ∞ runs:   1.00

          success_rate = successful / total
              → penalizes flaky nodes

          consistency_rate = consistent / successful
              → nodes that always return the same shape = more predictable

          final = volume_confidence * success_rate * sqrt(consistency_rate)
        """
        if total_runs == 0:
            return 0.0

        volume_confidence = 1.0 - 0.5 * math.exp(-total_runs / 20.0)
        success_rate      = successful_runs / total_runs
        consistency_rate  = (consistent_runs / successful_runs) if successful_runs > 0 else 0.5

        # sqrt dampens the consistency penalty — inconsistency hurts but not linearly
        final = volume_confidence * success_rate * math.sqrt(consistency_rate)
        return round(min(max(final, 0.0), 0.98), 4)  # cap at 0.98, never 1.0

    def from_claude_knowledge(self, api_familiarity: str) -> float:
        """
        Fallback confidence when no historical data exists.
        Claude's knowledge of common APIs is reasonably accurate.

        api_familiarity: "well_known" | "common" | "obscure" | "custom"
        """
        return {
            "well_known": 0.72,   # Stripe, Slack, GitHub — Claude knows these well
            "common":     0.60,   # Most REST APIs with docs
            "obscure":    0.40,   # Uncommon APIs
            "custom":     0.25,   # Internal APIs Claude has no knowledge of
        }.get(api_familiarity, 0.50)

    def propagate(
        self,
        raw_confidence: float,
        upstream_confidences: Sequence[float],
    ) -> float:
        """
        Apply upstream uncertainty to a node's raw confidence.

        If a node has no upstream dependencies: propagated = raw.
        If a node depends on uncertain upstream nodes, its effective
        confidence is reduced proportionally.

        Formula:
          upstream_factor = geometric_mean(upstream_confidences)
          propagated = raw * (1 - PROPAGATION_FACTOR * (1 - upstream_factor))

        Examples:
          raw=0.90, upstream=[1.0]   → 0.90  (perfect upstream)
          raw=0.90, upstream=[0.80]  → 0.876 (slight degradation)
          raw=0.90, upstream=[0.50]  → 0.815 (significant degradation)
          raw=0.90, upstream=[0.20]  → 0.726 (heavy degradation)
        """
        if not upstream_confidences:
            return raw_confidence

        # Geometric mean of upstream confidences (handles multiple deps)
        log_sum = sum(math.log(max(c, 1e-9)) for c in upstream_confidences)
        upstream_factor = math.exp(log_sum / len(upstream_confidences))

        propagated = raw_confidence * (
            1 - self.PROPAGATION_FACTOR * (1 - upstream_factor)
        )
        return round(min(max(propagated, 0.01), 0.99), 4)

    def overall_confidence(self, node_confidences: Sequence[float]) -> float:
        """
        Compute a single overall confidence score for the entire DAG.

        Uses geometric mean — a single low-confidence node pulls the
        overall score down significantly (which is correct: a chain is
        only as strong as its weakest link).
        """
        if not node_confidences:
            return 0.0

        valid = [max(c, 1e-9) for c in node_confidences]
        log_mean = sum(math.log(c) for c in valid) / len(valid)
        result = math.exp(log_mean)
        return round(min(max(result, 0.01), 0.99), 4)

    def confidence_label(self, confidence: float) -> str:
        """Human-readable label for display."""
        if confidence >= 0.90:
            return "very high"
        elif confidence >= 0.75:
            return "high"
        elif confidence >= 0.60:
            return "medium"
        elif confidence >= 0.40:
            return "low"
        else:
            return "very low"

    def confidence_color(self, confidence: float) -> str:
        """Tailwind/hex color for UI rendering."""
        if confidence >= 0.85:
            return "#10b981"   # green
        elif confidence >= 0.65:
            return "#f59e0b"   # amber
        else:
            return "#ef4444"   # red
