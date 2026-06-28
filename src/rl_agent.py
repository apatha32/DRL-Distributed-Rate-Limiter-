"""
Deep Reinforcement Learning agent for adaptive rate limiting.

Uses a tabular Q-learning approach to learn per-client optimal rate limits
based on observed traffic patterns. No external ML framework required — uses
only numpy.

State space (discretized):
  - traffic_level:  low (0), medium (1), high (2)
  - block_ratio:    low (0), medium (1), high (2)   [blocked / total requests]
  - trend:          falling (0), stable (1), rising (2)

Action space:
  0 → decrease limit by LIMIT_STEP_PCT %
  1 → keep current limit
  2 → increase limit by LIMIT_STEP_PCT %

Reward signal:
  +1.0  for each allowed request (throughput reward)
  -0.5  for each blocked request (over-restriction penalty)
  -2.0  per-step if block_ratio is very LOW while traffic is HIGH
        (we're likely under-protecting; we gave too much away)
  -3.0  per-step if block_ratio is extremely HIGH (we're too aggressive)
"""

import json
import logging
import math
import os
import random
import time
from typing import Dict, Tuple, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ----- Hyper-parameters (can be overridden via environment) ---------------
LEARNING_RATE: float = float(os.getenv("RL_LEARNING_RATE", "0.1"))
DISCOUNT_FACTOR: float = float(os.getenv("RL_DISCOUNT_FACTOR", "0.9"))
EPSILON_START: float = float(os.getenv("RL_EPSILON_START", "1.0"))
EPSILON_MIN: float = float(os.getenv("RL_EPSILON_MIN", "0.05"))
EPSILON_DECAY: float = float(os.getenv("RL_EPSILON_DECAY", "0.995"))
LIMIT_STEP_PCT: float = float(os.getenv("RL_LIMIT_STEP_PCT", "0.10"))  # 10 %
MIN_LIMIT: int = int(os.getenv("RL_MIN_LIMIT", "5"))
MAX_LIMIT: int = int(os.getenv("RL_MAX_LIMIT", "10000"))
UPDATE_INTERVAL: int = int(os.getenv("RL_UPDATE_INTERVAL_SEC", "10"))

# State dimension sizes
N_TRAFFIC = 3   # low / medium / high
N_BLOCK   = 3   # low / medium / high
N_TREND   = 3   # falling / stable / rising
N_STATES  = N_TRAFFIC * N_BLOCK * N_TREND
N_ACTIONS = 3


def _encode_state(traffic_level: int, block_level: int, trend: int) -> int:
    return traffic_level * (N_BLOCK * N_TREND) + block_level * N_TREND + trend


def _discretize_traffic(rps: float) -> int:
    """Discretize requests-per-second into low/medium/high."""
    if rps < 5:
        return 0
    if rps < 50:
        return 1
    return 2


def _discretize_block_ratio(ratio: float) -> int:
    """Discretize block_ratio (0-1) into low/medium/high."""
    if ratio < 0.05:
        return 0
    if ratio < 0.30:
        return 1
    return 2


def _discretize_trend(delta_rps: float) -> int:
    """Discretize rate-of-change into falling/stable/rising."""
    if delta_rps < -2:
        return 0
    if delta_rps > 2:
        return 2
    return 1


class ClientStats:
    """Rolling window stats for one client."""

    WINDOW = 60  # seconds

    def __init__(self) -> None:
        self.allowed: int = 0
        self.blocked: int = 0
        self._rps_history: list = []   # (timestamp, rps_snapshot)
        self._last_update: float = time.time()
        self._prev_rps: float = 0.0

    def record(self, allowed: bool) -> None:
        if allowed:
            self.allowed += 1
        else:
            self.blocked += 1
        self._last_update = time.time()

    @property
    def total(self) -> int:
        return self.allowed + self.blocked

    @property
    def block_ratio(self) -> float:
        if self.total == 0:
            return 0.0
        return self.blocked / self.total

    @property
    def rps(self) -> float:
        elapsed = time.time() - self._last_update
        if elapsed < 1:
            elapsed = 1
        return self.total / min(elapsed, self.WINDOW)

    @property
    def rps_delta(self) -> float:
        current = self.rps
        delta = current - self._prev_rps
        self._prev_rps = current
        return delta

    def reset_window(self) -> None:
        """Reset counters each RL update cycle to keep a fresh window."""
        self._prev_rps = self.rps
        self.allowed = 0
        self.blocked = 0
        self._last_update = time.time()


