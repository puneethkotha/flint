"""Shell task — runs a shell command via asyncio subprocess."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task

logger = structlog.get_logger(__name__)


@register_task("shell")
class ShellTask(BaseTask):
    """
    Executes a shell command.

    config:
        command: str      — required shell command
        cwd: str          — optional working directory
        env: dict         — optional extra env vars
        timeout: int      — seconds, default 60
        capture_output: bool — default True
    """

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        command: str = self.config.get("command", "")
        if not command:
            raise TaskExecutionError("shell task requires config.command")

        cwd: str | None = self.config.get("cwd")
        extra_env: dict[str, str] = self.config.get("env", {})
        timeout: int = self.config.get("timeout", 60)

        import os

        env = {**os.environ, **extra_env}

        logger.info("shell_task_start", task_id=self.id, command=command[:100])

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                raise TaskExecutionError(
                    f"Shell command timed out after {timeout}s: {command[:80]}"
                )
        except TaskExecutionError:
            raise
        except OSError as exc:
            raise TaskExecutionError(f"Failed to start shell command: {exc}") from exc

        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        returncode = proc.returncode or 0

        logger.info(
            "shell_task_complete",
            task_id=self.id,
            returncode=returncode,
            stdout_len=len(stdout),
        )

        if returncode != 0:
            raise TaskExecutionError(
                f"Shell command exited with code {returncode}: {stderr[:500]}"
            )

        return {
            "status": "ok",
            "stdout": stdout,
            "stderr": stderr,
            "returncode": returncode,
        }
