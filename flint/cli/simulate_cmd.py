"""
CLI simulate command — add this to flint/cli/main.py.

Usage:
  flint simulate <workflow_id>
  flint run "description" --simulate
  flint run "description" --simulate --auto-run-if-safe

The most impressive CLI demo in the project.
"""

import asyncio
import json
import sys
import uuid
from typing import Optional

import click
import httpx

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich import print as rprint
    HAS_RICH = True
    console = Console()
except ImportError:
    HAS_RICH = False

FLINT_API_URL = "http://localhost:8000"

# ─── Paste these two commands into flint/cli/main.py ──────────────────────────

# 1. Add --simulate flag to the existing `run` command:
RUN_SIMULATE_PATCH = """
# ADD to the existing `flint run` command:
@click.option('--simulate', is_flag=True, default=False, help='Run simulation before executing')
@click.option('--auto-run', is_flag=True, default=False, help='Auto-run if simulation is safe')
"""

# 2. Add standalone `flint simulate` command:

async def _run_simulation(workflow_id: str, base_url: str) -> dict | None:
    async with httpx.AsyncClient(base_url=base_url, timeout=60) as client:
        resp = await client.post(
            f"/api/v1/workflows/{workflow_id}/simulate",
            json={"include_calibration": True},
        )
        if resp.status_code == 404:
            click.echo(f"✗ Workflow {workflow_id} not found", err=True)
            return None
        resp.raise_for_status()
        return resp.json()


