"""Task type registry — import all task modules to trigger registration."""

from flint.engine.tasks.http_task import HttpTask
from flint.engine.tasks.llm_task import LlmTask
from flint.engine.tasks.python_task import PythonTask
from flint.engine.tasks.shell_task import ShellTask
from flint.engine.tasks.sql_task import SqlTask
from flint.engine.tasks.webhook_task import WebhookTask
from flint.engine.tasks.agent_task import AgentTask

__all__ = [
    "HttpTask",
    "ShellTask",
    "WebhookTask",
    "PythonTask",
    "SqlTask",
    "LlmTask",
    "AgentTask",
]
