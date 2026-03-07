"""Claude (Anthropic) provider for NL parsing."""

from __future__ import annotations

import json

import anthropic
import structlog

from flint.config import get_settings
from flint.parser.prompts import SYSTEM_PROMPT

logger = structlog.get_logger(__name__)


async def parse_with_claude(description: str) -> dict:
    """Call Claude claude-sonnet-4-6 to parse a workflow description into DAG JSON."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    logger.info("claude_parse_start", description_len=len(description))

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": description}],
        )
    except anthropic.RateLimitError as exc:
        raise RuntimeError(f"Claude rate limit hit: {exc}") from exc
    except anthropic.AuthenticationError as exc:
        raise RuntimeError(f"Claude authentication failed: {exc}") from exc
    except anthropic.APIError as exc:
        raise RuntimeError(f"Claude API error: {exc}") from exc

    raw = response.content[0].text.strip()
    logger.info("claude_parse_complete", raw_len=len(raw))

    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude returned invalid JSON: {exc}\nRaw: {raw[:500]}") from exc
