# Distributed Rate Limiter (DRL)

**Live website:** https://drl-distributed-rate-limiter.vercel.app

Distributed API rate limiter supporting four algorithms (Token Bucket, Fixed Window, Sliding Window, Leaky Bucket) backed by Redis. Every decision is a single atomic Lua script, so per-client limits are enforced consistently across any number of limiter nodes with sub-millisecond overhead.

A tabular Q-learning agent sits on top of the limiter: every 10 seconds it observes each client's live RPS and block ratio and raises, holds, or lowers that client's limit, so limits adapt to bursty load without manual tuning. A Claude-powered **AI traffic analyst** reviews the limiter's state and the agent's decisions on demand, explains what is happening in plain English, and proposes rule changes that an admin applies with one click.

![Tests](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Tests/badge.svg?branch=main)
![Lint & Code Quality](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Lint%20&%20Code%20Quality/badge.svg?branch=main)
![Docker Build & Push](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Docker%20Build%20&%20Push/badge.svg?branch=main)
![Security Checks](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-/workflows/Security%20Checks/badge.svg?branch=main)

## How to run a demo

The dashboard has a **Run live demo** button on the Overview page. It sends real requests to the API and explains, in plain English, what the limiter did with them.

### On the deployed site

1. Open the live website: https://drl-distributed-rate-limiter.vercel.app
2. On the Overview page, click **Run live demo**.
3. Watch the box under the button. It shows which phase is running, live counters, and a "What just happened" feed.
4. Browse other pages while it runs. A "Demo running" button in the header stops it from anywhere. It also stops by itself after 15 minutes.

### On your machine

You need Docker and Node.js 20 or newer.

```bash
# 1. Start Redis and the API (ports bound to localhost only)
docker network create drl
docker run -d --name drl-redis --network drl redis:7-alpine
docker build -t drl-api .
docker run -d --name drl-api --network drl -p 127.0.0.1:8000:8000 \
  -e REDIS_URL=redis://drl-redis:6379/0 \
  -e ADMIN_API_KEY=dev-admin-key \
  drl-api
# Optional: add  -e ANTHROPIC_API_KEY=sk-ant-...  to enable the AI analyst

# 2. Start the dashboard (it forwards /v1 and /health to the API on port 8000)
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 and click **Run live demo**. To clean up afterwards, run `docker rm -f drl-api drl-redis`.

### What the demo does

It loops through four phases and sends at most about 10 requests per second in total.

| Phase | Length | Traffic | What you should see |
|---|---|---|---|
| 1. Normal traffic | 30 s | `demo_web` and `demo_mobile` send 1 to 2 requests per second | Everything is allowed |
| 2. A scraper floods the API | 35 s | `demo_scraper` adds 7 requests per second | The scraper uses up its allowance, then gets 429 responses. The regular apps are not affected. |
| 3. Someone hammers a login page | 30 s | 4 requests per second to `client_a /login` | Login has a stricter rule (20 per minute), so it is cut off quickly |
| 4. Things calm down | 25 s | Only the regular apps | Limits refill. The RL agent may adjust limits based on what it saw. |

The feed explains:

- the first request, step by step;
- the moment each client is first blocked;
- a summary every 5 seconds of what each client sent and how much was allowed;
- any time the RL agent raises or lowers a client's limit, with the traffic it based that on.

### Other things to try

- **Playground:** send your own bursts or a steady stream and watch each 200 or 429 come back, with charts of decisions per second and remaining quota.
- **Algorithms, Live algorithm race:** the same traffic hits all four algorithms at once. Choose "Window boundary" to watch Fixed Window let through twice the limit.
- **AI Analyst:** enter your admin key and click **Run analysis** for Claude's summary and suggested rule changes. This needs `ANTHROPIC_API_KEY` on the API.
- **From a terminal:** send 60 requests for `client_b` (limit 50 per minute) and count the answers:

```bash
for i in $(seq 60); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/v1/check \
    -H 'Content-Type: application/json' -d '{"client_id": "client_b"}'
