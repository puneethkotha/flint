"""
Phase 3c: Natural Language Debugging. AI-powered failure analysis.

HOW TO INTEGRATE:
  1. In executor.py, after a job transitions to "failed", call:
         analysis = await analyze_failure(job, failed_node, error)
         await job_repo.update(job.id, failure_analysis=analysis.model_dump())

  2. The Job model needs a `failure_analysis` JSON column (see models_patch.py).

  3. The job detail API endpoint (GET /api/v1/jobs/{id}) already returns
     all job fields — failure_analysis will appear automatically once the
     column exists.
"""

from __future__ import annotations

import json
import re
from typing import Any

import anthropic
from pydantic import BaseModel

from flint.config import get_settings
from flint.observability.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class FailureAnalysis(BaseModel):
    explanation: str          # 2-sentence natural language explanation
    suggested_fix: str        # one specific actionable fix
    fix_patch: dict | None = None  # optional: patched node config to apply
    confidence: str = "medium"    # "high" | "medium" | "low"


ANALYSIS_SYSTEM = (
    "You are an expert workflow debugging assistant for Flint, a DAG-based workflow engine. "
    "You receive a failed workflow step's error, the node's configuration, and the full workflow definition. "
    "Respond with ONLY valid JSON — no markdown, no explanation outside the JSON. "
    "The JSON must match this schema exactly:\n"
    "{\n"
    '  "explanation": "<2 sentences max — what went wrong in natural language>",\n'
    '  "suggested_fix": "<one specific, actionable fix — be concrete, not vague>",\n'
    '  "fix_patch": <null OR a partial node config dict that patches the broken config>,\n'
    '  "confidence": "<high|medium|low>"\n'
    "}"
)


def _build_analysis_prompt(
    node_id: str,
    node_type: str,
    node_config: dict,
    error: str,
    workflow_dag: dict,
) -> str:
    return (
        f"A workflow step failed. Here are the details:\n\n"
        f"**Node ID:** {node_id}\n"
        f"**Node Type:** {node_type}\n"
        f"**Node Config:**\n```json\n{json.dumps(node_config, indent=2)}\n```\n\n"
        f"**Error:**\n```\n{error[:3000]}\n```\n\n"
        f"**Full Workflow DAG:**\n```json\n{json.dumps(workflow_dag, indent=2)[:4000]}\n```\n\n"
        "Please analyze the failure and respond with the JSON schema described in your system prompt."
    )


async def analyze_failure(
    node_id: str,
    node_type: str,
    node_config: dict,
    error: str,
    workflow_dag: dict,
) -> FailureAnalysis:
    """
    Call Claude to explain a workflow failure in natural language.
    Returns a FailureAnalysis with explanation, suggested fix, and optional patch.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    prompt = _build_analysis_prompt(node_id, node_type, node_config, error, workflow_dag)

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",  # fast + cheap for debugging
            max_tokens=1024,
            system=ANALYSIS_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()

        # Strip markdown fences if model ignores instructions
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        data = json.loads(raw)
        return FailureAnalysis(**data)

    except Exception as e:
        logger.warning("failure_analysis_error", error=str(e))
        return FailureAnalysis(
            explanation=f"Flint could not analyze this failure automatically. Raw error: {str(e)[:200]}",
            suggested_fix="Check the node configuration and error message above for clues.",
            confidence="low",
        )
