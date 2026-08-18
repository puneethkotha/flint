"""NL Parser: orchestrates LLM providers and DAG validation."""

from __future__ import annotations

from typing import Any

import structlog

from flint.parser.dag_validator import validate_dag

logger = structlog.get_logger(__name__)


async def parse_workflow(description: str) -> dict[str, Any]:
    """
    Parse a natural language workflow description into a validated DAG dict.

    1. Calls the configured LLM provider
    2. Validates the returned DAG structure
    3. Returns the validated DAG dict

    Raises:
        RuntimeError: if the LLM call fails
        DAGValidationError: if the returned DAG is structurally invalid
        ValueError: if JSON parsing fails
    """
    from flint import llm

    spec = llm.resolve_provider()

    logger.info(
        "nl_parse_start",
        provider=spec.name,
        model=llm.resolve_model(spec),
        description=description[:100],
    )

    dag = await _call_provider(spec.name, description)

    # Ensure required top-level fields have defaults
    dag.setdefault("name", _infer_name(description))
    dag.setdefault("description", description[:200])
    dag.setdefault("schedule", None)
    dag.setdefault("timezone", "UTC")
    dag.setdefault("tags", [])
    dag.setdefault("nodes", [])

    # Validate structure and check acyclic
    validate_dag(dag)

    logger.info(
        "nl_parse_complete",
        provider=spec.name,
        node_count=len(dag["nodes"]),
    )
    return dag


async def _call_provider(provider: str, description: str) -> dict[str, Any]:
    """
    Parse a description into a DAG dict via the unified LLM gateway.

    Every provider (groq, gemini, openai, claude, ollama) goes through the same
    JSON-mode path so the free default (Groq) behaves identically to the others.
    """
    from flint import llm
    from flint.parser.prompts import SYSTEM_PROMPT

    return await llm.chat_json(SYSTEM_PROMPT, description, max_tokens=4096, temperature=0.1)


def _infer_name(description: str) -> str:
    """Generate a workflow name from the first few words of the description."""
    words = description.strip().split()[:6]
    name = " ".join(words)
    if len(description.split()) > 6:
        name += "..."
    return name[:100]
