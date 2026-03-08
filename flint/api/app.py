"""FastAPI application factory with async lifespan."""

from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

import structlog
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from flint.config import get_settings
from flint.observability.logging import configure_logging

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize and clean up all resources."""
    settings = get_settings()
    configure_logging(settings.flint_log_level)
    logger.info("flint_starting", env=settings.flint_env)

    # Database
    from flint.storage.database import close_pool, create_pool, init_db
    pool = await create_pool()
    await init_db(pool)
    app.state.db_pool = pool
    logger.info("db_ready")

    # Redis
    from flint.storage.redis_client import get_redis
    redis = await get_redis()
    app.state.redis = redis
    logger.info("redis_ready")

    # Kafka producer (optional — degrades gracefully if unavailable)
    from flint.streaming.producer import start_producer
    await start_producer()
    logger.info("kafka_producer_ready")

    # WebSocket manager
    from flint.api.routes.websocket import ws_manager

    # DAG Executor
    from flint.engine.executor import DAGExecutor
    from flint.streaming.producer import get_producer
    executor = DAGExecutor(
        db_pool=pool,
        redis_client=redis,
        kafka_producer=await get_producer(),
        ws_manager=ws_manager,
    )
    app.state.executor = executor
    logger.info("executor_ready")

    # Scheduler
    from flint.engine.scheduler import start_scheduler
    await start_scheduler()
    logger.info("scheduler_ready")

    logger.info("flint_started")
    yield

    # Shutdown
    logger.info("flint_stopping")
    from flint.engine.scheduler import stop_scheduler
    await stop_scheduler()

    from flint.streaming.producer import stop_producer
    await stop_producer()

    from flint.storage.redis_client import close_redis
    await close_redis()

    await close_pool()
    logger.info("flint_stopped")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Flint",
        description="Describe any workflow in plain English. Flint runs it reliably.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Middleware
    from flint.api.middleware import RequestLoggingMiddleware, setup_cors
    setup_cors(app)
    app.add_middleware(RequestLoggingMiddleware)

    # Root redirect to docs
    from fastapi.responses import RedirectResponse

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    # API routes
    from flint.api.routes import health, jobs, metrics, parse, workflows
    from flint.api.routes.websocket import router as ws_router

    app.include_router(health.router, prefix="/api/v1", tags=["health"])
    app.include_router(metrics.router, prefix="/api/v1", tags=["metrics"])
    app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
    app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"])
    app.include_router(parse.router, prefix="/api/v1", tags=["parse"])
    app.include_router(ws_router, prefix="/ws", tags=["websocket"])

    # Serve React dashboard static files if built
    dashboard_dist = Path(__file__).parent.parent.parent / "dashboard" / "dist"
    if dashboard_dist.exists():
        app.mount("/", StaticFiles(directory=str(dashboard_dist), html=True), name="dashboard")

    return app


app = create_app()
