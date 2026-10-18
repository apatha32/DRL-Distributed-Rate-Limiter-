/**
 * The four limiter algorithms. Colors follow the algorithm everywhere (fixed
 * categorical order, validated as a 4-slot set on the dark surface); latencies
 * come from scripts/benchmark.py (async client, 20K checks, Redis 7).
 */
export type AlgorithmId = 'token_bucket' | 'leaky_bucket' | 'fixed_window' | 'sliding_window'

export interface AlgorithmInfo {
  id: AlgorithmId
  name: string
  color: string
  summary: string
  pros: string[]
  cons: string[]
  p50: number
  p95: number
  p99: number
  state: string
  bursts: boolean
  boundary: boolean
  code: string
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'token_bucket',
    name: 'Token Bucket',
    color: '#3987e5',
    summary: 'A bucket of tokens refills continuously; each request spends tokens.',
    pros: ['Absorbs bursts up to the bucket size', 'Smooth continuous refill', 'One small hash per client'],
    cons: ['Short bursts can exceed the average rate'],
    p50: 0.098, p95: 0.142, p99: 0.286, state: '1 hash', bursts: true, boundary: false,
    code: `local tokens, ts = HMGET(key, 'tokens', 'ts')
tokens = min(capacity, tokens + (now - ts) * refill_per_ms)
if tokens >= cost then
  tokens = tokens - cost; allowed = 1
else
  retry_ms = ceil((cost - tokens) / refill_per_ms)
end
HSET(key, 'tokens', tokens, 'ts', now)`,
  },
  {
    id: 'leaky_bucket',
    name: 'Leaky Bucket',
    color: '#d95926',
    summary: 'Requests pour into a bucket that drains at a constant rate; overflow is rejected.',
    pros: ['Smooth, constant outflow', 'Protects fragile backends', 'One small hash per client'],
    cons: ['Less tolerant of legitimate spikes'],
    p50: 0.097, p95: 0.111, p99: 0.131, state: '1 hash', bursts: true, boundary: false,
    code: `local level, ts = HMGET(key, 'level', 'ts')
level = max(0, level - (now - ts) * leak_per_ms)
if level + cost <= capacity then
  level = level + cost; allowed = 1
else
  retry_ms = ceil((level + cost - capacity) / leak_per_ms)
end
HSET(key, 'level', level, 'ts', now)`,
  },
  {
    id: 'fixed_window',
    name: 'Fixed Window',
    color: '#199e70',
    summary: 'One counter per aligned time window, reset at each boundary.',
    pros: ['Simplest and cheapest', 'Easy to reason about'],
    cons: ['Up to 2× the rate across a window boundary'],
    p50: 0.096, p95: 0.110, p99: 0.130, state: '1 hash', bursts: true, boundary: true,
    code: `local win_start = now - (now % window_ms)
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
    id: 'sliding_window',
    name: 'Sliding Window',
    color: '#c98500',
    summary: 'A sorted-set log of request timestamps, counted over a true rolling window.',
    pros: ['Exact enforcement', 'No boundary spikes', 'Rejected requests cost nothing'],
    cons: ['Memory grows with request rate'],
    p50: 0.101, p95: 0.118, p99: 0.171, state: 'sorted set', bursts: false, boundary: false,
    code: `ZREMRANGEBYSCORE(key, '-inf', now - window_ms)
local count = ZCARD(key)
if count + cost <= rate then
  ZADD(key, now, nonce)   -- once per unit of cost
  allowed = 1
else
  retry_ms = oldest_needed + window_ms - now
end`,
  },
]

export const algorithmById = (id: string | undefined) => ALGORITHMS.find((a) => a.id === id)

export const algorithmName = (id: string | undefined) => algorithmById(id)?.name ?? id ?? '—'

// ---- Race schedules -----------------------------------------------------------

export type RacePattern = 'burst' | 'steady' | 'boundary'

export const RACE_PATTERNS: { value: RacePattern; label: string; description: string }[] = [
  { value: 'burst', label: 'Burst', description: 'Twice the limit at once, then a light trickle. Shows how much each algorithm lets a spike through.' },
  { value: 'steady', label: 'Steady overload', description: 'A constant stream at twice the allowed rate. Shows the long-run rate each algorithm admits.' },
  { value: 'boundary', label: 'Window boundary', description: 'A full limit just before a window boundary and another just after. Fixed Window lets both through.' },
]

/**
 * Send times in ms from the start of the race. For `boundary`, `msToBoundary` is
 * how long until the next aligned window boundary on the server's clock.
 */
export function raceSchedule(pattern: RacePattern, rate: number, windowSec: number, msToBoundary = 0): number[] {
  const windowMs = windowSec * 1000
  const duration = 2 * windowMs + 2000
  const times: number[] = []
  const spaced = (start: number, count: number, gap: number) => {
    for (let i = 0; i < count; i++) times.push(start + i * gap)
  }

  if (pattern === 'burst') {
    spaced(0, rate * 2, 25)
    const trickleGap = (windowMs / rate) * 2
    for (let t = rate * 2 * 25 + trickleGap; t < duration; t += trickleGap) times.push(t)
  } else if (pattern === 'steady') {
    const gap = windowMs / (rate * 2)
    for (let t = 0; t < duration; t += gap) times.push(t)
  } else {
    // Line the two bursts up around the first boundary at least 1.5s away
    const boundary = msToBoundary >= 1500 ? msToBoundary : msToBoundary + windowMs
    spaced(boundary - 900, rate, 30)
    spaced(boundary + 200, rate, 30)
    const trickleGap = (windowMs / rate) * 2
    for (let t = boundary + 200 + rate * 30 + trickleGap; t < boundary + windowMs + 1500; t += trickleGap) times.push(t)
  }
  return times.map(Math.round).sort((a, b) => a - b)
}

/** Most requests admitted inside any sliding window of `windowSec` (shows boundary spikes). */
export function peakPerWindow(times: number[], windowSec: number) {
  const sorted = [...times].sort((a, b) => a - b)
  let best = 0
  for (let i = 0, j = 0; j < sorted.length; j++) {
    while (sorted[j] - sorted[i] >= windowSec) i++
    best = Math.max(best, j - i + 1)
  }
  return best
}
