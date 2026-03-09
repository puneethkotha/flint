"""Audit log query API for compliance and trust."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from flint.api.dependencies import get_db_pool

router = APIRouter()


@router.get("/audit-log")
async def list_audit_logs(
    pool: Annotated[object, Depends(get_db_pool)],
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, description="Filter by action (e.g. workflow.create)"),
    resource_type: str | None = Query(None, description="Filter by resource_type (workflow, job)"),
    resource_id: str | None = Query(None, description="Filter by resource_id"),
) -> dict:
    """
    List audit log entries with optional filters. Supports pagination.
    Use for compliance reviews and trust audits.
    """
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        parts: list[str] = []
        args: list = []
        if action:
            parts.append("action=$1")
            args.append(action)
        if resource_type:
            n = len(args) + 1
            parts.append(f"resource_type=${n}")
            args.append(resource_type)
        if resource_id:
            n = len(args) + 1
            parts.append(f"resource_id=${n}")
            args.append(resource_id)
        where_sql = " AND ".join(parts) if parts else "TRUE"
        count_sql = f"SELECT COUNT(*) FROM audit_logs WHERE {where_sql}"
        total = await conn.fetchval(count_sql, *args)
        list_sql = (
            f"SELECT id, created_at, actor_id, actor_type, action, resource_type, resource_id, "
            f"details, ip_address, trace_id FROM audit_logs WHERE {where_sql} "
            f"ORDER BY created_at DESC LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}"
        )
        rows = await conn.fetch(list_sql, *args, limit, offset)

    entries = []
    for r in rows:
        details = r["details"]
        if isinstance(details, str):
            import json
            details = json.loads(details) if details else {}
        entries.append({
            "id": str(r["id"]),
            "created_at": r["created_at"].isoformat() if isinstance(r["created_at"], datetime) else str(r["created_at"]),
            "actor_id": r["actor_id"],
            "actor_type": r["actor_type"],
            "action": r["action"],
            "resource_type": r["resource_type"],
            "resource_id": r["resource_id"],
            "details": details,
            "ip_address": r["ip_address"],
            "trace_id": r["trace_id"],
        })
    return {"entries": entries, "total": int(total or 0)}
