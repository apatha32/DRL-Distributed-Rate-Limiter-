"""
Redis client and connection management.
"""
import logging
import redis
from typing import Optional

logger = logging.getLogger(__name__)


class RedisClient:
    """Thread-safe Redis client wrapper."""
    
    _instance: Optional[redis.Redis] = None
    
    @classmethod
    def get_instance(cls, host: str = "localhost", port: int = 6379, db: int = 0) -> redis.Redis:
        """Get or create Redis client instance."""
        if cls._instance is None:
            try:
                cls._instance = redis.Redis(
                    host=host,
                    port=port,
                    db=db,
                    socket_connect_timeout=5,
                    socket_keepalive=True,
                    health_check_interval=10,
                    decode_responses=True,
                )
                # Test connection
                cls._instance.ping()
                logger.info(f"Connected to Redis at {host}:{port}")
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
