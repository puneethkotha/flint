"""
Phase 4a: Flint CLI — full rewrite with rich terminal output.

Replaces/augments: flint/cli.py or flint/cli/main.py

Entry point in pyproject.toml:
    [project.scripts]
    flint = "flint.cli.main:cli"
    flint-mcp = "flint.mcp.server:main"

Usage:
    flint init                          # scaffold new project
    flint run "fetch GitHub stars"      # NL → workflow → trigger → stream logs
    flint deploy                        # push to remote Flint instance
    flint logs <job_id>                 # tail job logs
    flint ls                            # list workflows
    flint status <job_id>               # check job status
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

import click
import httpx

# Try to import rich for pretty output, fall back to plain text
try:
    from rich.console import Console
    from rich.live import Live
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.syntax import Syntax
    from rich.table import Table
    from rich import print as rprint
    HAS_RICH = True
    console = Console()
except ImportError:
    HAS_RICH = False
    console = None  # type: ignore[assignment]

FLINT_API_URL = os.environ.get("FLINT_API_URL", "http://localhost:8000")
FLINT_API_KEY = os.environ.get("FLINT_API_KEY", "")

FLINT_DIR = Path(".flint")
CONFIG_FILE = FLINT_DIR / "config.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if FLINT_API_KEY:
        h["Authorization"] = f"Bearer {FLINT_API_KEY}"
    return h


def _print(msg: str, style: str = ""):
    if HAS_RICH and style:
        console.print(msg, style=style)
    else:
        click.echo(msg)


def _error(msg: str):
    _print(msg, "bold red")
    sys.exit(1)


def _success(msg: str):
    _print(msg, "bold green")


def _info(msg: str):
    _print(f"  {msg}", "dim")


# ---------------------------------------------------------------------------
# CLI Group
# ---------------------------------------------------------------------------

@click.group()
@click.version_option(version="1.0.0", prog_name="flint")
def cli():
    """
    Flint — natural language workflow engine.

    Describe any workflow in natural language. Flint runs it reliably.
    """
    pass


# Register simulate command from simulate_cmd
from flint.cli.simulate_cmd import register_simulate_command
register_simulate_command(cli)


# ---------------------------------------------------------------------------
# flint init
# ---------------------------------------------------------------------------

@cli.command()
@click.option("--api-url", default="http://localhost:8000", help="Flint API URL")
def init(api_url: str):
    """Scaffold a new Flint project in the current directory."""
    FLINT_DIR.mkdir(exist_ok=True)

    config = {"api_url": api_url, "api_key": FLINT_API_KEY}
    CONFIG_FILE.write_text(json.dumps(config, indent=2))

    # Create example workflow file
    example_file = FLINT_DIR / "example.yaml"
    example_file.write_text(
        "# Example Flint workflow\n"
        "description: |\n"
        "  Fetch the top 10 starred Python repos from GitHub,\n"
        "  save them to a Postgres table called github_stars.\n"
    )

    _success(f"Flint project initialized in {FLINT_DIR}/")
    _info(f"Config saved to {CONFIG_FILE}")
    _info(f"Example workflow: {example_file}")
    _info(f"Set FLINT_API_URL={api_url} or edit {CONFIG_FILE}")


# ---------------------------------------------------------------------------
# flint run
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("description")
@click.option("--api-url", default=None, help="Override API URL")
@click.option("--stream/--no-stream", default=True, help="Stream logs to terminal")
@click.option("--input", "input_data", default=None, help="JSON input data for the workflow")
def run(description: str, api_url: Optional[str], stream: bool, input_data: Optional[str]):
    """
    Parse a plain-English description, create a workflow, trigger it, and stream logs.

    Example:
        flint run "fetch GitHub stars for anthropics repos and save to postgres"
    """
    base_url = api_url or _load_api_url()
    asyncio.run(_run_workflow(description, base_url, stream, input_data))


async def _run_workflow(description: str, base_url: str, stream: bool, input_data_str: Optional[str]):
    input_data = {}
    if input_data_str:
        try:
            input_data = json.loads(input_data_str)
        except json.JSONDecodeError:
            _error(f"--input must be valid JSON, got: {input_data_str}")

    _print(f"\n[bold cyan]Flint[/bold cyan] — parsing workflow...\n" if HAS_RICH else "\nFlint — parsing workflow...\n")

    async with httpx.AsyncClient(base_url=base_url, timeout=60, headers=_headers()) as client:
        # Step 1: Parse NL to DAG
        try:
            resp = await client.post("/api/v1/workflows", json={"description": description})
            resp.raise_for_status()
            workflow = resp.json()
        except httpx.HTTPStatusError as e:
            _error(f"Failed to create workflow: {e.response.status_code} — {e.response.text}")
        except httpx.ConnectError:
            _error(f"Cannot connect to Flint at {base_url}. Is it running?")

        wf_id = workflow["id"]
        wf_name = workflow.get("name", "Untitled")
        nodes = workflow.get("dag_json", {}).get("nodes", [])

        _success(f"Created workflow: {wf_name} ({len(nodes)} nodes)")
        _info(f"Workflow ID: {wf_id}")

        if HAS_RICH:
            t = Table(show_header=True, header_style="bold magenta")
            t.add_column("Node", style="cyan")
            t.add_column("Type")
            t.add_column("Dependencies")
            for n in nodes:
                t.add_row(n["id"], n.get("type", "?"), ", ".join(n.get("dependencies", [])) or "-")
            console.print(t)

        # Step 2: Trigger job
        _print("\nTriggering job...")
        body: dict = {}
        if input_data:
            body["input_data"] = input_data
        body["idempotency_key"] = str(uuid.uuid4())

        resp = await client.post(f"/api/v1/jobs/trigger/{wf_id}", json=body)
        resp.raise_for_status()
        job = resp.json()
        job_id = job["job_id"]

        _success(f"Job started: {job_id}")

        if not stream:
            _info(f"Run `flint logs {job_id}` to see output")
            return

        # Step 3: Stream logs / poll until done
        _print("\n── Live output ─────────────────────────────────\n")
        await _stream_job(client, job_id)


async def _stream_job(client: httpx.AsyncClient, job_id: str):
    """Poll job status until completion, printing node statuses."""
    seen_tasks: set[str] = set()
    final_statuses = {"completed", "failed"}

    while True:
        resp = await client.get(f"/api/v1/jobs/{job_id}")
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "pending")

        for task in data.get("task_executions", []):
            key = f"{task['task_id']}-{task['status']}"
            if key not in seen_tasks:
                seen_tasks.add(key)
                icon = {"completed": "ok", "failed": "fail", "running": "...", "pending": "..."}.get(
                    task["status"], "?"
                )
                color = {"completed": "green", "failed": "red", "running": "yellow"}.get(
                    task["status"], "white"
                )
                if HAS_RICH:
                    console.print(f"  [{color}]{icon} {task['task_id']}[/{color}] → {task['status']}")
                else:
                    click.echo(f"  {icon} {task['task_id']} → {task['status']}")

                if task.get("error"):
                    _print(f"     {task['error'][:120]}", "red")

        if status in final_statuses:
            break

        await asyncio.sleep(1.5)

    _print("\n── Result ──────────────────────────────────────\n")

    resp = await client.get(f"/api/v1/jobs/{job_id}")
    data = resp.json()
    final_status = data.get("status")

    if final_status == "completed":
        _success(f"Job completed in {data.get('duration_ms', '?')}ms")
    else:
        _print(f"Job failed", "bold red")
        if data.get("failure_analysis"):
            fa = data["failure_analysis"]
            _print(f"\nFailure analysis:", "bold yellow")
            _print(f"   {fa.get('explanation', '')}")
            _print(f"   Suggested fix: {fa.get('suggested_fix', '')}", "cyan")


# ---------------------------------------------------------------------------
# flint logs
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("job_id")
@click.option("--api-url", default=None, help="Override API URL")
def logs(job_id: str, api_url: Optional[str]):
    """Tail logs for a job."""
    base_url = api_url or _load_api_url()
    asyncio.run(_tail_logs(job_id, base_url))


async def _tail_logs(job_id: str, base_url: str):
    async with httpx.AsyncClient(base_url=base_url, timeout=60, headers=_headers()) as client:
        await _stream_job(client, job_id)


# ---------------------------------------------------------------------------
# flint ls
# ---------------------------------------------------------------------------

@cli.command("ls")
@click.option("--api-url", default=None)
@click.option("--limit", default=20, help="Max workflows to show")
def list_workflows(api_url: Optional[str], limit: int):
    """List all workflows."""
    base_url = api_url or _load_api_url()
    asyncio.run(_list_workflows(base_url, limit))


async def _list_workflows(base_url: str, limit: int):
    async with httpx.AsyncClient(base_url=base_url, timeout=30, headers=_headers()) as client:
        resp = await client.get("/api/v1/workflows", params={"limit": limit})
        resp.raise_for_status()
        data = resp.json()
        workflows = data.get("workflows", [])

    if not workflows:
        _print("No workflows found. Create one with: flint run '<description>'")
        return

    if HAS_RICH:
        t = Table(show_header=True, header_style="bold magenta")
        t.add_column("ID", style="dim", no_wrap=True)
        t.add_column("Name", style="cyan")
        t.add_column("Nodes")
        t.add_column("Status")
        t.add_column("Created")
        for wf in workflows:
            nodes = len(wf.get("dag_json", {}).get("nodes", []))
            t.add_row(
                str(wf["id"])[:8] + "…",
                wf["name"],
                str(nodes),
                wf.get("status", "?"),
                wf.get("created_at", "?")[:10],
            )
        console.print(t)
    else:
        for wf in workflows:
            click.echo(f"{wf['id'][:8]}  {wf['name']}  {wf.get('status', '?')}")


# ---------------------------------------------------------------------------
# flint status
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("job_id")
@click.option("--api-url", default=None)
def status(job_id: str, api_url: Optional[str]):
    """Check the status of a job."""
    base_url = api_url or _load_api_url()
    asyncio.run(_job_status(job_id, base_url))


async def _job_status(job_id: str, base_url: str):
    async with httpx.AsyncClient(base_url=base_url, timeout=30, headers=_headers()) as client:
        resp = await client.get(f"/api/v1/jobs/{job_id}")
        if resp.status_code == 404:
            _error(f"Job {job_id} not found")
        resp.raise_for_status()
        data = resp.json()

    job_status = data.get("status", "unknown")
    duration = data.get("duration_ms")

    if HAS_RICH:
        color = {"completed": "green", "failed": "red", "running": "yellow"}.get(job_status, "white")
        console.print(f"\nJob [dim]{job_id}[/dim]")
        console.print(f"Status: [{color}]{job_status.upper()}[/{color}]")
        if duration:
            console.print(f"Duration: {duration}ms")
    else:
        click.echo(f"Job {job_id}: {job_status.upper()}")

    for task in data.get("task_executions", []):
        icon = {"completed": "ok", "failed": "fail", "running": "...", "pending": "..."}.get(
            task["status"], "?"
        )
        click.echo(f"  {icon} {task['task_id']} — {task['status']}")

    if data.get("failure_analysis"):
        fa = data["failure_analysis"]
        _print(f"\n{fa.get('explanation', '')}", "yellow")
        _print(f"   Fix: {fa.get('suggested_fix', '')}", "cyan")


# ---------------------------------------------------------------------------
# flint deploy
# ---------------------------------------------------------------------------

@cli.command()
@click.option("--remote", default=None, help="Remote Flint API URL to deploy to")
def deploy(remote: Optional[str]):
    """
    Push local workflow definitions to a remote Flint instance.

    Reads .flint/*.yaml files and creates/updates workflows on the remote.
    """
    base_url = remote or _load_api_url()
    yaml_files = list(FLINT_DIR.glob("*.yaml")) + list(FLINT_DIR.glob("*.yml"))

    if not yaml_files:
        _error(f"No workflow files found in {FLINT_DIR}/. Create .flint/my-workflow.yaml")

    asyncio.run(_deploy_workflows(yaml_files, base_url))


async def _deploy_workflows(yaml_files: list[Path], base_url: str):
    try:
        import yaml  # type: ignore[import]
    except ImportError:
        _error("PyYAML is required for deploy: pip install pyyaml")

    async with httpx.AsyncClient(base_url=base_url, timeout=60, headers=_headers()) as client:
        for f in yaml_files:
            data = yaml.safe_load(f.read_text())
            description = data.get("description", "").strip()
            if not description:
                _print(f"Skipping {f.name} — no description", "dim")
                continue

            _print(f"Deploying {f.name}...")
            try:
                resp = await client.post("/api/v1/workflows", json={"description": description})
                resp.raise_for_status()
                wf = resp.json()
                _success(f"{f.name} → {wf['name']} ({wf['id'][:8]}…)")
            except Exception as e:
                _print(f"  Failed: {e}", "red")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_api_url() -> str:
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text())
        return cfg.get("api_url", FLINT_API_URL)
    return FLINT_API_URL


if __name__ == "__main__":
    cli()
