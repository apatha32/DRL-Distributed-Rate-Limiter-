"""
Metrics collection and exposure.
"""
import logging
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry

logger = logging.getLogger(__name__)

# Create registry
registry = CollectorRegistry()

# Define metrics
allowed_requests = Counter(
    'ratelimiter_allowed_total',
    'Total allowed requests',
    ['client_id', 'endpoint'],
    registry=registry,
)

blocked_requests = Counter(
    'ratelimiter_blocked_total',
    'Total blocked requests',
    ['client_id', 'endpoint'],
    registry=registry,
)

redis_errors = Counter(
    'ratelimiter_redis_errors_total',
    'Total Redis errors',
    ['operation'],
    registry=registry,
)

check_latency = Histogram(
    'ratelimiter_check_duration_seconds',
    'Rate limit check duration',
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
    registry=registry,
)

active_clients = Gauge(
    'ratelimiter_active_clients',
    'Number of active clients',
    registry=registry,
)


def record_allowed(client_id: str, endpoint: str = "global"):
    """Record an allowed request."""
    allowed_requests.labels(client_id=client_id, endpoint=endpoint).inc()


def record_blocked(client_id: str, endpoint: str = "global"):
    """Record a blocked request."""
    blocked_requests.labels(client_id=client_id, endpoint=endpoint).inc()


def record_redis_error(operation: str):
    """Record a Redis error."""
    redis_errors.labels(operation=operation).inc()


def get_registry():
    """Get Prometheus registry."""
    return registry
