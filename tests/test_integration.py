"""
Integration tests against real Redis and PostgreSQL.

Uses the services configured by REDIS_HOST / REDIS_PORT / DATABASE_URL (in CI,
the workflow's service containers). These are read when src.main is imported,
so set them in the environment before running pytest.
"""
import pytest
from fastapi.testclient import TestClient

from src.main import app


class TestRateLimiterIntegration:
    """Integration tests with real Redis and PostgreSQL."""

    @pytest.fixture
    def client(self):
        with TestClient(app) as client:
            yield client

    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]
        assert "redis_available" in data
    
    def test_rate_limit_allow(self, client):
        """Test allowing request within limit."""
        payload = {
            "client_id": "test_client",
            "limit_key": "global",
            "cost": 1,
        }
        response = client.post("/v1/check", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is True
        assert data["remaining"] == 99  # 100 - 1
        # A real decision, not a fail-open fallback
        assert "X-RateLimit-Degraded" not in response.headers
        assert response.headers["X-RateLimit-Limit"] == "100"
    
    def test_rate_limit_block(self, client):
        """Test blocking request exceeding limit."""
        # Use up all tokens
        payload = {
            "client_id": "test_block",
            "limit_key": "global",
            "cost": 100,
        }
        
        # First request uses all 100 tokens
        response = client.post("/v1/check", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is True
        assert data["remaining"] == 0
        
        # Second request should be blocked
        response = client.post("/v1/check", json=payload)
        assert response.status_code == 429
        assert int(response.headers["Retry-After"]) >= 1
        data = response.json()
        assert data["allowed"] is False
    
    def test_correlation_id_header(self, client):
        """Test correlation ID is added to response."""
        payload = {
            "client_id": "test_client",
            "limit_key": "global",
        }
        
        response = client.post(
            "/v1/check",
            json=payload,
            headers={"X-Correlation-ID": "test-id-123"},
        )
        
        assert response.status_code == 200
        assert response.headers.get("X-Correlation-ID") == "test-id-123"
    
    def test_different_clients_isolated(self, client):
        """Test rate limits isolated per client."""
        # Client A uses tokens
        for _ in range(50):
            response = client.post(
                "/v1/check",
                json={
                    "client_id": "client_a_iso",
                    "limit_key": "global",
                    "cost": 1,
                }
            )
            assert response.status_code == 200
        
        # Client B should have full bucket
        response = client.post(
            "/v1/check",
            json={
                "client_id": "client_b_iso",
                "limit_key": "global",
                "cost": 1,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["remaining"] == 99
    
    def test_endpoint_specific_limits(self, client):
        """Test endpoint-specific rate limits."""
        # Global limit is 100, /login is 20
        
        # Use up 20 tokens on /login
        for _ in range(20):
            response = client.post(
                "/v1/check",
                json={
                    "client_id": "client_a",
                    "limit_key": "login",
                    "cost": 1,
                }
            )
            assert response.status_code == 200
            assert response.json()["allowed"] is True
        
        # 21st request to /login should be blocked
        response = client.post(
            "/v1/check",
            json={
                "client_id": "client_a",
                "limit_key": "login",
                "cost": 1,
            }
        )
        assert response.status_code == 429
        assert response.json()["allowed"] is False
    
    def test_high_cost_request(self, client):
        """Test requests with high cost."""
        payload = {
            "client_id": "test_cost",
            "limit_key": "global",
            "cost": 50,
        }
        
        # First request with cost 50
        response = client.post("/v1/check", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is True
        assert data["remaining"] == 50  # 100 - 50
        
        # Second request with cost 50
        response = client.post("/v1/check", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["allowed"] is True
        assert data["remaining"] == 0  # 50 - 50
        
        # Third request should be blocked
        response = client.post("/v1/check", json=payload)
        assert response.status_code == 429
        data = response.json()
        assert data["allowed"] is False
    
    def test_metrics_endpoint(self, client):
        """Test metrics endpoint."""
        # Make some requests
        for _ in range(5):
            client.post(
                "/v1/check",
                json={
                    "client_id": "metrics_test",
                    "limit_key": "global",
                }
            )
        
        # Check metrics
        response = client.get("/metrics")
        assert response.status_code == 200
        assert b"ratelimiter_allowed_total" in response.content
        assert b"ratelimiter_blocked_total" in response.content


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
