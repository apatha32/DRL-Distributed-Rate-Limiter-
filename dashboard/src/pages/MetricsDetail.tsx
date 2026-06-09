import React, { useState } from 'react'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Activity, AlertTriangle, Clock, Server } from 'lucide-react'
import ChartCard from '../components/ChartCard'
import StatCard from '../components/StatCard'

const metricsData = [
  { time: '00:00', requests: 2500, p50: 0.5, p95: 1.2, p99: 2.0, errors: 5 },
  { time: '04:00', requests: 1800, p50: 0.6, p95: 1.3, p99: 2.1, errors: 3 },
  { time: '08:00', requests: 5200, p50: 0.8, p95: 1.8, p99: 2.5, errors: 12 },
  { time: '12:00', requests: 7800, p50: 1.1, p95: 2.2, p99: 3.0, errors: 28 },
  { time: '16:00', requests: 6400, p50: 0.9, p95: 2.0, p99: 2.8, errors: 18 },
  { time: '20:00', requests: 4100, p50: 0.7, p95: 1.6, p99: 2.3, errors: 8 },
  { time: '24:00', requests: 2900, p50: 0.5, p95: 1.2, p99: 2.0, errors: 4 },
]

const clientMetrics = [
  { name: 'api_client_01', requests: 15234, allowed: 14891, blocked: 343, avgLatency: 1.2 },
  { name: 'api_client_02', requests: 12543, allowed: 12123, blocked: 420, avgLatency: 0.9 },
  { name: 'api_client_03', requests: 9876, allowed: 9534, blocked: 342, avgLatency: 1.5 },
  { name: 'api_client_04', requests: 8234, allowed: 7823, blocked: 411, avgLatency: 1.1 },
  { name: 'api_client_05', requests: 7654, allowed: 7234, blocked: 420, avgLatency: 1.3 },
]

const errorData = [
  { time: '00:00', redis_errors: 0, circuit_breaker: 0, timeout: 0 },
  { time: '04:00', redis_errors: 1, circuit_breaker: 0, timeout: 0 },
  { time: '08:00', redis_errors: 3, circuit_breaker: 1, timeout: 2 },
  { time: '12:00', redis_errors: 2, circuit_breaker: 2, timeout: 4 },
  { time: '16:00', redis_errors: 1, circuit_breaker: 1, timeout: 1 },
  { time: '20:00', redis_errors: 0, circuit_breaker: 0, timeout: 0 },
  { time: '24:00', redis_errors: 0, circuit_breaker: 0, timeout: 0 },
]

export default function MetricsDetail() {
  const [timeRange, setTimeRange] = useState('24h')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">Metrics</h1>
          <p className="text-slate-400">Detailed performance and system metrics</p>
        </div>
        <div className="flex space-x-2">
          {['1h', '6h', '24h', '7d'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRange === range
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Activity}
          title="Total Requests"
          value="58,387"
          change="In selected period"
          description="All rate limit checks"
        />
        <StatCard
          icon={Server}
          title="Avg Latency"
          value="0.81ms"
          change="Within SLA"
          trend="up"
          description="P50 latency"
        />
        <StatCard
          icon={Clock}
          title="P95 Latency"
          value="1.76ms"
          change="-0.12ms vs yesterday"
          trend="up"
          description="95th percentile"
        />
        <StatCard
          icon={AlertTriangle}
          title="Error Rate"
          value="0.032%"
          change="16 total errors"
          trend="down"
          description="Last 24 hours"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Volume */}
        <ChartCard title="Request Volume" description="Total requests over time">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metricsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="time" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Bar dataKey="requests" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Latency Percentiles */}
        <ChartCard title="Latency Percentiles" description="P50, P95, P99 over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metricsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="time" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Legend />
              <Line type="monotone" dataKey="p50" stroke="#0ea5e9" dot={false} name="P50" />
              <Line type="monotone" dataKey="p95" stroke="#06b6d4" dot={false} name="P95" />
              <Line type="monotone" dataKey="p99" stroke="#0891b2" dot={false} name="P99" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Error Metrics */}
      <ChartCard title="Error Distribution" description="Breakdown of errors by type">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={errorData}>
            <defs>
              <linearGradient id="colorRedis" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCircuit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorTimeout" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
            <XAxis dataKey="time" stroke="rgba(148, 163, 184, 0.5)" />
            <YAxis stroke="rgba(148, 163, 184, 0.5)" />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
              labelStyle={{ color: '#0ea5e9' }}
            />
            <Legend />
            <Area type="monotone" dataKey="redis_errors" stackId="1" stroke="#ef4444" fillOpacity={1} fill="url(#colorRedis)" name="Redis Errors" />
            <Area type="monotone" dataKey="circuit_breaker" stackId="1" stroke="#f97316" fillOpacity={1} fill="url(#colorCircuit)" name="Circuit Breaker" />
            <Area type="monotone" dataKey="timeout" stackId="1" stroke="#eab308" fillOpacity={1} fill="url(#colorTimeout)" name="Timeouts" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Client Metrics Table */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-6">Top Clients by Request Volume</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-300">Client ID</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Total Requests</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Allowed</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Blocked</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Block %</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {clientMetrics.map((client, i) => {
                const blockPercent = ((client.blocked / client.requests) * 100).toFixed(2)
                return (
                  <tr key={i} className="border-b border-slate-700 hover:bg-slate-700/50 transition">
                    <td className="py-3 px-4 font-mono text-cyan-400">{client.name}</td>
                    <td className="text-right py-3 px-4">{client.requests.toLocaleString()}</td>
                    <td className="text-right py-3 px-4 text-green-400">{client.allowed.toLocaleString()}</td>
                    <td className="text-right py-3 px-4 text-red-400">{client.blocked.toLocaleString()}</td>
                    <td className="text-right py-3 px-4">{blockPercent}%</td>
                    <td className="text-right py-3 px-4 font-mono">{client.avgLatency}ms</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h4 className="text-sm font-medium text-slate-400 mb-4">SUCCESS RATE</h4>
          <div className="text-4xl font-bold gradient-text mb-2">99.97%</div>
          <p className="text-sm text-slate-400">Requests successfully processed</p>
          <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: '99.97%' }}></div>
          </div>
        </div>
        <div className="card">
          <h4 className="text-sm font-medium text-slate-400 mb-4">AVG RESPONSE TIME</h4>
          <div className="text-4xl font-bold gradient-text mb-2">0.81ms</div>
          <p className="text-sm text-slate-400">Within target SLA</p>
          <div className="mt-4 space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Min:</span>
              <span className="text-cyan-400">0.2ms</span>
            </div>
            <div className="flex justify-between">
              <span>Max:</span>
              <span className="text-cyan-400">3.2ms</span>
            </div>
          </div>
        </div>
        <div className="card">
          <h4 className="text-sm font-medium text-slate-400 mb-4">UPTIME</h4>
          <div className="text-4xl font-bold gradient-text mb-2">99.99%</div>
          <p className="text-sm text-slate-400">Service availability</p>
          <div className="mt-4 space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Downtime:</span>
              <span className="text-cyan-400">3.15 min/month</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
