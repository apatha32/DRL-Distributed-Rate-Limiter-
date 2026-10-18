# Distributed Rate Limiter (DRL)

Distributed API rate limiter supporting four algorithms (Token Bucket, Fixed Window, Sliding Window, Leaky Bucket) backed by Redis. Every decision is a single atomic Lua script, so per-client limits are enforced consistently across any number of limiter nodes with sub-millisecond overhead.

A tabular Q-learning agent sits on top of the limiter: every 10 seconds it observes each client's live RPS and block ratio and raises, holds, or lowers that client's limit — no manual tuning under bursty load.

## ✅ CI/CD Status

![Tests](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=main)
![Lint & Code Quality](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg?branch=main)
![Docker Build & Push](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg?branch=main)
![Load Testing](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Load%20Testing/badge.svg?branch=main)
![Security Checks](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg?branch=main)

### Automated Workflows
Every push triggers:
- **Tests** - Unit & integration tests with Redis, PostgreSQL, Jaeger
- **Lint & Code Quality** - flake8, black, isort, pylint checks
- **Docker Build & Push** - Auto-builds and pushes to GHCR on main branch
- **Load Testing** - Performance benchmarks with 10 concurrent users (30s duration)
- **Security Checks** - Bandit & Safety vulnerability scans

📖 **Documentation:** [CI/CD Setup Guide](.github/CI-CD-SETUP.md) | [Quick Reference](.github/QUICK-REFERENCE.md) | [Badges & Status](.github/BADGES.md)

## 📊 What You Get

**4 Rate Limiting Algorithms** — each one atomic Redis Lua script (one round trip, Redis server clock)
- **Token Bucket** - Burst-friendly, continuous refill
- **Leaky Bucket** - Constant drain rate, smooths traffic
- **Fixed Window** - Cheapest, counter per aligned window
- **Sliding Window** - Exact timestamp log, no boundary spikes

**Adaptive Limits (Q-learning)**
- Per-client Q-table over traffic level × block ratio × RPS trend (27 states)
- Actions: lower / hold / raise the client's limit by 10%, every 10 s (`RL_UPDATE_INTERVAL_SEC`)
- Enable with `ENABLE_RL=true`; inspect with `GET /v1/rl/diagnostics/{client_id}`

**Production Features**
- ✅ Circuit breaker pattern (auto-recovery on failures)
- ✅ OpenTelemetry + Jaeger distributed tracing
- ✅ Prometheus metrics (counters, histograms, gauges)
- ✅ Correlation IDs for request tracking
- ✅ PostgreSQL persistence (rule storage + metrics)
- ✅ Docker Compose stack (Redis, PostgreSQL, Jaeger, nginx)
- ✅ Integration tests with testcontainers
- ✅ Load testing with Locust

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (or Python 3.11+ for local dev)

### With Docker Compose (Recommended)

```bash
git clone https://github.com/apatha32/DRL-Distributed-Rate-Limiter-.git
cd DRL-Distributed-Rate-Limiter-
docker-compose up --build

# Access:
# Rate Limiter API: http://localhost:8000
# Jaeger Tracing: http://localhost:16686
# Prometheus Metrics: http://localhost:9090
```

### Local Setup (No Docker)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r demo_requirements.txt

# Start demo server
python3 demo.py

# Visit http://localhost:8000
```

## 🧪 Interactive Demos

### 1. FastAPI HTML Demo
Beautiful UI at `http://localhost:8000` - test rate limiting in real-time

```bash
python3 demo.py  # Starts on port 8000
```

### 2. Streamlit Dashboard  
Interactive testing dashboard with metrics visualization

```bash
pip install streamlit plotly requests
streamlit run streamlit_demo.py --server.port=8501
```

## 🔌 API Endpoints

### Rate Limit Check
```bash
curl -X POST http://localhost:8000/v1/check \
  -H 'Content-Type: application/json' \
  -d '{"client_id": "api_client", "cost": 1}'
```

**Response (Allowed):**
```json
{
  "allowed": true,
  "remaining": 19,
  "limit": 20,
  "window": 60,
  "reset_at": 1234567890.123
}
```

