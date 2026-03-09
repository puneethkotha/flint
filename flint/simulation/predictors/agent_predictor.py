"""
Agent Predictor — simulates AGENT node execution without real tool calls.

For AGENT nodes: we run Claude with *mock* tool results instead of real ones.
Claude still reasons, still calls "tools" — but the tool results are simulated.
This gives us a realistic prediction of what the agent would decide and output.

This is the most sophisticated predictor in Flint.

Drop into: flint/simulation/predictors/agent_predictor.py
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

import anthropic

from flint.config import get_settings
from flint.simulation.engine import NodeSimulation, ConfidenceBasis  # type: ignore
from flint.simulation.predictors.base import BasePredictor

settings = get_settings()

SIMULATION_SYSTEM = """You are simulating a sub-agent in a workflow testing environment.
You will receive a task. When you call tools, you will receive SIMULATED (mock) results.
Work through the task using the simulated results and produce a realistic final output.
When finished, respond with ONLY valid JSON representing your output.
The JSON must have a 'result' key. Be realistic — simulate what a real agent would produce."""

MOCK_TOOL_RESULTS = {
    "web_search": lambda inp: {
        "query": inp.get("query", ""),
        "results": [
            {
                "title":   f"Top result for '{inp.get('query', '')}'",
                "url":     "https://example.com/result-1",
                "snippet": f"Comprehensive information about {inp.get('query', '')}. "
                           f"This is a simulated search result for workflow testing.",
            },
            {
                "title":   f"Second result for '{inp.get('query', '')}'",
                "url":     "https://example.com/result-2",
                "snippet": f"Additional context about {inp.get('query', '')}.",
            },
        ],
        "_simulated": True,
    },
    "http_fetch": lambda inp: {
        "status_code": 200,
        "body":        f"Simulated response from {inp.get('url', 'unknown URL')}",
        "headers":     {"content-type": "application/json"},
        "_simulated":  True,
    },
    "python_exec": lambda inp: {
        "stdout":     f"Simulated output of: {inp.get('code', '')[:50]}",
        "exit_code":  0,
        "_simulated": True,
    },
}


class AgentPredictor(BasePredictor):

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

        prompt = config.get("prompt", "") or "Complete the assigned task."
        max_iterations = min(config.get("max_iterations", 10), 5)  # cap at 5 for simulation

        # Check historical runs
        runs = await self.get_historical_runs(workflow_id, node_id)
        if len(runs) >= 3:
            return NodeSimulation(
                node_id=node_id,
                node_type=node_type,
                predicted_output=self.most_common_output(runs),
                raw_confidence=min(self.confidence_from_runs(runs), 0.80),
                propagated_confidence=min(self.confidence_from_runs(runs), 0.80),
                confidence_basis=ConfidenceBasis.HISTORICAL_LOW if len(runs) < 10 else ConfidenceBasis.HISTORICAL_MED,
                historical_run_count=len(runs),
                risks=[],
                warnings=["AGENT output is non-deterministic — reasoning path may vary"],
                predicted_duration_ms=self.avg_duration(runs),
                simulation_note=f"Based on {len(runs)} historical AGENT runs",
            )

        # Run simulated agentic loop
        if upstream_context:
            full_prompt = (
                f"Context from previous workflow steps:\n"
                f"```json\n{json.dumps(upstream_context, indent=2)}\n```\n\n"
                f"Your task: {prompt}"
            )
        else:
            full_prompt = prompt

        t_start     = time.monotonic()
        output, trace = await self._run_simulated_agent(full_prompt, max_iterations)
        duration    = int((time.monotonic() - t_start) * 1000)

        return NodeSimulation(
            node_id=node_id,
            node_type=node_type,
            predicted_output={
                **output,
                "_simulation": {
                    "simulated": True,
                    "tool_calls": len(trace),
                    "mock_tools_used": [t["tool"] for t in trace],
                },
            },
            raw_confidence=0.68,   # Agents are inherently less predictable
            propagated_confidence=0.68,
            confidence_basis=ConfidenceBasis.SANDBOX_EXEC,
            historical_run_count=len(runs),
            risks=[],
            warnings=[
                "AGENT simulation uses mock tool results — real agent may take different actions",
                "Tool call sequence is representative, not exact",
            ],
            predicted_duration_ms=max(duration, 2000),  # agents are slow
            simulation_note=(
                f"Ran simulated agentic loop with {len(trace)} mock tool calls. "
                f"Output structure representative of real run."
            ),
        )

    async def _run_simulated_agent(
        self,
        prompt:         str,
        max_iterations: int,
    ) -> tuple[dict, list[dict]]:
        """Run Claude with mock tool responses — realistic reasoning, fake external data."""

        from flint.engine.tasks.agent_task import AGENT_TOOLS  # reuse tool schemas

        messages: list[dict] = [{"role": "user", "content": prompt}]
        trace: list[dict] = []

        for _ in range(max_iterations):
            try:
                resp = await self.client.messages.create(
                    model="claude-haiku-4-5-20251001",  # cheap for simulation
                    max_tokens=1024,
                    system=SIMULATION_SYSTEM,
                    tools=AGENT_TOOLS,  # type: ignore[arg-type]
                    messages=messages,
                )
            except Exception as e:
                return {"error": str(e), "simulated": True}, trace

            tool_blocks = [b for b in resp.content if b.type == "tool_use"]
            text_blocks = [b for b in resp.content if b.type == "text"]

            messages.append({"role": "assistant", "content": resp.content})

            if resp.stop_reason == "end_turn" or not tool_blocks:
                final_text = text_blocks[-1].text if text_blocks else ""
                return self._parse_output(final_text), trace

            # Return mock tool results instead of real ones
            tool_results = []
            for block in tool_blocks:
                mock_fn = MOCK_TOOL_RESULTS.get(block.name)
                mock_result = mock_fn(block.input) if mock_fn else {"result": "simulated", "_simulated": True}
                trace.append({"tool": block.name, "input": block.input, "result": mock_result})
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(mock_result),
                })

            messages.append({"role": "user", "content": tool_results})

        return {"error": "max_iterations_reached", "simulated": True}, trace

    def _parse_output(self, text: str) -> dict:
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"result": text, "simulated": True}
