"""
Redis client and connection management.
"""
import logging
import os
import redis
from typing import Optional

logger = logging.getLogger(__name__)

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"


class RedisClient:
    """Thread-safe Redis client wrapper."""
    
    _instance: Optional[redis.Redis] = None
    
    @classmethod
    def get_instance(cls, host: str = "localhost", port: int = 6379, db: int = 0) -> redis.Redis:
        """Get or create Redis client instance."""
        if cls._instance is None:
            if DEMO_MODE:
                try:
                    import fakeredis
                    cls._instance = fakeredis.FakeRedis(decode_responses=True)
                    logger.info("Running in DEMO_MODE: using fakeredis (in-process)")
                    return cls._instance
                except ImportError:
                    logger.warning("fakeredis not installed, falling back to real Redis")
            options = dict(
                socket_connect_timeout=5,
                socket_keepalive=True,
                health_check_interval=10,
                decode_responses=True,
            )
            try:
                # Managed hosts (e.g. Railway) provide a single REDIS_URL with credentials
                redis_url = os.getenv("REDIS_URL")
                if redis_url:
                    cls._instance = redis.Redis.from_url(redis_url, **options)
                else:
                    cls._instance = redis.Redis(host=host, port=port, db=db, **options)
                # Test connection
                cls._instance.ping()
                logger.info("Connected to Redis at %s", "REDIS_URL" if redis_url else f"{host}:{port}")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                raise
        return cls._instance
    
    @classmethod
    def close(cls):
        """Close Redis connection."""
        if cls._instance:
            cls._instance.close()
            cls._instance = None
            logger.info("Redis connection closed")


def get_redis_client(host: str = "localhost", port: int = 6379, db: int = 0) -> redis.Redis:
    """Get Redis client."""
    return RedisClient.get_instance(host, port, db)
