"""
Locust load testing script for the distributed rate limiter.
"""
from locust import HttpUser, task, between, events
import time
import statistics


class RateLimiterUser(HttpUser):
    """Simulates a client making requests to the rate limiter."""
    
    wait_time = between(0.01, 0.1)  # Wait 10-100ms between requests
    
    def on_start(self):
        """Called when a simulated user starts."""
        self.client_id = f"load_test_client_{self.client.get_connection_pool().connection_kwargs['timeout']}"
        self.request_count = 0
        self.allowed_count = 0
        self.blocked_count = 0
    
    @task
    def check_limit(self):
        """Make a check request."""
        payload = {
            "client_id": "client_a",
            "limit_key": "global",
            "cost": 1,
        }
        
        with self.client.post(
            "/v1/check",
            json=payload,
            catch_response=True,
            timeout=5,
        ) as response:
            self.request_count += 1
            
            if response.status_code == 200:
                data = response.json()
                if data.get("allowed"):
                    self.allowed_count += 1
                    response.success()
                else:
                    self.blocked_count += 1
                    response.success()  # Expected behavior
            else:
                response.failure(f"Status {response.status_code}")
    
    @task
    def check_endpoint_specific(self):
        """Test endpoint-specific limits."""
        payload = {
            "client_id": "client_a",
            "limit_key": "login",
            "cost": 1,
        }
        
        with self.client.post(
            "/v1/check",
            json=payload,
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Status {response.status_code}")
    
    @task
    def health_check(self):
        """Check service health."""
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Status {response.status_code}")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts."""
    print("=" * 80)
    print("DISTRIBUTED RATE LIMITER - LOAD TEST")
    print("=" * 80)
    print(f"Target: {environment.host}")
    print(f"Start time: {time.time()}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops."""
    print("\n" + "=" * 80)
    print("TEST RESULTS")
    print("=" * 80)
    
    for key, value in environment.stats.entries.items():
        print(f"\n{key[1]} {key[0]}")
        print(f"  Requests: {value.num_requests}")
        print(f"  Failures: {value.num_failures}")
        if value.response_times:
            print(f"  Response times (ms):")
            print(f"    Min: {min(value.response_times):.2f}")
            print(f"    Max: {max(value.response_times):.2f}")
            print(f"    Avg: {statistics.mean(value.response_times):.2f}")
            print(f"    P95: {statistics.quantiles(value.response_times, n=20)[18]:.2f}")
            print(f"    P99: {statistics.quantiles(value.response_times, n=100)[98]:.2f}")


if __name__ == "__main__":
    # Run with: locust -f tests/load_test.py --host=http://localhost:8000
    pass
