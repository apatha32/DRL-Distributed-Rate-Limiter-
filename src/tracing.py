"""
Distributed tracing with OpenTelemetry (OTLP export).

Enabled when OTEL_EXPORTER_OTLP_ENDPOINT is set, e.g. http://jaeger:4317 for
the local docker-compose Jaeger, or any OTLP-compatible backend in production.
The exporter also honours the other standard OTEL_EXPORTER_OTLP_* variables.
"""
import logging
import os

from opentelemetry import trace
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)


def tracing_enabled() -> bool:
    return bool(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))


def init_tracing(service_name: str = "rate-limiter"):
    """Install a global tracer provider that exports spans over OTLP/gRPC."""
    if not tracing_enabled():
        logger.info("Tracing disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)")
        return

    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

    provider = TracerProvider(resource=Resource(attributes={SERVICE_NAME: service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    logger.info("Tracing initialized: %s", os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))


def instrument_app(app):
    """Instrument FastAPI and Redis calls when tracing is enabled."""
    if not tracing_enabled():
        return

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.redis import RedisInstrumentor

    FastAPIInstrumentor.instrument_app(app, excluded_urls="health,metrics")
    RedisInstrumentor().instrument()
    logger.info("OpenTelemetry instrumentation complete")


def get_tracer(name: str = "rate-limiter"):
    """Get tracer instance."""
    return trace.get_tracer(name)
