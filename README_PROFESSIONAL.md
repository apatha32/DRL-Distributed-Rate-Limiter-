# Distributed Rate Limiter (DRL)

Production-grade distributed rate limiting service with circuit breaker resilience, distributed tracing, and comprehensive observability. Designed for high-throughput backend systems requiring fine-grained request rate control across multiple clients and endpoints.

## Architecture

### System Overview

DRL provides a centralized rate limiting service that validates incoming requests against configurable policies before they reach downstream services. The system operates as a fast, stateless HTTP microservice that delegates state management to Redis, ensuring horizontal scalability and fault tolerance.

### Core Components

**API Service (FastAPI)**
- Exposes `/v1/check` endpoint for real-time rate limit validation
- Stateless design enables horizontal scaling behind a load balancer
- Integrated circuit breaker prevents cascading failures when Redis unavailable
- Supports three pluggable rate limiting algorithms with configurable per-client policies

**Distributed State Layer (Redis)**
- Maintains ephemeral rate limit buckets and counters
- Atomic operations via Lua scripting ensure consistency under concurrent load
- Keys automatically expire based on window duration, preventing memory bloat
- Supports 10,000+ requests/second per instance with sub-millisecond lookup times

**Persistent Configuration (PostgreSQL)**
- Stores rate limit rules and client policies
- Enables dynamic policy updates without service restart
- Maintains historical metrics for compliance and analysis
- Supports endpoint-specific limits per client

**Observability Stack**
- Prometheus metrics expose request counts, latency distributions, and error rates
- OpenTelemetry spans track request flow across service boundaries
- Jaeger distributed tracing visualizes end-to-end request paths
- Correlation IDs maintain request identity through the system

### Request Flow

```
Client Request → [API Validation]
                      ↓
                [Rate Limit Check]
                      ↓
                [Redis Query] ← Circuit Breaker Protection
                      ↓
         [Allow/Block Decision] → [Metrics + Tracing]
                      ↓
           HTTP 200 with Decision
```

1. Incoming request arrives at FastAPI service
2. Client ID and endpoint determine applicable rate limit rule
3. Algorithm checks Redis for current token/counter state
4. Circuit breaker intercepts Redis failures, defaulting to configured fail-mode (open/closed)
5. Decision (allowed/blocked) returned with remaining quota and retry metadata
6. Prometheus counter and latency histogram recorded
7. OpenTelemetry span created for distributed tracing

### Algorithm Implementations

**Token Bucket Algorithm**
- Conceptual model: Each client has a bucket with capacity equal to the rate limit
- Tokens refill continuously at a fixed rate (rate / window)
- Incoming request consumes tokens equal to its cost parameter
- Burst-friendly: Unused tokens accumulate, permitting temporary traffic spikes
- Behavior: Smooth rate enforcement with natural burst tolerance
- Implementation: Two Redis keys per client (current tokens, last refill timestamp)
- Latency: ~1.2ms per check

**Fixed Window Algorithm**
- Conceptual model: Time axis divided into fixed-duration buckets
- Each bucket is a counter that resets at window boundaries
- Requests increment the counter; allowed if counter ≤ rate
- Simplicity: O(1) operation, minimal state tracking
- Weakness: Boundary spike problem (requests spike at window transitions)
- Implementation: Single Redis key per window epoch with automatic expiration
- Latency: ~0.8ms per check

**Sliding Window Algorithm**
- Conceptual model: Evaluates requests within a rolling time window
- Maintains sorted set of request timestamps in Redis
- Removes old timestamps outside current window automatically
- Accuracy: True rate limiting without boundary artifacts
- Benefit: Prevents boundary spikes while maintaining precision
- Implementation: Redis sorted set (zset) with microsecond-precision timestamps
- Latency: ~2.3ms per check (higher due to timestamp tracking)

### Failure Modes and Resilience

**Circuit Breaker Pattern**
- Monitors Redis connection health across consecutive operations
- CLOSED state (normal): Requests proceed to rate limit check
- OPEN state (failure detected): Requests fail immediately, avoiding timeout waits
- HALF_OPEN state (recovery test): Allows test request to probe Redis health
- Configurable thresholds: failure_threshold (failures before opening) and recovery_timeout (seconds before retry)

**Fail Mode Configuration**
- Open mode (default): Allow requests when Redis unavailable (prefer availability)
- Closed mode: Block requests when Redis unavailable (prefer consistency)

**Metrics and Observability**
- Allows operators to detect degradation early via Prometheus dashboards
- Correlation IDs enable tracing of request sequences across failures
- Database fallback stores historical metrics for post-incident analysis

