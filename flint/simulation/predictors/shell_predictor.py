"""
Shell Predictor — predicts shell command output.

Most shell commands are TOO RISKY to actually run in simulation.
We use a whitelist of safe commands that can run in a subprocess,
and for everything else we predict the output shape using Claude.

Drop into: flint/simulation/predictors/shell_predictor.py
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from typing import Any

import anthropic

from flint.config import get_settings
from flint.simulation.engine import NodeSimulation, ConfidenceBasis  # type: ignore
from flint.simulation.predictors.base import BasePredictor

settings = get_settings()

# Commands safe to actually execute in simulation
SAFE_COMMAND_PATTERNS = [
    r"^echo\s",
    r"^date\b",
    r"^pwd\b",
    r"^ls\s",
    r"^cat\s/tmp/",       # only /tmp reads
    r"^wc\s",
    r"^head\s",
    r"^tail\s",
    r"^grep\s",
    r"^awk\s",
    r"^sed\s",
    r"^python3?\s+-c\s",  # Python one-liners (not arbitrary files)
    r"^node\s+-e\s",
    r"^jq\s",
]

SHELL_PREDICTION_SYSTEM = """You are a shell command output simulator.
Given a shell command, predict its stdout output on a Linux/Unix system.
Return ONLY a JSON object with this structure:
{"stdout": "...", "exit_code": 0, "stderr": ""}
Make the stdout realistic — correct format, plausible content, proper newlines.
For commands that list files, invent realistic filenames. For curl, invent realistic API responses."""


class ShellPredictor(BasePredictor):

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

        command = (config.get("command", "") or "").strip()

        # Historical runs first
        runs = await self.get_historical_runs(workflow_id, node_id)
        if len(runs) >= 3:
            return NodeSimulation(
                node_id=node_id,
                node_type=node_type,
                predicted_output=self.most_common_output(runs),
                raw_confidence=self.confidence_from_runs(runs),
                propagated_confidence=self.confidence_from_runs(runs),
                confidence_basis=ConfidenceBasis.HISTORICAL_LOW if len(runs) < 10 else ConfidenceBasis.HISTORICAL_MED,
                historical_run_count=len(runs),
                risks=[],
                warnings=[],
                predicted_duration_ms=self.avg_duration(runs),
                simulation_note=f"Based on {len(runs)} historical shell runs",
            )

        # Check if safe to actually run
        if self._is_safe_command(command):
            output, duration = await self._run_safe(command)
            conf  = 0.96
            basis = ConfidenceBasis.SANDBOX_EXEC
            note  = f"Executed safely in sandbox: {command[:50]}"
            warnings = []
        else:
            # Claude prediction
            output, duration = await self._claude_predict(command, upstream_context)
            conf  = 0.55
            basis = ConfidenceBasis.CLAUDE_KNOWLEDGE
            note  = f"Predicted output shape — command not safe to execute in simulation"
            warnings = ["Shell command predicted, not executed — verify output format manually"]

        return NodeSimulation(
            node_id=node_id,
            node_type=node_type,
            predicted_output=output,
            raw_confidence=conf,
            propagated_confidence=conf,
            confidence_basis=basis,
            historical_run_count=len(runs),
            risks=[],
            warnings=warnings,
            predicted_duration_ms=duration,
            simulation_note=note,
        )

    def _is_safe_command(self, command: str) -> bool:
        return any(re.match(p, command, re.IGNORECASE) for p in SAFE_COMMAND_PATTERNS)

    async def _run_safe(self, command: str) -> tuple[dict, int]:
        import time
        t = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=3.0)
            duration = int((time.monotonic() - t) * 1000)
            return {
                "stdout":    stdout.decode().strip()[:2000],
                "stderr":    stderr.decode().strip()[:500],
                "exit_code": proc.returncode,
            }, duration
        except asyncio.TimeoutError:
            return {"stdout": "", "stderr": "timeout", "exit_code": 1}, 3000
        except Exception as e:
            return {"stdout": "", "stderr": str(e), "exit_code": 1}, 500

    async def _claude_predict(self, command: str, context: dict) -> tuple[dict, int]:
        import time
        t = time.monotonic()
        prompt = f"Command: {command}"
        if context:
            prompt += f"\nContext: {json.dumps(context)}"
        try:
            resp = await self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                system=SHELL_PREDICTION_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text.strip()
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
            result = json.loads(raw)
            return result, int((time.monotonic() - t) * 1000)
        except Exception:
            return {"stdout": "", "exit_code": 0, "stderr": ""}, 500
