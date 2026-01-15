"""
Configuration and constants for the distributed rate limiter.
"""
import os
from enum import Enum


class RateLimitAlgorithm(Enum):
    TOKEN_BUCKET = "token_bucket"
    FIXED_WINDOW = "fixed_window"
    SLIDING_WINDOW = "sliding_window"


class FailMode(Enum):
    OPEN = "open"  # Allow on Redis failure
    CLOSED = "closed"  # Block on Redis failure


# Rate limiting rules (hardcoded for MVP)
DEFAULT_RATE_LIMIT_RULES = {
    "default": {
        "rate": 100,  # requests per minute
        "window": 60,  # seconds
    },
    "client_a": {
        "rate": 100,
        "window": 60,
        "endpoints": {
            "login": {"rate": 20, "window": 60},
            "register": {"rate": 10, "window": 60},
        }
    },
    "client_b": {
        "rate": 50,
        "window": 60,
    }
}

# Configuration from environment
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
FAIL_MODE = FailMode(os.getenv("FAIL_MODE", "open").lower())
ALGORITHM = RateLimitAlgorithm(os.getenv("ALGORITHM", "token_bucket").lower())
SERVICE_NAME = os.getenv("SERVICE_NAME", "limiter")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Feature flags
ENABLE_METRICS = os.getenv("ENABLE_METRICS", "true").lower() == "true"
METRICS_PORT = int(os.getenv("METRICS_PORT", 8001))
