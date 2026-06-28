import React, { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Brain, TrendingUp, TrendingDown, Minus, Activity, Target, Cpu, Sliders } from 'lucide-react'
import StatCard from '../components/StatCard'
import ChartCard from '../components/ChartCard'

// ---- Types ---------------------------------------------------------------

interface ClientRLState {
  clientId: string
  currentLimit: number
  baseLimit: number
  epsilon: number
  rps: number
  blockRatio: number
  rpsDelta: number
  totalRequests: number
  lastAction: 'decrease' | 'keep' | 'increase'
  rewardHistory: number[]
  limitHistory: { time: string; limit: number; base: number }[]
}

// ---- Simulation helpers --------------------------------------------------

const CLIENTS = ['client_a', 'client_b', 'client_c', 'api_gateway', 'mobile_app']
const BASE_LIMITS: Record<string, number> = {
  client_a: 100, client_b: 50, client_c: 200, api_gateway: 500, mobile_app: 80,
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function pickAction(blockRatio: number, rps: number, eps: number): 'decrease' | 'keep' | 'increase' {
  if (Math.random() < eps) {
    const r = Math.random()
    return r < 0.33 ? 'decrease' : r < 0.66 ? 'keep' : 'increase'
  }
  // Greedy: high block ratio -> decrease, low block at high traffic -> increase
  if (blockRatio > 0.35) return 'decrease'
  if (blockRatio < 0.05 && rps > 20) return 'increase'
  return 'keep'
}

function applyAction(current: number, action: 'decrease' | 'keep' | 'increase'): number {
  if (action === 'decrease') return clamp(Math.floor(current * 0.9), 5, 10000)
  if (action === 'increase') return clamp(Math.ceil(current * 1.1), 5, 10000)
  return current
}

function computeReward(allowed: number, blocked: number, rps: number, blockRatio: number): number {
  let r = allowed * 1.0 - blocked * 0.5
  if (rps > 20 && blockRatio < 0.05) r -= 2
  if (blockRatio > 0.7) r -= 3
  return parseFloat(r.toFixed(2))
}

function initClient(id: string): ClientRLState {
  const base = BASE_LIMITS[id] ?? 100
  return {
    clientId: id,
    currentLimit: base,
    baseLimit: base,
    epsilon: 1.0,
    rps: Math.random() * 15 + 2,
    blockRatio: Math.random() * 0.15,
    rpsDelta: 0,
    totalRequests: 0,
    lastAction: 'keep',
    rewardHistory: [],
    limitHistory: [],
  }
}

function stepClient(prev: ClientRLState): ClientRLState {
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Simulate traffic changes
  const newRps = clamp(prev.rps + (Math.random() * 6 - 3), 0.5, 80)
  const rpsDelta = parseFloat((newRps - prev.rps).toFixed(2))

  // Simulate block ratio influenced by current limit vs rps
  const pressure = newRps / (prev.currentLimit / 10)
  const newBlockRatio = clamp(prev.blockRatio + (pressure > 1.2 ? 0.05 : -0.03) + (Math.random() * 0.04 - 0.02), 0, 0.95)

  const totalWindow = Math.floor(newRps * 10)
  const blockedWindow = Math.floor(totalWindow * newBlockRatio)
  const allowedWindow = totalWindow - blockedWindow

  const reward = computeReward(allowedWindow, blockedWindow, newRps, newBlockRatio)
  const action = pickAction(newBlockRatio, newRps, prev.epsilon)
  const newLimit = applyAction(prev.currentLimit, action)
  const newEpsilon = parseFloat(Math.max(0.05, prev.epsilon * 0.995).toFixed(4))

  const rewardHistory = [...prev.rewardHistory.slice(-29), reward]
  const limitHistory = [
    ...prev.limitHistory.slice(-29),
    { time: now, limit: newLimit, base: prev.baseLimit },
  ]

  return {
    ...prev,
    currentLimit: newLimit,
    epsilon: newEpsilon,
    rps: parseFloat(newRps.toFixed(2)),
    rpsDelta,
    blockRatio: parseFloat(newBlockRatio.toFixed(4)),
    totalRequests: prev.totalRequests + totalWindow,
    lastAction: action,
    rewardHistory,
    limitHistory,
  }
}

// ---- Sub-components ------------------------------------------------------

function ActionBadge({ action }: { action: 'decrease' | 'keep' | 'increase' }) {
  const styles = {
    decrease: 'bg-red-500/15 text-red-400 border-red-500/30',
    keep:     'bg-slate-500/15 text-slate-400 border-slate-500/30',
    increase: 'bg-green-500/15 text-green-400 border-green-500/30',
  }
  const icons = { decrease: TrendingDown, keep: Minus, increase: TrendingUp }
  const Icon = icons[action]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${styles[action]}`}>
      <Icon className="w-3 h-3" />
      {action}
    </span>
  )
}

function EpsilonBar({ value }: { value: number }) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>Exploration</span>
        <span className="font-mono">{value.toFixed(3)}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  )
}

// ---- Main page -----------------------------------------------------------

export default function AIAgent() {
  const [clients, setClients] = useState<Record<string, ClientRLState>>(
    () => Object.fromEntries(CLIENTS.map(id => [id, initClient(id)]))
  )
  const [selected, setSelected] = useState<string>(CLIENTS[0])
  const [isRunning, setIsRunning] = useState(true)
  const [totalUpdates, setTotalUpdates] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setClients(prev => {
        const next: Record<string, ClientRLState> = {}
        for (const id of CLIENTS) next[id] = stepClient(prev[id])
        return next
      })
      setTotalUpdates(n => n + 1)
    }, 2000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning])

  const active = clients[selected]
  const avgEpsilon = parseFloat(
    (Object.values(clients).reduce((s, c) => s + c.epsilon, 0) / CLIENTS.length).toFixed(3)
  )
  const totalReqs = Object.values(clients).reduce((s, c) => s + c.totalRequests, 0)
  const adaptedClients = Object.values(clients).filter(c => c.currentLimit !== c.baseLimit).length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">AI Rate Limit Agent</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Q-learning agent adapting per-client rate limits in real time based on traffic behavior.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isRunning ? 'bg-green-500/15 text-green-400' : 'bg-slate-500/15 text-slate-400'}`}>
            {isRunning ? 'LEARNING' : 'PAUSED'}
          </span>
          <button
            onClick={() => setIsRunning(r => !r)}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium transition-colors"
          >
            {isRunning ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Brain}
          title="RL Update Cycles"
          value={totalUpdates.toLocaleString()}
          description="Q-table updates since session start"
          trend="up"
          change="Every 2 seconds"
        />
        <StatCard
          icon={Sliders}
          title="Avg Exploration (epsilon)"
          value={avgEpsilon}
          description="Decays from 1.0 toward 0.05"
          trend="down"
          change="Converging toward greedy policy"
        />
        <StatCard
          icon={Target}
          title="Clients Adapted"
          value={`${adaptedClients} / ${CLIENTS.length}`}
          description="Clients with limit diverged from base"
          trend="neutral"
        />
        <StatCard
          icon={Activity}
          title="Requests Observed"
          value={totalReqs.toLocaleString()}
          description="Across all clients this session"
          trend="up"
          change="All windows"
        />
      </div>

      {/* Client selector + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client list */}
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Clients</h2>
          {CLIENTS.map(id => {
            const c = clients[id]
            const isSelected = id === selected
            const pct = Math.round(((c.currentLimit - c.baseLimit) / c.baseLimit) * 100)
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                className={`w-full text-left rounded-lg px-4 py-3 transition-all border ${
                  isSelected
                    ? 'bg-cyan-600/20 border-cyan-500/50'
                    : 'bg-slate-800/40 border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold font-mono">{id}</span>
                  <ActionBadge action={c.lastAction} />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Limit: <span className="text-white font-mono">{c.currentLimit}</span></span>
                  <span className={pct >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {pct >= 0 ? '+' : ''}{pct}% vs base
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected client detail */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold font-mono">{selected}</h2>
              <ActionBadge action={active.lastAction} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Current Limit', value: active.currentLimit, mono: true },
                { label: 'Base Limit', value: active.baseLimit, mono: true },
                { label: 'RPS', value: active.rps.toFixed(1), mono: true },
                { label: 'Block Ratio', value: `${(active.blockRatio * 100).toFixed(1)}%`, mono: true },
                { label: 'RPS Delta', value: (active.rpsDelta >= 0 ? '+' : '') + active.rpsDelta, mono: true },
                { label: 'Total Requests', value: active.totalRequests.toLocaleString(), mono: false },
              ].map(({ label, value, mono }) => (
                <div key={label} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                  <p className="text-slate-400 text-xs mb-1">{label}</p>
                  <p className={`text-white text-lg font-bold ${mono ? 'font-mono' : ''}`}>{value}</p>
                </div>
              ))}
            </div>
            <EpsilonBar value={active.epsilon} />
          </div>

          {/* Limit adjustment chart */}
          <ChartCard title="Limit Adjustment Over Time" description="RL-adjusted limit vs static base limit">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={active.limitHistory} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="lgLimit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <Area type="monotone" dataKey="limit" name="RL Limit" stroke="#06b6d4" fill="url(#lgLimit)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="base" name="Base Limit" stroke="#64748b" strokeDasharray="4 2" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Reward history + all-client limit comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Reward Signal" description="Per-update reward for the selected client">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={active.rewardHistory.map((r, i) => ({ step: i + 1, reward: r }))} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="lgReward" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="step" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="reward" name="Reward" stroke="#22c55e" fill="url(#lgReward)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Limit Deviation by Client" description="Current RL limit vs base limit across all clients">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={CLIENTS.map(id => ({
                name: id,
                base: clients[id].baseLimit,
                rl: clients[id].currentLimit,
              }))}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="base" name="Base" fill="#334155" radius={[3, 3, 0, 0]} />
              <Bar dataKey="rl" name="RL Adjusted" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Agent parameter reference */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Agent Configuration
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { env: 'ENABLE_RL', default: 'false', desc: 'Enable the RL adaptive layer' },
            { env: 'RL_LEARNING_RATE', default: '0.1', desc: 'Q-table Bellman update step size' },
            { env: 'RL_DISCOUNT_FACTOR', default: '0.9', desc: 'Future reward discount gamma' },
            { env: 'RL_EPSILON_START', default: '1.0', desc: 'Initial exploration probability' },
            { env: 'RL_EPSILON_MIN', default: '0.05', desc: 'Minimum exploration floor' },
            { env: 'RL_EPSILON_DECAY', default: '0.995', desc: 'Per-update epsilon multiplier' },
            { env: 'RL_LIMIT_STEP_PCT', default: '0.10', desc: 'Limit change size per action' },
            { env: 'RL_UPDATE_INTERVAL_SEC', default: '10', desc: 'Seconds between RL updates' },
          ].map(({ env, default: def, desc }) => (
            <div key={env} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
              <p className="font-mono text-cyan-400 text-xs font-semibold mb-1">{env}</p>
              <p className="font-mono text-slate-300 text-sm mb-2">default: {def}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
