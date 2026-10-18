"""
Unit tests for the AI traffic analyst (Claude client stubbed - no API calls).
"""
import json
from types import SimpleNamespace

import fakeredis
import pytest

from src.analyst import (
    AnalysisStore,
    AnalystError,
    Finding,
    RuleRecommendation,
    TrafficAnalysis,
    TrafficAnalyst,
    build_snapshot,
)

ANALYSIS = TrafficAnalysis(
    status="watch",
    summary="client_x is hammering /login at 40 rps with 92% blocked.",
    findings=[Finding(client_id="client_x", endpoint="login", severity="warning",
                      issue="Possible credential stuffing", evidence="40 rps, 92% blocked")],
    recommendations=[RuleRecommendation(client_id="client_x", endpoint="login", rate=5,
                                        window=60, rationale="Sustained abuse")],
)


class StubClaude:
    """Mimics AsyncAnthropic().beta.messages.parse and records the request."""

    def __init__(self, stop_reason="end_turn", parsed_output=ANALYSIS, exc=None):
        self.calls = []
        self._response = SimpleNamespace(
            stop_reason=stop_reason,
            parsed_output=parsed_output,
            model="claude-opus-5-5",
            usage=SimpleNamespace(input_tokens=1200, output_tokens=300),
        )
        self._exc = exc
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse))

    async def _parse(self, **kwargs):
        self.calls.append(kwargs)
        if self._exc:
            raise self._exc
        return self._response


def test_snapshot_merges_counters_and_rl_state_and_caps_clients():
    totals = {
        ("busy", "global"): {"allowed": 900, "blocked": 100},
        ("busy", "login"): {"allowed": 10, "blocked": 90},
        ("quiet", "global"): {"allowed": 3, "blocked": 0},
    }
    agent_state = {"busy/login": {"current_limit": 18, "recent_decisions": []}}
    snap = build_snapshot({"default": {"rate": 100, "window": 60}}, totals, agent_state,
                          {"algorithm": "token_bucket"}, max_clients=2)

    assert [c["client_id"] + "/" + c["endpoint"] for c in snap["clients"]] == [
        "busy/global", "busy/login"
    ]
    assert snap["clients"][1]["rl"]["current_limit"] == 18
    assert snap["clients_omitted"] == 1


async def test_analyze_requests_structured_output_with_fallbacks():
    stub = StubClaude()
    result = await TrafficAnalyst(client=stub).analyze({"clients": [{"client_id": "x"}]})

    assert result["analysis"] == ANALYSIS
    assert result["usage"] == {"input_tokens": 1200, "output_tokens": 300}
    (call,) = stub.calls
    assert call["model"] == "claude-opus-5-5"
    assert call["output_format"] is TrafficAnalysis
    assert call["fallbacks"] == "default"
    assert call["betas"] == ["server-side-fallback-2026-07-01"]
    assert "<snapshot>" in call["messages"][0]["content"]
    assert "untrusted data" in call["system"]


@pytest.mark.parametrize("stop_reason,parsed", [("refusal", None), ("max_tokens", None)])
async def test_analyze_rejects_refusals_and_truncation(stop_reason, parsed):
    analyst = TrafficAnalyst(client=StubClaude(stop_reason=stop_reason, parsed_output=parsed))
    with pytest.raises(AnalystError) as exc:
        await analyst.analyze({})
    assert exc.value.status_code == 502


async def test_analyst_disabled_without_credentials(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    analyst = TrafficAnalyst()
    assert analyst.enabled is False
    with pytest.raises(AnalystError) as exc:
        await analyst.analyze({})
    assert exc.value.status_code == 503


async def test_store_round_trip_and_mark_applied():
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    store = AnalysisStore(redis)
    record = await store.save({"analysis": ANALYSIS, "model": "claude-opus-5-5",
                               "usage": {"input_tokens": 1, "output_tokens": 1}})
    assert record["applied"] == [False]
    assert await redis.ttl(AnalysisStore.PREFIX + record["id"]) > 0

    await store.mark_applied(record, 0)
    loaded = await store.get(record["id"])
    assert loaded["applied"] == [True]
    assert TrafficAnalysis.model_validate(loaded["analysis"]) == ANALYSIS
    assert json.loads(await redis.get(AnalysisStore.PREFIX + record["id"]))["id"] == record["id"]
