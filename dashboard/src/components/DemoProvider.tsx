import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentKey, api, errorMessage } from '../lib/api'
import { DemoContext, DemoLogEntry, DemoLogKind, useToast } from '../lib/context'
import {
  ClientTally, clientLabel, DEMO_MAX_MINUTES, DEMO_PHASES, DEMO_SUMMARY_EVERY_MS, explainFirstBlock,
  explainFirstRequest, explainLimitChange, summarizeTally,
} from '../lib/demo'
import { STATS_POLL_MS } from '../lib/queries'

const TICK_MS = 100
const MAX_LOG = 80
const now = () => Date.now() / 1000

/**
 * Runs the scripted demo from the browser: sends real checks on a schedule,
 * tallies the answers, and writes a plain-English log. Lives above the router so
 * the demo keeps running while you move between pages.
 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [totals, setTotals] = useState({ sent: 0, allowed: 0, blocked: 0 })
  const [log, setLog] = useState<DemoLogEntry[]>([])

  const nextId = useRef(0)
  const tallies = useRef(new Map<string, ClientTally>())
  const blockedOnce = useRef(new Set<string>())
  const explainedFirst = useRef(false)
  const credit = useRef(new Map<string, number>())
  const knownLimits = useRef(new Map<string, number>())
  const failed = useRef(false)
  const runningRef = useRef(false)

  const add = useCallback((kind: DemoLogKind, title: string, lines: string[]) => {
    const entry = { id: nextId.current++, at: now(), kind, title, lines }
    setLog((l) => [entry, ...l].slice(0, MAX_LOG))
  }, [])

  const stop = useCallback(
    (reason?: string) => {
      if (!runningRef.current) return
      runningRef.current = false
      setRunning(false)
      add('info', 'Demo stopped', [reason ?? 'You stopped the demo. The Overview keeps the data it produced.'])
    },
    [add],
  )

  const start = useCallback(() => {
    tallies.current.clear()
    blockedOnce.current.clear()
    credit.current.clear()
    knownLimits.current.clear()
    explainedFirst.current = false
    failed.current = false
    setTotals({ sent: 0, allowed: 0, blocked: 0 })
    setLog([])
    setPhaseIndex(0)
    setStartedAt(now())
    setPhaseStartedAt(now())
    runningRef.current = true
    setRunning(true)
    const p = DEMO_PHASES[0]
    add('phase', `Phase 1: ${p.title}`, [p.explanation])
  }, [add])

  const send = useCallback(
    async (clientId: string, endpoint: string) => {
      try {
        const r = await api.checkLimit(clientId, endpoint, 1)
        setTotals((t) => ({ sent: t.sent + 1, allowed: t.allowed + (r.allowed ? 1 : 0), blocked: t.blocked + (r.allowed ? 0 : 1) }))
        const key = clientLabel(clientId, endpoint)
        const tally = tallies.current.get(key) ?? { clientId, endpoint, allowed: 0, blocked: 0 }
        tally[r.allowed ? 'allowed' : 'blocked']++
        tally.last = r
        tallies.current.set(key, tally)

        if (!explainedFirst.current) {
          explainedFirst.current = true
          add('first', 'What happens when a request arrives', explainFirstRequest(clientId, endpoint, r))
        }
        if (!r.allowed && !blockedOnce.current.has(key)) {
          blockedOnce.current.add(key)
          add('block', `${key} was blocked`, [explainFirstBlock(clientId, endpoint, r)])
        }
      } catch (err) {
        if (!failed.current && runningRef.current) {
          failed.current = true
          runningRef.current = false
          toast({ variant: 'error', title: 'Demo stopped', description: errorMessage(err) })
          setRunning(false)
          add('error', 'Demo stopped', [`A request failed: ${errorMessage(err)}.`])
        }
      }
    },
    [add, toast],
  )

  // Send traffic: each tick, every client in the phase earns rps * tick of "credit"
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const phase = DEMO_PHASES[phaseIndex]
      for (const c of phase.clients) {
        const key = clientLabel(c.clientId, c.endpoint)
        let balance = (credit.current.get(key) ?? 0) + (c.rps * TICK_MS) / 1000
        while (balance >= 1) {
          balance -= 1
          void send(c.clientId, c.endpoint)
        }
        credit.current.set(key, balance)
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running, phaseIndex, send])

  // Advance phases (looping) and enforce the time limit
  useEffect(() => {
    if (!running || phaseStartedAt == null || startedAt == null) return
    const id = window.setInterval(() => {
      if (now() - startedAt > DEMO_MAX_MINUTES * 60) {
        stop(`The demo stops by itself after ${DEMO_MAX_MINUTES} minutes so it never runs forever in a forgotten tab.`)
        return
      }
      if (now() - phaseStartedAt >= DEMO_PHASES[phaseIndex].seconds) {
        const next = (phaseIndex + 1) % DEMO_PHASES.length
        const p = DEMO_PHASES[next]
        setPhaseIndex(next)
        setPhaseStartedAt(now())
        add('phase', `Phase ${next + 1}: ${p.title}`, [p.explanation])
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [running, phaseIndex, phaseStartedAt, startedAt, add, stop])

  // Every few seconds, summarize what each client experienced
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const lines = [...tallies.current.values()]
        .filter((t) => t.allowed + t.blocked > 0)
        .map(summarizeTally)
      tallies.current.forEach((t) => { t.allowed = 0; t.blocked = 0 })
      if (lines.length) add('summary', 'Last 5 seconds', lines)
    }, DEMO_SUMMARY_EVERY_MS)
    return () => window.clearInterval(id)
  }, [running, add])

  // Watch the RL agent: narrate when it moves a demo client's limit
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: STATS_POLL_MS,
    enabled: running,
  })
  useEffect(() => {
    if (!running || !stats?.rl_enabled) return
    for (const c of stats.clients) {
      const key = agentKey(c.client_id, c.endpoint)
      const before = knownLimits.current.get(key)
      knownLimits.current.set(key, c.effective_limit)
      const inDemo = DEMO_PHASES.some((p) => p.clients.some((d) => d.clientId === c.client_id && d.endpoint === c.endpoint))
      if (before === undefined || before === c.effective_limit || !inDemo) continue
      const to = c.effective_limit
      api.rlDiagnostics(key)
        .then((d) => {
          const last = d.recent_decisions?.[d.recent_decisions.length - 1]
          add('rl', 'The RL agent adjusted a limit', [
            explainLimitChange(key, before, to, last && { rps: last.rps, block_ratio: last.block_ratio, action: last.action }),
          ])
        })
        .catch(() => add('rl', 'The RL agent adjusted a limit', [explainLimitChange(key, before, to)]))
    }
  }, [stats, running, add])

  const value = useMemo(
    () => ({ running, phaseIndex, phaseStartedAt, startedAt, ...totals, log, start, stop }),
    [running, phaseIndex, phaseStartedAt, startedAt, totals, log, start, stop],
  )
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}
