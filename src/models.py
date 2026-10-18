"""
Request and response models for the rate limiter API.
"""
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from src.analyst import TrafficAnalysis

ID_PATTERN = r"^[A-Za-z0-9_.:@/-]+$"


class CheckLimitRequest(BaseModel):
    """Request to check if a request should be allowed."""
    
    client_id: str = Field(..., min_length=1, max_length=128, pattern=ID_PATTERN,
                           description="Unique client identifier")
    limit_key: str = Field(default="global", min_length=1, max_length=128, pattern=ID_PATTERN,
                           description="Optional endpoint/resource name")
    cost: int = Field(default=1, ge=1, le=10_000, description="Token cost for this request")


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
    
    client_id: str = Field(..., min_length=1, max_length=128, pattern=ID_PATTERN,
                           description="Client identifier")
    rate: int = Field(..., ge=1, le=1_000_000, description="Requests per window")
    window: int = Field(..., ge=1, le=86_400, description="Window size in seconds")
    endpoint: Optional[str] = Field(default=None, max_length=128, pattern=ID_PATTERN,
                                    description="Specific endpoint (optional)")


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


class RLDiagnosticsResponse(BaseModel):
    """RL agent diagnostics for a single client."""

    client_id: str
    rl_enabled: bool
    current_limit: Optional[int] = None
    epsilon: Optional[float] = None
    rps: Optional[float] = None
    block_ratio: Optional[float] = None
    rps_delta: Optional[float] = None
    total_requests_window: Optional[int] = None


class AnalysisRecord(BaseModel):
    """A stored AI traffic analysis."""

    id: str
    created_at: float
    model: str
    usage: Dict[str, int]
    analysis: TrafficAnalysis
    applied: List[bool] = Field(description="Whether each recommendation has been applied")


class AnalystStatus(BaseModel):
    enabled: bool
    model: Optional[str] = None
    snapshot_preview: Optional[Dict[str, Any]] = None