done | sort | uniq -c
#   50 200
#   10 429
```

## What happens when you send a request

This is the path of one `POST /v1/check`, from the moment it arrives until the answer goes back.

1. **The request arrives.** It says who is asking (`client_id`), optionally which endpoint (`limit_key`, for example `login`), and how much it costs (`cost`, usually 1).
2. **The input is checked.** Client IDs may only contain letters, numbers and `_ . : @ / -`, and the cost must be between 1 and 10,000. Anything else is rejected with `422` before the limiter does any work.
3. **The rule is looked up.** The API finds the rule for this client and endpoint, for example 20 requests per 60 seconds for `client_a /login`. Clients without a rule get the default of 100 per 60 seconds.
4. **The RL agent is asked for the current limit.** If adaptive limits are on, the Q-learning agent may have moved this client's limit up or down from the rule. This is a read from memory, with no network call.
5. **One atomic decision runs in Redis.** The API runs a single Lua script for the configured algorithm. Inside Redis, the script:
   - reads the client's state (tokens, bucket level, window count or timestamp log);
   - decides allow or block;
   - writes the new state back.

   Redis runs the whole script as one step, so two servers handling the same client at the same moment can never both spend the last unit of quota. The script uses the Redis clock, so servers with slightly different clocks still agree. This takes about 0.1 ms in Redis.
6. **The circuit breaker watches the Redis call.** If Redis keeps failing, the breaker opens and the API stops waiting on it. With `FAIL_MODE=open`, requests are allowed and marked `X-RateLimit-Degraded: true`. With `FAIL_MODE=closed`, they get `503`.
7. **The outcome is recorded.** Prometheus counters and the latency sample are updated for `/metrics` and the dashboard. The RL agent is told whether the request was allowed or blocked.
8. **The answer goes back.**
   - Allowed requests get `200`; blocked requests get `429 Too Many Requests`.
   - Both include the decision body and the headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `X-RateLimit-Algorithm`.
   - A blocked answer also includes `Retry-After`, the number of seconds to wait.
9. **Later, in the background.** Every 10 seconds the RL agent looks at each client's last window (requests per second, share blocked, and whether traffic is rising). It updates what it has learned and may raise, keep, or lower that client's limit by 10%. The next request from that client uses the new limit.

Claude is never part of this path. The AI analyst only runs when an admin asks for an analysis, so it adds no latency to any request.

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

The dashboard's **live algorithm race** sends identical traffic to all four algorithms through `/v1/sandbox/check`. With a limit of 10 per 10 s and 20 requests straddling a window boundary within ~1.4 s, the real limiter admits Fixed Window 20 (2.0×), Token Bucket 11, Leaky Bucket 11, and Sliding Window 10.

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
| POST | `/v1/check` | None | Rate-limit decision. 200 allowed, 429 blocked. |
| GET | `/health` | None | Liveness; `degraded` when Redis is unreachable |
| GET | `/metrics` | None | Prometheus text format |
| POST | `/v1/sandbox/check` | None | Decision with any algorithm and an ad-hoc limit in an isolated keyspace (powers the dashboard's algorithm race). Never touches real clients, rules, metrics or the RL agent, and is itself rate limited. |
| GET | `/v1/stats` | None | Live node snapshot for the dashboard: totals, decision-latency percentiles, busiest clients with rule and enforced limit |
| GET | `/v1/rl/diagnostics/{client_id}` | None | RL agent state and recent decisions for a client (`client` or `client/endpoint`) |
| GET | `/circuit-breaker-status` | None | Redis circuit breaker state |
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
x-ratelimit-algorithm: token_bucket
x-ratelimit-limit: 50
x-ratelimit-remaining: 0
x-ratelimit-reset: 12
retry-after: 12

{"allowed": false, "remaining": 0, "retry_after_ms": 11873, "limit": 50, "window": 60, "reset_at": 1792338000.1, "algorithm": "token_bucket"}
```

`limit` is the enforced limit, which the RL agent may have moved from the configured rule. If Redis is down and `FAIL_MODE=open`, requests are allowed with `X-RateLimit-Degraded: true`. With `FAIL_MODE=closed`, they get a 503.

## Configuration

| Variable | Default | |
|---|---|---|
| `REDIS_URL` | (not set) | Full Redis URL (takes precedence over `REDIS_HOST`/`REDIS_PORT`; set automatically on Railway) |
| `ALGORITHM` | `token_bucket` | `token_bucket` · `leaky_bucket` · `fixed_window` · `sliding_window` |
| `FAIL_MODE` | `open` | `open` allows on Redis failure, `closed` rejects |
| `ENABLE_RL` | `false` (`true` in the Docker image) | Q-learning adaptive limits |
| `RL_UPDATE_INTERVAL_SEC` | `10` | Seconds between RL observe/adjust cycles |
| `ADMIN_API_KEY` | (not set) | Required for `/v1/admin/*` (`openssl rand -hex 32`) |
| `CORS_ORIGINS` | (not set) | Comma-separated origins, e.g. the Vercel dashboard URL |
| `ANTHROPIC_API_KEY` | (not set) | Enables the AI analyst |
| `ANALYST_MODEL` | `claude-opus-5-5` | Claude model for analyses |
| `ANALYST_EFFORT` | `medium` | `low` · `medium` · `high` |
| `ANALYST_MAX_PER_HOUR` | `20` | Analysis quota |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (not set) | Enables OpenTelemetry tracing to any OTLP backend |

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
cd dashboard && npm install && npm run dev   # :5173, proxies /v1 to :8000
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
dashboard/             DRL Console: React + TypeScript live dashboard (Vercel), see dashboard/README.md
scripts/benchmark.py   Decision-latency benchmark
tests/                 Unit, API, integration, and load tests
```

## Known limitations

- Rules and RL state live in each node's memory. With several replicas, an admin or AI rule change applies only to the node that served it, and each node learns separately. The limiter counters themselves are shared in Redis. Moving rules and learned limits into Redis is the next step for multi-replica deployments.
- `/v1/stats` is public and read-only, so it shows client IDs and their counters to anyone with the URL. Put it behind the admin key if client IDs are sensitive in your deployment.

## License

MIT
