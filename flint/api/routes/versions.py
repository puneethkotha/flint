"""Phase 3b: Workflow version history endpoints."""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Annotated

from flint.api.dependencies import get_db_pool

logger = structlog.get_logger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class WorkflowVersionResponse(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    version_number: int
    definition: dict
    change_summary: str | None
    created_at: Any
    avg_execution_ms: int | None


class VersionListResponse(BaseModel):
    versions: list[WorkflowVersionResponse]
    total: int


class NodeDiff(BaseModel):
    node_id: str
    status: str
    before: dict | None = None
    after: dict | None = None
    changed_fields: list[str] = []


class WorkflowDiff(BaseModel):
    workflow_id: uuid.UUID
    version_a: int
    version_b: int
    nodes_diff: list[NodeDiff]
    edges_diff: list[dict]
    summary: str


# ---------------------------------------------------------------------------
# Diff utility
# ---------------------------------------------------------------------------

def _diff_dags(dag_a: dict, dag_b: dict) -> tuple[list[NodeDiff], list[dict]]:
    nodes_a = {n["id"]: n for n in dag_a.get("nodes", [])}
    nodes_b = {n["id"]: n for n in dag_b.get("nodes", [])}

    node_diffs: list[NodeDiff] = []
    for nid in nodes_a:
        if nid not in nodes_b:
            node_diffs.append(NodeDiff(node_id=nid, status="removed", before=nodes_a[nid]))
    for nid in nodes_b:
        if nid not in nodes_a:
            node_diffs.append(NodeDiff(node_id=nid, status="added", after=nodes_b[nid]))
    for nid in nodes_a:
        if nid in nodes_b:
            na, nb = nodes_a[nid], nodes_b[nid]
            changed = [k for k in set(na) | set(nb) if na.get(k) != nb.get(k)]
            status = "changed" if changed else "unchanged"
            node_diffs.append(NodeDiff(node_id=nid, status=status, before=na, after=nb, changed_fields=changed))

    def extract_edges(dag: dict) -> set[tuple[str, str]]:
        edges = set()
        for node in dag.get("nodes", []):
            for dep in node.get("depends_on", []) or node.get("dependencies", []):
                edges.add((dep, node["id"]))
        return edges

    edges_a = extract_edges(dag_a)
    edges_b = extract_edges(dag_b)
    edge_diffs = []
    for (frm, to) in edges_a - edges_b:
        edge_diffs.append({"type": "removed", "from": frm, "to": to})
    for (frm, to) in edges_b - edges_a:
        edge_diffs.append({"type": "added", "from": frm, "to": to})

    return node_diffs, edge_diffs


async def save_workflow_version(
    pool: Any,
    workflow_id: uuid.UUID,
    definition: dict,
    change_summary: str | None = None,
) -> None:
    """Create a new version row. Call from workflow create/update."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT COALESCE(MAX(version_number), 0) as mx FROM workflow_versions WHERE workflow_id = $1""",
            workflow_id,
        )
        next_version = (row["mx"] or 0) + 1
        await conn.execute(
            """INSERT INTO workflow_versions (workflow_id, version_number, definition, change_summary)
               VALUES ($1, $2, $3, $4)""",
            workflow_id,
            next_version,
            json.dumps(definition),
            change_summary,
        )
    logger.info("workflow_version_saved", workflow_id=str(workflow_id), version=next_version)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/workflows/{workflow_id}/versions", response_model=VersionListResponse)
async def list_versions(
    workflow_id: uuid.UUID,
    pool: Annotated[Any, Depends(get_db_pool)],
):
    """Return all saved versions of a workflow in reverse chronological order."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, workflow_id, version_number, definition, change_summary, created_at, avg_execution_ms
               FROM workflow_versions WHERE workflow_id = $1 ORDER BY version_number DESC""",
            workflow_id,
        )
        if not rows:
            wf = await conn.fetchrow("SELECT id FROM workflows WHERE id = $1", workflow_id)
            if not wf:
                raise HTTPException(status_code=404, detail="Workflow not found")

    versions = []
    for r in rows:
        defn = r["definition"]
        if isinstance(defn, str):
            defn = json.loads(defn)
        versions.append(WorkflowVersionResponse(
            id=r["id"],
            workflow_id=r["workflow_id"],
            version_number=r["version_number"],
            definition=defn,
            change_summary=r["change_summary"],
            created_at=r["created_at"],
            avg_execution_ms=r["avg_execution_ms"],
        ))

    return VersionListResponse(versions=versions, total=len(versions))


@router.get("/workflows/{workflow_id}/versions/diff", response_model=WorkflowDiff)
async def diff_versions(
    workflow_id: uuid.UUID,
    v1: int = Query(..., description="First version number"),
    v2: int = Query(..., description="Second version number"),
    pool: Annotated[Any, Depends(get_db_pool)],
):
    """Return structural diff between two workflow versions."""
    async with pool.acquire() as conn:
        ver_a = await conn.fetchrow(
            """SELECT definition FROM workflow_versions WHERE workflow_id = $1 AND version_number = $2""",
            workflow_id, v1,
        )
        ver_b = await conn.fetchrow(
            """SELECT definition FROM workflow_versions WHERE workflow_id = $1 AND version_number = $2""",
            workflow_id, v2,
        )

    if not ver_a:
        raise HTTPException(status_code=404, detail=f"Version {v1} not found")
    if not ver_b:
        raise HTTPException(status_code=404, detail=f"Version {v2} not found")

    defn_a = ver_a["definition"]
    defn_b = ver_b["definition"]
    if isinstance(defn_a, str):
        defn_a = json.loads(defn_a)
    if isinstance(defn_b, str):
        defn_b = json.loads(defn_b)

    node_diffs, edge_diffs = _diff_dags(defn_a, defn_b)
    added = sum(1 for n in node_diffs if n.status == "added")
    removed = sum(1 for n in node_diffs if n.status == "removed")
    changed = sum(1 for n in node_diffs if n.status == "changed")
    parts = []
    if changed:
        parts.append(f"{changed} node{'s' if changed > 1 else ''} changed")
    if added:
        parts.append(f"{added} added")
    if removed:
        parts.append(f"{removed} removed")
    summary = ", ".join(parts) if parts else "No changes"

    return WorkflowDiff(
        workflow_id=workflow_id,
        version_a=v1,
        version_b=v2,
        nodes_diff=node_diffs,
        edges_diff=edge_diffs,
        summary=summary,
    )
