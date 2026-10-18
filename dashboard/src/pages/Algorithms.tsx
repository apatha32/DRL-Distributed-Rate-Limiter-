import React, { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BookOpen, Zap, Clock } from 'lucide-react'
import ChartCard from '../components/ChartCard'

// Latencies measured with scripts/benchmark.py (20K checks/algorithm, Redis 7, same Docker network)
const algorithms = [
  {
    id: 'token-bucket',
    name: 'Token Bucket',
    description: 'Each client has a bucket that refills continuously at rate/window tokens per second. Requests spend tokens; if too few remain, the request is denied.',
    pros: ['Allows bursts', 'Smooth refill', 'O(1) state per client'],
    cons: ['Bursts can briefly exceed average rate', 'Two parameters to reason about'],
    latency: 0.080,
    complexity: '1',
    memory: 'Low',
    accuracy: 'High',
    bestFor: 'Bursty APIs',
    color: '#0ea5e9',
    code: `-- one atomic Lua script (EVALSHA)
local tokens, ts = HMGET(key, 'tokens', 'ts')
tokens = min(capacity, tokens + (now - ts) * refill_per_ms)
if tokens >= cost then
  tokens = tokens - cost; allowed = 1
else
  retry_ms = ceil((cost - tokens) / refill_per_ms)
end
HSET(key, 'tokens', tokens, 'ts', now)`,
  },
  {
    id: 'leaky-bucket',
    name: 'Leaky Bucket',
    description: 'Each request pours water into a bucket that drains at a constant rate. Requests that would overflow the bucket are rejected, enforcing a smooth outflow.',
    pros: ['Smooth, constant output rate', 'O(1) state per client', 'Bounded bursts'],
    cons: ['Less tolerant of legitimate spikes', 'Full bucket recovers slowly'],
    latency: 0.080,
    complexity: '1',
    memory: 'Low',
    accuracy: 'High',
    bestFor: 'Protecting fragile backends',
    color: '#6366f1',
    code: `-- one atomic Lua script (EVALSHA)
local level, ts = HMGET(key, 'level', 'ts')
level = max(0, level - (now - ts) * leak_per_ms)
if level + cost <= capacity then
  level = level + cost; allowed = 1
else
  retry_ms = ceil((level + cost - capacity) / leak_per_ms)
end
HSET(key, 'level', level, 'ts', now)`,
  },
  {
    id: 'fixed-window',
    name: 'Fixed Window',
    description: 'Divides time into aligned windows with one counter each. A request is allowed while the counter plus its cost stays within the limit.',
    pros: ['Simplest implementation', 'O(1) operations', 'Lowest memory'],
    cons: ['Boundary spike issue', 'Up to 2x rate across a boundary'],
    latency: 0.079,
    complexity: '1',
    memory: 'Low',
    accuracy: 'Medium',
    bestFor: 'Simple quotas',
    color: '#06b6d4',
    code: `-- one atomic Lua script (EVALSHA)
local win_start = now - (now % window_ms)
local start, count = HMGET(key, 'start', 'count')
if start ~= win_start then count = 0 end
if count + cost <= rate then
  HSET(key, 'start', win_start, 'count', count + cost)
  allowed = 1
else
  retry_ms = win_start + window_ms - now
end`,
  },
  {
    id: 'sliding-window',
    name: 'Sliding Window',
    description: 'Keeps a sorted-set log of request timestamps and counts those inside a true rolling window before admitting a request.',
    pros: ['Exact rate limiting', 'No boundary spikes', 'Blocked requests cost nothing'],
    cons: ['Memory grows with request rate', 'O(log N) per operation'],
    latency: 0.083,
    complexity: 'log N',
    memory: 'High',
    accuracy: 'Very High',
    bestFor: 'Strict enforcement',
    color: '#0891b2',
    code: `-- one atomic Lua script (EVALSHA)
ZREMRANGEBYSCORE(key, '-inf', now - window_ms)
local count = ZCARD(key)
if count + cost <= rate then
  ZADD(key, now, nonce)   -- once per unit of cost
  allowed = 1
else
  retry_ms = oldest_needed + window_ms - now
end`,
  },
]

// Illustrative behaviour under the same bursty traffic pattern
const comparisonData = [
  { time: '0s', 'Token Bucket': 1000, 'Leaky Bucket': 1000, 'Fixed Window': 1000, 'Sliding Window': 1000 },
  { time: '5s', 'Token Bucket': 950, 'Leaky Bucket': 900, 'Fixed Window': 800, 'Sliding Window': 920 },
  { time: '10s', 'Token Bucket': 1050, 'Leaky Bucket': 940, 'Fixed Window': 1000, 'Sliding Window': 980 },
  { time: '15s', 'Token Bucket': 1100, 'Leaky Bucket': 960, 'Fixed Window': 800, 'Sliding Window': 1050 },
  { time: '20s', 'Token Bucket': 1000, 'Leaky Bucket': 980, 'Fixed Window': 1000, 'Sliding Window': 1000 },
  { time: '25s', 'Token Bucket': 950, 'Leaky Bucket': 960, 'Fixed Window': 800, 'Sliding Window': 920 },
]

