"""
Redis client and connection management (asyncio).
"""
import logging
import os
from typing import Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"


class RedisClient:
    """Process-wide async Redis client (one connection pool per process)."""

    _instance: Optional[redis.Redis] = None

    @classmethod
    async def get_instance(cls, host: str = "localhost", port: int = 6379, db: int = 0) -> redis.Redis:
        """Get or create the Redis client, verifying the connection on first use."""
        if cls._instance is None:
            if DEMO_MODE:
                try:
                    import fakeredis
                    cls._instance = fakeredis.FakeAsyncRedis(decode_responses=True)
                    logger.info("Running in DEMO_MODE: using fakeredis (in-process)")
                    return cls._instance
                except ImportError:
                    logger.warning("fakeredis not installed, falling back to real Redis")
            options = dict(
                socket_connect_timeout=5,
                socket_timeout=2,
                socket_keepalive=True,
                health_check_interval=10,
                decode_responses=True,
            )
            # Managed hosts (e.g. Railway) provide a single REDIS_URL with credentials
            redis_url = os.getenv("REDIS_URL")
            if redis_url:
                client = redis.Redis.from_url(redis_url, **options)
            else:
                client = redis.Redis(host=host, port=port, db=db, **options)
            try:
                await client.ping()
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                await client.aclose()
                raise
            cls._instance = client
            logger.info("Connected to Redis at %s", "REDIS_URL" if redis_url else f"{host}:{port}")
        return cls._instance

    @classmethod
    async def close(cls):
        """Close Redis connection."""
        if cls._instance:
            await cls._instance.aclose()
            cls._instance = None
            logger.info("Redis connection closed")


async def get_redis_client(host: str = "localhost", port: int = 6379, db: int = 0) -> redis.Redis:
    """Get Redis client."""
    return await RedisClient.get_instance(host, port, db)
