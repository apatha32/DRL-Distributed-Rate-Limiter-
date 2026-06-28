"""
Rate limiting algorithms implementations.
"""
import logging
import time
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any
from redis import Redis

logger = logging.getLogger(__name__)


class RateLimitAlgorithmBase(ABC):
    """Base class for rate limiting algorithms."""
    
    def __init__(self, redis_client: Redis):
        self.redis = redis_client
    
    @abstractmethod
    def check_limit(
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
    """Token bucket rate limiting algorithm."""
    
    def check_limit(
        self,
        client_id: str,
        limit_key: str,
        rate: int,
        window: int,
        cost: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Token bucket algorithm:
        - Each client has a bucket with max 'rate' tokens
        - Tokens refill continuously based on time elapsed
        - Each request consumes 'cost' tokens
        """
        bucket_key = f"ratelimit:token_bucket:{client_id}:{limit_key}"
        last_refill_key = f"ratelimit:token_bucket:{client_id}:{limit_key}:last_refill"
        
        try:
            now = time.time()
            pipe = self.redis.pipeline()
            
            # Get current state
            current_tokens = self.redis.get(bucket_key)
            last_refill = self.redis.get(last_refill_key)
            
            if current_tokens is None:
                # First request from this client
                current_tokens = float(rate)
                last_refill = now
            else:
                current_tokens = float(current_tokens)
                last_refill = float(last_refill)
                
                # Calculate tokens to add based on time elapsed
                time_elapsed = now - last_refill
                refill_rate = rate / window  # tokens per second
                tokens_to_add = time_elapsed * refill_rate
                current_tokens = min(current_tokens + tokens_to_add, float(rate))
            
            # Check if we have enough tokens
            if current_tokens >= cost:
                # Consume tokens
                remaining = int(current_tokens - cost)
                retry_after_ms = 0
                allowed = True
            else:
                # Not enough tokens
                remaining = int(current_tokens)
                # Calculate how long until next token
                tokens_needed = cost - current_tokens
                retry_after_ms = int((tokens_needed / (rate / window)) * 1000)
                allowed = False
            
            # Update Redis atomically
            pipe.set(bucket_key, remaining, ex=window * 2)
            pipe.set(last_refill_key, now, ex=window * 2)
            pipe.execute()
            
            return allowed, remaining, retry_after_ms
            
        except Exception as e:
            logger.error(f"Error in token bucket check: {e}")
            raise


class FixedWindowLimiter(RateLimitAlgorithmBase):
    """Fixed window rate limiting algorithm."""
    
    def check_limit(
        self,
        client_id: str,
        limit_key: str,
        rate: int,
        window: int,
        cost: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Fixed window algorithm:
        - Count requests in fixed time windows
        - Reset counter at window boundary
        - Prone to boundary spike problem (mentioned in docs)
        """
        now = time.time()
        window_start = int(now / window) * window
        window_key = f"ratelimit:fixed_window:{client_id}:{limit_key}:{window_start}"
        
        try:
            pipe = self.redis.pipeline()
            
            # Increment counter
            pipe.incr(window_key)
            # Set expiration (window duration)
            pipe.expire(window_key, window + 1)
            results = pipe.execute()
            
            current_count = results[0]
            remaining = max(0, rate - current_count)
            
            if current_count <= rate:
                allowed = True
                retry_after_ms = 0
            else:
                allowed = False
                # Approximate retry time until next window
                time_until_next_window = window - (now % window)
                retry_after_ms = int(time_until_next_window * 1000)
            
            return allowed, remaining, retry_after_ms
            
        except Exception as e:
            logger.error(f"Error in fixed window check: {e}")
            raise


class SlidingWindowLimiter(RateLimitAlgorithmBase):
    """
    Sliding window rate limiting algorithm.
    
    Combines accuracy of sliding window with simplicity of fixed window.
    Uses a sorted set in Redis to track request timestamps within the window.
    """
    
    def check_limit(
        self,
        client_id: str,
        limit_key: str,
        rate: int,
        window: int,
        cost: int = 1,
    ) -> Tuple[bool, int, int]:
        """
        Sliding window algorithm:
        - Tracks exact timestamps of requests in Redis sorted set
        - Removes old timestamps outside the window
        - Counts requests in the sliding window
        - More accurate than fixed window, prevents boundary spikes
        """
        now = time.time()
        window_start = now - window
        sorted_set_key = f"ratelimit:sliding_window:{client_id}:{limit_key}"
        
        try:
            pipe = self.redis.pipeline()
            
            # Remove old timestamps outside window (older than window_start)
            pipe.zremrangebyscore(sorted_set_key, "-inf", window_start)
            
            # Count current requests in window
            pipe.zcount(sorted_set_key, window_start, now)
            
            # Add current request timestamp (can have duplicates for same millisecond)
            for _ in range(cost):
                pipe.zadd(sorted_set_key, {f"{now}:{time.time_ns()}": now})
            
            # Set expiration to window + 1 second
            pipe.expire(sorted_set_key, window + 1)
            
            results = pipe.execute()
            
            # results: [removed_count, current_count, add_result1, add_result2, ..., expire_result]
            current_count = results[1]
            
            remaining = max(0, rate - current_count - cost)
            
            if current_count + cost <= rate:
                allowed = True
                retry_after_ms = 0
            else:
                allowed = False
                # Get oldest request in window to calculate retry time
                oldest_request = self.redis.zrange(sorted_set_key, 0, 0, withscores=True)
                if oldest_request:
                    oldest_timestamp = oldest_request[0][1]
                    retry_after = (oldest_timestamp + window) - now
                    retry_after_ms = max(0, int(retry_after * 1000))
                else:
                    retry_after_ms = int((window / rate) * 1000)
            
            return allowed, remaining, retry_after_ms
            
        except Exception as e:
            logger.error(f"Error in sliding window check: {e}")
            raise
