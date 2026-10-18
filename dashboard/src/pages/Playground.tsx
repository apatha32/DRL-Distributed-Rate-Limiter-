import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, CheckCircle2, Pause, Play, RotateCcw, Send, Zap } from 'lucide-react'
import clsx from 'clsx'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '../components/ChartTooltip'
import { AnimatedNumber } from '../components/numbers'
import {
  Card, CardHeader, ChartReveal, Chip, EmptyState, Legend, Meter, PageHeader, Segmented, Stagger, StaggerItem,
} from '../components/ui'
import { algorithmById, algorithmName } from '../lib/algorithms'
import { api, CheckResult, errorMessage } from '../lib/api'
import { useToast } from '../lib/context'
import { clockTime, integer, ms } from '../lib/format'
import { axisTick, color, ease } from '../lib/theme'

interface Decision extends CheckResult {
  id: number
  at: number
  clientId: string
  endpoint: string
}

const PRESETS = [
  { label: 'client_b', clientId: 'client_b', endpoint: 'global', hint: '50 / min' },
  { label: 'client_a /login', clientId: 'client_a', endpoint: 'login', hint: '20 / min' },
  { label: 'playground', clientId: 'playground', endpoint: 'global', hint: 'default 100 / min' },
]

const MAX_FEED = 60
const MAX_STREAM_RPS = 20
const CHART_SECONDS = 60

interface HistoryPoint {
  t: number // seconds since the session's first request
  allowed: boolean
  remaining: number
}

function SessionCharts({ history }: { history: HistoryPoint[] }) {
  const perSecond = useMemo(() => {
    if (!history.length) return []
    const last = Math.floor(history[history.length - 1].t)
    const first = Math.max(0, last - CHART_SECONDS + 1)
    const buckets = Array.from({ length: last - first + 1 }, (_, i) => ({ s: first + i, allowed: 0, blocked: 0 }))
    for (const h of history) {
      const b = buckets[Math.floor(h.t) - first]
      if (b) b[h.allowed ? 'allowed' : 'blocked']++
    }
    return buckets
  }, [history])
  const quota = useMemo(() => history.slice(-300).map((h) => ({ t: h.t, remaining: h.remaining })), [history])
  const seconds = (v: number) => `${Math.round(v)}s`

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Decisions per second" subtitle="This session"
          actions={<Legend items={[{ label: 'Allowed', color: color.series1 }, { label: 'Blocked', color: color.series2 }]} />} />
        <div className="h-56 px-2 pb-3 pt-2">
          <ChartReveal>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perSecond} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={color.grid} />
                <XAxis dataKey="s" tickFormatter={seconds} tick={axisTick} tickLine={false} axisLine={{ stroke: color.axis }} minTickGap={32} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  content={<ChartTooltip labelFormatter={(v) => `Second ${v}`} valueFormatter={(v) => String(v)} />} />
                <Bar dataKey="allowed" name="Allowed" stackId="d" fill={color.series1} maxBarSize={24} isAnimationActive={false} />
                <Bar dataKey="blocked" name="Blocked" stackId="d" fill={color.series2} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartReveal>
        </div>
      </Card>
      <Card>
        <CardHeader title="Remaining quota" subtitle="After each decision, from the response" />
        <div className="h-56 px-2 pb-3 pt-2">
          <ChartReveal>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={quota} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={color.grid} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={seconds} tick={axisTick}
                  tickLine={false} axisLine={{ stroke: color.axis }} minTickGap={32} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} allowDecimals={false} domain={[0, 'auto']} />
                <Tooltip cursor={{ stroke: color.axis }}
                  content={<ChartTooltip labelFormatter={(v) => `${v.toFixed(1)}s`} valueFormatter={(v) => `${v} left`} />} />
                <Line dataKey="remaining" name="Remaining" type="stepAfter" stroke={color.series1} strokeWidth={2}
                  dot={false} activeDot={{ r: 4, stroke: color.surface, strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartReveal>
        </div>
      </Card>
    </div>
  )
}

type Mode = 'burst' | 'stream'

