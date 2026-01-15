"""
Main FastAPI application for the distributed rate limiter.
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from prometheus_client import generate_latest
from typing import Dict, Any

from src.config import (
    REDIS_HOST,
    REDIS_PORT,
    REDIS_DB,
    SERVICE_NAME,
    LOG_LEVEL,
    FAIL_MODE,
    ALGORITHM,
    FailMode,
    RateLimitAlgorithm,
    DEFAULT_RATE_LIMIT_RULES,
)
from src.redis_client import get_redis_client, RedisClient
from src.algorithms import TokenBucketLimiter, FixedWindowLimiter, SlidingWindowLimiter
from src.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from src.correlation import CorrelationIDMiddleware, setup_logging_with_correlation
from src.tracing import init_tracing, instrument_app
from src.database import init_db
from src.metrics import (
    record_allowed,
    record_blocked,
    record_redis_error,
    check_latency,
    get_registry,
)
from src.models import (
    CheckLimitRequest,
    CheckLimitResponse,
    UpdateRuleRequest,
    RuleInfo,
    HealthResponse,
)

# Configure logging with correlation IDs
setup_logging_with_correlation()
logging.basicConfig(level=getattr(logging, LOG_LEVEL))
logger = logging.getLogger(__name__)

# Initialize tracing
init_tracing(service_name=SERVICE_NAME)

# Global rate limit rules storage
rate_limit_rules: Dict[str, Any] = DEFAULT_RATE_LIMIT_RULES.copy()

# Circuit breaker for Redis
redis_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    expected_exception=Exception,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context for startup and shutdown events."""
    # Startup
    try:
        redis_client = get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
        logger.info(f"[{SERVICE_NAME}] Service started. Redis connected.")
        
        # Initialize database
        init_db()
        logger.info(f"[{SERVICE_NAME}] Database initialized.")
    except Exception as e:
        logger.error(f"[{SERVICE_NAME}] Failed to initialize: {e}")
        if FAIL_MODE == FailMode.CLOSED:
            raise
    
    yield
    
    # Shutdown
    RedisClient.close()
    logger.info(f"[{SERVICE_NAME}] Service shutdown.")


# Create FastAPI app
app = FastAPI(
    title="Distributed Rate Limiter",
    description="Production-ready distributed rate limiting service with circuit breakers and tracing",
    version="0.2.0",
    lifespan=lifespan,
)

# Add middleware for correlation IDs
app.add_middleware(CorrelationIDMiddleware)

# Instrument app with OpenTelemetry
instrument_app(app)


def get_limiter():
    """Get appropriate rate limiter based on configuration."""
    try:
        def _get_limiter():
            redis_client = get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
            if ALGORITHM == RateLimitAlgorithm.TOKEN_BUCKET:
                return TokenBucketLimiter(redis_client)
            elif ALGORITHM == RateLimitAlgorithm.FIXED_WINDOW:
                return FixedWindowLimiter(redis_client)
            elif ALGORITHM == RateLimitAlgorithm.SLIDING_WINDOW:
                return SlidingWindowLimiter(redis_client)
            else:
                raise ValueError(f"Unknown algorithm: {ALGORITHM}")
        
        return redis_circuit_breaker.call(_get_limiter)
    except CircuitBreakerOpen as e:
        logger.error(f"Circuit breaker open: {e}")
        record_redis_error("circuit_breaker_open")
        if FAIL_MODE == FailMode.CLOSED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Rate limiter temporarily unavailable",
            )
        return None
    except Exception as e:
        logger.error(f"Error getting limiter: {e}")
        record_redis_error("get_limiter")
        if FAIL_MODE == FailMode.CLOSED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Rate limiter unavailable",
            )
        return None


