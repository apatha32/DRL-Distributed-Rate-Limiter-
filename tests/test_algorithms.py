"""
Unit tests for rate limiting algorithms.

Uses fakeredis with Lua support so the real Redis scripts are executed.
"""
import threading
import time

import fakeredis
import pytest

from src.algorithms import (
    TokenBucketLimiter,
    FixedWindowLimiter,
    SlidingWindowLimiter,
    LeakyBucketLimiter,
)

ALL_LIMITERS = [TokenBucketLimiter, FixedWindowLimiter, SlidingWindowLimiter, LeakyBucketLimiter]


@pytest.fixture
def redis():
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.mark.parametrize("limiter_cls", ALL_LIMITERS)
def test_first_request_allowed(redis, limiter_cls):
    limiter = limiter_cls(redis)
    allowed, remaining, retry_after = limiter.check_limit("client1", "global", rate=100, window=60)
    assert allowed is True
    assert remaining == 99
    assert retry_after == 0


@pytest.mark.parametrize("limiter_cls", ALL_LIMITERS)
def test_exhaustion_blocks_with_retry_after(redis, limiter_cls):
    limiter = limiter_cls(redis)
    for _ in range(100):
        allowed, _, _ = limiter.check_limit("client1", "global", rate=100, window=60)
        assert allowed is True

    allowed, remaining, retry_after = limiter.check_limit("client1", "global", rate=100, window=60)
    assert allowed is False
    assert remaining == 0
    assert retry_after > 0


@pytest.mark.parametrize("limiter_cls", ALL_LIMITERS)
def test_blocked_requests_do_not_consume_budget(redis, limiter_cls):
    limiter = limiter_cls(redis)
    for _ in range(10):
        limiter.check_limit("client1", "global", rate=10, window=60)
    for _ in range(50):
        allowed, remaining, _ = limiter.check_limit("client1", "global", rate=10, window=60)
        assert allowed is False
        assert remaining == 0


@pytest.mark.parametrize("limiter_cls", ALL_LIMITERS)
def test_clients_and_endpoints_isolated(redis, limiter_cls):
    limiter = limiter_cls(redis)
    for _ in range(50):
        limiter.check_limit("client1", "login", rate=100, window=60)

    assert limiter.check_limit("client2", "login", rate=100, window=60)[1] == 99
    assert limiter.check_limit("client1", "global", rate=100, window=60)[1] == 99


@pytest.mark.parametrize("limiter_cls", ALL_LIMITERS)
def test_cost_is_charged(redis, limiter_cls):
    limiter = limiter_cls(redis)
    allowed, remaining, _ = limiter.check_limit("client1", "global", rate=100, window=60, cost=10)
    assert allowed is True
    assert remaining == 90

    allowed, _, _ = limiter.check_limit("client1", "global", rate=100, window=60, cost=91)
    assert allowed is False


@pytest.mark.parametrize("limiter_cls", ALL_LIMITERS)
def test_concurrent_nodes_never_exceed_limit(limiter_cls):
    """
    Simulates many limiter nodes (separate client connections + script
    instances) sharing one Redis. Because each check is a single atomic
    script, exactly `rate` requests are admitted.
    """
    server = fakeredis.FakeServer()
    rate, attempts_per_node, nodes = 50, 40, 8
    admitted = []
    lock = threading.Lock()

    def node():
        limiter = limiter_cls(fakeredis.FakeRedis(server=server, decode_responses=True))
        for _ in range(attempts_per_node):
            if limiter.check_limit("shared", "global", rate=rate, window=60)[0]:
                with lock:
                    admitted.append(1)

    threads = [threading.Thread(target=node) for _ in range(nodes)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(admitted) == rate


@pytest.mark.parametrize("limiter_cls", [TokenBucketLimiter, LeakyBucketLimiter])
def test_bucket_recovers_over_time(redis, limiter_cls):
    limiter = limiter_cls(redis)
    # 10 per 1s => one unit every 100ms
    for _ in range(10):
        limiter.check_limit("client1", "global", rate=10, window=1)
    assert limiter.check_limit("client1", "global", rate=10, window=1)[0] is False

    time.sleep(0.25)
    assert limiter.check_limit("client1", "global", rate=10, window=1)[0] is True


def test_sliding_window_frees_capacity_as_entries_expire(redis):
    limiter = SlidingWindowLimiter(redis)
    for _ in range(5):
        limiter.check_limit("client1", "global", rate=5, window=1)
    allowed, _, retry_after = limiter.check_limit("client1", "global", rate=5, window=1)
    assert allowed is False
    assert 0 < retry_after <= 1000

    time.sleep(1.05)
    assert limiter.check_limit("client1", "global", rate=5, window=1)[0] is True


def test_token_bucket_honours_lowered_limit(redis):
    """The RL agent may lower a client's limit; the bucket must clamp to it."""
    limiter = TokenBucketLimiter(redis)
    limiter.check_limit("client1", "global", rate=100, window=60)
    allowed, remaining, _ = limiter.check_limit("client1", "global", rate=10, window=60)
    assert allowed is True
    assert remaining == 9


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
