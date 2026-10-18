"""
Latency benchmark: time a single rate-limit decision (one atomic Lua script
via EVALSHA) for each algorithm against a real Redis.

Usage:
    docker run -d -p 6379:6379 redis:7-alpine
    python scripts/benchmark.py --host localhost --port 6379 -n 20000
"""
import argparse
import os
import statistics
import sys
import time

import redis

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src.algorithms import (  # noqa: E402
    TokenBucketLimiter,
    FixedWindowLimiter,
    SlidingWindowLimiter,
    LeakyBucketLimiter,
)

LIMITERS = [TokenBucketLimiter, FixedWindowLimiter, SlidingWindowLimiter, LeakyBucketLimiter]


def percentile(sorted_vals, pct):
    return sorted_vals[min(len(sorted_vals) - 1, int(len(sorted_vals) * pct / 100))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=6379)
    parser.add_argument("-n", type=int, default=20000, help="checks per algorithm")
    args = parser.parse_args()

    r = redis.Redis(host=args.host, port=args.port, decode_responses=True)
    r.ping()

    print(f"{'algorithm':<16}{'p50 ms':>9}{'p95 ms':>9}{'p99 ms':>9}{'mean ms':>9}")
    for cls in LIMITERS:
        limiter = cls(r)
        # Warm up: load the script and the connection
        for _ in range(200):
            limiter.check_limit("bench-warmup", "global", rate=1_000_000, window=60)

        samples = []
        for i in range(args.n):
            client = f"bench-{i % 100}"   # 100 clients, mix of allowed/blocked
            t0 = time.perf_counter()
            limiter.check_limit(client, "global", rate=150, window=60)
            samples.append((time.perf_counter() - t0) * 1000)

        samples.sort()
        print(
            f"{cls.__name__.replace('Limiter', ''):<16}"
            f"{percentile(samples, 50):>9.3f}{percentile(samples, 95):>9.3f}"
            f"{percentile(samples, 99):>9.3f}{statistics.mean(samples):>9.3f}"
        )
        r.delete(*r.keys(f"ratelimit:{cls.KEY_PREFIX}:bench-*"))


if __name__ == "__main__":
    main()
