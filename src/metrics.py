"""
Metrics collection and exposure.
"""
import logging
from collections import deque
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
    buckets=(0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5),
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


analyst_runs = Counter(
    'ratelimiter_ai_analyses_total',
    'AI traffic analyses by outcome',
    ['outcome'],
    registry=registry,
)

analyst_tokens = Counter(
    'ratelimiter_ai_tokens_total',
    'Claude tokens used by the AI traffic analyst',
    ['direction'],
    registry=registry,
)


def client_totals() -> dict:
    """Lifetime allowed/blocked counts per (client_id, endpoint) on this node."""
    totals: dict = {}
    for family in registry.collect():
        if family.name not in ("ratelimiter_allowed", "ratelimiter_blocked"):
            continue
        field = family.name.rsplit("_", 1)[1]  # allowed | blocked
        for sample in family.samples:
            if not sample.name.endswith("_total"):
                continue
            key = (sample.labels["client_id"], sample.labels["endpoint"])
            totals.setdefault(key, {"allowed": 0, "blocked": 0})[field] = int(sample.value)
    return totals


# Recent server-side decision latencies (seconds) for live percentiles
_recent_latencies: deque = deque(maxlen=2048)


def record_decision_latency(seconds: float) -> None:
    _recent_latencies.append(seconds)


def latency_percentiles_ms() -> dict:
    """p50/p95/p99 over the most recent decisions on this node (None when idle)."""
    if not _recent_latencies:
        return {"p50": None, "p95": None, "p99": None, "samples": 0}
    ordered = sorted(_recent_latencies)

    def pct(p: float) -> float:
        return round(ordered[min(len(ordered) - 1, int(len(ordered) * p))] * 1000, 3)

    return {"p50": pct(0.50), "p95": pct(0.95), "p99": pct(0.99), "samples": len(ordered)}
