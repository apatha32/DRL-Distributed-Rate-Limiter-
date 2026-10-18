"""
Unit tests for the Q-learning agent and the RL-adaptive limiter.
"""
import fakeredis
import numpy as np
import pytest

from src import rl_agent
from src.rl_agent import RLAgent, UPDATE_INTERVAL
from src.adaptive_limiter import RLAdaptiveLimiter, agent_key
from src.algorithms import TokenBucketLimiter


def _age_window(agent: RLAgent, client_id: str, seconds: float) -> None:
    """Pretend `seconds` have passed in the client's current observation window."""
    agent._last_update[client_id] -= seconds
    agent._stats[client_id].window_start -= seconds


def test_get_limit_starts_at_base_limit():
    agent = RLAgent()
    assert agent.get_limit("c1", base_limit=100) == 100


def test_rps_and_block_ratio_measured_over_window():
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)
    for i in range(100):
        agent.observe("c1", allowed=i < 80)
    _age_window(agent, "c1", 10)

    stats = agent._stats["c1"]
    assert stats.rps == pytest.approx(10.0, rel=0.05)
    assert stats.block_ratio == pytest.approx(0.20)


def test_step_all_waits_for_update_interval():
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)
    agent.observe("c1", allowed=True)
    assert agent.step_all() == 0

    _age_window(agent, "c1", UPDATE_INTERVAL)
    assert agent.step_all() == 1
    assert agent._last_state["c1"] is not None


def test_idle_clients_are_not_adjusted():
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)
    _age_window(agent, "c1", UPDATE_INTERVAL)
    assert agent.step_all() == 0
    assert agent.get_limit("c1", base_limit=100) == 100


def test_actions_change_limit_within_bounds(monkeypatch):
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)

    agent._apply_action("c1", 2)
    assert agent._current_limits["c1"] == 110
    agent._apply_action("c1", 0)
    assert agent._current_limits["c1"] == 99
    agent._apply_action("c1", 1)
    assert agent._current_limits["c1"] == 99

    agent._current_limits["c1"] = rl_agent.MIN_LIMIT
    agent._apply_action("c1", 0)
    assert agent._current_limits["c1"] == rl_agent.MIN_LIMIT


def test_q_table_learns_from_reward(monkeypatch):
    """With exploration off, repeated over-blocking teaches the agent to raise limits."""
    monkeypatch.setattr(rl_agent, "EPSILON_START", 0.0)
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)

    for _ in range(30):
        for i in range(200):
            agent.observe("c1", allowed=i < 40)   # 80 % blocked
        _age_window(agent, "c1", UPDATE_INTERVAL)
        agent.step_all()

    q = agent._q_tables["c1"]
    assert np.any(q != 0)
    assert agent._current_limits["c1"] != 100


async def test_adaptive_limiter_enforces_rl_limit_and_feeds_agent():
    limiter = RLAdaptiveLimiter(TokenBucketLimiter(fakeredis.FakeAsyncRedis(decode_responses=True)))
    agent = limiter._agent
    agent.get_limit("rl-client", base_limit=20)
    agent._current_limits["rl-client"] = 5   # agent decided to tighten

    assert limiter.effective_limit("rl-client", "global", rate=20) == 5
    results = [
        (await limiter.check_limit("rl-client", "global", rate=20, window=60))[0]
        for _ in range(8)
    ]
    assert results.count(True) == 5
    assert agent._stats["rl-client"].blocked == 3


async def test_endpoint_limits_are_learned_independently():
    limiter = RLAdaptiveLimiter(TokenBucketLimiter(fakeredis.FakeAsyncRedis(decode_responses=True)))
    assert limiter.effective_limit("ep-client", "global", rate=100) == 100
    assert limiter.effective_limit("ep-client", "login", rate=20) == 20
    assert agent_key("ep-client", "login") == "ep-client/login"


def test_operator_rule_change_resets_learned_limit():
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)
    agent._current_limits["c1"] = 140
    agent.set_base_limit("c1", 50)
    assert agent.get_limit("c1", base_limit=100) == 50


def test_decisions_are_recorded_for_analysis():
    agent = RLAgent()
    agent.get_limit("c1", base_limit=100)
    for i in range(50):
        agent.observe("c1", allowed=i < 45)
    _age_window(agent, "c1", UPDATE_INTERVAL)
    agent.step_all()

    (decision,) = agent.get_history("c1")
    assert decision["requests"] == 50
    assert decision["block_ratio"] == pytest.approx(0.1)
    assert decision["action"] in ("decrease", "keep", "increase")
    assert agent.snapshot()["c1"]["recent_decisions"] == [decision]
