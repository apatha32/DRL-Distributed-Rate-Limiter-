"""
Rate limiting algorithms implementations.

Every algorithm runs as a single Redis Lua script, so the read-decide-write
cycle for a client is atomic: concurrent requests hitting different limiter
nodes are serialized by Redis and can never both spend the same budget.
Scripts read the clock with Redis TIME rather than each node's local clock,
so clock skew between nodes does not affect decisions. Each check is one
network round trip (EVALSHA) on an asyncio Redis client.

All scripts return {allowed (0/1), remaining, retry_after_ms}.
"""
import logging
import uuid
from abc import ABC, abstractmethod
from typing import Tuple
from redis.asyncio import Redis

logger = logging.getLogger(__name__)


# Shared prelude: current Redis server time in milliseconds.
_NOW_MS = """
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
"""

TOKEN_BUCKET_LUA = _NOW_MS + """
local capacity  = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local cost      = tonumber(ARGV[3])
local refill_per_ms = capacity / window_ms

local state  = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts     = tonumber(state[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

-- Refill for elapsed time, capped at capacity (also handles a lowered limit)
tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill_per_ms)

local allowed, retry = 0, 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil((cost - tokens) / refill_per_ms)
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], window_ms * 2)
return {allowed, math.floor(tokens), retry}
"""

LEAKY_BUCKET_LUA = _NOW_MS + """
local capacity  = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local cost      = tonumber(ARGV[3])
local leak_per_ms = capacity / window_ms

local state = redis.call('HMGET', KEYS[1], 'level', 'ts')
local level = tonumber(state[1]) or 0
local ts    = tonumber(state[2]) or now

-- Drain the bucket at a constant rate for the elapsed time
level = math.max(0, level - math.max(0, now - ts) * leak_per_ms)

local allowed, retry = 0, 0
if level + cost <= capacity then
  level = level + cost
  allowed = 1
else
  retry = math.ceil((level + cost - capacity) / leak_per_ms)
end

redis.call('HSET', KEYS[1], 'level', level, 'ts', now)
redis.call('PEXPIRE', KEYS[1], window_ms * 2)
return {allowed, math.floor(capacity - level), retry}
"""

FIXED_WINDOW_LUA = _NOW_MS + """
local rate      = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local cost      = tonumber(ARGV[3])
local win_start = now - (now % window_ms)

local state = redis.call('HMGET', KEYS[1], 'start', 'count')
local count = 0
if tonumber(state[1]) == win_start then
  count = tonumber(state[2])
end

local allowed, retry = 0, 0
if count + cost <= rate then
  count = count + cost
  allowed = 1
  redis.call('HSET', KEYS[1], 'start', win_start, 'count', count)
  redis.call('PEXPIRE', KEYS[1], window_ms)
else
  retry = win_start + window_ms - now
end
return {allowed, rate - count, retry}
"""

SLIDING_WINDOW_LUA = _NOW_MS + """
local rate      = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local cost      = tonumber(ARGV[3])
local nonce     = ARGV[4]

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window_ms)
local count = redis.call('ZCARD', KEYS[1])

local allowed, retry = 0, 0
if count + cost <= rate then
  for i = 1, cost do
    redis.call('ZADD', KEYS[1], now, nonce .. ':' .. i)
  end
  count = count + cost
  allowed = 1
  redis.call('PEXPIRE', KEYS[1], window_ms)
elseif cost > rate then
  retry = window_ms
else
  -- Wait until enough of the oldest entries slide out of the window
  local idx = count + cost - rate - 1
  local entry = redis.call('ZRANGE', KEYS[1], idx, idx, 'WITHSCORES')
  retry = math.max(0, tonumber(entry[2]) + window_ms - now)
end
return {allowed, rate - count, retry}
"""


class RateLimitAlgorithmBase(ABC):
    """Base class for rate limiting algorithms."""

    LUA: str = ""
    KEY_PREFIX: str = ""

    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        # register_script hashes locally and invokes via EVALSHA, loading the
        # script into Redis on first use (or after a Redis restart).
        self._script = redis_client.register_script(self.LUA)

    def _key(self, client_id: str, limit_key: str) -> str:
        return f"ratelimit:{self.KEY_PREFIX}:{client_id}:{limit_key}"

    async def _run(self, key: str, *args) -> Tuple[bool, int, int]:
        try:
            allowed, remaining, retry_after_ms = await self._script(keys=[key], args=list(args))
        except Exception as e:
            logger.error(f"Error in {self.KEY_PREFIX} check: {e}")
            raise
        return bool(allowed), max(0, int(remaining)), int(retry_after_ms)

    def effective_limit(self, client_id: str, limit_key: str, rate: int) -> int:
        """The limit that check_limit will enforce for this client (static here)."""
        return rate

    @abstractmethod
    async def check_limit(
        self,
        client_id: str,
        limit_key: str,
        rate: int,
        window: int,
        cost: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Check if request should be allowed.

        Returns:
            (allowed, remaining, retry_after_ms)
        """
        pass


class TokenBucketLimiter(RateLimitAlgorithmBase):
    """
    Token bucket: a bucket of `rate` tokens refills continuously at
    rate/window tokens per second; each request spends `cost` tokens.
    Allows bursts up to the bucket size.
    """

    LUA = TOKEN_BUCKET_LUA
    KEY_PREFIX = "token_bucket"

    async def check_limit(self, client_id, limit_key, rate, window, cost=1):
        return await self._run(self._key(client_id, limit_key), rate, window * 1000, cost)


class LeakyBucketLimiter(RateLimitAlgorithmBase):
    """
    Leaky bucket (as a meter): each request adds `cost` units of water to a
    bucket of size `rate` that drains at a constant rate/window per second.
    Requests that would overflow the bucket are rejected, enforcing a smooth
    outflow rate.
    """

    LUA = LEAKY_BUCKET_LUA
    KEY_PREFIX = "leaky_bucket"

    async def check_limit(self, client_id, limit_key, rate, window, cost=1):
        return await self._run(self._key(client_id, limit_key), rate, window * 1000, cost)


class FixedWindowLimiter(RateLimitAlgorithmBase):
    """
    Fixed window: counts request cost in aligned windows of `window` seconds
    and resets at each boundary. Cheapest, but allows up to 2x `rate` across
    a window boundary.
    """

    LUA = FIXED_WINDOW_LUA
    KEY_PREFIX = "fixed_window"

    async def check_limit(self, client_id, limit_key, rate, window, cost=1):
        return await self._run(self._key(client_id, limit_key), rate, window * 1000, cost)


class SlidingWindowLimiter(RateLimitAlgorithmBase):
    """
    Sliding window log: keeps a sorted set of request timestamps and counts
    those within the last `window` seconds. Exact, with no boundary spikes.
    Only allowed requests are logged, so rejected traffic does not consume budget.
    """

    LUA = SLIDING_WINDOW_LUA
    KEY_PREFIX = "sliding_window"

    async def check_limit(self, client_id, limit_key, rate, window, cost=1):
        return await self._run(
            self._key(client_id, limit_key), rate, window * 1000, cost, uuid.uuid4().hex
        )
