# Distributed Rate Limiter (Tier 1)

Production-grade HTTP service for controlling API request rates across distributed instances using Redis, with circuit breaker protection, distributed tracing, and comprehensive observability.

## Features

- **3 Algorithms:** Token Bucket (burst-friendly), Fixed Window (simple), Sliding Window (accurate, no boundary spikes)
- **Circuit Breaker:** Graceful degradation when Redis fails (CLOSED → OPEN → HALF_OPEN states)
- **Distributed Tracing:** OpenTelemetry + Jaeger for complete request visibility
- **Correlation IDs:** Track requests across services in logs
- **PostgreSQL Integration:** Persistent rule storage
- **Prometheus Metrics:** Real-time monitoring and alerting
- **Load Balanced:** nginx distributing across multiple instances
- **Docker Ready:** Complete docker-compose stack with all dependencies

## Architecture

- **Rate Limiter Service** - FastAPI with circuit breaker protection
- **Redis** - Atomic distributed state for rate limit counters
- **PostgreSQL** - Persistent rule storage
- **Jaeger** - Distributed tracing visualization
- **nginx** - Load balancer (least_conn)
- **Prometheus** - Metrics collection

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Python 3.11+ (local development)

### With Docker Compose

```bash
docker-compose up --build
# Rate Limiter: http://localhost:8000
# Jaeger UI: http://localhost:16686
# Prometheus: http://localhost:9090
```

### Locally

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export REDIS_HOST=localhost JAEGER_ENABLED=true
python -m uvicorn src.main:app --reload --port 8000
```
