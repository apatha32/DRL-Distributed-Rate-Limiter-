"""
Database models for persistent rate limit rules.
"""
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ratelimiter.db")

engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_pre_ping=True,  # Verify connections before using
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class RateLimitRule(Base):
    """Rate limit rule configuration."""
    
    __tablename__ = "rate_limit_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True, nullable=False)
    endpoint = Column(String, nullable=True)  # None for global, endpoint name for specific
    rate = Column(Integer, nullable=False)  # Requests per window
    window = Column(Integer, nullable=False)  # Time window in seconds
    enabled = Column(Boolean, default=True)
    metadata = Column(JSON, default=dict)  # Additional data
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"RateLimitRule(client_id={self.client_id}, endpoint={self.endpoint}, rate={self.rate})"


class RateLimitMetric(Base):
    """Historical metrics for analysis and debugging."""
    
    __tablename__ = "rate_limit_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True, nullable=False)
    endpoint = Column(String, nullable=True)
    allowed_count = Column(Integer, default=0)
    blocked_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    avg_latency_ms = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
