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

# RL adaptive rate limiting
ENABLE_RL = os.getenv("ENABLE_RL", "false").lower() == "true"
RL_MODEL_PATH = os.getenv("RL_MODEL_PATH", "")          # path to persist Q-tables
RL_LEARNING_RATE = float(os.getenv("RL_LEARNING_RATE", "0.1"))
RL_DISCOUNT_FACTOR = float(os.getenv("RL_DISCOUNT_FACTOR", "0.9"))
RL_EPSILON_START = float(os.getenv("RL_EPSILON_START", "1.0"))
RL_EPSILON_MIN = float(os.getenv("RL_EPSILON_MIN", "0.05"))
RL_EPSILON_DECAY = float(os.getenv("RL_EPSILON_DECAY", "0.995"))
RL_LIMIT_STEP_PCT = float(os.getenv("RL_LIMIT_STEP_PCT", "0.10"))
RL_UPDATE_INTERVAL_SEC = int(os.getenv("RL_UPDATE_INTERVAL_SEC", "10"))
