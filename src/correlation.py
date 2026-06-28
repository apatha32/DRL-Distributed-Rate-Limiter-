"""
Middleware and utilities for request tracking and correlation.
"""
import logging
import uuid
from contextvars import ContextVar
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Context variable for correlation ID
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")

logger = logging.getLogger(__name__)


class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add correlation IDs to requests.
    
    Each request gets a unique ID that's propagated through logs and traces.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and add correlation ID.
        
        Args:
            request: HTTP request
            call_next: Next middleware/handler
            
        Returns:
            HTTP response with correlation ID header
        """
        # Get or generate correlation ID
        correlation_id = request.headers.get(
            "X-Correlation-ID",
            str(uuid.uuid4()),
        )
        
        # Store in context variable for access in handlers
        correlation_id_var.set(correlation_id)
        
        # Process request
        response = await call_next(request)
        
        # Add correlation ID to response headers
        response.headers["X-Correlation-ID"] = correlation_id
        
        return response


def get_correlation_id() -> str:
    """Get current request correlation ID."""
    return correlation_id_var.get()


class CorrelationIDFilter(logging.Filter):
    """Logging filter to include correlation ID in log records."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Add correlation ID to log record."""
        record.correlation_id = get_correlation_id()
        return True


def setup_logging_with_correlation():
    """Configure logging to include correlation IDs."""
    # Get root logger
    root_logger = logging.getLogger()
    
    # Add correlation ID filter
    correlation_filter = CorrelationIDFilter()
    root_logger.addFilter(correlation_filter)
    
    # Update formatter to include correlation ID
    for handler in root_logger.handlers:
        formatter = logging.Formatter(
            "[%(correlation_id)s] %(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
