"""SQL task — executes a query via asyncpg."""

from __future__ import annotations

from typing import Any

import structlog

from flint.engine.tasks.base import BaseTask, TaskExecutionError, register_task

logger = structlog.get_logger(__name__)


@register_task("sql")
class SqlTask(BaseTask):
    """
    Executes a SQL query against the configured PostgreSQL database.

    config:
        query: str            — SQL query (supports $1, $2 parameters)
        params: list          — query parameters
        fetch: str            — "one" | "all" | "none" (default "all")
        database_url: str     — optional override, else uses app default
        timeout: int          — seconds, default 30
    """

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        query: str = self.config.get("query", "")
        if not query:
            raise TaskExecutionError("sql task requires config.query")

        params: list[Any] = self.config.get("params", [])
        fetch_mode: str = self.config.get("fetch", "all")
        timeout: int = self.config.get("timeout", 30)
        db_url: str | None = self.config.get("database_url")

        logger.info("sql_task_start", task_id=self.id, fetch=fetch_mode)

        try:
            if db_url:
                import asyncpg

                conn = await asyncpg.connect(dsn=db_url, timeout=timeout)
                try:
                    result = await _run_query(conn, query, params, fetch_mode, timeout)
                finally:
                    await conn.close()
            else:
                from flint.storage.database import get_pool

                pool = await get_pool()
                async with pool.acquire() as conn:
                    result = await _run_query(conn, query, params, fetch_mode, timeout)
        except TaskExecutionError:
            raise
        except Exception as exc:
            raise TaskExecutionError(f"SQL execution error: {exc}") from exc

        logger.info("sql_task_complete", task_id=self.id, rows=len(result))
        return {
            "status": "ok",
            "rows": result,
            "count": len(result),
        }


async def _run_query(
    conn: Any,
    query: str,
    params: list[Any],
    fetch_mode: str,
    timeout: int,
) -> list[dict[str, Any]]:
    import asyncio

    try:
        if fetch_mode == "none":
            await asyncio.wait_for(conn.execute(query, *params), timeout=timeout)
            return []
        elif fetch_mode == "one":
            row = await asyncio.wait_for(
                conn.fetchrow(query, *params), timeout=timeout
            )
            return [dict(row)] if row else []
        else:
            rows = await asyncio.wait_for(
                conn.fetch(query, *params), timeout=timeout
            )
            return [dict(row) for row in rows]
    except asyncio.TimeoutError as exc:
        raise TaskExecutionError(f"SQL query timed out after {timeout}s") from exc
