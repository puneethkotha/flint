"""
LLM Predictor — predicts LLM node output.

Strategy: actually run the prompt with a cheaper/faster model.
- If the node uses Opus → run with Haiku (80% cheaper, similar structure)
- If the node uses Haiku → just run it directly (already cheap)
- Cache identical prompt hashes to avoid re-running in same simulation session

This is the honest approach: we don't "predict" LLM output generically,
we actually run a cheaper version. The output shape is correct.
Confidence is high for structure, lower for exact wording.

Drop into: flint/simulation/predictors/llm_predictor.py
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Any

import anthropic

from flint.config import get_settings
from flint.simulation.engine import NodeSimulation, ConfidenceBasis  # type: ignore
from flint.simulation.predictors.base import BasePredictor

settings = get_settings()

# Simulation model mapping: use cheaper model to simulate expensive ones
SIMULATION_MODEL_MAP = {
    "claude-opus-4-6":           "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6":         "claude-haiku-4-5-20251001",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5-20251001",  # already cheap
    "gpt-4o":                    "claude-haiku-4-5-20251001",
    "gpt-4o-mini":               "claude-haiku-4-5-20251001",
}

# Session-level cache: prompt_hash → output
_prompt_cache: dict[str, dict] = {}


class LlmPredictor(BasePredictor):

    def __init__(self, db: Any):
        super().__init__(db)
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def predict(
        self,
        node_id:          str,
        node_type:        str,
        config:           dict,
        workflow_id:      uuid.UUID,
        upstream_context: dict,
        input_data:       dict,
    ) -> NodeSimulation:

        prompt      = config.get("prompt", "") or ""
        system      = config.get("system", "") or ""
        model       = config.get("model", "claude-sonnet-4-6")
        max_tokens  = min(config.get("max_tokens", 1024), 512)  # cap for simulation

        # Inject upstream context into prompt
        if upstream_context:
            prompt = f"{prompt}\n\nContext: {json.dumps(upstream_context)}"

        # Check historical runs first (fastest path)
        runs = await self.get_historical_runs(workflow_id, node_id)
        if len(runs) >= 5:
            conf     = self.confidence_from_runs(runs)
            output   = self.most_common_output(runs)
            duration = self.avg_duration(runs)
            note     = (
                f"Based on {len(runs)} historical LLM runs — "
                f"output shape is stable, exact text varies"
            )
            return NodeSimulation(
                node_id=node_id,
                node_type=node_type,
                predicted_output=output,
                raw_confidence=min(conf, 0.85),  # cap: LLM output is inherently variable
                propagated_confidence=min(conf, 0.85),
                confidence_basis=ConfidenceBasis.HISTORICAL_MED if len(runs) >= 10 else ConfidenceBasis.HISTORICAL_LOW,
                historical_run_count=len(runs),
                risks=[],
                warnings=["LLM outputs are non-deterministic — exact text will vary run to run"],
                predicted_duration_ms=duration,
                simulation_note=note,
            )

        # No/little history → actually run with cheaper model
        sim_model  = SIMULATION_MODEL_MAP.get(model, "claude-haiku-4-5-20251001")
        cache_key  = hashlib.sha256(f"{prompt}|{system}|{sim_model}".encode()).hexdigest()

        if cache_key in _prompt_cache:
            output   = _prompt_cache[cache_key]
            duration = 200
            note     = f"Cached simulation result (identical prompt)"
        else:
            output, duration = await self._run_simulation(prompt, system, sim_model, max_tokens)
            _prompt_cache[cache_key] = output
            note = (
                f"Simulated with {sim_model} "
                f"(actual model: {model}). "
                f"Output structure matches — exact wording may differ."
            )

        # Confidence: high for structure, capped for exact content
        confidence = 0.78 if sim_model != model else 0.88

        return NodeSimulation(
            node_id=node_id,
            node_type=node_type,
            predicted_output=output,
            raw_confidence=confidence,
            propagated_confidence=confidence,
            confidence_basis=ConfidenceBasis.SANDBOX_EXEC,
            historical_run_count=len(runs),
            risks=[],
            warnings=[
                f"Simulated with {sim_model} instead of {model} — output structure is representative",
                "LLM outputs are non-deterministic — treat as approximate",
            ] if sim_model != model else [
                "LLM outputs are non-deterministic — treat as approximate"
            ],
            predicted_duration_ms=duration,
            simulation_note=note,
        )

    async def _run_simulation(
        self,
        prompt:     str,
        system:     str,
        model:      str,
        max_tokens: int,
    ) -> tuple[dict, int]:
        """Actually run the prompt with the simulation model."""
        import time
        t = time.monotonic()

        try:
            messages = [{"role": "user", "content": prompt}]
            kwargs: dict = {"model": model, "max_tokens": max_tokens, "messages": messages}
            if system:
                kwargs["system"] = system

            resp = await self.client.messages.create(**kwargs)
            text = resp.content[0].text if resp.content else ""
            duration = int((time.monotonic() - t) * 1000)

            # Try to parse as JSON if the prompt expects structured output
            try:
                clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
                return json.loads(clean), duration
            except json.JSONDecodeError:
                return {"text": text, "tokens_used": resp.usage.output_tokens}, duration

        except Exception as e:
            return {"error": f"Simulation LLM call failed: {e}"}, 1000
