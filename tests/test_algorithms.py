"""
Unit tests for rate limiting algorithms.
"""
import pytest
import time
from unittest.mock import Mock, patch
from src.algorithms import TokenBucketLimiter, FixedWindowLimiter
from src.redis_client import get_redis_client


class MockRedis:
    """Mock Redis client for testing."""
    
    def __init__(self):
        self.data = {}
        self.expirations = {}
    
    def get(self, key):
        if key in self.data and time.time() < self.expirations.get(key, float('inf')):
            return self.data[key]
        return None
    
    def set(self, key, value, ex=None):
        self.data[key] = str(value)
        if ex:
            self.expirations[key] = time.time() + ex
    
    def incr(self, key):
        if key in self.data:
            self.data[key] = str(int(self.data[key]) + 1)
        else:
            self.data[key] = "1"
        return int(self.data[key])
    
    def expire(self, key, seconds):
        self.expirations[key] = time.time() + seconds
        return True
    
    def pipeline(self):
        return MockPipeline(self)
    
    def ping(self):
        return True


class MockPipeline:
    """Mock Redis pipeline."""
    
    def __init__(self, redis):
        self.redis = redis
        self.commands = []
    
    def set(self, key, value, ex=None):
        self.commands.append(('set', key, value, ex))
        return self
    
    def expire(self, key, seconds):
        self.commands.append(('expire', key, seconds))
        return self
    
    def incr(self, key):
        self.commands.append(('incr', key))
        return self
    
    def execute(self):
        results = []
        for cmd in self.commands:
            if cmd[0] == 'set':
                self.redis.set(cmd[1], cmd[2], ex=cmd[3])
                results.append(True)
            elif cmd[0] == 'expire':
                self.redis.expire(cmd[1], cmd[2])
                results.append(True)
            elif cmd[0] == 'incr':
                results.append(self.redis.incr(cmd[1]))
        return results


def test_token_bucket_first_request():
    """Test token bucket allows first request."""
    redis = MockRedis()
    limiter = TokenBucketLimiter(redis)
    
    allowed, remaining, retry_after = limiter.check_limit(
        "client1", "global", rate=100, window=60, cost=1
    )
    
    assert allowed is True
    assert remaining == 99  # 100 - 1
    assert retry_after == 0


def test_token_bucket_burst():
    """Test token bucket allows burst."""
    redis = MockRedis()
    limiter = TokenBucketLimiter(redis)
    
    # Use up 50 tokens
    for i in range(50):
        allowed, remaining, _ = limiter.check_limit(
            "client1", "global", rate=100, window=60, cost=1
        )
        assert allowed is True
    
    # Should have 50 left
    assert remaining == 50


def test_token_bucket_exhaustion():
    """Test token bucket exhaustion."""
    redis = MockRedis()
    limiter = TokenBucketLimiter(redis)
    
    # Use up all tokens
    for i in range(100):
        allowed, remaining, _ = limiter.check_limit(
            "client1", "global", rate=100, window=60, cost=1
        )
    
    # Next request should be blocked
    allowed, remaining, retry_after = limiter.check_limit(
        "client1", "global", rate=100, window=60, cost=1
    )
    
    assert allowed is False
    assert remaining == 0
    assert retry_after > 0


def test_fixed_window_basic():
    """Test fixed window basic functionality."""
    redis = MockRedis()
    limiter = FixedWindowLimiter(redis)
    
    # Make 50 requests
    for i in range(50):
        allowed, remaining, _ = limiter.check_limit(
            "client1", "global", rate=100, window=60, cost=1
        )
        assert allowed is True
    
    # 51st should be allowed (limit is 100)
    allowed, _, _ = limiter.check_limit(
        "client1", "global", rate=100, window=60, cost=1
    )
    assert allowed is True


def test_different_clients_isolated():
    """Test that different clients have isolated limits."""
    redis = MockRedis()
    limiter = TokenBucketLimiter(redis)
    
    # Client 1 uses 50 tokens
    for i in range(50):
        limiter.check_limit("client1", "global", rate=100, window=60, cost=1)
    
    # Client 2 should still have full bucket
    allowed, remaining, _ = limiter.check_limit(
        "client2", "global", rate=100, window=60, cost=1
    )
    
    assert allowed is True
    assert remaining == 99


def test_different_endpoints_isolated():
    """Test that different endpoints have isolated limits."""
    redis = MockRedis()
    limiter = TokenBucketLimiter(redis)
    
    # Use 50 tokens on "login" endpoint
    for i in range(50):
        limiter.check_limit("client1", "login", rate=100, window=60, cost=1)
    
    # "global" endpoint should still have full bucket
    allowed, remaining, _ = limiter.check_limit(
        "client1", "global", rate=100, window=60, cost=1
    )
    
    assert allowed is True
    assert remaining == 99


def test_high_cost_request():
    """Test requests with high cost."""
    redis = MockRedis()
    limiter = TokenBucketLimiter(redis)
    
    # Request with cost=10
    allowed, remaining, _ = limiter.check_limit(
        "client1", "global", rate=100, window=60, cost=10
    )
    
    assert allowed is True
    assert remaining == 90


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
