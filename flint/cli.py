"""Flint CLI: run/status/list/parse/deploy commands."""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import click


@click.group()
def cli() -> None:
    """Flint: Describe any workflow in natural language. Flint runs it reliably."""


@cli.command()
@click.argument("description_or_path")
@click.option("--api", default="http://localhost:8000", help="Flint API base URL")
def run(description_or_path: str, api: str) -> None:
    """Parse, save, and run a workflow. Stream live status to terminal."""
    asyncio.run(_run(description_or_path, api))


async def _run(description_or_path: str, api: str) -> None:
    import httpx

    # Check if it's a file path
    path = Path(description_or_path)
    if path.exists() and path.suffix == ".json":
        click.echo(f"📂 Loading workflow from {path}")
        dag = json.loads(path.read_text())
        payload: dict = {"dag": dag, "run_immediately": True}
    else:
        click.echo(f"Parsing: {description_or_path[:80]}...")
        payload = {"description": description_or_path, "run_immediately": True}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{api}/api/v1/workflows", json=payload)
        if resp.status_code not in (200, 201):
            click.secho(f"✗ Error: {resp.text}", fg="red")
            sys.exit(1)
        workflow = resp.json()
        wf_id = workflow["id"]
        click.secho(f"Workflow created: {workflow['name']} ({wf_id})", fg="green")

        # Trigger if not already triggered
        trigger_resp = await client.post(f"{api}/api/v1/jobs/trigger/{wf_id}", json={})
        if trigger_resp.status_code != 200:
            click.secho(f"Trigger failed: {trigger_resp.text}", fg="red")
            sys.exit(1)
        job = trigger_resp.json()
        job_id = str(job["job_id"])
        click.echo(f"🚀 Job started: {job_id}")
        click.echo(f"   Status URL: {api}{job['status_url']}")

    # Stream status
    await _stream_job_status(api, job_id)


async def _stream_job_status(api: str, job_id: str) -> None:
    import httpx

    click.echo("\nLive Status:\n")
    seen_statuses: dict[str, str] = {}
    terminal_statuses = {"completed", "failed", "cancelled"}

    for _ in range(120):
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"{api}/api/v1/jobs/{job_id}")
                if resp.status_code != 200:
                    await asyncio.sleep(1)
                    continue
                job_data = resp.json()
            except Exception:
                await asyncio.sleep(1)
                continue

        for te in job_data.get("task_executions", []):
            tid = te["task_id"]
            status = te["status"]
            if seen_statuses.get(tid) != status:
                seen_statuses[tid] = status
                color = {"completed": "green", "failed": "red", "running": "blue"}.get(
                    status, "white"
                )
                icon = {"completed": "ok", "failed": "fail", "running": "..."}.get(status, "?")
                click.secho(f"  {icon} {tid:<30} {status}", fg=color)

        job_status = job_data.get("status", "")
        if job_status in terminal_statuses:
            duration = job_data.get("duration_ms", 0)
            click.echo("")
            if job_status == "completed":
                click.secho(f"Job completed in {duration}ms", fg="green")
            else:
                click.secho(f"✗ Job {job_status}: {job_data.get('error', '')}", fg="red")
            break

        await asyncio.sleep(1)


@cli.command()
@click.argument("job_id")
@click.option("--api", default="http://localhost:8000")
def status(job_id: str, api: str) -> None:
    """Show job status and all task statuses."""
    asyncio.run(_status(job_id, api))


async def _status(job_id: str, api: str) -> None:
    import httpx

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{api}/api/v1/jobs/{job_id}")
        if resp.status_code == 404:
            click.secho("Job not found", fg="red")
            sys.exit(1)
        data = resp.json()

    status_color = {"completed": "green", "failed": "red", "running": "blue"}.get(
        data["status"], "white"
    )
    click.echo(f"\nJob: {job_id}")
    click.secho(f"Status: {data['status']}", fg=status_color)
    click.echo(f"Triggered: {data.get('triggered_at', 'N/A')}")
    click.echo(f"Duration: {data.get('duration_ms', 'N/A')}ms")

    if data.get("error"):
        click.secho(f"Error: {data['error']}", fg="red")

    if data.get("task_executions"):
        click.echo("\nTask Executions:")
        for te in data["task_executions"]:
            color = {"completed": "green", "failed": "red", "running": "blue"}.get(
                te["status"], "white"
            )
            click.secho(
                f"  {te['task_id']:<30} {te['status']:<12} attempt={te['attempt_number']}",
                fg=color,
            )


@cli.command(name="list")
@click.option("--api", default="http://localhost:8000")
@click.option("--limit", default=20)
def list_workflows(api: str, limit: int) -> None:
    """List recent workflows and their last execution status."""
    asyncio.run(_list(api, limit))


async def _list(api: str, limit: int) -> None:
    import httpx

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{api}/api/v1/workflows?limit={limit}")
        data = resp.json()

    workflows = data.get("workflows", [])
    if not workflows:
        click.echo("No workflows found.")
        return

    click.echo(f"\n{'Name':<40} {'Status':<10} {'Schedule':<20} {'ID'}")
    click.echo("-" * 90)
    for w in workflows:
        click.echo(
            f"{w['name'][:39]:<40} {w['status']:<10} "
            f"{(w.get('schedule') or 'manual'):<20} {w['id']}"
        )


@cli.command()
@click.argument("description")
@click.option("--api", default="http://localhost:8000")
def parse(description: str, api: str) -> None:
    """Preview DAG parse without executing."""
    asyncio.run(_parse(description, api))


async def _parse(description: str, api: str) -> None:
    import httpx

    click.echo(f"Parsing: {description[:80]}...")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{api}/api/v1/parse", json={"description": description}
        )
        if resp.status_code != 200:
            click.secho(f"Parse failed: {resp.text}", fg="red")
            sys.exit(1)
        data = resp.json()

    dag = data["dag"]
    click.secho(f"\nParsed: {dag['name']}", fg="green")
    click.echo(f"  Nodes: {data['node_count']}")
    click.echo(f"  Schedule: {dag.get('schedule') or 'manual'}")
    click.echo("\nTask Graph:")
    for node in dag.get("nodes", []):
        deps = " → depends on: " + str(node["depends_on"]) if node.get("depends_on") else ""
        click.echo(f"  [{node['type']:8}] {node['id']}{deps}")

    if data.get("warnings"):
        click.echo("\nWarnings:")
        for w in data["warnings"]:
            click.secho(f"  {w}", fg="yellow")

    click.echo("\nFull DAG JSON:")
    click.echo(json.dumps(dag, indent=2))


@cli.command()
def deploy() -> None:
    """Deploy Flint to Railway."""
    import subprocess

    click.echo("🚀 Deploying to Railway...")
    result = subprocess.run(["railway", "up"], check=False)
    sys.exit(result.returncode)


if __name__ == "__main__":
    cli()
