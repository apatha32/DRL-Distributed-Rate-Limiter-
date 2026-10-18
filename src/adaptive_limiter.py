"""
Adaptive rate limiter that wraps existing algorithms with RL-driven limit adjustment.

Instead of fixed static limits from config, the RLAdaptiveLimiter asks the RL
agent for an adjusted limit for each client before delegating the actual
check to the underlying algorithm (token bucket, sliding window, etc.).

Usage:
    adaptive = RLAdaptiveLimiter(base_limiter=TokenBucketLimiter(redis))
    allowed, remaining, retry_ms = await adaptive.check_limit(
        client_id, limit_key, base_rate, window, cost
    )
"""

import logging
from typing import Tuple

from src.algorithms import RateLimitAlgorithmBase
from src.rl_agent import get_agent

logger = logging.getLogger(__name__)


def agent_key(client_id: str, limit_key: str) -> str:
    """RL state is learned per (client, endpoint) so endpoint rules stay independent."""
    return client_id if limit_key == "global" else f"{client_id}/{limit_key}"


class RLAdaptiveLimiter:
    """
    Decorator over any RateLimitAlgorithmBase that replaces the static `rate`
    with an RL-adjusted value computed by the Q-learning agent.

    The underlying algorithm still handles all the Redis mechanics; the RL
    agent only decides *what limit* to enforce. Reading the limit is O(1);
    learning happens off the request path in the agent's 10 s update loop.
    """

    def __init__(self, base_limiter: RateLimitAlgorithmBase) -> None:
        self._base = base_limiter
        self._agent = get_agent()

    def effective_limit(self, client_id: str, limit_key: str, rate: int) -> int:
        """The RL-adjusted limit currently enforced for this client/endpoint."""
        return self._agent.get_limit(agent_key(client_id, limit_key), base_limit=rate)

    async def check_limit(
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
        adjusted_rate = self.effective_limit(client_id, limit_key, rate)

        logger.debug(
            "[Adaptive] client=%s key=%s base_rate=%d adjusted_rate=%d",
            client_id, limit_key, rate, adjusted_rate,
        )

        allowed, remaining, retry_ms = await self._base.check_limit(
            client_id=client_id,
            limit_key=limit_key,
            rate=adjusted_rate,
            window=window,
            cost=cost,
        )

        # Feed outcome back to the RL agent so it can learn
        self._agent.observe(agent_key(client_id, limit_key), allowed)

        return allowed, remaining, retry_ms

    def get_agent_diagnostics(self, client_id: str) -> dict:
        """Return RL diagnostics for a specific client (for the API/dashboard)."""
        return self._agent.get_diagnostics(client_id)