// Measured per-decision latency (ms)
const latencyComparison = [
  { algorithm: 'Token Bucket', p50: 0.080, p95: 0.102, p99: 0.123 },
  { algorithm: 'Leaky Bucket', p50: 0.080, p95: 0.096, p99: 0.145 },
  { algorithm: 'Fixed Window', p50: 0.079, p95: 0.091, p99: 0.106 },
  { algorithm: 'Sliding Window', p50: 0.083, p95: 0.093, p99: 0.106 },
]

export default function Algorithms() {
  const [selectedAlgo, setSelectedAlgo] = useState(algorithms[0])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Rate Limiting Algorithms</h1>
        <p className="text-slate-400">Compare and understand different rate limiting strategies</p>
      </div>

      {/* Algorithm Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {algorithms.map((algo) => (
          <div
            key={algo.id}
            onClick={() => setSelectedAlgo(algo)}
            className={`card cursor-pointer border-2 transition-all ${
              selectedAlgo.id === algo.id
                ? 'border-cyan-500 ring-2 ring-cyan-500/50'
                : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-lg">{algo.name}</h3>
              <span className="text-xs font-mono bg-slate-700 px-2 py-1 rounded">{algo.latency}ms</span>
            </div>
            <p className="text-sm text-slate-400 mb-4 line-clamp-2">{algo.description}</p>
            <div className="flex space-x-2">
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">O({algo.complexity})</span>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Algorithm Details */}
      <div className="card">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">{selectedAlgo.name}</h2>
            <p className="text-slate-400">{selectedAlgo.description}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-cyan-400">{selectedAlgo.latency}ms</div>
            <div className="text-sm text-slate-400">p50 latency (measured)</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-3 flex items-center space-x-2">
              <Zap className="w-4 h-4 text-green-400" />
              <span>Advantages</span>
            </h4>
            <ul className="space-y-2">
              {selectedAlgo.pros.map((pro, i) => (
                <li key={i} className="text-sm text-slate-300 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-red-400" />
              <span>Disadvantages</span>
            </h4>
            <ul className="space-y-2">
              {selectedAlgo.cons.map((con, i) => (
                <li key={i} className="text-sm text-slate-300 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <span>{con}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Balance Comparison */}
        <ChartCard 
          title="Remaining Capacity Over Time"
          description="How each algorithm handles remaining tokens/requests"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="time" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Legend />
              {algorithms.map((algo) => (
                <Line key={algo.id} type="monotone" dataKey={algo.name} stroke={algo.color} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Measured latency */}
        <ChartCard 
          title="Decision Latency (measured)"
          description="p50 / p95 / p99 per check, one atomic Redis round trip"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="algorithm" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis unit="ms" stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Legend />
              <Bar dataKey="p50" fill="#0ea5e9" />
              <Bar dataKey="p95" fill="#06b6d4" />
              <Bar dataKey="p99" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Algorithm Pseudocode */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <span>Algorithm Logic</span>
        </h3>
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-cyan-400">
          <code>{selectedAlgo.code}</code>
        </pre>
      </div>

      {/* Key Metrics Table */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-6">Comparison Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-300">Metric</th>
                {algorithms.map((algo) => (
                  <th key={algo.id} className="text-center py-3 px-4 font-medium text-slate-300">{algo.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-700">
                <td className="py-3 px-4">Latency</td>
                {algorithms.map((algo) => (
                  <td key={algo.id} className="text-center py-3 px-4 font-mono text-cyan-400">{algo.latency}ms</td>
                ))}
              </tr>
              <tr className="border-b border-slate-700">
                <td className="py-3 px-4">Time Complexity</td>
                {algorithms.map((algo) => (
                  <td key={algo.id} className="text-center py-3 px-4 font-mono text-cyan-400">O({algo.complexity})</td>
                ))}
              </tr>
              <tr className="border-b border-slate-700">
                <td className="py-3 px-4">Memory Usage</td>
                {algorithms.map((algo) => (
                  <td key={algo.id} className="text-center py-3 px-4">{algo.memory}</td>
                ))}
              </tr>
              <tr className="border-b border-slate-700">
                <td className="py-3 px-4">Accuracy</td>
                {algorithms.map((algo) => (
                  <td key={algo.id} className="text-center py-3 px-4">{algo.accuracy}</td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4">Best For</td>
                {algorithms.map((algo) => (
                  <td key={algo.id} className="text-center py-3 px-4">{algo.bestFor}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
