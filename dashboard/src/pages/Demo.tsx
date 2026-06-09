import React, { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw, Zap } from 'lucide-react'

interface RequestEvent {
  id: number
  clientId: string
  algorithm: string
  allowed: boolean
  timestamp: number
  latency: number
}

interface RateLimiterState {
  tokenBucket: number  // Global tokens
  fixedWindow: { count: number; windowStart: number }
  slidingWindow: number[]  // Global timestamps
}

export default function Demo() {
  const [isRunning, setIsRunning] = useState(false)
  const [algorithm, setAlgorithm] = useState<'token-bucket' | 'fixed-window' | 'sliding-window'>('token-bucket')
  const [requestsPerSecond, setRequestsPerSecond] = useState(50)
  const [rateLimit, setRateLimit] = useState(100)
  const [events, setEvents] = useState<RequestEvent[]>([])
  const [stats, setStats] = useState({
    total: 0,
    allowed: 0,
    blocked: 0,
  })
  
  const limiterStateRef = useRef<RateLimiterState>({
    tokenBucket: 0,
    fixedWindow: { count: 0, windowStart: Date.now() },
    slidingWindow: [],
  })

  // Check rate limit based on algorithm (GLOBAL rate limit)
  const checkRateLimit = (now: number): boolean => {
    const state = limiterStateRef.current

    if (algorithm === 'token-bucket') {
      // Token bucket: global refilling bucket
      if (state.tokenBucket >= 1) {
        state.tokenBucket -= 1
        return true
      }
      return false
    }

    if (algorithm === 'fixed-window') {
      // Fixed window: global 1-second window
      const currentWindow = Math.floor(now / 1000)
      const stateWindow = Math.floor(state.fixedWindow.windowStart / 1000)
      
      if (currentWindow !== stateWindow) {
        // New window, reset count
        state.fixedWindow = { count: 1, windowStart: now }
        return true
      }
      
      if (state.fixedWindow.count < rateLimit) {
        state.fixedWindow.count++
        return true
      }
      return false
    }

    if (algorithm === 'sliding-window') {
      // Sliding window: global 1-second window
      const windowStart = now - 1000
      
      // Remove old timestamps outside window
      state.slidingWindow = state.slidingWindow.filter(ts => ts > windowStart)
      
      if (state.slidingWindow.length < rateLimit) {
        state.slidingWindow.push(now)
        return true
      }
      
      return false
    }

    return true
  }

  // Refill tokens for token bucket algorithm
  useEffect(() => {
    if (algorithm !== 'token-bucket' || !isRunning) return

    limiterStateRef.current.tokenBucket = rateLimit // Start with full bucket

    const refillInterval = setInterval(() => {
      const state = limiterStateRef.current
      const tokensToAdd = Math.max(1, Math.ceil(rateLimit / 10)) // Add tokens to maintain rate
      state.tokenBucket = Math.min(rateLimit, state.tokenBucket + tokensToAdd)
    }, 100)

    return () => clearInterval(refillInterval)
  }, [algorithm, isRunning, rateLimit])

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      const now = Date.now()
      const rps = Math.floor(requestsPerSecond / 10)
      const newEvents: RequestEvent[] = []
      let allowedCount = 0
      let blockedCount = 0

      for (let i = 0; i < rps; i++) {
        const clientId = `client_${Math.floor(Math.random() * 5)}`
        const allowed = checkRateLimit(now)
        
        const latency = algorithm === 'fixed-window' ? 0.8 : algorithm === 'token-bucket' ? 1.2 : 2.3
        const jitter = (Math.random() - 0.5) * 0.5

        newEvents.push({
          id: stats.total + i,
          clientId,
          algorithm,
          allowed,
          timestamp: now,
          latency: Math.max(0.1, latency + jitter),
        })

        if (allowed) allowedCount++
        else blockedCount++
      }

      setEvents(prev => [...newEvents, ...prev].slice(0, 50))
      setStats(prev => ({
        total: prev.total + rps,
        allowed: prev.allowed + allowedCount,
        blocked: prev.blocked + blockedCount,
      }))
    }, 100)

    return () => clearInterval(interval)
  }, [isRunning, algorithm, requestsPerSecond, rateLimit])

  const reset = () => {
    setEvents([])
    setStats({ total: 0, allowed: 0, blocked: 0 })
    setIsRunning(false)
    limiterStateRef.current = {
      tokenBucket: 0,
      fixedWindow: { count: 0, windowStart: Date.now() },
      slidingWindow: [],
    }
  }

  const handleAlgorithmChange = (newAlgo: any) => {
    setAlgorithm(newAlgo)
    reset()
  }

  const blockRate = stats.total > 0 ? ((stats.blocked / stats.total) * 100).toFixed(2) : 0
  const avgLatency = events.length > 0 ? (events.reduce((sum, e) => sum + e.latency, 0) / events.length).toFixed(2) : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Interactive Demo</h1>
        <p className="text-slate-400">Simulate rate limiting with different algorithms and parameters</p>
      </div>

      {/* Controls */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-6">Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Algorithm Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Algorithm</label>
            <select
              value={algorithm}
              onChange={(e) => handleAlgorithmChange(e.target.value as any)}
              className="w-full px-4 py-2 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-cyan-500 focus:outline-none transition"
            >
              <option value="token-bucket">Token Bucket</option>
              <option value="fixed-window">Fixed Window</option>
              <option value="sliding-window">Sliding Window</option>
            </select>
          </div>

          {/* Requests Per Second */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Requests/sec: {requestsPerSecond}
            </label>
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={requestsPerSecond}
              onChange={(e) => setRequestsPerSecond(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Rate Limit */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Rate Limit: {rateLimit}
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Controls */}
          <div className="flex items-end space-x-2">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="flex-1 btn-primary flex items-center justify-center space-x-2"
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Start</span>
                </>
              )}
            </button>
            <button
              onClick={reset}
              className="btn-secondary px-4"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <p className="text-slate-400 text-sm font-medium mb-2">Total Requests</p>
          <h3 className="text-3xl font-bold gradient-text">{stats.total.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-2">Processed events</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm font-medium mb-2">Allowed</p>
          <h3 className="text-3xl font-bold text-green-400">{stats.allowed.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-2">
            {stats.total > 0 ? ((stats.allowed / stats.total) * 100).toFixed(2) : 0}% success
          </p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm font-medium mb-2">Blocked</p>
          <h3 className="text-3xl font-bold text-red-400">{stats.blocked.toLocaleString()}</h3>
          <p className="text-sm text-slate-400 mt-2">{blockRate}% blocked</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm font-medium mb-2">Avg Latency</p>
          <h3 className="text-3xl font-bold text-cyan-400">{avgLatency}ms</h3>
          <p className="text-sm text-slate-400 mt-2">Response time</p>
        </div>
      </div>

      {/* Live Event Stream */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
          <Zap className="w-5 h-5 text-cyan-400" />
          <span>Real-time Event Stream</span>
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>Click "Start" to begin the simulation</p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  event.allowed
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-center space-x-4 flex-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      event.allowed ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  ></div>
                  <div className="flex-1">
                    <p className="text-sm font-mono text-slate-300">{event.clientId}</p>
                    <p className="text-xs text-slate-500">{algorithm.replace('-', ' ')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      event.allowed
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {event.allowed ? 'Allowed' : 'Blocked'}
                  </span>
                  <p className="text-xs text-slate-500 mt-1">{event.latency.toFixed(2)}ms</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Algorithm Info */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">
          {algorithm === 'token-bucket'
            ? '🪣 Token Bucket Algorithm'
            : algorithm === 'fixed-window'
            ? '📦 Fixed Window Algorithm'
            : '📊 Sliding Window Algorithm'}
        </h3>
        <p className="text-slate-300 mb-4">
          {algorithm === 'token-bucket'
            ? 'Tokens are added to the bucket at a constant rate. Each request costs tokens. If sufficient tokens exist, request is allowed; otherwise, it is denied. This allows bursts up to the bucket capacity.'
            : algorithm === 'fixed-window'
            ? 'Time is divided into fixed windows (e.g., 1 second). Each window has a counter tracking requests. If count < limit, request is allowed and counter increments. Simple but can have boundary issues.'
            : 'Maintains a sliding window of request timestamps. Counts requests within the window and compares to the limit. Accurate but more memory-intensive. Handles boundary cases better than fixed window.'}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Latency</p>
            <p className="text-xl font-bold text-cyan-400">
              {algorithm === 'token-bucket'
                ? '1.2ms'
                : algorithm === 'fixed-window'
                ? '0.8ms'
                : '2.3ms'}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Complexity</p>
            <p className="text-xl font-bold text-cyan-400">
              {algorithm === 'token-bucket' ? 'O(1)' : algorithm === 'fixed-window' ? 'O(1)' : 'O(N)'}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Memory</p>
            <p className="text-xl font-bold text-cyan-400">
              {algorithm === 'token-bucket'
                ? 'Medium'
                : algorithm === 'fixed-window'
                ? 'Low'
                : 'High'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
