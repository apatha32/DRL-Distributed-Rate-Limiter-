"""
Adaptive rate limiter that wraps existing algorithms with RL-driven limit adjustment.

Instead of fixed static limits from config, the RLAdaptiveLimiter asks the RL
agent for an adjusted limit for each client before delegating the actual
check to the underlying algorithm (token bucket, sliding window, etc.).

Usage:
    adaptive = RLAdaptiveLimiter(base_limiter=TokenBucketLimiter(redis))
    allowed, remaining, retry_ms = adaptive.check_limit(
        client_id, limit_key, base_rate, window, cost
    )
"""

import logging
from typing import Tuple

from src.algorithms import RateLimitAlgorithmBase
from src.rl_agent import get_agent

logger = logging.getLogger(__name__)


class RLAdaptiveLimiter:
    """
    Decorator over any RateLimitAlgorithmBase that replaces the static `rate`
    with an RL-adjusted value computed by the Q-learning agent.

    The underlying algorithm still handles all the Redis mechanics; the RL
    agent only decides *what limit* to enforce.
    """

    def __init__(self, base_limiter: RateLimitAlgorithmBase) -> None:
        self._base = base_limiter
        self._agent = get_agent()

    def check_limit(
        self,
        client_id: str,
        limit_key: str,
        rate: int,
        window: int,
        cost: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Check rate limit using RL-adjusted limit.

        Args:
            client_id:  Unique client identifier.
            limit_key:  Endpoint / resource key.
            rate:       Configured (base) rate limit (requests per window).
            window:     Window size in seconds.
            cost:       Token cost of this request.

        Returns:
            (allowed, remaining, retry_after_ms)
        """
        # Ask the RL agent for an adjusted limit (may differ from base `rate`)
        adjusted_rate = self._agent.get_limit(client_id, base_limit=rate)

        logger.debug(
            "[Adaptive] client=%s base_rate=%d adjusted_rate=%d",
            client_id, rate, adjusted_rate,
        )

        # Delegate the actual check to the wrapped algorithm
        allowed, remaining, retry_ms = self._base.check_limit(
            client_id=client_id,
            limit_key=limit_key,
            rate=adjusted_rate,
            window=window,
            cost=cost,
        )

        # Feed outcome back to the RL agent so it can learn
        self._agent.observe(client_id, allowed)

        return allowed, remaining, retry_ms

    def get_agent_diagnostics(self, client_id: str) -> dict:
        """Return RL diagnostics for a specific client (for the API/dashboard)."""
        return self._agent.get_diagnostics(client_id)
