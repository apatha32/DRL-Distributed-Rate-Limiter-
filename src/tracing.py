"""
Distributed tracing setup with OpenTelemetry and Jaeger.
"""
import logging
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
import os

logger = logging.getLogger(__name__)


def init_tracing(service_name: str = "rate-limiter"):
    """
    Initialize OpenTelemetry tracing with Jaeger exporter.
    
    Args:
        service_name: Service name for tracing
    """
    jaeger_enabled = os.getenv("JAEGER_ENABLED", "false").lower() == "true"
    jaeger_host = os.getenv("JAEGER_HOST", "localhost")
    jaeger_port = int(os.getenv("JAEGER_PORT", 6831))
    
    if not jaeger_enabled:
        logger.info("Jaeger tracing disabled")
        return
    
    try:
        # Create Jaeger exporter
        jaeger_exporter = JaegerExporter(
            agent_host_name=jaeger_host,
            agent_port=jaeger_port,
        )
        
        # Create trace provider with resource
        resource = Resource(attributes={SERVICE_NAME: service_name})
        trace_provider = TracerProvider(resource=resource)
        trace_provider.add_span_processor(
            BatchSpanProcessor(jaeger_exporter)
        )
        
        # Set global trace provider
        trace.set_tracer_provider(trace_provider)
        
        logger.info(f"Jaeger tracing initialized: {jaeger_host}:{jaeger_port}")
    except Exception as e:
        logger.error(f"Failed to initialize Jaeger: {e}")
        raise


def instrument_app(app):
    """
    Instrument FastAPI app with OpenTelemetry.
    
    Args:
        app: FastAPI application instance
    """
    try:
        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(app)
        
        # Instrument Redis
        RedisInstrumentor().instrument()
        
        logger.info("OpenTelemetry instrumentation complete")
    except Exception as e:
        logger.error(f"Failed to instrument app: {e}")
        raise


def get_tracer(name: str = "rate-limiter"):
    """Get tracer instance."""
    return trace.get_tracer(name)
