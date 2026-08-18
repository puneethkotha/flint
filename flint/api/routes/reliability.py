"""
Reliability & Self-Heal routes.

Powers the dashboard's Self-Heal mode. Two endpoints:

* ``POST /reliability/audit`` — score a workflow's resilience and list its gaps.
* ``POST /reliability/heal``  — run the monitor→detect→diagnose→recover→verify loop,
  return a patched (more resilient) DAG plus a step-by-step trace and metrics.

Both accept either a ready DAG or a natural-language ``description`` (parsed via
the free LLM gateway). Neither executes anything, so both work on infra that has
only a database — and cost nothing beyond an optional narration call.
"""

from __future__ import annotations

from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from flint.api.dependencies import get_current_user_optional
from flint.engine.reliability import audit_dag, heal_dag, narrate_heal
from flint.moderation import check_content, check_dag_content

logger = structlog.get_logger(__name__)
router = APIRouter()


class ReliabilityRequest(BaseModel):
    dag: dict[str, Any] | None = None
    description: str | None = None
    narrate: bool = True


async def _resolve_dag(body: ReliabilityRequest) -> dict:
    """Return a DAG from the request — either provided directly or parsed from NL."""
    if body.dag:
        reason = check_dag_content(body.dag)
        if reason:
            raise HTTPException(status_code=400, detail=reason)
        return body.dag

    if body.description:
        reason = check_content(body.description)
        if reason:
            raise HTTPException(status_code=400, detail=reason)
        from flint.parser.nl_parser import parse_workflow
        try:
            return await parse_workflow(body.description)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not parse workflow: {exc}") from exc

    raise HTTPException(status_code=400, detail="Provide either a 'dag' or a 'description'.")


@router.post("/reliability/audit")
async def reliability_audit(
    body: ReliabilityRequest,
    user: Annotated[dict | None, Depends(get_current_user_optional)] = None,
) -> dict:
    """Score a workflow's reliability and enumerate its gaps (no changes made)."""
    dag = await _resolve_dag(body)
    report = audit_dag(dag)
    return {"dag": dag, "report": report}


@router.post("/reliability/heal")
async def reliability_heal(
    body: ReliabilityRequest,
    user: Annotated[dict | None, Depends(get_current_user_optional)] = None,
) -> dict:
    """
    Run the full self-heal loop and return the trace + patched DAG.

    The response is structured for live visualization: ``before``/``after``
    reports, a per-node ``trace`` (monitor→detect→diagnose→recover→verify), the
    applicable ``patched_dag``, computed ``metrics``, and an optional AI narration.
    """
    dag = await _resolve_dag(body)
    result = heal_dag(dag)

    narration = ""
    if body.narrate:
        narration = await narrate_heal(result)
    result["narration"] = narration

    logger.info(
        "reliability_heal",
        nodes=result["after"]["node_count"],
        score_before=result["metrics"]["score_before"],
        score_after=result["metrics"]["score_after"],
        fixes=result["metrics"]["fixes_applied"],
    )
    return result