**Response (Blocked):**
```json
{
  "allowed": false,
  "remaining": 0,
  "limit": 20,
  "window": 60,
  "retry_after_ms": 3000
}
```

### Other Endpoints
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `GET /circuit-breaker-status` - Circuit breaker state
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc

## 🏗️ Architecture

```
┌─────────────────┐
│     Client      │
└────────┬────────┘
         │
    ┌────▼─────┐
    │   nginx   │ (Load Balancer)
    └────┬─────┘
         │
    ┌────┴────────┐
    │             │
 ┌──▼──┐    ┌───▼──┐
 │ API │    │ API  │ (FastAPI instances)
 └──┬──┘    └───┬──┘
    │           │
    └─────┬─────┘
          │
    ┌─────┴──────────┬──────────┬──────────┐
    │                │          │          │
  ┌─▼──┐         ┌──▼──┐   ┌──▼──┐  ┌───▼────┐
  │Redis│        │ PgSQL│   │Jaeger│ │Prometheus│
  │Atomic│       │Rules │   │Traces│ │Metrics   │
  └─────┘        └──────┘   └──────┘ └────────┘
```

## 🧠 Algorithm Comparison

| | Token Bucket | Leaky Bucket | Fixed Window | Sliding Window |
|---|---|---|---|---|
| p50 latency | 0.080 ms | 0.080 ms | 0.079 ms | 0.083 ms |
| p99 latency | 0.123 ms | 0.145 ms | 0.106 ms | 0.106 ms |
| State per client | 1 hash | 1 hash | 1 hash | sorted set (1 entry / request) |
| Boundary spike | No | No | Yes (up to 2×) | No |
| Allows bursts | Yes | Up to bucket size | Yes | No |

Latency = one full limit decision (EVALSHA round trip) measured with `scripts/benchmark.py`, 20K checks per algorithm across 100 clients, app and Redis 7 on the same Docker network. Reproduce:

```bash
docker run -d -p 6379:6379 redis:7-alpine
python scripts/benchmark.py -n 20000
```

## 🧪 Testing

```bash
# Unit tests (algorithms run as real Lua via fakeredis, incl. multi-node concurrency)
pip install "fakeredis[lua]"
pytest tests/test_algorithms.py tests/test_rl_agent.py -v

# Integration tests (requires Docker)
pytest tests/test_integration.py -v

# Load testing
locust -f tests/load_test.py --host=http://localhost:8000 -u 100 -r 10
```

## 📈 Monitoring

### Prometheus Queries

```
# Block rate
sum(rate(ratelimiter_blocked_total[1m])) / (sum(rate(ratelimiter_allowed_total[1m])) + sum(rate(ratelimiter_blocked_total[1m]))) * 100

# P95 latency
histogram_quantile(0.95, rate(ratelimiter_check_duration_seconds_bucket[1m]))

# Total allowed requests
sum(rate(ratelimiter_allowed_total[1m]))
```

### Jaeger Tracing
- Visit `http://localhost:16686`
- Search service: `rate-limiter`
- See request flows, Redis operation timings, database queries

## 🔒 Circuit Breaker States

```
CLOSED (Normal)
  ↓ 5 failures
OPEN (Rejected)
  ↓ Wait 60 seconds
HALF_OPEN (Testing)
  ↓ Success → CLOSED
  ✗ Failure → OPEN
```

## 📁 Project Structure

```
src/
  ├── main.py              # FastAPI app (330 lines) - all endpoints
  ├── algorithms.py        # Token / leaky bucket, fixed / sliding window (Redis Lua)
  ├── rl_agent.py          # Tabular Q-learning agent
  ├── adaptive_limiter.py  # Applies RL-adjusted limits to any algorithm
  ├── circuit_breaker.py   # Resilience pattern
  ├── correlation.py       # Request tracking
  ├── tracing.py           # OpenTelemetry setup
  ├── database.py          # SQLAlchemy models
  ├── models.py            # Pydantic schemas
  ├── config.py            # Configuration
  ├── redis_client.py      # Redis wrapper
  └── metrics.py           # Prometheus metrics

tests/
  ├── test_algorithms.py   # Unit tests
  ├── test_integration.py  # Docker-based integration tests
  └── load_test.py         # Locust load tests

demos/
  ├── demo.py              # FastAPI HTML UI
  └── streamlit_demo.py    # Interactive dashboard

docker-compose.yml         # Full stack (6 services)
Dockerfile                 # Service image
nginx.conf                 # Load balancer config
requirements.txt           # Production dependencies
```

