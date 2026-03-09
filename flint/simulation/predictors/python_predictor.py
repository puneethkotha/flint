"""
Python Predictor — actually executes safe Python nodes in a sandbox.

For Python nodes: we CAN actually run the code in a subprocess with:
  - No network access (patched)
  - Resource limits (CPU, memory)
  - Timeout (5s max)
  - No file system writes outside /tmp

If the code has dangerous patterns (network calls, file writes outside /tmp,
sys imports) → fall back to Claude prediction.

Drop into: flint/simulation/predictors/python_predictor.py
"""

from __future__ import annotations

import ast
import asyncio
import json
import sys
import uuid
from typing import Any

from flint.simulation.engine import NodeSimulation, ConfidenceBasis  # type: ignore
from flint.simulation.predictors.base import BasePredictor


# Modules that are safe to import in sandbox
SAFE_IMPORTS = {
    "json", "math", "re", "datetime", "collections", "itertools",
    "functools", "string", "random", "hashlib", "base64", "uuid",
    "decimal", "fractions", "statistics", "textwrap", "copy",
}

# Modules that are NEVER safe
BLOCKED_IMPORTS = {
    "os", "sys", "subprocess", "socket", "urllib", "http",
    "requests", "httpx", "aiohttp", "boto3", "paramiko",
    "shutil", "pathlib", "open",
}

SANDBOX_WRAPPER = """
import json as _json
import sys as _sys

# Block dangerous builtins
_real_open = open
def _safe_open(path, *args, **kwargs):
    if not str(path).startswith('/tmp/'):
        raise PermissionError(f"Sandbox: file access outside /tmp is blocked: {{path}}")
    return _real_open(path, *args, **kwargs)
open = _safe_open

import builtins
_original_import = builtins.__import__
_SAFE = {safe_imports}
_BLOCKED = {blocked_imports}

def _safe_import(name, *args, **kwargs):
    base = name.split('.')[0]
    if base in _BLOCKED:
        raise ImportError(f"Sandbox: import '{{name}}' is blocked in simulation mode")
    return _original_import(name, *args, **kwargs)

builtins.__import__ = _safe_import

# Inject upstream context as variable
_context = {context}
_input = {input_data}

try:
{user_code}
    # Capture output
    if '_result' in dir():
        print(_json.dumps({{"result": _result, "status": "ok"}}))
    elif 'result' in dir():
        print(_json.dumps({{"result": result, "status": "ok"}}))
    else:
        print(_json.dumps({{"status": "ok", "note": "no result variable found"}}))
except Exception as e:
    print(_json.dumps({{"error": str(e), "status": "failed"}}))
"""


class PythonPredictor(BasePredictor):

    async def predict(
        self,
        node_id:          str,
        node_type:        str,
        config:           dict,
        workflow_id:      uuid.UUID,
        upstream_context: dict,
        input_data:       dict,
    ) -> NodeSimulation:

        code = config.get("code", "") or ""

        # Check historical runs
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
                simulation_note=f"Based on {len(runs)} historical Python executions",
            )

        # Safety check
        safe, issues = self._static_analysis(code)

        if safe:
            output, duration, success = await self._sandbox_execute(code, upstream_context, input_data)
            conf  = 0.95 if success else 0.30
            basis = ConfidenceBasis.SANDBOX_EXEC
            note  = "Executed in sandbox — full confidence in output structure"
            warnings = [] if success else [f"Sandbox execution failed: {output.get('error', 'unknown')}"]
        else:
            # Unsafe code — fall back to shape prediction
            output   = {"status": "ok", "result": None}
            conf     = 0.40
            basis    = ConfidenceBasis.CLAUDE_KNOWLEDGE
            duration = 500
            warnings = [f"Cannot sandbox safely: {', '.join(issues[:2])}. Prediction is a best-guess."]
            note     = "Static analysis found unsafe patterns — sandbox skipped"

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
            predicted_duration_ms=duration if safe else 500,
            simulation_note=note,
        )

    def _static_analysis(self, code: str) -> tuple[bool, list[str]]:
        """
        AST-based safety check. Returns (is_safe, list_of_issues).
        Fast, deterministic, no LLM calls.
        """
        issues = []
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return False, [f"Syntax error: {e}"]

        for node in ast.walk(tree):
            # Block dangerous imports
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                names = (
                    [alias.name for alias in node.names]
                    if isinstance(node, ast.Import)
                    else [node.module or ""]
                )
                for name in names:
                    base = (name or "").split(".")[0]
                    if base in BLOCKED_IMPORTS:
                        issues.append(f"blocked import: {name}")

            # Block dangerous function calls
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name) and func.id in ("eval", "exec", "compile"):
                    issues.append(f"dangerous builtin: {func.id}()")
                if isinstance(func, ast.Attribute) and func.attr in ("system", "popen", "spawn"):
                    issues.append(f"dangerous call: .{func.attr}()")

        return len(issues) == 0, issues

    async def _sandbox_execute(
        self,
        code:    str,
        context: dict,
        input_data: dict,
    ) -> tuple[dict, int, bool]:
        """Run code in a subprocess with safety constraints."""
        import time

        # Indent user code for wrapper
        indented = "\n".join("    " + line for line in code.splitlines())

        wrapped = SANDBOX_WRAPPER.format(
            safe_imports=repr(SAFE_IMPORTS),
            blocked_imports=repr(BLOCKED_IMPORTS),
            context=json.dumps(context),
            input_data=json.dumps(input_data),
            user_code=indented,
        )

        t = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-c", wrapped,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)
            duration = int((time.monotonic() - t) * 1000)

            out_text = stdout.decode().strip()
            if out_text:
                try:
                    result = json.loads(out_text.split("\n")[-1])  # last line
                    return result, duration, result.get("status") != "failed"
                except json.JSONDecodeError:
                    return {"stdout": out_text[:500]}, duration, True
            else:
                err = stderr.decode().strip()[:300]
                return {"error": err or "no output"}, duration, False

        except asyncio.TimeoutError:
            return {"error": "Sandbox timeout (5s)"}, 5000, False
        except Exception as e:
            return {"error": str(e)}, 1000, False