export default function Playground() {
  const toast = useToast()
  const [clientId, setClientId] = useState('client_b')
  const [endpoint, setEndpoint] = useState('global')
  const [cost, setCost] = useState(1)
  const [mode, setMode] = useState<Mode>('burst')
  const [burst, setBurst] = useState(20)
  const [streamRps, setStreamRps] = useState(5)
  const [streaming, setStreaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feed, setFeed] = useState<Decision[]>([])
  const [counts, setCounts] = useState({ allowed: 0, blocked: 0, rttTotal: 0 })
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const sessionStart = useRef<number | null>(null)

  const nextId = useRef(0)
  const lastError = useRef(0)
  const params = useRef({ clientId, endpoint, cost })
  params.current = { clientId, endpoint, cost }

  const fire = useCallback(async () => {
    const { clientId, endpoint, cost } = params.current
    try {
      const result = await api.checkLimit(clientId, endpoint, cost)
      const decision = { ...result, id: nextId.current++, at: Date.now() / 1000, clientId, endpoint }
      setFeed((f) => [decision, ...f].slice(0, MAX_FEED))
      sessionStart.current ??= decision.at
      const point = { t: decision.at - sessionStart.current, allowed: result.allowed, remaining: result.remaining }
      setHistory((h) => [...h, point].slice(-2000))
      setCounts((c) => ({
        allowed: c.allowed + (result.allowed ? 1 : 0),
        blocked: c.blocked + (result.allowed ? 0 : 1),
        rttTotal: c.rttTotal + result.rttMs,
      }))
    } catch (err) {
      setStreaming(false)
      // One toast per burst, not one per failed request
      if (Date.now() - lastError.current > 3000) {
        lastError.current = Date.now()
        toast({ variant: 'error', title: 'Request failed', description: errorMessage(err) })
      }
    }
  }, [toast])

  const sendBurst = async (n: number) => {
    setBusy(true)
    await Promise.all(Array.from({ length: n }, fire))
    setBusy(false)
  }

  useEffect(() => {
    if (!streaming) return
    const id = window.setInterval(fire, 1000 / streamRps)
    return () => window.clearInterval(id)
  }, [streaming, streamRps, fire])

  const reset = () => {
    setStreaming(false)
    setFeed([])
    setHistory([])
    sessionStart.current = null
    setCounts({ allowed: 0, blocked: 0, rttTotal: 0 })
  }

  const sent = counts.allowed + counts.blocked
  const latest = feed[0]
  const strip = feed.slice(0, 48).reverse()

  const latestAlgo = algorithmById(latest?.algorithm)

  return (
    <Stagger className="space-y-6">
      <StaggerItem>
      <PageHeader
        title="Playground"
        description="Send real requests to the rate limiter and watch each decision come back. This traffic shows up on the Overview and trains the RL agent like any other client."
      />
      </StaggerItem>

      <StaggerItem>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Controls */}
        <Card className="h-fit">
          <CardHeader title="Request" subtitle="Who is calling, and how much it costs" />
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = p.clientId === clientId && p.endpoint === endpoint
                return (
                  <button
                    key={p.label}
                    onClick={() => { setClientId(p.clientId); setEndpoint(p.endpoint) }}
                    className={clsx(
                      'rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                      active ? 'border-accent/60 bg-accent/10 text-ink' : 'border-white/10 text-ink-2 hover:border-white/20',
                    )}
                  >
                    <span className="font-mono">{p.label}</span>
                    <span className="ml-1.5 text-muted">{p.hint}</span>
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="label">Client ID</span>
                <input className="input font-mono" value={clientId} maxLength={128}
                  onChange={(e) => setClientId(e.target.value.replace(/[^A-Za-z0-9_.:@/-]/g, ''))} />
              </label>
              <label className="space-y-1.5">
                <span className="label">Endpoint</span>
                <input className="input font-mono" value={endpoint} maxLength={128}
                  onChange={(e) => setEndpoint(e.target.value.replace(/[^A-Za-z0-9_.:@/-]/g, '') || 'global')} />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="flex justify-between label"><span>Cost per request</span><span className="tabular text-ink-2">{cost}</span></span>
              <input type="range" min={1} max={10} value={cost} onChange={(e) => setCost(Number(e.target.value))} className="w-full" />
            </label>

            <div className="space-y-3 border-t border-white/10 pt-5">
              <Segmented<Mode>
                label="Traffic mode"
                value={mode}
                onChange={(m) => { setMode(m); setStreaming(false) }}
                options={[{ value: 'burst', label: 'Burst' }, { value: 'stream', label: 'Stream' }]}
              />
              <AnimatePresence mode="wait" initial={false}>
                {mode === 'burst' ? (
                  <motion.div key="burst" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="space-y-3">
                    <label className="block space-y-1.5">
                      <span className="flex justify-between label"><span>Requests in burst</span><span className="tabular text-ink-2">{burst}</span></span>
                      <input type="range" min={1} max={100} value={burst} onChange={(e) => setBurst(Number(e.target.value))} className="w-full" />
                    </label>
                    <div className="flex gap-2">
                      <button className="btn-ghost flex-1" onClick={() => sendBurst(1)} disabled={busy}>
                        <Send className="h-4 w-4" /> Send 1
                      </button>
                      <button className="btn-primary flex-1" onClick={() => sendBurst(burst)} disabled={busy}>
                        <Zap className="h-4 w-4" /> Burst {burst}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="stream" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="space-y-3">
                    <label className="block space-y-1.5">
                      <span className="flex justify-between label"><span>Requests per second</span><span className="tabular text-ink-2">{streamRps}</span></span>
                      <input type="range" min={1} max={MAX_STREAM_RPS} value={streamRps} onChange={(e) => setStreamRps(Number(e.target.value))} className="w-full" />
                    </label>
                    <button className={streaming ? 'btn-ghost w-full' : 'btn-primary w-full'} onClick={() => setStreaming((s) => !s)}>
                      {streaming ? <><Pause className="h-4 w-4" /> Stop stream</> : <><Play className="h-4 w-4" /> Start stream</>}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Sent', value: sent, fmt: (n: number) => integer(Math.round(n)) },
              { label: 'Allowed', value: counts.allowed, fmt: (n: number) => integer(Math.round(n)) },
              { label: 'Blocked (429)', value: counts.blocked, fmt: (n: number) => integer(Math.round(n)) },
              { label: 'Avg round trip', value: sent ? counts.rttTotal / sent : 0, fmt: (n: number) => ms(n) },
            ].map((t) => (
              <div key={t.label} className="card p-4">
                <p className="label">{t.label}</p>
                <AnimatedNumber value={t.value} format={t.fmt} className="mt-1.5 block text-xl font-semibold text-ink" />
              </div>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Remaining quota"
              subtitle={latest ? `${latest.clientId}${latest.endpoint !== 'global' ? ` /${latest.endpoint}` : ''} · limit ${latest.limit} per ${latest.window}s` : 'From the X-RateLimit headers of the latest response'}
              actions={latest && (
                <span className="flex items-center gap-3">
                  {latestAlgo && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: latestAlgo.color }} aria-hidden />
                      {latestAlgo.name}
                    </span>
                  )}
                  <span className="tabular text-sm text-ink">
                    {latest.remaining} <span className="text-muted">/ {latest.limit}</span>
                  </span>
                </span>
              )}
            />
            <div className="space-y-4 p-5 pt-4">
              <Meter value={latest ? latest.remaining / Math.max(1, latest.limit) : 0} severity="accent" label="Remaining quota" />
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label">Last {strip.length || 48} decisions</span>
                  <Legend items={[{ label: 'Allowed', color: color.series1 }, { label: 'Blocked', color: color.series2 }]} />
                </div>
                <div className="flex h-10 items-end gap-0.5" aria-hidden>
                  <AnimatePresence initial={false}>
                    {strip.map((d) => (
                      <motion.span
                        key={d.id}
                        layout
                        initial={{ opacity: 0, scaleY: 0 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease }}
                        className="h-full w-1.5 origin-bottom rounded-t-sm"
                        style={{ backgroundColor: d.allowed ? color.series1 : color.series2, height: d.allowed ? '100%' : '55%' }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </Card>

          <AnimatePresence initial={false}>
            {history.length > 0 && (
              <motion.div key="charts" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }} className="overflow-hidden">
                <SessionCharts history={history} />
              </motion.div>
            )}
          </AnimatePresence>

          <Card>
            <CardHeader
              title="Decisions"
              subtitle="Newest first"
              actions={feed.length > 0 && (
                <button className="btn-ghost px-2.5 py-1 text-xs" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            />
            {feed.length === 0 ? (
              <EmptyState icon={Send} title="No requests yet" description="Pick a client and send a burst. Bursts larger than the limit will start returning 429." />
            ) : (
              <ul className="mt-3 max-h-[420px] divide-y divide-white/5 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {feed.map((d) => (
                    <motion.li
                      key={d.id}
                      layout="position"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease }}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5 text-xs"
                    >
                      {d.allowed ? (
                        <span className="inline-flex w-24 items-center gap-1.5 text-ink"><CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden />200 Allowed</span>
                      ) : (
                        <span className="inline-flex w-24 items-center gap-1.5 text-ink"><Ban className="h-3.5 w-3.5 text-critical" aria-hidden />429 Blocked</span>
                      )}
                      <span className="flex min-w-0 items-center gap-2 truncate text-ink-2">
                        <Chip>{algorithmName(d.algorithm)}</Chip>
                        <span className="font-mono">{d.clientId}{d.endpoint !== 'global' && `/${d.endpoint}`}</span>
                        <span className="text-muted"> · {d.remaining}/{d.limit} left</span>
                        {!d.allowed && <span className="text-muted"> · retry in {Math.ceil(d.retryAfterMs / 1000)}s</span>}
                      </span>
                      <span className="tabular text-muted">{ms(d.rttMs)} · {clockTime(d.at)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>
        </div>
      </div>
      </StaggerItem>
    </Stagger>
  )
}
