"""
Main FastAPI application for the distributed rate limiter.
"""
import asyncio
import copy
import logging
import math
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import ValidationError

from src.config import (
    REDIS_HOST,
    REDIS_PORT,
    REDIS_DB,
    SERVICE_NAME,
    LOG_LEVEL,
    FAIL_MODE,
    ALGORITHM,
    ENABLE_RL,
    ADMIN_API_KEY,
    CORS_ORIGINS,
    ANALYST_MODEL,
    ANALYST_MAX_PER_HOUR,
    FailMode,
    RateLimitAlgorithm,
    DEFAULT_RATE_LIMIT_RULES,
)
from src.redis_client import get_redis_client, RedisClient
from src.algorithms import (
    TokenBucketLimiter,
    FixedWindowLimiter,
    SlidingWindowLimiter,
    LeakyBucketLimiter,
)
from src.adaptive_limiter import RLAdaptiveLimiter, agent_key
from src.analyst import AnalysisStore, AnalystError, TrafficAnalyst, build_snapshot
from src.rl_agent import get_agent, UPDATE_INTERVAL as RL_UPDATE_INTERVAL
from src.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from src.correlation import CorrelationIDMiddleware, setup_logging_with_correlation
from src.security import require_admin
from src.tracing import init_tracing, instrument_app
from src.database import init_db
from src.metrics import (
    record_allowed,
    record_blocked,
    record_redis_error,
    check_latency,
    client_totals,
    get_registry,
    latency_percentiles_ms,
    record_decision_latency,
)
from src.models import (
    AnalysisRecord,
    AnalystStatus,
    CheckLimitRequest,
    CheckLimitResponse,
    UpdateRuleRequest,
    RuleInfo,
    HealthResponse,
    RLDiagnosticsResponse,
    SandboxCheckRequest,
    StatsResponse,
)

# Configure logging with correlation IDs
setup_logging_with_correlation()
logging.basicConfig(level=getattr(logging, LOG_LEVEL))
logger = logging.getLogger(__name__)

# Initialize tracing
init_tracing(service_name=SERVICE_NAME)

# Rate limit rules (per process)
rate_limit_rules: Dict[str, Any] = copy.deepcopy(DEFAULT_RATE_LIMIT_RULES)

# Circuit breaker for Redis
redis_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    expected_exception=Exception,
)

analyst = TrafficAnalyst()
STARTED_AT = time.time()
STATS_MAX_CLIENTS = 50