def get_rate_limit_rule(client_id: str, limit_key: str = "global") -> Dict[str, int]:
    """Get rate limit rule for a client and endpoint."""
    # Check for endpoint-specific rule
    if client_id in rate_limit_rules:
        client_rules = rate_limit_rules[client_id]
        if "endpoints" in client_rules and limit_key in client_rules["endpoints"]:
            return client_rules["endpoints"][limit_key]
        # Return client-level rule
        return {
            "rate": client_rules.get("rate", rate_limit_rules["default"]["rate"]),
            "window": client_rules.get("window", rate_limit_rules["default"]["window"]),
        }
    # Return default rule
    return rate_limit_rules["default"]


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint with circuit breaker status."""
    try:
        redis_client = get_redis_client(REDIS_HOST, REDIS_PORT, REDIS_DB)
        redis_available = redis_client.ping()
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        redis_available = False
    
    return HealthResponse(
        status="healthy" if redis_available else "degraded",
        service=SERVICE_NAME,
        redis_available=redis_available,
    )


@app.post("/v1/check", response_model=CheckLimitResponse, tags=["Rate Limiting"])
async def check_limit(request: CheckLimitRequest):
    """
    Check if a request should be allowed based on rate limits.
    
    Returns:
    - allowed: true if request should be allowed
    - remaining: tokens/requests remaining in current window
    - retry_after_ms: milliseconds to wait before retrying (if blocked)
    - limit: configured rate limit
    - window: time window in seconds
    - reset_at: timestamp when limit resets
    """
    with check_latency.time():
        try:
            # Get rate limit rule
            rule = get_rate_limit_rule(request.client_id, request.limit_key)
            rate = rule["rate"]
            window = rule["window"]
            
            # Get limiter with circuit breaker protection
            limiter = get_limiter()
            if limiter is None:
                # Fail open: allow request if limiter unavailable
                logger.warning(f"Limiter unavailable, allowing request from {request.client_id}")
                return CheckLimitResponse(
                    allowed=True,
                    remaining=rate,
                    retry_after_ms=0,
                    limit=rate,
                    window=window,
                    reset_at=time.time() + window,
                )
            
            # Check limit
            allowed, remaining, retry_after_ms = limiter.check_limit(
                client_id=request.client_id,
                limit_key=request.limit_key,
                rate=rate,
                window=window,
                cost=request.cost,
            )
            
            # Record metrics
            if allowed:
                record_allowed(request.client_id, request.limit_key)
            else:
                record_blocked(request.client_id, request.limit_key)
            
            return CheckLimitResponse(
                allowed=allowed,
                remaining=remaining,
                retry_after_ms=retry_after_ms,
                limit=rate,
                window=window,
                reset_at=time.time() + window,
            )
            
        except CircuitBreakerOpen as e:
            logger.error(f"Circuit breaker open: {e}")
            record_redis_error("check_circuit_breaker_open")
            
            if FAIL_MODE == FailMode.CLOSED:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limiter temporarily unavailable",
                )
            else:
                # Fail open
                rule = get_rate_limit_rule(request.client_id, request.limit_key)
                return CheckLimitResponse(
                    allowed=True,
                    remaining=rule["rate"],
                    retry_after_ms=0,
                    limit=rule["rate"],
                    window=rule["window"],
                    reset_at=time.time() + rule["window"],
                )
        
        except Exception as e:
            logger.error(f"Error in check_limit: {e}")
            record_redis_error("check")
            
            if FAIL_MODE == FailMode.CLOSED:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limiter service error",
                )
            else:
                # Fail open - allow request
                rule = get_rate_limit_rule(request.client_id, request.limit_key)
                return CheckLimitResponse(
                    allowed=True,
                    remaining=rule["rate"],
                    retry_after_ms=0,
                    limit=rule["rate"],
                    window=rule["window"],
                    reset_at=time.time() + rule["window"],
                )


@app.post("/v1/admin/rules", response_model=RuleInfo, tags=["Admin"])
async def update_rule(request: UpdateRuleRequest):
    """
    Update rate limit rule for a client or endpoint (admin endpoint).
    """
    try:
        if request.endpoint:
            # Update endpoint-specific rule
            if request.client_id not in rate_limit_rules:
                rate_limit_rules[request.client_id] = {"endpoints": {}}
            if "endpoints" not in rate_limit_rules[request.client_id]:
                rate_limit_rules[request.client_id]["endpoints"] = {}
            
            rate_limit_rules[request.client_id]["endpoints"][request.endpoint] = {
                "rate": request.rate,
                "window": request.window,
            }
        else:
            # Update client-level rule
            rate_limit_rules[request.client_id] = {
                "rate": request.rate,
                "window": request.window,
            }
        
        logger.info(f"Updated rate limit rule: {request.client_id}")
        
        return RuleInfo(
            client_id=request.client_id,
            rate=request.rate,
            window=request.window,
            endpoint=request.endpoint,
        )
    except Exception as e:
        logger.error(f"Error updating rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update rule: {str(e)}",
        )


@app.get("/metrics", tags=["Metrics"])
async def metrics():
    """Prometheus metrics endpoint."""
    return JSONResponse(content=generate_latest(get_registry()).decode("utf-8"))


@app.get("/rules", tags=["Admin"])
async def get_rules():
    """Get current rate limit rules."""
    return rate_limit_rules


@app.get("/circuit-breaker-status", tags=["Diagnostics"])
async def circuit_breaker_status():
    """Get circuit breaker status."""
    return {
        "state": redis_circuit_breaker.get_state(),
        "failure_count": redis_circuit_breaker.failure_count,
        "time_until_retry_seconds": redis_circuit_breaker._time_until_retry(),
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level=LOG_LEVEL.lower(),
    )
