"""OpenTelemetry distributed tracing. Optional; requires [observability] extra."""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)


def setup_otel(app: object, service_name: str, otlp_endpoint: str) -> bool:
    """
    Configure OpenTelemetry SDK and instrument FastAPI.
    Returns True if instrumentation was applied, False otherwise.
    """
    if not otlp_endpoint or not otlp_endpoint.strip():
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource
    except ImportError:
        logger.warning(
            "otel_skip",
            reason="opentelemetry packages not installed. Install with: pip install flint-engine[observability]",
        )
        return False

    try:
        resource = Resource.create({"service.name": service_name})
        provider = TracerProvider(resource=resource)
        endpoint = otlp_endpoint.rstrip("/")
        if not endpoint.endswith("/v1/traces"):
            endpoint = f"{endpoint}/v1/traces"
        exporter = OTLPSpanExporter(endpoint=endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        FastAPIInstrumentor.instrument_app(app)
        logger.info(
            "otel_initialized",
            service=service_name,
            endpoint=otlp_endpoint,
        )
        return True
    except Exception as exc:
        logger.warning("otel_setup_failed", error=str(exc))
        return False
