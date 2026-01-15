"""
Request and response models for the rate limiter API.
"""
from pydantic import BaseModel, Field
from typing import Optional


class CheckLimitRequest(BaseModel):
    """Request to check if a request should be allowed."""
    
    client_id: str = Field(..., description="Unique client identifier")
    limit_key: str = Field(default="global", description="Optional endpoint/resource name")
    cost: int = Field(default=1, ge=1, description="Token cost for this request")


class CheckLimitResponse(BaseModel):
    """Response from rate limit check."""
    
    allowed: bool = Field(..., description="Whether the request is allowed")
    remaining: int = Field(..., description="Remaining tokens/requests")
    retry_after_ms: int = Field(
        default=0,
        description="Milliseconds to wait before retrying (if blocked)"
    )
    limit: int = Field(..., description="Rate limit")
    window: int = Field(..., description="Time window in seconds")
    reset_at: float = Field(..., description="Timestamp when limit resets")


class UpdateRuleRequest(BaseModel):
    """Request to update a rate limit rule."""
    
    client_id: str = Field(..., description="Client identifier")
    rate: int = Field(..., ge=1, description="Requests per window")
    window: int = Field(..., ge=1, description="Window size in seconds")
    endpoint: Optional[str] = Field(default=None, description="Specific endpoint (optional)")


class RuleInfo(BaseModel):
    """Information about a rate limit rule."""
    
    client_id: str
    rate: int
    window: int
    endpoint: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    
    status: str
    service: str
    redis_available: bool
