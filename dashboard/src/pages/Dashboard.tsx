import React, { useState, useEffect } from 'react'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Activity, TrendingUp, AlertCircle, Users, Server, Zap } from 'lucide-react'
import StatCard from '../components/StatCard'
import ChartCard from '../components/ChartCard'

// Mock data generator
const generateChartData = () => {
  const now = Date.now()
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(now - (23 - i) * 3600000).toLocaleTimeString('en-US', { hour: '2-digit' }),
    allowed: Math.floor(Math.random() * 5000) + 2000,
    blocked: Math.floor(Math.random() * 1000) + 200,
    latency: (Math.random() * 2.5 + 0.5).toFixed(2),
  }))
}

const algorithmData = [
  { name: 'Token Bucket', value: 45, latency: 1.2 },
  { name: 'Fixed Window', value: 35, latency: 0.8 },
  { name: 'Sliding Window', value: 20, latency: 2.3 },
]

const latencyData = [
  { name: 'p50', value: 0.8 },
  { name: 'p95', value: 1.5 },
  { name: 'p99', value: 2.3 },
]

const COLORS = ['#0ea5e9', '#06b6d4', '#0891b2']

export default function Dashboard() {
  const [chartData, setChartData] = useState(generateChartData())
  const [stats, setStats] = useState({
    totalRequests: 127534,
    allowedRequests: 126234,
    blockedRequests: 1300,
    activeClients: 342,
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setChartData(generateChartData())
      setStats(prev => ({
        totalRequests: prev.totalRequests + Math.floor(Math.random() * 100),
        allowedRequests: prev.allowedRequests + Math.floor(Math.random() * 95),
        blockedRequests: prev.blockedRequests + Math.floor(Math.random() * 5),
        activeClients: Math.max(100, Math.min(500, prev.activeClients + Math.floor(Math.random() * 20 - 10))),
      }))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const allowPercentage = ((stats.allowedRequests / stats.totalRequests) * 100).toFixed(2)
  const blockPercentage = ((stats.blockedRequests / stats.totalRequests) * 100).toFixed(2)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-slate-400">Real-time monitoring of your distributed rate limiter</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Activity}
          title="Total Requests"
          value={stats.totalRequests.toLocaleString()}
          change={`+${Math.floor(Math.random() * 1000)} today`}
          trend="up"
          description="Last 24 hours"
        />
        <StatCard
          icon={TrendingUp}
          title="Allowed Requests"
          value={stats.allowedRequests.toLocaleString()}
          change={`${allowPercentage}% success rate`}
          trend="up"
          description="Accepted by limiter"
        />
        <StatCard
          icon={AlertCircle}
          title="Blocked Requests"
          value={stats.blockedRequests.toLocaleString()}
          change={`${blockPercentage}% blocked`}
          trend="down"
          description="Rate limit exceeded"
        />
        <StatCard
          icon={Users}
          title="Active Clients"
          value={stats.activeClients}
          change="+12 this hour"
          trend="up"
          description="Connected clients"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests Over Time */}
        <ChartCard title="Request Trend" description="Allowed vs blocked requests over time">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
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
              <Area type="monotone" dataKey="allowed" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorAllowed)" />
              <Area type="monotone" dataKey="blocked" stroke="#ef4444" fillOpacity={1} fill="url(#colorBlocked)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Algorithm Distribution */}
        <ChartCard title="Algorithm Distribution" description="Usage percentage by algorithm">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={algorithmData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {algorithmData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Latency and Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Percentiles */}
        <ChartCard title="Latency Percentiles" description="Response time distribution">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="name" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Bar dataKey="value" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Latency Trend */}
        <ChartCard title="Latency Over Time" description="Response times in milliseconds">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="time" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(14, 165, 233, 0.3)' }}
                labelStyle={{ color: '#0ea5e9' }}
              />
              <Line type="monotone" dataKey="latency" stroke="#0ea5e9" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Algorithm Details Table */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-6">Algorithm Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-300">Algorithm</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Usage %</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Latency (ms)</th>
                <th className="text-right py-3 px-4 font-medium text-slate-300">Status</th>
              </tr>
            </thead>
            <tbody>
              {algorithmData.map((algo, i) => (
                <tr key={i} className="border-b border-slate-700 hover:bg-slate-700/50 transition">
                  <td className="py-3 px-4">{algo.name}</td>
                  <td className="text-right py-3 px-4">{algo.value}%</td>
                  <td className="text-right py-3 px-4 font-mono text-cyan-400">{algo.latency}</td>
                  <td className="text-right py-3 px-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                      Healthy
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
