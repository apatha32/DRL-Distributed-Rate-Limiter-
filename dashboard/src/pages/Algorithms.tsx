import React, { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts'
import { BookOpen, Zap, Clock } from 'lucide-react'
import ChartCard from '../components/ChartCard'

const algorithms = [
  {
    id: 'token-bucket',
    name: 'Token Bucket',
    description: 'Each client has a bucket that fills at a constant rate. Requests consume tokens; if insufficient tokens exist, the request is denied.',
    pros: ['Allows bursts', 'Smooth refill', 'Flexible capacity'],
    cons: ['Requires bucket storage', 'Token generation overhead'],
    latency: 1.2,
    complexity: 'O(1)',
    color: '#0ea5e9',
  },
  {
    id: 'fixed-window',
    name: 'Fixed Window',
    description: 'Divides time into fixed intervals (windows). Each window has a request limit counter. When a request arrives, check if the counter is below the limit.',
    pros: ['Simplest implementation', 'Fast O(1) operations', 'Low memory'],
    cons: ['Boundary spike issue', 'Less accurate', 'Can burst at boundaries'],
    latency: 0.8,
    complexity: 'O(1)',
    color: '#06b6d4',
  },
  {
    id: 'sliding-window',
    name: 'Sliding Window',
    description: 'Maintains a window of requests with timestamps. For each request, counts how many requests fall within the sliding window and compares against the limit.',
    pros: ['Accurate rate limiting', 'No boundary spikes', 'Smooth behavior'],
    cons: ['Higher memory usage', 'More complex logic', 'Slower than fixed window'],
    latency: 2.3,
    complexity: 'O(N)',
    color: '#0891b2',
  },
]

const comparisonData = [
  { time: '0s', 'Token Bucket': 1000, 'Fixed Window': 1000, 'Sliding Window': 1000 },
  { time: '5s', 'Token Bucket': 950, 'Fixed Window': 800, 'Sliding Window': 920 },
  { time: '10s', 'Token Bucket': 1050, 'Fixed Window': 1000, 'Sliding Window': 980 },
  { time: '15s', 'Token Bucket': 1100, 'Fixed Window': 800, 'Sliding Window': 1050 },
  { time: '20s', 'Token Bucket': 1000, 'Fixed Window': 1000, 'Sliding Window': 1000 },
  { time: '25s', 'Fixed Window': 800, 'Token Bucket': 950, 'Sliding Window': 920 },
]

const latencyComparison = [
  { requests: 100, 'Token Bucket': 0.9, 'Fixed Window': 0.7, 'Sliding Window': 1.5 },
  { requests: 500, 'Token Bucket': 1.1, 'Fixed Window': 0.8, 'Sliding Window': 1.8 },
  { requests: 1000, 'Token Bucket': 1.2, 'Fixed Window': 0.8, 'Sliding Window': 2.0 },
  { requests: 5000, 'Token Bucket': 1.3, 'Fixed Window': 0.9, 'Sliding Window': 2.2 },
  { requests: 10000, 'Token Bucket': 1.4, 'Fixed Window': 0.9, 'Sliding Window': 2.5 },
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <div className="text-sm text-slate-400">Average Latency</div>
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
              <Line type="monotone" dataKey="Token Bucket" stroke="#0ea5e9" dot={false} />
              <Line type="monotone" dataKey="Fixed Window" stroke="#06b6d4" dot={false} />
              <Line type="monotone" dataKey="Sliding Window" stroke="#0891b2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Latency vs Load */}
        <ChartCard 
          title="Latency vs Request Load"
          description="Performance degradation with increasing request volume"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="requests" name="Requests/sec" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis dataKey="data" name="Latency (ms)" stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Scatter name="Token Bucket" data={latencyComparison} dataKey="Token Bucket" fill="#0ea5e9" />
              <Scatter name="Fixed Window" data={latencyComparison} dataKey="Fixed Window" fill="#06b6d4" />
              <Scatter name="Sliding Window" data={latencyComparison} dataKey="Sliding Window" fill="#0891b2" />
            </ScatterChart>
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
          <code>{`${selectedAlgo.name === 'Token Bucket' 
            ? `def check_limit(client_id, rate, window, cost=1):
    key = f"bucket:{client_id}"
    current = redis.get(key) or rate
    
    if current >= cost:
        redis.decrby(key, cost)
        return True, current - cost
    
    return False, 0` 
            : selectedAlgo.name === 'Fixed Window'
            ? `def check_limit(client_id, rate, window):
    key = f"window:{client_id}:{current_window()}"
    count = redis.get(key) or 0
    
    if count < rate:
        redis.incr(key)
        redis.expire(key, window)
        return True
    
    return False`
            : `def check_limit(client_id, rate, window):
    key = f"sliding:{client_id}"
    now = time.time()
    
    # Remove old requests outside window
    redis.zremrangebyscore(key, 0, now - window)
    
    # Count requests in window
    count = redis.zcard(key)
    
    if count < rate:
        redis.zadd(key, {now: now})
        return True
    
    return False`}</code>
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
                <td className="text-center py-3 px-4">Medium</td>
                <td className="text-center py-3 px-4">Low</td>
                <td className="text-center py-3 px-4">High</td>
              </tr>
              <tr className="border-b border-slate-700">
                <td className="py-3 px-4">Accuracy</td>
                <td className="text-center py-3 px-4">High</td>
                <td className="text-center py-3 px-4">Medium</td>
                <td className="text-center py-3 px-4">Very High</td>
              </tr>
              <tr>
                <td className="py-3 px-4">Best For</td>
                <td className="text-center py-3 px-4">Bursting APIs</td>
                <td className="text-center py-3 px-4">Simple limits</td>
                <td className="text-center py-3 px-4">Accurate rate limiting</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
