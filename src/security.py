"""
API-key authentication for admin endpoints.
"""
import hmac

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from src.config import ADMIN_API_KEY

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_admin(api_key: str = Security(_api_key_header)) -> None:
    """Allow the request only with the configured admin key (constant-time compare)."""
    if not ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API disabled: set ADMIN_API_KEY",
        )
    if not api_key or not hmac.compare_digest(api_key, ADMIN_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
