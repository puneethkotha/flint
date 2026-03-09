"""
Phase 3d: Flint MCP Server — exposes Flint workflows as MCP tools.

Drop this file into: flint/mcp/server.py
Create empty:        flint/mcp/__init__.py

Add to pyproject.toml [project.scripts]:
    flint-mcp = "flint.mcp.server:main"

USAGE (Claude Code / Cursor):
    Add to your MCP config:
    {
      "mcpServers": {
        "flint": {
          "command": "flint-mcp",
          "env": {
            "FLINT_API_URL": "https://flint-api-fbsk.onrender.com",
            "FLINT_API_KEY": "your-key-here"
          }
        }
      }
    }

    Or for local dev:
    {
      "mcpServers": {
        "flint": {
          "command": "python",
          "args": ["-m", "flint.mcp.server"],
          "env": { "FLINT_API_URL": "http://localhost:8000" }
        }
      }
    }

Then in Claude/Cursor you can say:
    "Run my data-pipeline workflow"
    "Create a workflow that fetches GitHub stars and saves to DB"
    "What's the status of job abc-123?"
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# MCP Protocol implementation (stdio transport, JSON-RPC 2.0)
# ---------------------------------------------------------------------------

FLINT_API_URL = os.environ.get("FLINT_API_URL", "http://localhost:8000")
FLINT_API_KEY = os.environ.get("FLINT_API_KEY", "")

TOOL_DEFINITIONS = [
    {
        "name": "list_workflows",
        "description": (
            "List all Flint workflows. Returns workflow IDs, names, descriptions, "
            "and status. Use this to discover available workflows before running them."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max number of workflows to return (default 20)",
                    "default": 20,
                }
            },
        },
    },
    {
        "name": "create_workflow",
        "description": (
            "Create a new Flint workflow from a plain English description. "
            "Flint will parse the description into a DAG and save it. "
            "Returns the new workflow ID."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Plain English description of what the workflow should do",
                }
            },
            "required": ["description"],
        },
    },
    {
        "name": "run_workflow",
        "description": (
            "Trigger execution of a Flint workflow by ID or name. "
            "Returns the job_id to track execution status."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "workflow_id": {
                    "type": "string",
                    "description": "The workflow UUID or name to run",
                },
                "input_data": {
                    "type": "object",
                    "description": "Optional JSON input data passed to the workflow",
                },
            },
            "required": ["workflow_id"],
        },
    },
    {
        "name": "get_job_status",
        "description": (
            "Get the current status of a Flint job. Returns status "
            "(pending/running/completed/failed), per-node results, duration, "
            "and any failure analysis if it failed."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "job_id": {
                    "type": "string",
                    "description": "The job UUID returned by run_workflow",
                }
            },
            "required": ["job_id"],
        },
    },
    {
        "name": "get_metrics",
        "description": (
            "Get Flint system metrics: throughput (executions/min), "
            "avg latency, error rate, and active jobs."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_workflow_versions",
        "description": "List all saved versions of a workflow with timestamps.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "Workflow UUID"}
            },
            "required": ["workflow_id"],
        },
    },
]


# ---------------------------------------------------------------------------
# HTTP client helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if FLINT_API_KEY:
        h["Authorization"] = f"Bearer {FLINT_API_KEY}"
    return h


async def _api_get(path: str, params: dict | None = None) -> Any:
    async with httpx.AsyncClient(base_url=FLINT_API_URL, timeout=30) as client:
        resp = await client.get(path, params=params, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def _api_post(path: str, body: dict) -> Any:
    async with httpx.AsyncClient(base_url=FLINT_API_URL, timeout=30) as client:
        resp = await client.post(path, json=body, headers=_headers())
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------

async def handle_list_workflows(limit: int = 20) -> str:
    data = await _api_get("/api/v1/workflows", params={"limit": limit})
    workflows = data.get("workflows", [])
    if not workflows:
        return "No workflows found. Create one with create_workflow."

    lines = [f"Found {len(workflows)} workflow(s):\n"]
    for wf in workflows:
        lines.append(
            f"• [{wf['id']}] {wf['name']} — {wf.get('description', 'no description')} "
            f"(status: {wf.get('status', 'unknown')})"
        )
    return "\n".join(lines)


async def handle_create_workflow(description: str) -> str:
    data = await _api_post("/api/v1/workflows", {"description": description})
    wf_id = data.get("id", "unknown")
    name = data.get("name", "Untitled")
    nodes = len(data.get("dag_json", {}).get("nodes", []))
    return (
        f"Created workflow '{name}' with {nodes} node(s).\n"
        f"Workflow ID: {wf_id}\n"
        f"Run it with: run_workflow(workflow_id='{wf_id}')"
    )


async def handle_run_workflow(workflow_id: str, input_data: dict | None = None) -> str:
    body: dict = {}
    if input_data:
        body["input_data"] = input_data

    data = await _api_post(f"/api/v1/jobs/trigger/{workflow_id}", body)
    job_id = data.get("job_id", "unknown")
    return (
        f"Workflow triggered. Job ID: {job_id}\n"
        f"Check status with: get_job_status(job_id='{job_id}')"
    )


async def handle_get_job_status(job_id: str) -> str:
    data = await _api_get(f"/api/v1/jobs/{job_id}")
    status = data.get("status", "unknown")
    duration = data.get("duration_ms")
    tasks = data.get("task_executions", [])

    lines = [
        f"Job {job_id}",
        f"Status: {status.upper()}",
    ]
    if duration:
        lines.append(f"Duration: {duration}ms")

    if tasks:
        lines.append(f"\nNodes ({len(tasks)}):")
        for t in tasks:
            icon = {"completed": "✓", "failed": "✗", "running": "⟳", "pending": "○"}.get(
                t["status"], "?"
            )
            lines.append(f"  {icon} {t['task_id']} ({t['task_type']}) — {t['status']}")
            if t.get("error"):
                lines.append(f"     Error: {t['error'][:100]}")

    if data.get("failure_analysis"):
        fa = data["failure_analysis"]
        lines.append(f"\n⚡ Flint thinks it knows what happened:")
        lines.append(f"  {fa.get('explanation', '')}")
        lines.append(f"  Suggested fix: {fa.get('suggested_fix', '')}")

    return "\n".join(lines)


async def handle_get_metrics() -> str:
    data = await _api_get("/api/v1/health")
    lines = [
        "Flint System Metrics:",
        f"  Status: {data.get('status', 'unknown')}",
    ]
    for component, info in data.get("components", {}).items():
        if isinstance(info, dict):
            status = info.get("status", "unknown")
            latency = info.get("latency_ms")
            line = f"  {component}: {status}"
            if latency is not None:
                line += f" ({latency}ms)"
            lines.append(line)
    return "\n".join(lines)


async def handle_get_workflow_versions(workflow_id: str) -> str:
    data = await _api_get(f"/api/v1/workflows/{workflow_id}/versions")
    versions = data.get("versions", [])
    if not versions:
        return f"No versions found for workflow {workflow_id}."

    lines = [f"Versions for workflow {workflow_id}:\n"]
    for v in versions:
        nodes = len(v.get("definition", {}).get("nodes", []))
        summary = v.get("change_summary") or "no summary"
        lines.append(
            f"  v{v['version_number']} — {v['created_at'][:19]} — {nodes} nodes — {summary}"
        )
    return "\n".join(lines)


TOOL_HANDLERS = {
    "list_workflows": lambda args: handle_list_workflows(**args),
    "create_workflow": lambda args: handle_create_workflow(**args),
    "run_workflow": lambda args: handle_run_workflow(**args),
    "get_job_status": lambda args: handle_get_job_status(**args),
    "get_metrics": lambda args: handle_get_metrics(),
    "get_workflow_versions": lambda args: handle_get_workflow_versions(**args),
}


# ---------------------------------------------------------------------------
# MCP stdio server loop
# ---------------------------------------------------------------------------

def _make_response(request_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _make_error(request_id: Any, code: int, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


async def handle_request(msg: dict) -> dict | None:
    method = msg.get("method", "")
    req_id = msg.get("id")
    params = msg.get("params", {})

    # MCP initialization handshake
    if method == "initialize":
        return _make_response(req_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "flint", "version": "1.0.0"},
        })

    if method == "notifications/initialized":
        return None  # no response for notifications

    if method == "tools/list":
        return _make_response(req_id, {"tools": TOOL_DEFINITIONS})

    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        handler = TOOL_HANDLERS.get(tool_name)
        if not handler:
            return _make_error(req_id, -32601, f"Unknown tool: {tool_name}")
        try:
            result_text = await handler(arguments)
            return _make_response(req_id, {
                "content": [{"type": "text", "text": result_text}],
                "isError": False,
            })
        except Exception as e:
            tb = traceback.format_exc()
            return _make_response(req_id, {
                "content": [{"type": "text", "text": f"Error: {e}\n{tb}"}],
                "isError": True,
            })

    if method == "ping":
        return _make_response(req_id, {})

    return _make_error(req_id, -32601, f"Method not found: {method}")


async def stdio_server():
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    write_transport, write_protocol = await loop.connect_write_pipe(
        asyncio.BaseProtocol, sys.stdout
    )

    def write_json(obj: dict):
        line = json.dumps(obj) + "\n"
        write_transport.write(line.encode())

    while True:
        try:
            line = await reader.readline()
            if not line:
                break
            msg = json.loads(line.decode().strip())
            response = await handle_request(msg)
            if response is not None:
                write_json(response)
        except json.JSONDecodeError as e:
            sys.stderr.write(f"JSON parse error: {e}\n")
        except Exception as e:
            sys.stderr.write(f"Server error: {e}\n{traceback.format_exc()}\n")


def main():
    """Entry point: flint-mcp"""
    asyncio.run(stdio_server())


if __name__ == "__main__":
    main()
