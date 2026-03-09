"""
AGENT node type for Flint — spawns a mini Claude sub-agent per node.

Drop this file into: flint/engine/tasks/agent_task.py
"""

from __future__ import annotations

import json
import time
import asyncio
from dataclasses import dataclass, field
from typing import Any

import anthropic

from flint.config import get_settings
from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task
from flint.observability.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# Tool schemas exposed to the sub-agent
# ---------------------------------------------------------------------------

AGENT_TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for information on a topic.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (1-10)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "http_fetch",
        "description": "Fetch the content of a URL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch"},
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST"],
                    "default": "GET",
                },
                "body": {
                    "type": "object",
                    "description": "Optional JSON body for POST requests",
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "python_exec",
        "description": "Execute a Python code snippet and return its stdout output.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute",
                },
            },
            "required": ["code"],
        },
    },
]


# ---------------------------------------------------------------------------
# Mock tool executors
# ---------------------------------------------------------------------------

async def _exec_web_search(query: str, num_results: int = 5) -> dict:
    """Mock web search — replace with real SerpAPI / Brave / Tavily call."""
    await asyncio.sleep(0.1)  # simulate latency
    return {
        "query": query,
        "results": [
            {
                "title": f"Result {i+1} for '{query}'",
                "url": f"https://example.com/result-{i+1}",
                "snippet": f"This is a mock snippet about {query} result #{i+1}.",
            }
            for i in range(min(num_results, 5))
        ],
    }


async def _exec_http_fetch(url: str, method: str = "GET", body: dict | None = None) -> dict:
    """Mock HTTP fetch — replace with real httpx call in production."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if method == "POST":
                resp = await client.post(url, json=body or {})
            else:
                resp = await client.get(url)
            return {
                "status_code": resp.status_code,
                "body": resp.text[:2000],  # truncate large responses
                "headers": dict(resp.headers),
            }
    except Exception as e:
        return {"error": str(e)}


async def _exec_python(code: str) -> dict:
    """Execute Python in a subprocess sandbox."""
    proc = await asyncio.create_subprocess_exec(
        "python3", "-c", code,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
    return {
        "stdout": stdout.decode(),
        "stderr": stderr.decode(),
        "exit_code": proc.returncode,
    }


TOOL_EXECUTORS = {
    "web_search": lambda inp: _exec_web_search(**inp),
    "http_fetch": lambda inp: _exec_http_fetch(**inp),
    "python_exec": lambda inp: _exec_python(inp["code"]),
}


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class AgentToolCall:
    tool_name: str
    tool_input: dict
    tool_result: Any
    duration_ms: int


@dataclass
class AgentResult:
    output: dict
    reasoning_trace: list[AgentToolCall] = field(default_factory=list)
    total_tokens: int = 0
    duration_ms: int = 0
    error: str | None = None


# ---------------------------------------------------------------------------
# Core AgentTask
# ---------------------------------------------------------------------------

class AgentTaskCore:
    """
    Spawns a Claude sub-agent that can call tools and return structured JSON.

    Node config shape:
        {
            "prompt": "Search for the top 5 Python web frameworks and summarize them.",
            "output_schema": {...},   # optional JSON schema for output validation
            "max_iterations": 10,     # max agentic loops (default: 10)
            "model": "claude-opus-4-6"  # optional override
        }
    """

    SYSTEM_PROMPT = (
        "You are a sub-agent in a workflow automation system called Flint. "
        "You receive a task and must complete it using the tools available to you. "
        "When you are done, respond with ONLY a valid JSON object as your final message "
        "that captures your findings/output. Do not include markdown fences. "
        "The JSON must have a 'result' key with your main output, and optionally "
        "a 'summary' key with a one-sentence plain-English description of what you did."
    )

    def __init__(self, node_config: dict, context: dict | None = None):
        self.config = node_config
        self.context = context or {}
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def execute(self) -> AgentResult:
        prompt = self.config.get("prompt", "")
        max_iterations = self.config.get("max_iterations", 10)
        model = self.config.get("model", "claude-opus-4-6")

        # Inject upstream context into prompt if available
        if self.context:
            context_str = json.dumps(self.context, indent=2)
            prompt = f"Context from previous steps:\n```json\n{context_str}\n```\n\nYour task:\n{prompt}"

        messages: list[dict] = [{"role": "user", "content": prompt}]
        reasoning_trace: list[AgentToolCall] = []
        total_tokens = 0
        t_start = time.monotonic()

        for iteration in range(max_iterations):
            logger.info("agent_iteration", iteration=iteration, model=model)

            response = await self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=self.SYSTEM_PROMPT,
                tools=AGENT_TOOLS,  # type: ignore[arg-type]
                messages=messages,
            )
            total_tokens += response.usage.input_tokens + response.usage.output_tokens

            # Collect tool use blocks
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
            text_blocks = [b for b in response.content if b.type == "text"]

            # Append assistant message
            messages.append({"role": "assistant", "content": response.content})

            # If no tool calls → agent is done
            if response.stop_reason == "end_turn" or not tool_use_blocks:
                final_text = text_blocks[-1].text if text_blocks else ""
                output = self._parse_output(final_text)
                duration_ms = int((time.monotonic() - t_start) * 1000)
                return AgentResult(
                    output=output,
                    reasoning_trace=reasoning_trace,
                    total_tokens=total_tokens,
                    duration_ms=duration_ms,
                )

            # Execute tool calls
            tool_results = []
            for block in tool_use_blocks:
                t_tool = time.monotonic()
                executor = TOOL_EXECUTORS.get(block.name)
                if executor:
                    try:
                        result = await executor(block.input)
                    except Exception as e:
                        result = {"error": str(e)}
                else:
                    result = {"error": f"Unknown tool: {block.name}"}

                tool_call = AgentToolCall(
                    tool_name=block.name,
                    tool_input=block.input,
                    tool_result=result,
                    duration_ms=int((time.monotonic() - t_tool) * 1000),
                )
                reasoning_trace.append(tool_call)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                })

            messages.append({"role": "user", "content": tool_results})

        duration_ms = int((time.monotonic() - t_start) * 1000)
        return AgentResult(
            output={"error": "max_iterations_reached"},
            reasoning_trace=reasoning_trace,
            total_tokens=total_tokens,
            duration_ms=duration_ms,
            error="Agent reached max iterations without completing",
        )

    def _parse_output(self, text: str) -> dict:
        """Try to extract JSON from agent's final message."""
        text = text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Wrap raw text as result
            return {"result": text}


@register_task("AGENT")
class AgentTask(BaseTask):
    """BaseTask adapter for AgentTaskCore."""

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        config = self.config
        core = AgentTaskCore(node_config=config, context=self.get_input(context))
        result = await core.execute()
        if result.error:
            raise TaskExecutionError(result.error)
        out = result.output.copy()
        if result.reasoning_trace:
            out["_metadata"] = {
                "reasoning_trace": [
                    {"tool": t.tool_name, "input": t.tool_input, "result": t.tool_result, "duration_ms": t.duration_ms}
                    for t in result.reasoning_trace
                ],
                "total_tokens": result.total_tokens,
                "agent_duration_ms": result.duration_ms,
            }
        return out