async def rl_update_loop():
    """Step the RL agent every RL_UPDATE_INTERVAL seconds for all active clients."""
    agent = get_agent()
    while True:
        await asyncio.sleep(RL_UPDATE_INTERVAL)
        try:
            stepped = agent.step_all()
            if stepped:
                logger.debug(f"[RL] update cycle adjusted {stepped} client(s)")
        except Exception as e:
            logger.error(f"[RL] update cycle failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context for startup and shutdown events."""
    try:
        await get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
        logger.info(f"[{SERVICE_NAME}] Service started. Redis connected.")
    except Exception as e:
        logger.error(f"[{SERVICE_NAME}] Redis unavailable at startup: {e}")
        if FAIL_MODE == FailMode.CLOSED:
            raise
    try:
        init_db()
    except Exception as e:
        logger.warning(f"[{SERVICE_NAME}] Database init failed: {e}")
    if not ADMIN_API_KEY:
        logger.warning("ADMIN_API_KEY not set: admin endpoints are disabled")

    rl_task = asyncio.create_task(rl_update_loop()) if ENABLE_RL else None

    yield

    if rl_task:
        rl_task.cancel()
    # Drop objects bound to the Redis client we are about to close
    global _limiter, _analysis_quota
    _limiter = _analysis_quota = None
    _sandbox_limiters.clear()
    await RedisClient.close()
    logger.info(f"[{SERVICE_NAME}] Service shutdown.")


app = FastAPI(
    title="Distributed Rate Limiter",
    description=(
        "Distributed rate limiting with four atomic Redis algorithms, Q-learning adaptive "
        "limits, and a Claude-powered traffic analyst. Admin endpoints require `X-API-Key`."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(CorrelationIDMiddleware)
if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key", "X-Correlation-ID"],
        expose_headers=[
            "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-RateLimit-Algorithm",
            "Retry-After", "X-Correlation-ID",
        ],
    )
instrument_app(app)


_ALGORITHMS = {
    RateLimitAlgorithm.TOKEN_BUCKET: TokenBucketLimiter,
    RateLimitAlgorithm.FIXED_WINDOW: FixedWindowLimiter,
    RateLimitAlgorithm.SLIDING_WINDOW: SlidingWindowLimiter,
    RateLimitAlgorithm.LEAKY_BUCKET: LeakyBucketLimiter,
}
_limiter = None
_analysis_quota: Optional[TokenBucketLimiter] = None
_sandbox_limiters: Dict[str, Any] = {}
SANDBOX_MAX_PER_MIN = 3000  # across all sandbox sessions on this node
# Internal limiter keys start with "#", which client IDs can't contain (models.ID_PATTERN),
# so no API caller can share or exhaust them.
INTERNAL = "#"


async def get_limiter():
    """Get the configured rate limiter (built once per process)."""
    global _limiter
    if _limiter is None:
        redis_client = await get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
        base = _ALGORITHMS[ALGORITHM](redis_client)
        _limiter = RLAdaptiveLimiter(base) if ENABLE_RL else base
    return _limiter


def get_rate_limit_rule(client_id: str, limit_key: str = "global") -> Dict[str, int]:
    """Get rate limit rule for a client and endpoint."""
    if client_id in rate_limit_rules:
        client_rules = rate_limit_rules[client_id]
        if "endpoints" in client_rules and limit_key in client_rules["endpoints"]:
            return client_rules["endpoints"][limit_key]
        return {
            "rate": client_rules.get("rate", rate_limit_rules["default"]["rate"]),
            "window": client_rules.get("window", rate_limit_rules["default"]["window"]),
        }
    return rate_limit_rules["default"]


def apply_rule(rule: UpdateRuleRequest) -> RuleInfo:
    """Store a rule and restart RL learning for that client/endpoint from the new limit."""
    client_rules = rate_limit_rules.setdefault(rule.client_id, {})
    if rule.endpoint:
        client_rules.setdefault("endpoints", {})[rule.endpoint] = {
            "rate": rule.rate,
            "window": rule.window,
        }
    else:
        client_rules.update(rate=rule.rate, window=rule.window)

    if ENABLE_RL:
        get_agent().set_base_limit(agent_key(rule.client_id, rule.endpoint or "global"), rule.rate)

    logger.info(f"Updated rate limit rule: {rule.client_id} {rule.endpoint or ''} "
                f"{rule.rate}/{rule.window}s")
    return RuleInfo(**rule.model_dump())


def _rate_limit_headers(limit: int, remaining: int, retry_after_ms: int, window: int,
                        algorithm: str = ALGORITHM.value) -> Dict[str, str]:
    headers = {
        "X-RateLimit-Algorithm": algorithm,
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Reset": str(math.ceil(retry_after_ms / 1000) if retry_after_ms else window),
    }
    if retry_after_ms:
        headers["Retry-After"] = str(max(1, math.ceil(retry_after_ms / 1000)))
    return headers


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Liveness check; reports `degraded` when Redis is unreachable."""
    try:
        redis_client = await get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
        redis_available = bool(await redis_client.ping())
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        redis_available = False

    return HealthResponse(
        status="healthy" if redis_available else "degraded",
        service=SERVICE_NAME,
        redis_available=redis_available,
    )


@app.post(
    "/v1/check",
    response_model=CheckLimitResponse,
    tags=["Rate Limiting"],
    responses={429: {"model": CheckLimitResponse, "description": "Rate limit exceeded"}},
)
async def check_limit(request: CheckLimitRequest, response: Response):
    """
    Decide whether a request should be allowed.

    Returns 200 when allowed and 429 when blocked; both carry the decision body plus
    `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers, and
    blocked responses add `Retry-After`. `limit` is the enforced limit, which the RL agent
    may have adjusted from the configured rule.
    """
    rule = get_rate_limit_rule(request.client_id, request.limit_key)
    rate, window = rule["rate"], rule["window"]

    async def decide():
        limiter = await get_limiter()
        limit = limiter.effective_limit(request.client_id, request.limit_key, rate)
        allowed, remaining, retry_after_ms = await limiter.check_limit(
            client_id=request.client_id,
            limit_key=request.limit_key,
            rate=rate,
            window=window,
            cost=request.cost,
        )
        return limit, allowed, remaining, retry_after_ms

    with check_latency.time():
        try:
            started = time.perf_counter()
            limit, allowed, remaining, retry_after_ms = await redis_circuit_breaker.call_async(decide)
            record_decision_latency(time.perf_counter() - started)
        except Exception as e:
            reason = "circuit_breaker_open" if isinstance(e, CircuitBreakerOpen) else "check"
            logger.error(f"Rate limit check failed ({reason}): {e}")
            record_redis_error(reason)
            if FAIL_MODE == FailMode.CLOSED:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limiter temporarily unavailable",
                )
            # Fail open: allow the request and say so
            response.headers["X-RateLimit-Degraded"] = "true"
            return CheckLimitResponse(
                allowed=True,
                remaining=rate,
                retry_after_ms=0,
                limit=rate,
                window=window,
                reset_at=time.time() + window,
                algorithm=ALGORITHM.value,
            )

    if allowed:
        record_allowed(request.client_id, request.limit_key)
    else:
        record_blocked(request.client_id, request.limit_key)

    headers = _rate_limit_headers(limit, remaining, retry_after_ms, window)
    body = CheckLimitResponse(
        allowed=allowed,
        remaining=remaining,
        retry_after_ms=retry_after_ms,
        limit=limit,
        window=window,
        reset_at=time.time() + int(headers["X-RateLimit-Reset"]),
        algorithm=ALGORITHM.value,
    )
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content=body.model_dump(),
            headers=headers,
        )
    response.headers.update(headers)
    return body


@app.post(
    "/v1/sandbox/check",
    response_model=CheckLimitResponse,
    tags=["Sandbox"],
    responses={429: {"model": CheckLimitResponse, "description": "Rate limit exceeded"}},
)
async def sandbox_check(request: SandboxCheckRequest):
    """
    Run one decision with any algorithm and an ad-hoc limit, in an isolated keyspace
    (`sandbox:<session_id>`). Used by the dashboard to compare algorithms side by side.
    Never touches real clients, rules, metrics, or the RL agent, so it can't be used to
    get extra quota. Sandbox traffic as a whole is itself rate limited.
    """
    try:
        return await _sandbox_decide(request)
    except HTTPException:
        raise
    except Exception as e:
        # The sandbox only exists to show real Redis decisions, so it never fails open
        logger.error(f"Sandbox check failed: {e}")
        record_redis_error("sandbox")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sandbox unavailable: the limiter cannot reach Redis",
        )


async def _sandbox_decide(request: SandboxCheckRequest):
    redis_client = await get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
    if "_quota" not in _sandbox_limiters:
        _sandbox_limiters["_quota"] = TokenBucketLimiter(redis_client)
    within_quota, _, quota_retry_ms = await _sandbox_limiters["_quota"].check_limit(
        f"{INTERNAL}sandbox", "all", rate=SANDBOX_MAX_PER_MIN, window=60
    )
    if not within_quota:
        raise HTTPException(
            status_code=429,
            detail="Sandbox is busy; try again shortly",
            headers={"Retry-After": str(max(1, math.ceil(quota_retry_ms / 1000)))},
        )

    algorithm = RateLimitAlgorithm(request.algorithm)
    if algorithm.value not in _sandbox_limiters:
        _sandbox_limiters[algorithm.value] = _ALGORITHMS[algorithm](redis_client)
    allowed, remaining, retry_after_ms = await _sandbox_limiters[algorithm.value].check_limit(
        client_id=f"{INTERNAL}sandbox:{request.session_id}",
        limit_key="race",
        rate=request.rate,
        window=request.window,
        cost=request.cost,
    )
    headers = _rate_limit_headers(request.rate, remaining, retry_after_ms, request.window, algorithm.value)
    body = CheckLimitResponse(
        allowed=allowed,
        remaining=remaining,
        retry_after_ms=retry_after_ms,
        limit=request.rate,
        window=request.window,
        reset_at=time.time() + int(headers["X-RateLimit-Reset"]),
        algorithm=algorithm.value,
    )
    return JSONResponse(status_code=200 if allowed else 429, content=body.model_dump(), headers=headers)


@app.get("/metrics", tags=["Metrics"])
async def metrics():
    """Prometheus metrics endpoint (text exposition format)."""
    return Response(content=generate_latest(get_registry()), media_type=CONTENT_TYPE_LATEST)


@app.get("/v1/rl/diagnostics/{client_id:path}", response_model=RLDiagnosticsResponse, tags=["RL"])
async def rl_diagnostics(client_id: str):
    """
    Return RL agent diagnostics for a specific client.
    Only populated when ENABLE_RL=true.
    """
    if not ENABLE_RL:
        return RLDiagnosticsResponse(client_id=client_id, rl_enabled=False)

    agent = get_agent()
    diag = agent.get_diagnostics(client_id)
    return RLDiagnosticsResponse(
        client_id=client_id,
        rl_enabled=True,
        recent_decisions=agent.get_history(client_id) if diag else None,
        **diag,
    )


@app.get("/v1/stats", response_model=StatsResponse, tags=["Diagnostics"])
async def stats():
    """
    Live, read-only snapshot of this node for the dashboard: totals, server-side
    decision latency percentiles, and the busiest clients with their rule and the
    limit currently enforced (RL-adjusted when enabled). Counters are per node and
    reset on restart.
    """
    totals = client_totals()
    agent = get_agent() if ENABLE_RL else None
    clients = []
    for (client_id, endpoint), counts in totals.items():
        rule = get_rate_limit_rule(client_id, endpoint)
        tracked = agent.peek(agent_key(client_id, endpoint)) if agent else None
        clients.append({
            "client_id": client_id,
            "endpoint": endpoint,
            "allowed": counts["allowed"],
            "blocked": counts["blocked"],
            "rule_rate": rule["rate"],
            "rule_window": rule["window"],
            "effective_limit": tracked["limit"] if tracked else rule["rate"],
            "rl_epsilon": tracked["epsilon"] if tracked else None,
        })
    clients.sort(key=lambda c: c["allowed"] + c["blocked"], reverse=True)

    return StatsResponse(
        generated_at=time.time(),
        uptime_sec=round(time.time() - STARTED_AT, 1),
        node=SERVICE_NAME,
        algorithm=ALGORITHM.value,
        rl_enabled=ENABLE_RL,
        rl_update_interval_sec=RL_UPDATE_INTERVAL,
        fail_mode=FAIL_MODE.value,
        circuit_breaker=redis_circuit_breaker.get_state(),
        totals={
            "allowed": sum(c["allowed"] for c in clients),
            "blocked": sum(c["blocked"] for c in clients),
        },
        latency_ms=latency_percentiles_ms(),
        clients=clients[:STATS_MAX_CLIENTS],
        clients_total=len(clients),
    )


@app.get("/circuit-breaker-status", tags=["Diagnostics"])
async def circuit_breaker_status():
    """Get circuit breaker status."""
    return {
        "state": redis_circuit_breaker.get_state(),
        "failure_count": redis_circuit_breaker.failure_count,
        "time_until_retry_seconds": redis_circuit_breaker._time_until_retry(),
    }


# ----- Admin (X-API-Key) -----------------------------------------------------

admin = Depends(require_admin)


@app.get("/v1/admin/rules", tags=["Admin"], dependencies=[admin])
async def get_rules():
    """Get current rate limit rules."""
    return rate_limit_rules


@app.post("/v1/admin/rules", response_model=RuleInfo, tags=["Admin"], dependencies=[admin])
async def update_rule(request: UpdateRuleRequest):
    """Create or update a client-level or endpoint-specific rule."""
    return apply_rule(request)


def _current_snapshot() -> Dict[str, Any]:
    return build_snapshot(
        rules=rate_limit_rules,
        totals=client_totals(),
        agent_state=get_agent().snapshot() if ENABLE_RL else {},
        service={
            "node": SERVICE_NAME,
            "algorithm": ALGORITHM.value,
            "rl_enabled": ENABLE_RL,
            "rl_update_interval_sec": RL_UPDATE_INTERVAL,
            "fail_mode": FAIL_MODE.value,
            "circuit_breaker": redis_circuit_breaker.get_state(),
        },
    )


async def _analysis_store() -> AnalysisStore:
    return AnalysisStore(await get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB))


@app.get("/v1/admin/ai/status", response_model=AnalystStatus, tags=["AI Analyst"],
         dependencies=[admin])
async def analyst_status(include_snapshot: bool = False):
    """Whether the analyst is configured; optionally preview the data Claude would see."""
    return AnalystStatus(
        enabled=analyst.enabled,
        model=ANALYST_MODEL if analyst.enabled else None,
        snapshot_preview=_current_snapshot() if include_snapshot else None,
    )


@app.post("/v1/admin/ai/analyses", response_model=AnalysisRecord, status_code=201,
          tags=["AI Analyst"], dependencies=[admin])
async def create_analysis():
    """
    Ask Claude to analyze current traffic. Returns a summary, flagged clients, and
    proposed rule changes; nothing changes until a recommendation is applied.
    Limited to ANALYST_MAX_PER_HOUR runs (enforced with this service's own token bucket).
    """
    global _analysis_quota
    if not analyst.enabled:
        raise HTTPException(status_code=503, detail="AI analyst disabled: set ANTHROPIC_API_KEY")

    redis_client = await get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
    _analysis_quota = _analysis_quota or TokenBucketLimiter(redis_client)
    allowed, _, retry_after_ms = await _analysis_quota.check_limit(
        f"{INTERNAL}admin", "ai_analysis", rate=ANALYST_MAX_PER_HOUR, window=3600
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Analysis quota reached",
            headers={"Retry-After": str(max(1, math.ceil(retry_after_ms / 1000)))},
        )

    try:
        result = await analyst.analyze(_current_snapshot())
    except AnalystError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return await (await _analysis_store()).save(result)


@app.get("/v1/admin/ai/analyses/{analysis_id}", response_model=AnalysisRecord,
         tags=["AI Analyst"], dependencies=[admin])
async def get_analysis(analysis_id: str):
    record = await (await _analysis_store()).get(analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found or expired")
    return record


@app.post("/v1/admin/ai/analyses/{analysis_id}/recommendations/{index}/apply",
          response_model=RuleInfo, tags=["AI Analyst"], dependencies=[admin])
async def apply_recommendation(analysis_id: str, index: int):
    """Apply one of Claude's proposed rule changes (human-in-the-loop approval)."""
    store = await _analysis_store()
    record = await store.get(analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found or expired")
    recommendations = record["analysis"]["recommendations"]
    if not 0 <= index < len(recommendations):
        raise HTTPException(status_code=404, detail="Recommendation not found")
    if record["applied"][index]:
        raise HTTPException(status_code=409, detail="Recommendation already applied")

    rec = recommendations[index]
    try:
        # Same validation as a manual rule change: model output is untrusted input
        rule = UpdateRuleRequest(
            client_id=rec["client_id"],
            endpoint=rec["endpoint"],
            rate=rec["rate"],
            window=rec["window"],
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Recommendation failed validation: {e}")

    info = apply_rule(rule)
    await store.mark_applied(record, index)
    return info


if __name__ == "__main__":
    import uvicorn

    # Local runs listen on localhost only; containers set HOST (the Dockerfile runs uvicorn directly)
    uvicorn.run(
        app,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        log_level=LOG_LEVEL.lower(),
    )
