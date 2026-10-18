# Distributed Rate Limiter (DRL)

Distributed API rate limiter supporting four algorithms (Token Bucket, Fixed Window, Sliding Window, Leaky Bucket) backed by Redis. Every decision is a single atomic Lua script, so per-client limits are enforced consistently across any number of limiter nodes with sub-millisecond overhead.

A tabular Q-learning agent sits on top of the limiter: every 10 seconds it observes each client's live RPS and block ratio and raises, holds, or lowers that client's limit, so limits adapt to bursty load without manual tuning. A Claude-powered **AI traffic analyst** reviews the limiter's state and the agent's decisions on demand, explains what is happening in plain English, and proposes rule changes that an admin applies with one click.

![Tests](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=main)
![Lint & Code Quality](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg?branch=main)
![Docker Build & Push](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg?branch=main)
![Security Checks](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg?branch=main)

## Architecture

```
                 ┌──────────────────────────┐
  Dashboard ───▶ │  FastAPI limiter node(s) │ ──── EVALSHA (1 round trip) ───▶  Redis
  (Vercel)       │                          │                                   (atomic Lua,
  API clients ─▶ │  /v1/check     hot path  │                                    server clock)
                 │  RL agent      10 s loop │
                 │  AI analyst    on demand │ ──── HTTPS ───▶ Claude API
                 └──────────────────────────┘
                    │ /metrics (Prometheus)   │ OTLP traces (optional)
```

- **Hot path** (`POST /v1/check`): rule lookup → RL-adjusted limit (in-memory read) → one Lua script in Redis. No other I/O.
- **Learning loop**: a background task steps the Q-learning agent every `RL_UPDATE_INTERVAL_SEC`.
- **Control plane**: admin endpoints, including the AI analyst, are behind an API key. Claude is never called on the request path.

## Algorithms

Each algorithm is one Redis Lua script: the read, decision, and write happen atomically, using Redis `TIME` so clock skew between nodes doesn't matter. Only admitted requests consume budget.

| | Token Bucket | Leaky Bucket | Fixed Window | Sliding Window |
|---|---|---|---|---|
| p50 latency | 0.098 ms | 0.097 ms | 0.096 ms | 0.101 ms |
| p99 latency | 0.286 ms | 0.131 ms | 0.130 ms | 0.171 ms |
| State per client | 1 hash | 1 hash | 1 hash | sorted set (1 entry / request) |
| Boundary spike | No | No | Yes (up to 2×) | No |
| Allows bursts | Yes | Up to bucket size | Yes | No |

Latency is one full limit decision on the asyncio Redis client (EVALSHA round trip), measured with `scripts/benchmark.py`: 20K checks per algorithm across 100 clients, app and Redis 7 on the same Docker network. Reproduce:

```bash
docker run -d -p 6379:6379 redis:7-alpine
python scripts/benchmark.py -n 20000
```

Atomicity is tested: `tests/test_algorithms.py::test_concurrent_nodes_never_exceed_limit` fires 8 concurrent "nodes" with separate connections at one Redis and asserts exactly `rate` requests are admitted.

## Adaptive limits (Q-learning)

- One Q-table per client and endpoint. States are traffic level × block ratio × RPS trend (27 states).
- Every 10 s the agent observes the last window, updates the Q-table, and lowers, holds, or raises the enforced limit by 10%, within `RL_MIN_LIMIT`..`RL_MAX_LIMIT`.
- Reward favors allowed throughput and penalizes over-blocking and under-protection at high traffic.
- Admin rule changes reset the learned limit for that client to the new rule.
- Inspect with `GET /v1/rl/diagnostics/{client_id}`. Turn it off with `ENABLE_RL=false`.

## AI traffic analyst (Claude)

`POST /v1/admin/ai/analyses` sends Claude (`claude-opus-5-5` by default) a bounded snapshot: the rules, per-client allowed/blocked counters for the busiest clients, and the RL agent's recent decisions with rewards. It returns schema-validated structured output:

```json
{
  "status": "watch",
  "summary": "client_x is sending 40 rps to /login with 92% blocked; pattern matches credential stuffing...",
  "findings": [{"client_id": "client_x", "endpoint": "login", "severity": "warning", "issue": "...", "evidence": "..."}],
  "recommendations": [{"client_id": "client_x", "endpoint": "login", "rate": 5, "window": 60, "rationale": "..."}]
}
```

Safeguards:
- **Human in the loop.** Recommendations take effect only through `POST /v1/admin/ai/analyses/{id}/recommendations/{i}/apply`, and pass the same validation as a manual rule change.
- **Untrusted data stays data.** Client IDs come from API callers, so they're validated on input and the prompt marks the snapshot as untrusted.
- **Cost guardrail.** At most `ANALYST_MAX_PER_HOUR` analyses, enforced by the limiter's own token bucket.
- **Resilience.** It uses server-side refusal fallbacks (`fallbacks: "default"`) and handles refusals, truncation, and API errors explicitly.
- **Observability.** Exposes `ratelimiter_ai_analyses_total` and `ratelimiter_ai_tokens_total` metrics.

