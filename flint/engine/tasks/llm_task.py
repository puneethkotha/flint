"""LLM task — calls Claude (or OpenAI/Ollama) as a workflow step."""

from __future__ import annotations

import re
from typing import Any

import structlog

from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task

logger = structlog.get_logger(__name__)


def _render(template: str, context: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        parts = key.split(".")
        val: Any = context
        for part in parts:
            if isinstance(val, dict):
                val = val.get(part, match.group(0))
            else:
                return match.group(0)
        return str(val)

    return re.sub(r"\{\{(.+?)\}\}", replace, template)


@register_task("llm")
class LlmTask(BaseTask):
    """
    Calls an LLM as a workflow step.

    config:
        prompt: str           — user message (supports {{context}} templates)
        system: str           — optional system message
        model: str            — optional model id override (else provider default)
        max_tokens: int       — default 1024
        temperature: float    — default 0.3
        output_key: str       — key to store result under in output dict

    The provider is chosen globally via LLM_PROVIDER (default: free Groq). See
    flint/llm.py. A node may still pin a specific ``model`` id if needed.
    """

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        prompt: str = self.config.get("prompt", "")
        if not prompt:
            raise TaskExecutionError("llm task requires config.prompt")

        prompt = _render(prompt, context)
        system: str = _render(self.config.get("system", ""), context)
        max_tokens: int = self.config.get("max_tokens", 1024)
        temperature: float = self.config.get("temperature", 0.3)
        output_key: str = self.config.get("output_key", "result")
        model_override: str | None = self.config.get("model")

        from flint import llm

        spec = llm.resolve_provider()
        model = llm.resolve_model(spec, override=model_override)
        logger.info("llm_task_start", task_id=self.id, provider=spec.name, model=model)

        try:
            text = await llm.chat(
                [{"role": "user", "content": prompt}],
                system=system or None,
                model=model_override,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as exc:
            raise TaskExecutionError(f"LLM call failed: {exc}") from exc

        logger.info("llm_task_complete", task_id=self.id, output_len=len(text))
        return {
            "status": "ok",
            output_key: text,
            "model": model,
            "provider": spec.name,
        }
