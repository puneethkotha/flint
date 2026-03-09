"""
PATCH for flint/engine/executor.py — adds AGENT node type support.

HOW TO APPLY:
1. In executor.py, add this import near the top:
       from flint.engine.tasks.agent_task import AgentTask

2. In the _execute_task() method (or equivalent dispatcher), add this branch:

    elif node.type == "AGENT":
        agent = AgentTask(
            node_config=node.config,
            context=upstream_context,   # dict of {node_id: result} from deps
        )
        agent_result = await agent.execute()
        return TaskResult(
            task_id=node.id,
            status="completed" if not agent_result.error else "failed",
            output=agent_result.output,
            metadata={
                "reasoning_trace": [
                    {
                        "tool": tc.tool_name,
                        "input": tc.tool_input,
                        "result": tc.tool_result,
                        "duration_ms": tc.duration_ms,
                    }
                    for tc in agent_result.reasoning_trace
                ],
                "total_tokens": agent_result.total_tokens,
                "agent_duration_ms": agent_result.duration_ms,
            },
            error=agent_result.error,
        )

3. In TaskNodeSchema (api/schemas.py), add "AGENT" to the type enum:
       type: Literal["http", "shell", "python", "sql", "llm", "webhook", "AGENT"]

4. In the storage models (storage/models.py), the task_type column stores this
   as the string "AGENT" — no schema change needed, it's just a new enum value.

EXAMPLE WORKFLOW DEFINITION with AGENT node:
{
  "name": "research-pipeline",
  "nodes": [
    {
      "id": "researcher",
      "name": "Research Agent",
      "type": "AGENT",
      "dependencies": [],
      "config": {
        "prompt": "Search the web for the top 5 Python web frameworks in 2026. For each one, find its GitHub stars and latest version. Return a JSON array of {name, stars, version, summary}.",
        "max_iterations": 8
      }
    },
    {
      "id": "save_results",
      "name": "Save to DB",
      "type": "sql",
      "dependencies": ["researcher"],
      "config": {
        "query": "INSERT INTO research_results (data) VALUES ($1)",
        "params": ["{{researcher.output.result}}"]
      }
    }
  ]
}
"""

# The actual dispatch logic to paste into executor.py:

EXECUTOR_AGENT_SNIPPET = '''
# === ADD THIS TO your task dispatch method ===

from flint.engine.tasks.agent_task import AgentTask

async def _execute_agent_node(self, node, upstream_context: dict) -> "TaskResult":
    """Execute an AGENT node — spawns a Claude sub-agent."""
    agent = AgentTask(node_config=node.config, context=upstream_context)
    agent_result = await agent.execute()
    return TaskResult(
        task_id=node.id,
        status="completed" if not agent_result.error else "failed",
        output=agent_result.output,
        metadata={
            "reasoning_trace": [
                {
                    "tool": tc.tool_name,
                    "input": tc.tool_input,
                    "result": tc.tool_result,
                    "duration_ms": tc.duration_ms,
                }
                for tc in agent_result.reasoning_trace
            ],
            "total_tokens": agent_result.total_tokens,
            "agent_duration_ms": agent_result.duration_ms,
        },
        error=agent_result.error,
    )
'''