class RLAgent:
    """
    Per-client Q-learning agent for dynamic rate limit adaptation.

    Each client gets its own Q-table so the agent learns specialised policies
    for different traffic profiles.
    """

    def __init__(self) -> None:
        # client_id → Q-table (np.ndarray shape [N_STATES, N_ACTIONS])
        self._q_tables: Dict[str, np.ndarray] = {}
        # client_id → current epsilon
        self._epsilons: Dict[str, float] = {}
        # client_id → rolling stats
        self._stats: Dict[str, ClientStats] = {}
        # client_id → current adjusted rate limit
        self._current_limits: Dict[str, int] = {}
        # client_id → timestamp of last RL update
        self._last_update: Dict[str, float] = {}
        # client_id → last observed state index
        self._last_state: Dict[str, Optional[int]] = {}
        # client_id → last action taken
        self._last_action: Dict[str, Optional[int]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def observe(self, client_id: str, allowed: bool) -> None:
        """Called after every rate-limit decision to record the outcome."""
        self._ensure_client(client_id)
        self._stats[client_id].record(allowed)

    def get_limit(self, client_id: str, base_limit: int) -> int:
        """
        Return the RL-adjusted rate limit for this client.
        Runs an RL update step if UPDATE_INTERVAL seconds have elapsed.
        """
        self._ensure_client(client_id, base_limit)
        now = time.time()
        if now - self._last_update.get(client_id, 0) >= UPDATE_INTERVAL:
            self._update(client_id)
        return self._current_limits[client_id]

    def get_diagnostics(self, client_id: str) -> Dict:
        """Return human-readable diagnostics for one client."""
        if client_id not in self._stats:
            return {}
        stats = self._stats[client_id]
        return {
            "current_limit": self._current_limits.get(client_id),
            "epsilon": round(self._epsilons.get(client_id, EPSILON_START), 4),
            "rps": round(stats.rps, 2),
            "block_ratio": round(stats.block_ratio, 4),
            "rps_delta": round(stats.rps_delta, 2),
            "total_requests_window": stats.total,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_client(self, client_id: str, base_limit: int = 100) -> None:
        if client_id not in self._q_tables:
            self._q_tables[client_id] = np.zeros((N_STATES, N_ACTIONS))
            self._epsilons[client_id] = EPSILON_START
            self._stats[client_id] = ClientStats()
            self._current_limits[client_id] = base_limit
            self._last_update[client_id] = time.time()
            self._last_state[client_id] = None
            self._last_action[client_id] = None

    def _get_state(self, client_id: str) -> int:
        stats = self._stats[client_id]
        t = _discretize_traffic(stats.rps)
        b = _discretize_block_ratio(stats.block_ratio)
        d = _discretize_trend(stats.rps_delta)
        return _encode_state(t, b, d)

    def _compute_reward(self, client_id: str) -> float:
        """Reward is a function of per-window traffic outcomes."""
        stats = self._stats[client_id]
        if stats.total == 0:
            return 0.0

        # Base reward: prefer maximising allowed throughput
        reward = stats.allowed * 1.0
        # Penalty for over-blocking
        reward -= stats.blocked * 0.5

        # Abuse-signal: very low block ratio at high traffic ⟹ under-protecting
        if _discretize_traffic(stats.rps) == 2 and _discretize_block_ratio(stats.block_ratio) == 0:
            reward -= 2.0

        # Over-restriction: block ratio > 70 %
        if stats.block_ratio > 0.70:
            reward -= 3.0

        return reward

    def _choose_action(self, client_id: str, state: int) -> int:
        eps = self._epsilons[client_id]
        if random.random() < eps:
            return random.randint(0, N_ACTIONS - 1)
        q_row = self._q_tables[client_id][state]
        return int(np.argmax(q_row))

    def _apply_action(self, client_id: str, action: int) -> None:
        current = self._current_limits[client_id]
        if action == 0:  # decrease
            new_limit = max(MIN_LIMIT, math.floor(current * (1 - LIMIT_STEP_PCT)))
        elif action == 2:  # increase
            new_limit = min(MAX_LIMIT, math.ceil(current * (1 + LIMIT_STEP_PCT)))
        else:  # keep
            new_limit = current

        if new_limit != current:
            logger.info(
                "[RL] client=%s action=%s limit %d → %d",
                client_id, ["decrease", "keep", "increase"][action], current, new_limit,
            )
        self._current_limits[client_id] = new_limit

    def _update(self, client_id: str) -> None:
        """Run one Q-learning update step for this client."""
        stats = self._stats[client_id]
        new_state = self._get_state(client_id)
        reward = self._compute_reward(client_id)

        prev_state = self._last_state[client_id]
        prev_action = self._last_action[client_id]

        # Q-table update (Bellman equation)
        if prev_state is not None and prev_action is not None:
            q = self._q_tables[client_id]
            best_next = float(np.max(q[new_state]))
            q[prev_state, prev_action] += LEARNING_RATE * (
                reward + DISCOUNT_FACTOR * best_next - q[prev_state, prev_action]
            )

        # Choose and apply next action
        action = self._choose_action(client_id, new_state)
        self._apply_action(client_id, action)

        # Decay exploration
        eps = self._epsilons[client_id]
        self._epsilons[client_id] = max(EPSILON_MIN, eps * EPSILON_DECAY)

        # Book-keeping
        self._last_state[client_id] = new_state
        self._last_action[client_id] = action
        self._last_update[client_id] = time.time()
        stats.reset_window()

        logger.debug(
            "[RL] client=%s state=%d action=%d reward=%.2f eps=%.3f limit=%d",
            client_id, new_state, action, reward,
            self._epsilons[client_id], self._current_limits[client_id],
        )

    # ------------------------------------------------------------------
    # Persistence (optional — save/load Q-tables to disk)
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        data = {
            cid: {
                "q_table": self._q_tables[cid].tolist(),
                "epsilon": self._epsilons[cid],
                "current_limit": self._current_limits[cid],
            }
            for cid in self._q_tables
        }
        with open(path, "w") as f:
            json.dump(data, f)
        logger.info("[RL] Q-tables saved to %s", path)

    def load(self, path: str) -> None:
        if not os.path.exists(path):
            logger.warning("[RL] No saved Q-tables found at %s", path)
            return
        with open(path) as f:
            data = json.load(f)
        for cid, entry in data.items():
            self._q_tables[cid] = np.array(entry["q_table"])
            self._epsilons[cid] = entry["epsilon"]
            self._current_limits[cid] = entry["current_limit"]
            self._stats[cid] = ClientStats()
            self._last_state[cid] = None
            self._last_action[cid] = None
            self._last_update[cid] = 0.0
        logger.info("[RL] Q-tables loaded from %s (%d clients)", path, len(data))


# Module-level singleton
_agent: Optional[RLAgent] = None


def get_agent() -> RLAgent:
    """Return the global RLAgent singleton."""
    global _agent
    if _agent is None:
        _agent = RLAgent()
        rl_model_path = os.getenv("RL_MODEL_PATH", "")
        if rl_model_path:
            _agent.load(rl_model_path)
    return _agent
