"""OpenAI provider for NL parsing."""

from __future__ import annotations

import json

import structlog
from openai import AsyncOpenAI

from flint.config import get_settings
from flint.parser.prompts import SYSTEM_PROMPT

logger = structlog.get_logger(__name__)


async def parse_with_openai(description: str) -> dict:
    """Call OpenAI GPT-4o to parse a workflow description into DAG JSON."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    logger.info("openai_parse_start", description_len=len(description))

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=4096,
            temperature=0.1,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": description},
            ],
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        raise RuntimeError(f"OpenAI API error: {exc}") from exc

    raw = response.choices[0].message.content or ""
    logger.info("openai_parse_complete", raw_len=len(raw))

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"OpenAI returned invalid JSON: {exc}\nRaw: {raw[:500]}"
        ) from exc