def _print_simulation(result: dict) -> None:
    """Render simulation result beautifully in the terminal."""
    if not HAS_RICH:
        _print_plain(result)
        return

    conf      = result["overall_confidence"]
    conf_pct  = int(conf * 100)
    safe      = result["safe_to_run"]
    conf_col  = "green" if conf >= 0.85 else "yellow" if conf >= 0.65 else "red"

    console.print()
    console.print(Panel(
        f"[bold]🔮 Simulation: {result['workflow_name']}[/bold]\n"
        f"[dim]{result['confidence_summary']}[/dim]",
        border_style="purple",
    ))

    # Overall confidence
    bar_filled = int(conf_pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    console.print(f"\n  Confidence  [{conf_col}]{bar}[/{conf_col}] [{conf_col}]{conf_pct}%[/{conf_col}]")

    if result.get("calibration_accuracy"):
        acc = int(result["calibration_accuracy"] * 100)
        console.print(f"  Historical accuracy: [green]{acc}%[/green] (based on past predictions)")

    # Per-node table
    console.print()
    t = Table(show_header=True, header_style="bold dim", box=None, padding=(0, 1))
    t.add_column("Node",      style="cyan", no_wrap=True)
    t.add_column("Type",      style="dim", width=8)
    t.add_column("Confidence")
    t.add_column("Basis",     style="dim")
    t.add_column("~Duration", justify="right")
    t.add_column("Risks",     justify="center")

    for node in result["nodes"]:
        p      = node["propagated_confidence"]
        pct    = int(p * 100)
        col    = "green" if p >= 0.85 else "yellow" if p >= 0.65 else "red"
        basis  = node["confidence_basis"].replace("_", " ")
        hist   = node["historical_run_count"]
        basis_display = f"{basis} ({hist} runs)" if hist > 0 else basis

        risks = node["risks"]
        risk_str = ""
        if any(r["level"] == "critical" for r in risks):
            risk_str = "[red]CRITICAL[/red]"
        elif any(r["level"] == "warning" for r in risks):
            risk_str = "[yellow]⚠[/yellow]"
        else:
            risk_str = "[green]✓[/green]"

        t.add_row(
            node["node_id"],
            node["node_type"],
            f"[{col}]{pct}%[/{col}]",
            basis_display,
            f"{node['predicted_duration_ms']}ms",
            risk_str,
        )
    console.print(t)

    # Risks
    critical = [r for r in result["risks"] if r["level"] == "critical"]
    warnings = [r for r in result["risks"] if r["level"] == "warning"]

    if critical:
        console.print("\n[bold red]🚨 Critical Risks:[/bold red]")
        for r in critical:
            console.print(f"  [red]✗[/red] [{r['node_id']}] {r['message']}")
            console.print(f"     [dim]{r['detail']}[/dim]")
            console.print(f"     [cyan]Fix:[/cyan] {r['suggested_action']}")

    if warnings:
        console.print("\n[bold yellow]⚠ Warnings:[/bold yellow]")
        for r in warnings:
            console.print(f"  [yellow]⚠[/yellow] [{r['node_id']}] {r['message']}")

    # Cost
    cost = result["cost_estimate"]
    console.print(f"\n[bold]💰 Cost estimate:[/bold]")
    console.print(f"   Real run:   [yellow]${cost['real_run_cost_usd']:.4f}[/yellow]")
    console.print(f"   This sim:   [green]${cost['simulation_cost_usd']:.4f}[/green]")
    if cost["external_api_cost_usd"] > 0.001:
        console.print(f"   External APIs: [yellow]${cost['external_api_cost_usd']:.4f}[/yellow]")

    # Timeline
    ms = result["predicted_duration_ms"]
    console.print(f"\n[bold]⏱ Predicted duration:[/bold] {ms}ms ({ms/1000:.1f}s)")

    # Final verdict
    console.print()
    if safe:
        console.print(Panel(
            "[bold green]✓ SAFE TO RUN[/bold green]\n"
            "No critical risks detected. Simulation confidence is acceptable.",
            border_style="green",
        ))
    else:
        console.print(Panel(
            f"[bold red]✗ DO NOT RUN YET[/bold red]\n"
            f"{len(critical)} critical risk(s) detected.\n"
            "Fix the issues above before running for real.",
            border_style="red",
        ))
    console.print()


def _print_plain(result: dict) -> None:
    """Fallback plain-text output (no rich)."""
    conf = int(result["overall_confidence"] * 100)
    print(f"\n🔮 Simulation: {result['workflow_name']}")
    print(f"Confidence: {conf}%  |  Safe: {'YES' if result['safe_to_run'] else 'NO'}")
    print(f"Predicted duration: {result['predicted_duration_ms']}ms")
    print(f"Estimated real cost: ${result['cost_estimate']['real_run_cost_usd']:.4f}")
    print(f"\nNodes:")
    for n in result["nodes"]:
        p = int(n["propagated_confidence"] * 100)
        print(f"  {n['node_id']} ({n['node_type']}) — {p}% confidence, ~{n['predicted_duration_ms']}ms")
    if result["risks"]:
        print(f"\nRisks ({len(result['risks'])}):")
        for r in result["risks"]:
            print(f"  [{r['level'].upper()}] {r['node_id']}: {r['message']}")


# ---------------------------------------------------------------------------
# Click command — paste this into flint/cli/main.py
# ---------------------------------------------------------------------------

def register_simulate_command(cli_group):
    """Call this in main.py: register_simulate_command(cli)"""

    @cli_group.command("simulate")
    @click.argument("workflow_id")
    @click.option("--api-url", default=FLINT_API_URL, help="Flint API URL")
    @click.option("--json", "output_json", is_flag=True, help="Output raw JSON")
    @click.option("--auto-run", is_flag=True, help="Run for real if simulation is safe")
    def simulate(workflow_id: str, api_url: str, output_json: bool, auto_run: bool):
        """
        Simulate a workflow — predict outputs without touching real systems.

        Shows predicted node outputs, confidence scores, risk analysis,
        and cost estimates before you run for real.

        Example:
            flint simulate abc-123-def
            flint simulate abc-123-def --auto-run
        """
        result = asyncio.run(_run_simulation(workflow_id, api_url))
        if not result:
            sys.exit(1)

        if output_json:
            click.echo(json.dumps(result, indent=2, default=str))
            return

        _print_simulation(result)

        if auto_run and result["safe_to_run"]:
            if HAS_RICH:
                console.print("[bold cyan]--auto-run enabled and simulation is safe. Triggering job...[/bold cyan]")
            else:
                print("--auto-run: triggering job...")

            async def _trigger():
                async with httpx.AsyncClient(base_url=api_url, timeout=30) as client:
                    resp = await client.post(
                        f"/api/v1/jobs/trigger/{workflow_id}",
                        json={"simulation_id": result["simulation_id"]},
                    )
                    resp.raise_for_status()
                    return resp.json()

            job = asyncio.run(_trigger())
            if HAS_RICH:
                console.print(f"✓ Job started: [cyan]{job['job_id']}[/cyan]")
            else:
                print(f"✓ Job started: {job['job_id']}")

        elif auto_run and not result["safe_to_run"]:
            if HAS_RICH:
                console.print("[red]--auto-run skipped: simulation found critical risks.[/red]")
            else:
                print("--auto-run skipped: simulation found critical risks.")
            sys.exit(2)
