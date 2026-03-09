"""FastAPI middleware: request logging, CORS, metrics."""

from __future__ import annotations

import time
import uuid

import structlog
from fastapi import Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware


logger = structlog.get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status, latency, trace_id."""

    async def dispatch(self, request: Request, call_next: object) -> Response:
        trace_id = str(uuid.uuid4())[:8]
        start = time.monotonic()

        request.state.trace_id = trace_id
        structlog.contextvars.bind_contextvars(
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
        )

        try:
            response: Response = await call_next(request)  # type: ignore[operator]
        except Exception as exc:
            logger.error("request_error", error=str(exc))
            raise
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            structlog.contextvars.unbind_contextvars("trace_id", "method", "path")

        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            trace_id=trace_id,
        )

        # Record Prometheus metric
        try:
            from flint.observability.metrics import HTTP_LATENCY, HTTP_REQUESTS
            path_label = _normalize_path(request.url.path)
            HTTP_REQUESTS.labels(
                method=request.method,
                path=path_label,
                status_code=str(response.status_code),
            ).inc()
            HTTP_LATENCY.labels(
                method=request.method,
                path=path_label,
            ).observe((time.monotonic() - start))
        except Exception:
            pass

        response.headers["X-Trace-ID"] = trace_id
        return response


def _normalize_path(path: str) -> str:
    """Replace UUIDs in paths with {id} for metric cardinality reduction."""
    import re
    return re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "{id}",
        path,
    )


def setup_cors(app: object) -> None:
    """Add CORS middleware with permissive settings for development."""
    from fastapi import FastAPI
    _app: FastAPI = app  # type: ignore[assignment]
    _app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
