"""NL Parser: orchestrates LLM providers and DAG validation."""

from __future__ import annotations

from typing import Any

import structlog

from flint.config import get_settings
from flint.parser.dag_validator import DAGValidationError, validate_dag

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
    settings = get_settings()
    provider = settings.llm_provider

    logger.info(
        "nl_parse_start",
        provider=provider,
        description=description[:100],
    )

    dag = await _call_provider(provider, description)

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
        provider=provider,
        node_count=len(dag["nodes"]),
    )
    return dag


async def _call_provider(provider: str, description: str) -> dict[str, Any]:
    """Dispatch to the correct LLM provider."""
    if provider == "claude":
        from flint.parser.providers.claude import parse_with_claude
        return await parse_with_claude(description)
    elif provider == "openai":
        from flint.parser.providers.openai import parse_with_openai
        return await parse_with_openai(description)
    elif provider == "ollama":
        from flint.parser.providers.ollama import parse_with_ollama
        return await parse_with_ollama(description)
    else:
        raise ValueError(f"Unknown LLM provider: '{provider}'. Use: claude, openai, ollama")


def _infer_name(description: str) -> str:
    """Generate a workflow name from the first few words of the description."""
    words = description.strip().split()[:6]
    name = " ".join(words)
    if len(description.split()) > 6:
        name += "..."
    return name[:100]
