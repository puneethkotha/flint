"""Python task — executes arbitrary Python code in a sandboxed namespace."""

from __future__ import annotations

import asyncio
import textwrap
from typing import Any

import structlog

from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task

logger = structlog.get_logger(__name__)


@register_task("python")
class PythonTask(BaseTask):
    """
    Executes Python code.

    config:
        code: str         — Python source (must define async def run(context) -> dict)
        function: str     — dotted import path to an async callable (alternative to code)
        timeout: int      — seconds, default 60
    """

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        code: str | None = self.config.get("code")
        function_path: str | None = self.config.get("function")
        timeout: int = self.config.get("timeout", 60)

        if not code and not function_path:
            raise TaskExecutionError(
                "python task requires either config.code or config.function"
            )

        logger.info("python_task_start", task_id=self.id)

        try:
            if function_path:
                result = await _call_function(function_path, context, timeout)
            else:
                result = await _exec_code(code or "", context, timeout)
        except TaskExecutionError:
            raise
        except asyncio.TimeoutError:
            raise TaskExecutionError(f"Python task timed out after {timeout}s")

        if not isinstance(result, dict):
            result = {"result": result}

        result["status"] = "ok"
        logger.info("python_task_complete", task_id=self.id)
        return result


async def _exec_code(code: str, context: dict[str, Any], timeout: int) -> Any:
    """Execute inline Python code defining `async def run(context)`."""
    dedented = textwrap.dedent(code)
    namespace: dict[str, Any] = {}
    try:
        exec(compile(dedented, "<flint_task>", "exec"), namespace)  # noqa: S102
    except SyntaxError as exc:
        raise TaskExecutionError(f"Python syntax error: {exc}") from exc

    run_fn = namespace.get("run")
    if run_fn is None:
        raise TaskExecutionError(
            "Python task code must define `async def run(context) -> dict`"
        )

    if not asyncio.iscoroutinefunction(run_fn):
        raise TaskExecutionError(
            "`run` must be an async function: `async def run(context)`"
        )

    return await asyncio.wait_for(run_fn(context), timeout=timeout)


async def _call_function(function_path: str, context: dict[str, Any], timeout: int) -> Any:
    """Dynamically import and call a dotted function path."""
    parts = function_path.rsplit(".", 1)
    if len(parts) != 2:
        raise TaskExecutionError(
            f"config.function must be 'module.function', got: {function_path}"
        )
    module_path, func_name = parts
    try:
        import importlib

        module = importlib.import_module(module_path)
        fn = getattr(module, func_name)
    except (ImportError, AttributeError) as exc:
        raise TaskExecutionError(f"Cannot import {function_path}: {exc}") from exc

    if asyncio.iscoroutinefunction(fn):
        return await asyncio.wait_for(fn(context), timeout=timeout)

    loop = asyncio.get_event_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, fn, context), timeout=timeout
    )