## ⚙️ Configuration

Environment variables:
- `REDIS_URL` - Full Redis URL incl. password (takes precedence; set automatically on Railway)
- `REDIS_HOST` - Redis hostname (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `DATABASE_URL` - PostgreSQL connection (optional)
- `ALGORITHM` - Algorithm choice: token_bucket | leaky_bucket | fixed_window | sliding_window
- `FAIL_MODE` - On failure: open (allow) | closed (reject)
- `ENABLE_RL` - Enable the Q-learning adaptive limits (default: false; true in the Docker image)
- `RL_UPDATE_INTERVAL_SEC` - Seconds between RL observe/adjust cycles (default: 10)
- `JAEGER_ENABLED` - Enable tracing (default: false)
- `JAEGER_HOST` - Jaeger hostname (default: localhost)

## 🎯 Demo Clients

```json
{
  "default": {"rate": 100, "window": 60},
  "api_client": {"rate": 20, "window": 60},
  "premium_client": {"rate": 500, "window": 60}
}
```

## 📚 Performance Metrics

- **Decision latency:** p50 ≈ 0.08 ms, p99 ≤ 0.15 ms per check (see Algorithm Comparison)
- **Atomicity:** each check is one Lua script; `tests/test_algorithms.py::test_concurrent_nodes_never_exceed_limit` runs 8 concurrent nodes against one Redis and asserts exactly `rate` requests are admitted
- **Clock-skew safe:** scripts use Redis `TIME`, not node clocks

## 🚀 Deployment

### Railway (API + Redis)

1. In Railway, **New Project → Deploy from GitHub repo** and pick this repo. It builds from the root `Dockerfile` using `railway.json` (health check: `/health`).
2. In the same project, **+ New → Database → Redis**.
3. On the API service, add the variable `REDIS_URL` = `${{Redis.REDIS_URL}}` (reference to the Redis service).
4. Optional: `ALGORITHM`, `ENABLE_RL`, `FAIL_MODE` (see Configuration).
5. **Settings → Networking → Generate Domain** to get the public API URL (`/docs` for Swagger).

### Vercel (Dashboard)

1. In Vercel, **Add New → Project**, import this repo.
2. Set **Root Directory** to `dashboard`. Framework, build command and SPA routing come from `dashboard/vercel.json`.
3. Deploy.

### Local with Docker Compose
```bash
docker-compose up -d
```

### Kubernetes (Ready for next phase)
- Service deployment manifests can be generated from docker-compose
- StatefulSet for PostgreSQL persistence
- ConfigMaps for rule configuration

## 🔄 Failure Modes

**Redis Down:**
- Circuit breaker opens
- Fail-open: Allow all requests (FAST, no limits)
- Fail-closed: Reject requests (SAFE, enforces limits)

**Database Down:**
- Falls back to in-memory rules
- Service continues operating
- No new rule updates until recovery

**Jaeger Down:**
- Tracing disabled (timeout after 100ms)
- Service continues operating at full speed
- No distributed trace visibility

## 🎓 Interview/Learning Points

✅ Algorithm trade-offs (accuracy vs speed vs memory)
✅ Distributed system resilience (circuit breakers)
✅ Observability at scale (tracing, metrics, logs)
✅ State management in distributed systems
✅ Container orchestration patterns
✅ Load balancing strategies

## 🔮 Future Enhancements (Tier 2+)

- Multi-tenant support with rule isolation
- Adaptive limiting based on traffic
- Database-backed hot-reload rules
- Cost-based rate limiting
- Request prioritization/queuing
- Kubernetes templates
- Advanced analytics dashboard

## 📝 License

MIT

## 🤝 Contributing

This is a portfolio project demonstrating production-grade system design. Feel free to fork, modify, and use as a learning resource.

---

**Status:** ✅ Production-Ready (Tier 1 Complete)
**GitHub:** https://github.com/apatha32/DRL-Distributed-Rate-Limiter-