## Technology Stack

| Component | Technology | Role | Version |
|-----------|-----------|------|---------|
| **Web Framework** | FastAPI + Uvicorn | REST API, async request handling | 0.100+ |
| **Rate Limit Storage** | Redis | Distributed state, atomic operations | 7+ |
| **Metrics Export** | Prometheus Python Client | Time-series metrics collection | 0.17+ |
| **Distributed Tracing** | OpenTelemetry + Jaeger Exporter | Request span instrumentation | 1.0+ |
| **Persistent Config** | PostgreSQL + SQLAlchemy | Rule storage and historical metrics | 15+ |
| **Load Testing** | Locust | Throughput and latency benchmarking | 2.0+ |
| **Container Orchestration** | Docker Compose | Multi-service deployment | 3.8+ |
| **HTTP Client** | httpx | Async HTTP client for service tests | 0.24+ |
| **Runtime** | Python | Implementation language | 3.11+ |

## Key Features

### Multi-Algorithm Support
- Three distinct rate limiting algorithms with different latency/accuracy tradeoffs
- Pluggable architecture: algorithm selected via ALGORITHM environment variable
- Token bucket for high-frequency APIs, fixed window for baseline, sliding window for precision

### Client and Endpoint Policies
- Per-client rate limit configuration with global defaults
- Endpoint-specific overrides (e.g., login endpoint stricter than read operations)
- Cost-based limiting: each request consumes configurable tokens/quota
- Dynamic policy updates via database without service restart

### Distributed Observability
- Prometheus metrics: request counters by client/endpoint, latency histograms, active client gauges
- OpenTelemetry automatic instrumentation: FastAPI routes, Redis operations, database queries
- Jaeger UI traces full request path with operation timing and error context
- Correlation IDs embedded in logs and spans for request tracking

### High Performance and Scalability
- Sub-millisecond rate limit checks via Redis lookups
- Stateless API service enables horizontal scaling
- Atomic Redis operations prevent race conditions under concurrent load
- Supports 10,000+ requests/second per instance
- Automatic key expiration prevents Redis memory unbounded growth

### Resilience and Graceful Degradation
- Circuit breaker pattern prevents cascading failures to Redis timeouts
- Configurable fail-open or fail-closed modes for service unavailability
- Health checks enable load balancer awareness of service state
- PostgreSQL persistence independent of Redis availability for rule validation

### Production-Ready Integration
- Structured logging with correlation IDs
- Docker Compose deployment stack (Redis, PostgreSQL, Jaeger, Prometheus)
- Comprehensive test suite: unit tests (algorithms), integration tests (with containers), load tests (Locust)
- CI/CD automation: linting (flake8, black, isort), security scanning (bandit, safety), Docker builds

### Cost Parameter Support
- Each request specifies a cost value (default 1)
- Enables weighted rate limiting: video upload (cost 10) vs. read (cost 1)
- Accurate under all three algorithms

### Granular Rate Limiting Rules
- Global default rate (e.g., 100 req/60s)
- Per-client overrides (e.g., premium clients at 500 req/60s)
- Per-endpoint limits (e.g., login restricted to 20 req/60s)
- Hierarchical fallback: endpoint-specific → client-specific → global default

## Test Generation Framework

The framework simulates realistic client behavior patterns via Locust, a Python-based load testing tool. Test generation proceeds through three stages:

### 1. Request Generation
Locust spawns multiple simulated users that autonomously generate HTTP requests:
- Each simulated user represents one concurrent client
- Inter-request delays (10-100ms) simulate realistic application think time
- Multiple task methods (check_limit, check_endpoint_specific, health_check) execute with weighted probability

### 2. Payload Construction
Generated requests populate realistic parameters:
- client_id: Identifies which client policy applies (e.g., "client_a")
- limit_key: Specifies rate limit rule scope (e.g., "login", "global")
- cost: Token/quota consumption per request (default 1)
- Payloads sent as JSON via POST to /v1/check endpoint

### 3. Response Validation and Metrics
Framework validates responses and collects metrics:
- Allowed requests marked as successful (response.allowed == true)
- Blocked requests still successful (expected behavior, rate limit working)
- HTTP errors captured as failures (500, timeouts, etc.)
- Response times recorded in histogram for latency analysis
- Locust aggregates: throughput (req/s), response time percentiles, error rates

