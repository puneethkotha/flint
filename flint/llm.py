"""
Unified LLM gateway for Flint.

One place that every LLM-backed path in the codebase goes through — the NL→DAG
parser, the conversational Agent, failure analysis, the reliability healer, and
the ``llm`` task type. Centralising this means switching the whole pipeline to a
free, fast provider is a one-line config change instead of a dozen edits.

Design goals
------------
* **Free by default.** Ships defaulting to Groq (no credit card, OpenAI-compatible,
  300–800 tok/s on LPU hardware — genuinely real-time). Google Gemini's free tier
  is a first-class alternative. Anthropic / OpenAI / local Ollama still work if a
  key is present.
* **Provider-agnostic.** Groq, Gemini and OpenAI are all reached through the
  OpenAI SDK (only the ``base_url`` differs), so there are no new dependencies.
  Claude uses the ``anthropic`` SDK; Ollama uses plain HTTP.
* **Resilient.** If the configured provider has no key, we auto-select the first
  provider that *does* — so a fresh clone with only ``GROQ_API_KEY`` set "just works".

Env vars (see .env.example): ``LLM_PROVIDER`` (groq|gemini|openai|claude|ollama),
``GROQ_API_KEY``, ``GEMINI_API_KEY``, ``LLM_MODEL`` (override), ``LLM_FAST_MODEL``.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import structlog

from flint.config import get_settings

logger = structlog.get_logger(__name__)


# ─── Provider catalogue ─────────────────────────────────────────────────────────

# base_url is None for providers that use their SDK's default endpoint.
@dataclass(frozen=True)
class ProviderSpec:
    name: str
    kind: str            # "openai_compat" | "anthropic" | "ollama"
    base_url: str | None
    default_model: str
    fast_model: str
    needs_key: bool = True


PROVIDERS: dict[str, ProviderSpec] = {
    # Groq — free, no credit card, OpenAI-compatible, LPU real-time inference.
    "groq": ProviderSpec(
        name="groq",
        kind="openai_compat",
        base_url="https://api.groq.com/openai/v1",
        default_model="llama-3.3-70b-versatile",
        fast_model="llama-3.1-8b-instant",
    ),
    # Google Gemini — free tier, native JSON-schema structured output, 1M context.
    "gemini": ProviderSpec(
        name="gemini",
        kind="openai_compat",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        default_model="gemini-2.5-flash",
        fast_model="gemini-2.5-flash-lite",
    ),
    "openai": ProviderSpec(
        name="openai",
        kind="openai_compat",
        base_url=None,
        default_model="gpt-4o",
        fast_model="gpt-4o-mini",
    ),
    "claude": ProviderSpec(
        name="claude",
        kind="anthropic",
        base_url=None,
        default_model="claude-sonnet-4-6",
        fast_model="claude-haiku-4-5",
    ),
    # Ollama — local, on-device, no key required.
    "ollama": ProviderSpec(
        name="ollama",
        kind="ollama",
        base_url=None,  # taken from settings.ollama_base_url
        default_model="llama3",
        fast_model="llama3",
        needs_key=False,
    ),
}

# Order used when auto-selecting a provider whose key is actually present.
_FALLBACK_ORDER = ("groq", "gemini", "openai", "claude")


class LLMNotConfiguredError(RuntimeError):
    """Raised when no usable LLM provider is configured."""


def _key_for(provider: str) -> str:
    s = get_settings()
    return {
        "groq": s.groq_api_key,
        "gemini": s.gemini_api_key,
        "openai": (s.openai_api_key if s.openai_api_key not in ("", "skip") else ""),
        "claude": s.anthropic_api_key,
        "ollama": "local",  # sentinel: no key needed
    }.get(provider, "")


def resolve_provider() -> ProviderSpec:
    """
    Pick the provider to use.

    Honours ``LLM_PROVIDER`` when it has a usable key (or is Ollama). Otherwise
    falls back to the first hosted provider that has a key, so a clone configured
    with only one free key works without touching ``LLM_PROVIDER``.
    """
    s = get_settings()
    requested = (s.llm_provider or "groq").lower()

    spec = PROVIDERS.get(requested)
    if spec is not None and (not spec.needs_key or _key_for(requested)):
        return spec

    for name in _FALLBACK_ORDER:
        if _key_for(name):
            if requested != name:
                logger.info("llm_provider_fallback", requested=requested, using=name)
            return PROVIDERS[name]

    # Nothing hosted is keyed. If Ollama was explicitly asked for, honour it.
    if requested == "ollama":
        return PROVIDERS["ollama"]

    raise LLMNotConfiguredError(
        "No LLM provider is configured. Set a free key — the easiest is Groq: "
        "get one at https://console.groq.com (no credit card) and set GROQ_API_KEY. "
        "Alternatives: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, "
        "or LLM_PROVIDER=ollama for a local model."
    )


def resolve_model(spec: ProviderSpec, *, fast: bool = False, override: str | None = None) -> str:
    """Resolve the concrete model id for a provider/tier."""
    if override:
        return override
    s = get_settings()
    if fast and s.llm_fast_model:
        return s.llm_fast_model
    if not fast and s.llm_model:
        return s.llm_model
    return spec.fast_model if fast else spec.default_model


def active_provider_info() -> dict[str, Any]:
    """Small, safe summary for /health and the dashboard (never leaks the key)."""
    try:
        spec = resolve_provider()
    except LLMNotConfiguredError:
        return {"provider": None, "model": None, "configured": False, "free": False}
    return {
        "provider": spec.name,
        "model": resolve_model(spec),
        "fast_model": resolve_model(spec, fast=True),
        "configured": True,
        "free": spec.name in ("groq", "gemini", "ollama"),
    }


def is_configured() -> bool:
    try:
        resolve_provider()
        return True
    except LLMNotConfiguredError:
        return False


# ─── Core calls ──────────────────────────────────────────────────────────────────


async def chat(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    model: str | None = None,
    fast: bool = False,
    max_tokens: int = 1024,
    temperature: float = 0.3,
    json_mode: bool = False,
) -> str:
    """
    Send a chat completion and return the assistant text.

    ``messages`` is a list of ``{"role": "user"|"assistant", "content": str}``.
    ``system`` is passed via the provider's native system field.
    """
    spec = resolve_provider()
    resolved_model = resolve_model(spec, fast=fast, override=model)

    logger.info("llm_call", provider=spec.name, model=resolved_model, json_mode=json_mode)

    if spec.kind == "openai_compat":
        return await _call_openai_compat(
            spec, resolved_model, messages, system, max_tokens, temperature, json_mode
        )
    if spec.kind == "anthropic":
        return await _call_anthropic(
            spec, resolved_model, messages, system, max_tokens, temperature
        )
    if spec.kind == "ollama":
        return await _call_ollama(
            resolved_model, messages, system, max_tokens, temperature, json_mode
        )
    raise LLMNotConfiguredError(f"Unknown provider kind: {spec.kind}")


async def chat_json(
    system: str,
    user: str,
    *,
    model: str | None = None,
    fast: bool = False,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> dict[str, Any]:
    """Chat and parse the reply as JSON (robust to code fences)."""
    text = await chat(
        [{"role": "user", "content": user}],
        system=system,
        model=model,
        fast=fast,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=True,
    )
    return _loads_lenient(text)


# ─── Provider implementations ────────────────────────────────────────────────────


async def _call_openai_compat(
    spec: ProviderSpec,
    model: str,
    messages: list[dict[str, str]],
    system: str | None,
    max_tokens: int,
    temperature: float,
    json_mode: bool,
) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=_key_for(spec.name), base_url=spec.base_url)

    full_messages: list[dict[str, str]] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": full_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        resp = await client.chat.completions.create(**kwargs)
    except Exception as exc:
        # Some models reject response_format; retry once without it.
        if json_mode:
            kwargs.pop("response_format", None)
            resp = await client.chat.completions.create(**kwargs)
        else:
            raise RuntimeError(f"{spec.name} API error: {exc}") from exc
    return resp.choices[0].message.content or ""


async def _call_anthropic(
    spec: ProviderSpec,
    model: str,
    messages: list[dict[str, str]],
    system: str | None,
    max_tokens: int,
    temperature: float,
) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=_key_for("claude"))
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        kwargs["system"] = system
    try:
        resp = await client.messages.create(**kwargs)
    except Exception as exc:
        raise RuntimeError(f"claude API error: {exc}") from exc
    return resp.content[0].text if resp.content else ""


async def _call_ollama(
    model: str,
    messages: list[dict[str, str]],
    system: str | None,
    max_tokens: int,
    temperature: float,
    json_mode: bool,
) -> str:
    import httpx

    s = get_settings()
    full_messages: list[dict[str, str]] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    payload: dict[str, Any] = {
        "model": model,
        "messages": full_messages,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    if json_mode:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{s.ollama_base_url}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


# ─── Helpers ──────────────────────────────────────────────────────────────────────


def _loads_lenient(raw: str) -> dict[str, Any]:
    """Parse JSON that may be wrapped in ```json fences or have leading prose."""
    text = raw.strip()
    if text.startswith("```"):
        # drop the opening fence line and a trailing fence if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last resort: extract the outermost JSON object.
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError(f"LLM returned invalid JSON. Raw: {raw[:500]}")
