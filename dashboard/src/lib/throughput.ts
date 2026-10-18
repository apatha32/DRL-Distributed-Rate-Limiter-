import { useEffect, useRef, useState } from 'react'
import type { Stats } from './api'

/** Per-second rates between two consecutive stats polls. */
export interface ThroughputSample {
  t: number
  allowed: number
  blocked: number
}

export interface TotalsAt {
  at: number
  allowed: number
  blocked: number
}

/**
 * Rate between two counter readings. Returns null for the first reading, for a
 * repeated reading, and when counters went backwards (the API node restarted).
 */
export function nextSample(prev: TotalsAt | null, cur: TotalsAt): ThroughputSample | null {
  if (!prev) return null
  const dt = cur.at - prev.at
  if (dt <= 0) return null
  const allowed = cur.allowed - prev.allowed
  const blocked = cur.blocked - prev.blocked
  if (allowed < 0 || blocked < 0) return null
  return { t: cur.at, allowed: allowed / dt, blocked: blocked / dt }
}

/** Rolling throughput series built from the stats poll (default: last 3 minutes at 2s). */
export function useThroughput(stats: Stats | undefined, maxSamples = 90) {
  const [series, setSeries] = useState<ThroughputSample[]>([])
  const prev = useRef<TotalsAt | null>(null)

  useEffect(() => {
    if (!stats) return
    const cur = { at: stats.generated_at, ...stats.totals }
    if (prev.current?.at === cur.at) return
    const sample = nextSample(prev.current, cur)
    prev.current = cur
    if (sample) setSeries((s) => [...s.slice(-(maxSamples - 1)), sample])
  }, [stats, maxSamples])

  return series
}
