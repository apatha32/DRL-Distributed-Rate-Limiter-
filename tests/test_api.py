"""
API tests against the real FastAPI app with an in-process (fakeredis) Redis.
"""
import fakeredis
import pytest
from fastapi.testclient import TestClient

from src import main, security
from src.redis_client import RedisClient
from tests.test_analyst import ANALYSIS, StubClaude
from src.analyst import TrafficAnalyst

ADMIN = {"X-API-Key": "test-admin-key"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(RedisClient, "_instance", fakeredis.FakeAsyncRedis(decode_responses=True))
    monkeypatch.setattr(security, "ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setattr(main, "_limiter", None)
    monkeypatch.setattr(main, "_analysis_quota", None)
    monkeypatch.setattr(main, "rate_limit_rules", {
        "default": {"rate": 100, "window": 60},
        "tight": {"rate": 3, "window": 60},
    })
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["redis_available"] is True


def test_allowed_request_has_rate_limit_headers(client):
    r = client.post("/v1/check", json={"client_id": "tight"})
    assert r.status_code == 200
    assert r.json()["allowed"] is True
    assert r.headers["X-RateLimit-Limit"] == "3"
    assert r.headers["X-RateLimit-Remaining"] == "2"
    assert "Retry-After" not in r.headers


def test_blocked_request_returns_429_with_retry_after(client):
    for _ in range(3):
        client.post("/v1/check", json={"client_id": "tight"})
    r = client.post("/v1/check", json={"client_id": "tight"})
    assert r.status_code == 429
    assert r.json()["allowed"] is False
    assert int(r.headers["Retry-After"]) >= 1
    assert r.headers["X-RateLimit-Remaining"] == "0"


@pytest.mark.parametrize("payload", [
    {"client_id": ""},
    {"client_id": "bad id with spaces"},
    {"client_id": "x" * 200},
    {"client_id": "ok", "cost": 0},
])
def test_invalid_check_requests_rejected(client, payload):
    assert client.post("/v1/check", json=payload).status_code == 422


def test_metrics_are_prometheus_text(client):
    client.post("/v1/check", json={"client_id": "metrics-client"})
    r = client.get("/metrics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert 'ratelimiter_allowed_total{client_id="metrics-client",endpoint="global"} 1.0' in r.text


@pytest.mark.parametrize("path,method", [
    ("/v1/admin/rules", "get"),
    ("/v1/admin/rules", "post"),
    ("/v1/admin/ai/status", "get"),
    ("/v1/admin/ai/analyses", "post"),
])
def test_admin_endpoints_require_api_key(client, path, method):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers={"X-API-Key": "wrong"}).status_code == 401


def test_admin_disabled_when_no_key_configured(client, monkeypatch):
    monkeypatch.setattr(security, "ADMIN_API_KEY", "")
    assert client.get("/v1/admin/rules", headers=ADMIN).status_code == 503


def test_update_rule_keeps_existing_endpoint_rules(client):
    client.post("/v1/admin/rules", headers=ADMIN,
                json={"client_id": "c", "endpoint": "login", "rate": 5, "window": 60})
    client.post("/v1/admin/rules", headers=ADMIN,
                json={"client_id": "c", "rate": 50, "window": 60})
    rules = client.get("/v1/admin/rules", headers=ADMIN).json()
    assert rules["c"] == {"endpoints": {"login": {"rate": 5, "window": 60}}, "rate": 50, "window": 60}


def test_analysis_disabled_without_anthropic_key(client, monkeypatch):
    monkeypatch.setattr(main, "analyst", TrafficAnalyst(client=None))
    r = client.post("/v1/admin/ai/analyses", headers=ADMIN)
    assert r.status_code == 503


def test_analyze_then_apply_recommendation(client, monkeypatch):
    stub = StubClaude()
    monkeypatch.setattr(main, "analyst", TrafficAnalyst(client=stub))
    client.post("/v1/check", json={"client_id": "client_x", "limit_key": "login"})

    r = client.post("/v1/admin/ai/analyses", headers=ADMIN)
    assert r.status_code == 201
    record = r.json()
    assert record["analysis"]["status"] == "watch"
    assert record["applied"] == [False]
    assert '"client_id":"client_x"' in stub.calls[0]["messages"][0]["content"]

    assert client.get(f"/v1/admin/ai/analyses/{record['id']}", headers=ADMIN).status_code == 200

    apply_url = f"/v1/admin/ai/analyses/{record['id']}/recommendations/0/apply"
    r = client.post(apply_url, headers=ADMIN)
    assert r.status_code == 200
    assert r.json() == {"client_id": "client_x", "endpoint": "login", "rate": 5, "window": 60}
    assert main.rate_limit_rules["client_x"]["endpoints"]["login"] == {"rate": 5, "window": 60}

    assert client.post(apply_url, headers=ADMIN).status_code == 409
    assert client.post(f"/v1/admin/ai/analyses/{record['id']}/recommendations/7/apply",
                       headers=ADMIN).status_code == 404


def test_invalid_recommendation_is_not_applied(client, monkeypatch):
    bad = ANALYSIS.model_copy(update={"recommendations": [
        ANALYSIS.recommendations[0].model_copy(update={"rate": -5})
    ]})
    monkeypatch.setattr(main, "analyst", TrafficAnalyst(client=StubClaude(parsed_output=bad)))
    record = client.post("/v1/admin/ai/analyses", headers=ADMIN).json()
    r = client.post(f"/v1/admin/ai/analyses/{record['id']}/recommendations/0/apply", headers=ADMIN)
    assert r.status_code == 422
    assert "client_x" not in main.rate_limit_rules


def test_analysis_quota_is_enforced(client, monkeypatch):
    monkeypatch.setattr(main, "ANALYST_MAX_PER_HOUR", 2)
    monkeypatch.setattr(main, "analyst", TrafficAnalyst(client=StubClaude()))
    codes = [client.post("/v1/admin/ai/analyses", headers=ADMIN).status_code for _ in range(3)]
    assert codes == [201, 201, 429]


def test_stats_reports_live_totals_latency_and_clients(client, monkeypatch):
    monkeypatch.setattr(main, "ENABLE_RL", True)

    def tight_counts():
        clients = client.get("/v1/stats").json()["clients"]
        row = next((c for c in clients if c["client_id"] == "tight"), None)
        return (row["allowed"], row["blocked"]) if row else (0, 0)

    before = tight_counts()   # Prometheus counters are process-wide
    for _ in range(5):
        client.post("/v1/check", json={"client_id": "tight"})

    r = client.get("/v1/stats")
    assert r.status_code == 200
    body = r.json()
    (tight,) = [c for c in body["clients"] if c["client_id"] == "tight"]
    assert (tight["allowed"] - before[0], tight["blocked"] - before[1]) == (3, 2)
    assert tight["rule_rate"] == 3 and tight["effective_limit"] == 3
    assert tight["rl_epsilon"] is not None
    assert body["totals"]["allowed"] >= 3
    assert body["latency_ms"]["samples"] >= 5 and body["latency_ms"]["p50"] > 0
    assert body["algorithm"] == "token_bucket"


def test_rl_diagnostics_include_recent_decisions(client, monkeypatch):
    monkeypatch.setattr(main, "ENABLE_RL", True)
    client.post("/v1/check", json={"client_id": "diag-client"})
    body = client.get("/v1/rl/diagnostics/diag-client").json()
    assert body["rl_enabled"] is True
    assert body["recent_decisions"] == []


def test_rl_diagnostics_for_endpoint_key(client, monkeypatch):
    monkeypatch.setattr(main, "ENABLE_RL", True)
    client.post("/v1/check", json={"client_id": "ep-diag", "limit_key": "login"})
    body = client.get("/v1/rl/diagnostics/ep-diag/login").json()
    assert body["client_id"] == "ep-diag/login"
    assert body["current_limit"] == 100


def test_decisions_report_the_algorithm(client):
    r = client.post("/v1/check", json={"client_id": "algo-client"})
    assert r.json()["algorithm"] == "token_bucket"
    assert r.headers["X-RateLimit-Algorithm"] == "token_bucket"


@pytest.mark.parametrize("algorithm", ["token_bucket", "leaky_bucket", "fixed_window", "sliding_window"])
def test_sandbox_runs_any_algorithm_in_isolation(client, algorithm):
    body = {"algorithm": algorithm, "session_id": f"sess-{algorithm}", "rate": 3, "window": 10}
    codes = [client.post("/v1/sandbox/check", json=body).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]
    blocked = client.post("/v1/sandbox/check", json=body)
    assert blocked.json()["algorithm"] == algorithm
    assert blocked.headers["X-RateLimit-Algorithm"] == algorithm


def test_sandbox_does_not_touch_real_clients_or_metrics(client):
    before = client.get("/v1/stats").json()["clients_total"]
    body = {"algorithm": "fixed_window", "session_id": "isolation-check", "rate": 1, "window": 10}
    client.post("/v1/sandbox/check", json=body)
    assert client.get("/v1/stats").json()["clients_total"] == before
    # The same id as a real client is unaffected by sandbox traffic
    assert client.post("/v1/check", json={"client_id": "tight"}).status_code == 200


@pytest.mark.parametrize("body", [
    {"algorithm": "nope", "session_id": "abcdefgh", "rate": 1, "window": 1},
    {"algorithm": "fixed_window", "session_id": "short", "rate": 1, "window": 1},
    {"algorithm": "fixed_window", "session_id": "abcdefgh", "rate": 5000, "window": 1},
    {"algorithm": "fixed_window", "session_id": "abcdefgh", "rate": 1, "window": 3600},
])
def test_sandbox_validates_input(client, body):
    assert client.post("/v1/sandbox/check", json=body).status_code == 422


def test_sandbox_has_its_own_global_quota(client, monkeypatch):
    monkeypatch.setattr(main, "SANDBOX_MAX_PER_MIN", 2)
    monkeypatch.setattr(main, "_sandbox_limiters", {})
    body = {"algorithm": "token_bucket", "session_id": "quota-check", "rate": 100, "window": 10}
    codes = [client.post("/v1/sandbox/check", json=body).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_internal_quota_keys_are_unreachable_by_client_ids(client):
    # "#" is reserved for internal keys and rejected in client IDs
    assert client.post("/v1/check", json={"client_id": "#admin", "limit_key": "ai_analysis"}).status_code == 422


def test_sandbox_reports_503_when_redis_is_down(client, monkeypatch):
    class Down:
        async def check_limit(self, *a, **k):
            raise ConnectionError("redis down")

    monkeypatch.setattr(main, "_sandbox_limiters", {"_quota": Down()})
    body = {"algorithm": "fixed_window", "session_id": "redis-down-1", "rate": 5, "window": 5}
    r = client.post("/v1/sandbox/check", json=body)
    assert r.status_code == 503
    assert "Redis" in r.json()["detail"]