Analyses are stored in Redis for `ANALYSIS_TTL_SEC` (default 24 h). The **AI Analyst** page in the dashboard drives this flow.

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/check` | – | Rate-limit decision. 200 allowed, 429 blocked. |
| GET | `/health` | – | Liveness; `degraded` when Redis is unreachable |
| GET | `/metrics` | – | Prometheus text format |
| GET | `/v1/rl/diagnostics/{client_id}` | – | RL agent state for a client |
| GET | `/circuit-breaker-status` | – | Redis circuit breaker state |
| GET/POST | `/v1/admin/rules` | API key | List / create or update rules |
| GET | `/v1/admin/ai/status` | API key | Analyst enabled? `?include_snapshot=true` previews what Claude sees |
| POST | `/v1/admin/ai/analyses` | API key | Run an analysis |
| GET | `/v1/admin/ai/analyses/{id}` | API key | Fetch a stored analysis |
| POST | `/v1/admin/ai/analyses/{id}/recommendations/{i}/apply` | API key | Apply one recommendation |

Interactive docs are at `/docs`. Admin endpoints take `X-API-Key: $ADMIN_API_KEY`; they return 503 when no key is configured (fail closed).

```bash
curl -i -X POST https://<api>/v1/check \
  -H 'Content-Type: application/json' \
  -d '{"client_id": "client_b", "limit_key": "global", "cost": 1}'

HTTP/1.1 429 Too Many Requests
x-ratelimit-limit: 50
x-ratelimit-remaining: 0
x-ratelimit-reset: 12
retry-after: 12

{"allowed": false, "remaining": 0, "retry_after_ms": 11873, "limit": 50, "window": 60, "reset_at": 1792338000.1}
```

`limit` is the enforced limit, which the RL agent may have moved from the configured rule. If Redis is down and `FAIL_MODE=open`, requests are allowed with `X-RateLimit-Degraded: true`. With `FAIL_MODE=closed`, they get a 503.

## Configuration

| Variable | Default | |
|---|---|---|
| `REDIS_URL` | – | Full Redis URL (takes precedence over `REDIS_HOST`/`REDIS_PORT`; set automatically on Railway) |
| `ALGORITHM` | `token_bucket` | `token_bucket` · `leaky_bucket` · `fixed_window` · `sliding_window` |
| `FAIL_MODE` | `open` | `open` allows on Redis failure, `closed` rejects |
| `ENABLE_RL` | `false` (`true` in the image) | Q-learning adaptive limits |
| `RL_UPDATE_INTERVAL_SEC` | `10` | Seconds between RL observe/adjust cycles |
| `ADMIN_API_KEY` | – | Required for `/v1/admin/*` (`openssl rand -hex 32`) |
| `CORS_ORIGINS` | – | Comma-separated origins, e.g. the Vercel dashboard URL |
| `ANTHROPIC_API_KEY` | – | Enables the AI analyst |
| `ANALYST_MODEL` | `claude-opus-5-5` | Claude model for analyses |
| `ANALYST_EFFORT` | `medium` | `low` · `medium` · `high` |
| `ANALYST_MAX_PER_HOUR` | `20` | Analysis quota |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | – | Enables OpenTelemetry tracing to any OTLP backend |

See `.env.example` for the full list.

## Deployment

### Railway (API + Redis)

1. **New Project → Deploy from GitHub repo**. The service builds the root `Dockerfile` (Python 3.12, non-root user) with the health check on `/health`, configured in `railway.json`.
2. **+ New → Database → Redis** in the same project.
3. Set these variables on the API service:
   - `REDIS_URL` = `${{Redis.REDIS_URL}}`
   - `ADMIN_API_KEY` = a long random string
   - `ANTHROPIC_API_KEY` = your Claude API key
   - `CORS_ORIGINS` = your Vercel URL (after step 2 of Vercel)
4. **Settings → Networking → Generate Domain**.

### Vercel (Dashboard)

1. **Add New → Project**, import this repo, and set **Root Directory** to `dashboard`.
2. Add the environment variable `VITE_API_URL` = your Railway API URL, then deploy.

### Local

```bash
docker-compose up --build            # 2 limiter nodes behind nginx on :8000, Redis, Postgres, Jaeger (:16686)
cd dashboard && npm install && npm run dev   # :3000, proxies /v1 to :8000
```

Compose sets `ADMIN_API_KEY=dev-admin-key` unless you export your own. Export `ANTHROPIC_API_KEY` to try the analyst.

## Testing

```bash
pip install -r requirements-dev.txt
pytest tests/test_algorithms.py tests/test_rl_agent.py tests/test_analyst.py tests/test_api.py
pytest tests/test_integration.py     # needs Redis + Postgres (CI runs them as services)
locust -f tests/load_test.py --host=http://localhost:8000 -u 100 -r 10
```

Unit and API tests run the real Lua scripts on fakeredis and stub the Claude client, so they need no network or API key.

## Project structure

```
src/
  main.py              FastAPI app: hot path, admin API, RL loop, analyst endpoints
  algorithms.py        Token/leaky bucket, fixed/sliding window as atomic Redis Lua
  rl_agent.py          Tabular Q-learning agent (per client/endpoint)
  adaptive_limiter.py  Applies RL-adjusted limits to any algorithm
  analyst.py           Claude traffic analyst: snapshot, structured output, storage
  security.py          Admin API-key auth
  circuit_breaker.py   Redis circuit breaker (sync + async)
  redis_client.py      asyncio Redis client (REDIS_URL / host+port / DEMO_MODE fakeredis)
  metrics.py           Prometheus metrics
  tracing.py           OpenTelemetry OTLP setup
dashboard/             React + Vite dashboard (Vercel)
scripts/benchmark.py   Decision-latency benchmark
tests/                 Unit, API, integration, and load tests
```

## Known limitations

- Rules and RL state live in each node's memory. With several replicas, an admin or AI rule change applies only to the node that served it, and each node learns separately. The limiter counters themselves are shared in Redis. Moving rules and learned limits into Redis is the next step for multi-replica deployments.
- Only the AI Analyst dashboard page calls the live API. The other pages show simulated data.

## License

MIT
