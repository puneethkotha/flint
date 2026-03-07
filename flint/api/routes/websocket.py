"""WebSocket endpoint for real-time job status updates."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = structlog.get_logger(__name__)
router = APIRouter()


class WebSocketManager:
    """Manages WebSocket connections grouped by job_id."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, job_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[job_id].add(ws)
        logger.info("ws_connected", job_id=job_id)

    async def disconnect(self, job_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[job_id].discard(ws)
            if not self._connections[job_id]:
                del self._connections[job_id]
        logger.info("ws_disconnected", job_id=job_id)

    async def broadcast_job(self, job_id: str, message: dict[str, Any]) -> None:
        """Send a message to all subscribers of a job."""
        async with self._lock:
            connections = set(self._connections.get(job_id, set()))

        if not connections:
            return

        payload = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections[job_id].discard(ws)

    def active_job_count(self) -> int:
        return len(self._connections)


ws_manager = WebSocketManager()


@router.websocket("/jobs/{job_id}")
async def websocket_job(websocket: WebSocket, job_id: str) -> None:
    """
    WebSocket endpoint for real-time task status updates.

    Client receives JSON messages:
    {
        "type": "task_update",
        "job_id": "...",
        "task_id": "...",
        "status": "running|completed|failed",
        "timestamp": "..."
    }
    """
    await ws_manager.connect(job_id, websocket)
    try:
        # Send current job state immediately on connect
        await _send_current_state(websocket, job_id)

        # Keep connection alive with heartbeat
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(json.dumps({"type": "heartbeat"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("ws_error", job_id=job_id, error=str(exc))
    finally:
        await ws_manager.disconnect(job_id, websocket)


async def _send_current_state(websocket: WebSocket, job_id: str) -> None:
    """Send current job and task state to a newly connected client."""
    try:
        from flint.storage.database import get_pool
        import uuid

        pool = await get_pool()
        async with pool.acquire() as conn:
            job_row = await conn.fetchrow(
                "SELECT status FROM jobs WHERE id=$1",
                uuid.UUID(job_id),
            )
            if job_row:
                await websocket.send_text(json.dumps({
                    "type": "job_state",
                    "job_id": job_id,
                    "status": job_row["status"],
                }))

            task_rows = await conn.fetch(
                """SELECT task_id, status, attempt_number
                   FROM task_executions WHERE job_id=$1
                   ORDER BY started_at""",
                uuid.UUID(job_id),
            )
            for row in task_rows:
                await websocket.send_text(json.dumps({
                    "type": "task_update",
                    "job_id": job_id,
                    "task_id": row["task_id"],
                    "status": row["status"],
                }))
    except Exception as exc:
        logger.warning("ws_state_send_failed", job_id=job_id, error=str(exc))
