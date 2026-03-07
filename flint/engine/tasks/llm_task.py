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
        model: str            — default "claude-sonnet-4-6" | "gpt-4o" | "llama3"
        provider: str         — "claude" | "openai" | "ollama"
        max_tokens: int       — default 1024
        temperature: float    — default 0.3
        output_key: str       — key to store result under in output dict
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

        from flint.config import get_settings

        settings = get_settings()
        provider: str = self.config.get("provider", settings.llm_provider)
        model: str = self.config.get(
            "model",
            "claude-sonnet-4-6" if provider == "claude" else "gpt-4o",
        )

        logger.info("llm_task_start", task_id=self.id, provider=provider, model=model)

        try:
            if provider == "claude":
                text = await _call_claude(prompt, system, model, max_tokens, temperature)
            elif provider == "openai":
                text = await _call_openai(prompt, system, model, max_tokens, temperature)
            elif provider == "ollama":
                text = await _call_ollama(prompt, system, model, max_tokens, temperature)
            else:
                raise TaskExecutionError(f"Unknown LLM provider: {provider}")
        except TaskExecutionError:
            raise
        except Exception as exc:
            raise TaskExecutionError(f"LLM call failed: {exc}") from exc

        logger.info("llm_task_complete", task_id=self.id, output_len=len(text))
        return {
            "status": "ok",
            output_key: text,
            "model": model,
            "provider": provider,
        }


async def _call_claude(
    prompt: str, system: str, model: str, max_tokens: int, temperature: float
) -> str:
    from flint.config import get_settings

    import anthropic

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system

    response = await client.messages.create(**kwargs)
    return response.content[0].text


async def _call_openai(
    prompt: str, system: str, model: str, max_tokens: int, temperature: float
) -> str:
    from openai import AsyncOpenAI

    from flint.config import get_settings

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


async def _call_ollama(
    prompt: str, system: str, model: str, max_tokens: int, temperature: float
) -> str:
    import httpx

    from flint.config import get_settings

    settings = get_settings()
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature, "num_predict": max_tokens},
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]