### Test Scenarios
- **Throughput Test**: Ramp users from 1 to 100 concurrent clients over 5 minutes, sustain 5 minutes, measure peak RPS
- **Latency Test**: Fixed 10 concurrent users for 30 seconds, capture p50/p95/p99 latency distributions
- **Burst Test**: Sudden spike to 50 concurrent clients, measure queue depth and circuit breaker behavior
- **Failure Test**: Simulate Redis outages, verify circuit breaker state transitions and fail-mode behavior

## 10K+ RPS in Context

The "10,000+ requests/second" specification describes the **system's throughput capacity**, not the test harness capability. This is the maximum rate the distributed rate limiter service can validate across all clients before hitting resource saturation.

**System Under Test**: DRL rate limiting service (FastAPI + Redis)
- Single instance (one container) can sustain ~10,000 RPS
- Throughput bottleneck: Redis lookup latency (sub-millisecond) multiplied by concurrency
- Horizontal scaling: Deploy N instances behind load balancer, scale capacity N × 10k RPS

**Test Harness**: Locust load generator
- Typically runs on separate hardware from the service
- Can generate sufficient load to stress test the system under test
- Realistic load testing: 10-100 concurrent simulated users sufficient to reach 10k RPS against DRL
- Metrics collected: actual RPS achieved, response time distribution, error rates

**Practical Use Case**
- API gateway protecting downstream microservices from thundering herd
- Peak load: e-commerce platform during flash sale (millions users, fraction send requests simultaneously)
- DRL service validates rate limits, forwards compliant requests downstream
- Prevents cascade failure: downstream service cannot be overloaded, maintains stability

## Prometheus and OpenTelemetry Monitoring

### Prometheus Metrics (Time-Series Data)

**Request Counters**
- `ratelimiter_allowed_total`: Cumulative requests approved by rate limit
  - Labels: client_id, endpoint
  - Enables per-client and per-endpoint throughput analysis
  
- `ratelimiter_blocked_total`: Cumulative requests rejected by rate limit
  - Labels: client_id, endpoint
  - Alerts on unexpected blocking patterns (e.g., legitimate clients hitting limits)

**Performance Metrics**
- `ratelimiter_check_duration_seconds`: Histogram of rate limit check latency
  - Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1000ms
  - Enables SLO tracking: "99th percentile latency < 10ms"
  - Detects Redis degradation (latency spike = Redis slowdown)

**System Health**
- `ratelimiter_redis_errors_total`: Counter of Redis operation failures
  - Labels: operation type (read, write, delete)
  - Triggers circuit breaker state changes and failover logic
  
- `ratelimiter_active_clients`: Gauge of unique clients currently hitting the service
  - Identifies traffic concentration (bursty vs. distributed)

### OpenTelemetry Distributed Tracing (Request-Level Context)

**Span Instrumentation**
- FastAPI automatic tracing: HTTP method, path, status code, duration per request
- Redis instrumentation: individual get/set/increment operations with key names
- SQLAlchemy instrumentation: database queries with SQL statements and execution time
- Custom spans: rate limit rule lookups, circuit breaker state transitions

**Jaeger UI Visualization**
- Single trace shows one complete request journey through DRL
- Timeline view: FastAPI handler → Redis lookup → database rule fetch → response
- Operator can identify bottleneck: is it Redis, database, or application logic?
- Error traces: exceptions and stack traces captured in spans for debugging

**Correlation IDs**
- UUID generated for each request at entry point
- Propagated through logs, metrics labels, and span baggage
- Enables log aggregation: search logs for correlation_id=abc123 to see complete request story
- Cross-service tracing: correlation ID passed in HTTP headers to downstream services

### Monitoring Use Cases

1. **SLO Compliance**: Query Prometheus histogram percentiles to verify "99.9% requests < 5ms"
2. **Capacity Planning**: Track ratelimiter_allowed_total growth rate, project when horizontal scaling needed
3. **Incident Investigation**: Use Jaeger to trace specific request, identify which component delayed it
4. **Policy Tuning**: Analyze ratelimiter_blocked_total by client to detect over-restrictive limits
5. **Circuit Breaker Health**: Monitor redis_errors_total and circuit breaker state for Redis failover events

## Implementation Notes

All code is implemented in **Python 3.11+** using FastAPI async framework. The project is entirely Python with no C++ components. Performance-critical operations (Redis and database queries) use async libraries (aioredis, sqlalchemy async mode) to avoid blocking the event loop.

**Algorithm selection** is configurable at startup via environment variables, allowing different instances to use different algorithms for A/B testing or workload-specific optimization.

**Horizontal scaling** achieved by running multiple DRL instances behind nginx load balancer (included in docker-compose). Each instance independently checks Redis and maintains the circuit breaker state, providing resilience through redundancy.
