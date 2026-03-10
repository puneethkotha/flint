"""FastAPI application factory with async lifespan."""

from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

import structlog
from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from flint.api.dependencies import verify_api_key
from flint.api.limiter import limiter
from flint.config import get_settings
from flint.observability.logging import configure_logging
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

logger = structlog.get_logger(__name__)

# API key required for all /api/v1/* except /health
API_DEPS = [Depends(verify_api_key)]


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

    # SQLAlchemy async engine (for simulation module)
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    sa_engine = create_async_engine(
        settings.sqlalchemy_async_url,
        echo=False,
        pool_pre_ping=True,
    )
    app.state.sa_async_session = async_sessionmaker(
        sa_engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    logger.info("db_ready")

    # Redis
    from flint.storage.redis_client import get_redis
    redis = await get_redis()
    app.state.redis = redis
    logger.info("redis_ready")

    # Kafka producer (optional: degrades gracefully if unavailable)
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
        description="Describe any workflow in natural language. Flint runs it reliably.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
        openapi_tags=[
            {"name": "health", "description": "System health checks. No API key required."},
            {"name": "workflows", "description": "Create, list, get, and delete workflows."},
            {"name": "jobs", "description": "Trigger workflows and monitor job execution status."},
            {"name": "parse", "description": "Parse natural language workflow descriptions into DAG JSON."},
            {"name": "versions", "description": "Workflow version history and diff between versions."},
            {"name": "marketplace", "description": "Browse, publish, fork, and star community workflows."},
            {"name": "benchmarks", "description": "Performance benchmarks and live Flint statistics."},
            {"name": "simulation", "description": "Simulate workflow runs with confidence scores and cost estimates."},
            {"name": "agent", "description": "Conversational AI agent that builds, deploys, and runs workflows from natural language."},
            {"name": "metrics", "description": "Prometheus metrics for monitoring."},
            {"name": "websocket", "description": "Real-time job status updates via WebSocket."},
            {"name": "export_import", "description": "Export/import workflows for backup and migration."},
            {"name": "audit", "description": "Audit logs for compliance and trust."},
        ],
    )

    # Rate limiting: 60/minute per IP for /api/v1/*, exempt /health
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

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
    from flint.api.routes import (
        health,
        jobs,
        metrics,
        parse,
        workflows,
        versions,
        marketplace,
        benchmarks,
        simulation,
        export_import,
        audit,
        auth,
        agent,
        demo,
        suggestions,
    )
    from flint.api.routes.websocket import router as ws_router

    app.include_router(health.router, prefix="/api/v1", tags=["health"])
    app.include_router(versions.router, prefix="/api/v1", tags=["versions"], dependencies=API_DEPS)
    app.include_router(marketplace.router, prefix="/api/v1", tags=["marketplace"], dependencies=API_DEPS)
    app.include_router(benchmarks.router, prefix="/api/v1", tags=["benchmarks"], dependencies=API_DEPS)
    app.include_router(simulation.router, prefix="/api/v1", tags=["simulation"], dependencies=API_DEPS)
    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
    app.include_router(demo.router, prefix="/api/v1", tags=["demo"])  # No API_DEPS: anonymous demo
    app.include_router(suggestions.router, prefix="/api/v1", tags=["suggestions"])  # No API_DEPS: works anonym + auth
    app.include_router(agent.router, prefix="/api/v1", tags=["agent"], dependencies=API_DEPS)
    app.include_router(metrics.router, prefix="/api/v1", tags=["metrics"], dependencies=API_DEPS)
    app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"], dependencies=API_DEPS)
    app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"], dependencies=API_DEPS)
    app.include_router(parse.router, prefix="/api/v1", tags=["parse"], dependencies=API_DEPS)
    app.include_router(export_import.router, prefix="/api/v1", tags=["export_import"], dependencies=API_DEPS)
    app.include_router(audit.router, prefix="/api/v1", tags=["audit"], dependencies=API_DEPS)
    app.include_router(ws_router, prefix="/ws", tags=["websocket"])

    # Serve React dashboard static files if built
    dashboard_dist = Path(__file__).parent.parent.parent / "dashboard" / "dist"
    if dashboard_dist.exists():
        app.mount("/", StaticFiles(directory=str(dashboard_dist), html=True), name="dashboard")

    # Customize OpenAPI to document API key auth (X-API-Key or Authorization: Bearer)
    _openapi = app.openapi

    def custom_openapi():
        schema = _openapi()
        schema.setdefault("components", {})["securitySchemes"] = {
            "ApiKeyAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "X-API-Key",
                "description": "API key. Alternatively use Authorization: Bearer <key>.",
            },
        }
        for path, methods in schema.get("paths", {}).items():
            if path == "/api/v1/health" or path.startswith("/api/v1/auth"):
                continue
            if path.startswith("/api/v1/"):
                for method in methods.values():
                    if isinstance(method, dict) and "security" not in method:
                        method["security"] = [{"ApiKeyAuth": []}]
        return schema

    app.openapi = custom_openapi

    # Distributed tracing (optional). Set OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_ENDPOINT.
    if settings.otel_enabled and settings.otel_exporter_otlp_endpoint:
        from flint.observability.otel import setup_otel
        setup_otel(
            app,
            service_name=settings.otel_service_name,
            otlp_endpoint=settings.otel_exporter_otlp_endpoint.strip(),
        )

    return app


app = create_app()
