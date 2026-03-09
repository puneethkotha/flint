"""NL parse preview endpoint."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException

from flint.api.schemas import ParseRequest, ParseResponse
from flint.moderation import check_content
from flint.parser.dag_validator import DAGValidationError

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/parse", response_model=ParseResponse)
async def parse_workflow(body: ParseRequest) -> ParseResponse:
    """
    Parse a plain English workflow description without saving it.
    Returns the DAG JSON for preview.
    """
    from flint.parser.nl_parser import parse_workflow as _parse

    block_reason = check_content(body.description)
    if block_reason:
        raise HTTPException(status_code=400, detail=block_reason)

    try:
        dag = await _parse(body.description)
    except DAGValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "DAG validation failed", "errors": exc.errors},
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    nodes = dag.get("nodes", [])
    warnings: list[str] = []

    # Warn if any tasks have no corruption checks
    for node in nodes:
        if not node.get("corruption_checks"):
            warnings.append(
                f"Task '{node.get('id', '?')}' has no corruption checks configured"
            )

    return ParseResponse(
        dag=dag,
        node_count=len(nodes),
        warnings=warnings,
    )
