"""Ollama (local) provider for NL parsing."""

from __future__ import annotations

import json

import httpx
import structlog

from flint.config import get_settings
from flint.parser.prompts import SYSTEM_PROMPT

logger = structlog.get_logger(__name__)


async def parse_with_ollama(description: str) -> dict:
    """Call local Ollama to parse a workflow description into DAG JSON."""
    settings = get_settings()
    base_url = settings.ollama_base_url
    model = settings.ollama_model

    logger.info("ollama_parse_start", model=model, description_len=len(description))

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{base_url}/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": description},
                    ],
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.1, "num_predict": 4096},
                },
            )
            response.raise_for_status()
            data = response.json()
    except httpx.ConnectError as exc:
        raise RuntimeError(
            f"Cannot connect to Ollama at {base_url}. Is it running?"
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"Ollama HTTP error: {exc}") from exc

    raw = data.get("message", {}).get("content", "").strip()
    logger.info("ollama_parse_complete", raw_len=len(raw))

    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Ollama returned invalid JSON: {exc}\nRaw: {raw[:500]}"
        ) from exc
