---
title: DRL - Distributed Rate Limiter
colorFrom: blue
colorTo: cyan
sdk: docker
app_port: 7860
pinned: true
license: mit
short_description: Production-grade distributed rate limiter with Q-learning adaptive limits
---

# DRL - Distributed Rate Limiter

Production-grade distributed rate limiting microservice with adaptive Q-learning AI, circuit breaker resilience, and full observability.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/check` | Check if a request is allowed |
| GET | `/health` | Health status |
| GET | `/v1/rl/diagnostics/{client_id}` | RL agent diagnostics |
| GET | `/rules` | Current rate limit rules |
| GET | `/metrics` | Prometheus metrics |

## Quick Test

```bash
curl -X POST https://ambarish0221-drl-demo.hf.space/v1/check \
  -H "Content-Type: application/json" \
  -d '{"client_id": "demo", "limit_key": "api", "cost": 1}'
```

## Source Code

[GitHub Repository](https://github.com/apatha32/DRL-Distributed-Rate-Limiter-)
