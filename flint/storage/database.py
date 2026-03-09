"""asyncpg connection pool and schema initialization."""

import asyncpg
import structlog
from asyncpg import Pool

from flint.config import get_settings

logger = structlog.get_logger(__name__)

_pool: Pool | None = None

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    dag_json JSONB NOT NULL,
    schedule TEXT,
    timezone TEXT DEFAULT 'UTC',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    version INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','queued','running','completed','failed','cancelled')),
    trigger_type TEXT NOT NULL,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error TEXT,
    idempotency_key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    attempt_number INT DEFAULT 1,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    output_validated BOOLEAN DEFAULT FALSE,
    validation_passed BOOLEAN,
    error TEXT,
    retry_reason TEXT,
    failure_type TEXT
);

CREATE TABLE IF NOT EXISTS corruption_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_execution_id UUID NOT NULL REFERENCES task_executions(id),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    check_type TEXT NOT NULL,
    expected JSONB,
    actual JSONB,
    severity TEXT DEFAULT 'error',
    action_taken TEXT
);

-- Phase 3b: Workflow version history
CREATE TABLE IF NOT EXISTS workflow_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    definition JSONB NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    avg_execution_ms INTEGER,
    CONSTRAINT uq_workflow_version UNIQUE (workflow_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_wv_workflow_id ON workflow_versions(workflow_id);

-- Phase 3c: failure_analysis on jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failure_analysis JSONB;

-- Phase 5a: Marketplace
CREATE TABLE IF NOT EXISTS marketplace_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    readme TEXT NOT NULL DEFAULT '',
    dag_json JSONB NOT NULL,
    star_count INTEGER NOT NULL DEFAULT 0,
    fork_count INTEGER NOT NULL DEFAULT 0,
    run_count INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms INTEGER,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_marketplace_name_author UNIQUE (name, author)
);
"""


async def create_pool() -> Pool:
    """Create asyncpg connection pool."""
    settings = get_settings()
    logger.info("creating_db_pool", dsn=settings.database_url.split("@")[-1])
    pool = await asyncpg.create_pool(
        dsn=settings.asyncpg_dsn,
        min_size=2,
        max_size=20,
        command_timeout=60,
        max_inactive_connection_lifetime=300,
    )
    if pool is None:
        raise RuntimeError("Failed to create asyncpg pool")
    return pool


async def init_db(pool: Pool) -> None:
    """Run schema migrations on startup."""
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
    logger.info("db_schema_initialized")


async def get_pool() -> Pool:
    """Return the global connection pool, creating it if needed."""
    global _pool
    if _pool is None:
        _pool = await create_pool()
        await init_db(_pool)
    return _pool


async def close_pool() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("db_pool_closed")
