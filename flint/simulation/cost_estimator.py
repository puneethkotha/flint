"""
Cost Estimator — predicts what a real workflow run will cost.

Estimates:
  - LLM token costs (per-model pricing)
  - Known external API costs (Stripe fees, etc.)
  - Compute/infrastructure costs
  - Simulation cost (what THIS simulation cost to run)

Grounded in real pricing as of 2026. Update PRICING table as models change.

Drop into: flint/simulation/cost_estimator.py
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from flint.simulation.models import NodeSimulation


# ---------------------------------------------------------------------------
# Pricing tables — update when prices change
# ---------------------------------------------------------------------------

# LLM pricing per 1M tokens (input/output) in USD
LLM_PRICING = {
    "claude-opus-4-6":         {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-6":       {"input":  3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.25, "output":  1.25},
    "gpt-4o":                  {"input":  2.50, "output": 10.00},
    "gpt-4o-mini":             {"input":  0.15, "output":  0.60},
    "gemini-1.5-pro":          {"input":  1.25, "output":  5.00},
    "gemini-flash":            {"input":  0.075,"output":  0.30},
    # Default fallback
    "_default":                {"input":  3.00, "output": 15.00},
}

# Typical token counts per operation
TYPICAL_TOKENS = {
    "llm":    {"input": 800,  "output": 400},
    "AGENT":  {"input": 2000, "output": 800},   # agents use more tokens
}

# External API cost patterns (matched against node URL)
EXTERNAL_API_COSTS = [
    # (url_pattern, cost_formula_fn)
    # Stripe: 2.9% + $0.30 per charge
    (r"api\.stripe\.com/.*(charges|payments)", lambda config: _stripe_fee(config)),
    # Twilio SMS: ~$0.0079 per message
    (r"api\.twilio\.com.*messages",             lambda _: 0.0079),
    # SendGrid: negligible per email on most plans
    (r"api\.sendgrid\.com",                      lambda _: 0.0001),
    # OpenAI Embeddings: ~$0.0001 per 1K tokens
    (r"api\.openai\.com/embeddings",             lambda _: 0.0002),
    # Clearbit: $0.0005–0.005 per lookup
    (r"company\.clearbit\.com",                  lambda _: 0.002),
    # Google Maps: $0.005 per geocode request
    (r"maps\.googleapis\.com",                   lambda _: 0.005),
]

# Compute cost per second of execution (very rough AWS Lambda pricing)
COMPUTE_COST_PER_SEC = 0.0000166   # ~$0.06/hour equivalent


def _stripe_fee(config: dict) -> float:
    """Estimate Stripe fee from request body."""
    body = config.get("body", {}) or {}
    amount_cents = body.get("amount", 5000)   # default $50 if unknown
    if isinstance(amount_cents, (int, float)):
        amount_usd = amount_cents / 100
        return amount_usd * 0.029 + 0.30
    return 0.30   # minimum Stripe fee


# ---------------------------------------------------------------------------
# Main estimator
# ---------------------------------------------------------------------------

@dataclass
class NodeCost:
    node_id:   str
    node_type: str
    token_cost_usd:    float
    external_cost_usd: float
    compute_cost_usd:  float
    total_usd:         float
    breakdown:         str


class CostEstimator:

    async def estimate(
        self,
        nodes:        list[dict],
        node_results: list[NodeSimulation],
        workflow_id:  object,  # uuid.UUID
    ) -> object:  # CostEstimate from engine
        """
        Compute full cost breakdown for simulated and real runs.
        """
        from flint.simulation.engine import CostEstimate  # avoid circular

        node_map = {n.node_id: n for n in node_results}
        node_costs: list[NodeCost] = []

        for node in nodes:
            nid  = node["id"]
            ntype = node.get("type", "http")
            config = node.get("config", {})
            sim = node_map.get(nid)
            duration_ms = sim.predicted_duration_ms if sim else 500

            nc = self._estimate_node(nid, ntype, config, duration_ms)
            node_costs.append(nc)

        total_token     = sum(nc.token_cost_usd for nc in node_costs)
        total_external  = sum(nc.external_cost_usd for nc in node_costs)
        total_compute   = sum(nc.compute_cost_usd for nc in node_costs)
        total_real      = total_token + total_external + total_compute

        # Simulation itself: we run cheap Claude Haiku calls + sandboxes
        # Estimate: ~$0.001 per node
        sim_cost = len(nodes) * 0.001

        return CostEstimate(
            simulation_cost_usd=round(sim_cost, 4),
            real_run_cost_usd=round(total_real, 4),
            token_cost_usd=round(total_token, 4),
            external_api_cost_usd=round(total_external, 4),
            compute_cost_usd=round(total_compute, 4),
            breakdown=[
                {
                    "node_id":   nc.node_id,
                    "type":      nc.node_type,
                    "token":     round(nc.token_cost_usd, 5),
                    "external":  round(nc.external_cost_usd, 5),
                    "compute":   round(nc.compute_cost_usd, 5),
                    "total":     round(nc.total_usd, 5),
                    "note":      nc.breakdown,
                }
                for nc in node_costs
            ],
        )

    def _estimate_node(
        self,
        node_id:     str,
        node_type:   str,
        config:      dict,
        duration_ms: int,
    ) -> NodeCost:

        token_cost    = 0.0
        external_cost = 0.0
        note_parts    = []

        # LLM token costs
        if node_type in ("llm", "AGENT"):
            model   = config.get("model", "claude-sonnet-4-6")
            pricing = LLM_PRICING.get(model, LLM_PRICING["_default"])
            typical = TYPICAL_TOKENS.get(node_type, TYPICAL_TOKENS["llm"])

            in_cost  = (typical["input"]  / 1_000_000) * pricing["input"]
            out_cost = (typical["output"] / 1_000_000) * pricing["output"]
            token_cost = in_cost + out_cost
            note_parts.append(f"~{typical['input']+typical['output']} tokens on {model}")

        # External API costs
        url = config.get("url", "") or ""
        for pattern, cost_fn in EXTERNAL_API_COSTS:
            if re.search(pattern, url, re.IGNORECASE):
                try:
                    external_cost = cost_fn(config)
                    note_parts.append(f"external API fee: ${external_cost:.4f}")
                except Exception:
                    external_cost = 0.001
                break

        # Compute cost
        duration_sec  = duration_ms / 1000.0
        compute_cost  = duration_sec * COMPUTE_COST_PER_SEC
        note_parts.append(f"compute ~{duration_ms}ms")

        total = token_cost + external_cost + compute_cost

        return NodeCost(
            node_id=node_id,
            node_type=node_type,
            token_cost_usd=token_cost,
            external_cost_usd=external_cost,
            compute_cost_usd=compute_cost,
            total_usd=total,
            breakdown="; ".join(note_parts) if note_parts else "minimal cost",
        )
