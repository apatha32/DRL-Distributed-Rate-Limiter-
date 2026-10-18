import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Check, Flag, Loader2, Minus, Play } from 'lucide-react'
import clsx from 'clsx'
import { AlgorithmGlyph } from '../components/AlgorithmGlyph'
import { ChartTooltip } from '../components/ChartTooltip'
import {
  Card, CardHeader, ChartReveal, Chip, EmptyState, Legend, PageHeader, Segmented, Stagger, StaggerItem,
} from '../components/ui'
import { AlgorithmId, ALGORITHMS, peakPerWindow, RACE_PATTERNS, RacePattern, raceSchedule } from '../lib/algorithms'
import { api, errorMessage } from '../lib/api'
import { useToast } from '../lib/context'
import { useStats } from '../lib/queries'
import { axisTick, color, ease } from '../lib/theme'

interface RaceResult {
  t: number // seconds since the race started
  algorithm: AlgorithmId
  allowed: boolean
}

const newSessionId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32)

function AlgorithmRace() {
  const toast = useToast()
  const [rate, setRate] = useState('10')
  const [windowSec, setWindowSec] = useState('10')
  const [pattern, setPattern] = useState<RacePattern>('boundary')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<RaceResult[]>([])
  const [ran, setRan] = useState<{ rate: number; window: number } | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const run = async () => {
    const r = Number(rate)
    const w = Number(windowSec)
    setRunning(true)
    setResults([])
    setProgress(0)
    setRan({ rate: r, window: w })

    let msToBoundary = 0
    if (pattern === 'boundary') {
      // Align to the server's clock: Fixed Window boundaries are server-time aligned
      try {
        const sent = Date.now()
        const s = await api.stats()
        const serverNow = s.generated_at * 1000 + (Date.now() - sent) / 2
        msToBoundary = w * 1000 - (serverNow % (w * 1000))
      } catch (err) {
        toast({ variant: 'error', title: "Couldn't start the race", description: errorMessage(err) })
        setRunning(false)
        return
      }
    }

    const schedule = raceSchedule(pattern, r, w, msToBoundary)
    const end = schedule[schedule.length - 1]
    const session = newSessionId()
    const started = performance.now()
    let failed = false
    let outstanding = schedule.length

    timers.current = schedule.map((at) =>
      window.setTimeout(async () => {
        try {
          const decisions = await Promise.all(ALGORITHMS.map((a) => api.sandboxCheck(a.id, session, r, w)))
          const t = (performance.now() - started) / 1000
          setResults((prev) => [...prev, ...decisions.map((d, i) => ({ t, algorithm: ALGORITHMS[i].id, allowed: d.allowed }))])
        } catch (err) {
          if (!failed) {
            failed = true
            timers.current.forEach(clearTimeout)
            toast({ variant: 'error', title: 'Race stopped', description: errorMessage(err) })
            setRunning(false)
          }
        } finally {
          setProgress(Math.min(1, at / end))
          if (--outstanding === 0 && !failed) setRunning(false)
        }
      }, at),
    )
  }

  const { points, summary } = useMemo(() => {
    const sorted = [...results].sort((a, b) => a.t - b.t)
    const cumulative = Object.fromEntries(ALGORITHMS.map((a) => [a.id, 0])) as Record<AlgorithmId, number>
    const pts: Record<string, number>[] = [{ t: 0, ...cumulative }]
    for (const res of sorted) {
      if (res.allowed) cumulative[res.algorithm]++
      const last = pts[pts.length - 1]
      if (last.t === res.t) Object.assign(last, cumulative)
      else pts.push({ t: res.t, ...cumulative })
    }
    const summary = ALGORITHMS.map((a) => {
      const mine = results.filter((x) => x.algorithm === a.id)
      const allowedTimes = mine.filter((x) => x.allowed).map((x) => x.t)
      return {
        ...a,
        allowed: allowedTimes.length,
        blocked: mine.length - allowedTimes.length,
        peak: ran ? peakPerWindow(allowedTimes, ran.window) : 0,
      }
    })
    return { points: pts, summary }
  }, [results, ran])

  const patternInfo = RACE_PATTERNS.find((p) => p.value === pattern)!

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Flag className="h-4 w-4 text-accent" aria-hidden />Live algorithm race</span>}
        subtitle="The same traffic hits all four algorithms at once, on the real limiter in an isolated sandbox."
      />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <span className="label block">Traffic pattern</span>
            <Segmented<RacePattern> label="Traffic pattern" value={pattern} onChange={setPattern}
              options={RACE_PATTERNS.map(({ value, label }) => ({ value, label }))} />
          </div>
          <label className="space-y-1.5">
            <span className="label block">Limit</span>
            <select className="input w-auto" value={rate} onChange={(e) => setRate(e.target.value)} disabled={running}>
              {['5', '10', '20'].map((v) => <option key={v} value={v}>{v} requests</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="label block">Per window</span>
            <select className="input w-auto" value={windowSec} onChange={(e) => setWindowSec(e.target.value)} disabled={running}>
              {['5', '10'].map((v) => <option key={v} value={v}>{v} seconds</option>)}
            </select>
          </label>
          <button className="btn-primary ml-auto" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Racing…' : 'Start race'}
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={pattern} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }} className="text-xs text-ink-2">
            {patternInfo.description}
          </motion.p>
        </AnimatePresence>

        <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <motion.div className="h-full bg-accent" animate={{ width: `${(running || results.length ? progress : 0) * 100}%` }}
            transition={{ duration: 0.3, ease }} />
        </div>

        {results.length === 0 && !running ? (
          <EmptyState icon={Flag} title="Pick a pattern and start the race"
            description="Window boundary is the most dramatic: Fixed Window admits twice the limit in about a second." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted">Requests admitted so far</span>
              <Legend items={ALGORITHMS.map((a) => ({ label: a.name, color: a.color }))} />
            </div>
            <div className="h-72">
              <ChartReveal>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={color.grid} />
                    <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tick={axisTick} tickLine={false}
                      axisLine={{ stroke: color.axis }} tickFormatter={(v: number) => `${Math.round(v)}s`} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip cursor={{ stroke: color.axis }}
                      content={<ChartTooltip labelFormatter={(v) => `${v.toFixed(1)}s`} valueFormatter={(v) => `${v} admitted`} />} />
                    {ALGORITHMS.map((a) => (
                      <Line key={a.id} dataKey={a.id} name={a.name} type="stepAfter" stroke={a.color} strokeWidth={2}
                        dot={false} activeDot={{ r: 4, stroke: color.surface, strokeWidth: 2 }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartReveal>
            </div>

            <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.map((s) => (
                <StaggerItem key={s.id}>
                  <div className="rounded-lg border border-white/10 bg-page/60 p-4">
                    <p className="flex items-center gap-2 text-xs text-ink-2">
                      <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                      {s.name}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-ink tabular">{s.allowed}<span className="ml-1 text-sm font-normal text-muted">admitted</span></p>
                    <p className="mt-1 text-xs text-ink-2 tabular">
                      {s.blocked} blocked · peak {s.peak} in any {ran?.window}s
                      {ran && s.peak > ran.rate && <span className="ml-1 text-ink">({(s.peak / ran.rate).toFixed(1)}× limit)</span>}
                    </p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </>
        )}
      </div>
    </Card>
  )
}

function Yes({ v }: { v: boolean }) {
  return v
    ? <span className="inline-flex items-center gap-1 text-ink"><Check className="h-3.5 w-3.5 text-ink-2" aria-hidden />Yes</span>
    : <span className="inline-flex items-center gap-1 text-ink-2"><Minus className="h-3.5 w-3.5" aria-hidden />No</span>
}

export default function Algorithms() {
  const { data: stats } = useStats()
  const [selectedId, setSelectedId] = useState<AlgorithmId>('token_bucket')
  useEffect(() => {
    if (stats?.algorithm) setSelectedId(stats.algorithm as AlgorithmId)
  }, [stats?.algorithm])
  const selected = ALGORITHMS.find((a) => a.id === selectedId)!

  return (
    <Stagger className="space-y-6">
      <StaggerItem>
        <PageHeader
          title="Algorithms"
          description="Every algorithm is one Redis Lua script: read, decide and write happen atomically in a single round trip, using the Redis server clock."
        />
      </StaggerItem>

      <StaggerItem>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ALGORITHMS.map((a) => {
            const active = stats?.algorithm === a.id
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                aria-pressed={a.id === selectedId}
                className={clsx('card-interactive relative h-full w-full p-5 text-left', a.id === selectedId && 'border-accent/60')}
              >
                {a.id === selectedId && (
                  <motion.span layoutId="algo-selected" className="absolute inset-0 rounded-xl bg-accent/[0.06]"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }} />
                )}
                <span className="relative flex items-start gap-4">
                  <AlgorithmGlyph id={a.id} color={a.color} size={48} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{a.name}</span>
                      {active && <Chip>Active</Chip>}
                    </span>
                    <span className="mt-1 block text-xs text-ink-2">{a.summary}</span>
                    <span className="mt-2 block text-xs text-muted tabular">p50 {a.p50.toFixed(3)} ms</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </StaggerItem>

      <StaggerItem>
        <AlgorithmRace />
      </StaggerItem>

      <StaggerItem>
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div key={selected.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22, ease }}>
                <CardHeader title={selected.name} subtitle="Lua script, simplified"
                  actions={stats?.algorithm === selected.id && <Chip>Running on this API</Chip>} />
                <div className="space-y-5 p-5">
                  <pre className="overflow-x-auto rounded-lg border border-white/10 bg-page p-4 font-mono text-xs leading-relaxed text-ink-2"><code>{selected.code}</code></pre>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="label mb-2">Strengths</p>
                      <ul className="space-y-1.5 text-ink-2">{selected.pros.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" aria-hidden />{p}</li>)}</ul>
                    </div>
                    <div>
                      <p className="label mb-2">Trade-offs</p>
                      <ul className="space-y-1.5 text-ink-2">{selected.cons.map((c) => <li key={c} className="flex gap-2"><Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />{c}</li>)}</ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Decision latency, p50" subtitle="One check against Redis 7 (lower is better)" />
            <div className="h-64 px-2 pb-3 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ALGORITHMS} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke={color.grid} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: color.axis }} domain={[0, 0.12]}
                    tickFormatter={(v: number) => v.toFixed(2)} />
                  <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: color.ink2 }} tickLine={false} axisLine={false} width={104} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(3)} ms`} />} />
                  <Bar dataKey="p50" name="p50" fill={color.series1} maxBarSize={20} radius={[0, 4, 4, 0]}
                    animationDuration={900} animationEasing="ease-out">
                    <LabelList dataKey="p50" position="right" formatter={(v: number) => v.toFixed(3)} fill={color.ink2} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader title="Comparison" />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium"></th>
                  {ALGORITHMS.map((a) => <th key={a.id} className="px-3 py-2.5 font-medium">{a.name}</th>)}
                </tr>
              </thead>
              <tbody className="tabular">
                {[
                  { label: 'p50 / p99', render: (a: typeof selected) => <span className="text-ink">{a.p50.toFixed(3)} / {a.p99.toFixed(3)} ms</span> },
                  { label: 'State per client', render: (a: typeof selected) => <span className="text-ink-2">{a.state}</span> },
                  { label: 'Allows bursts', render: (a: typeof selected) => <Yes v={a.bursts} /> },
                  { label: 'Boundary spikes', render: (a: typeof selected) => <Yes v={a.boundary} /> },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-xs text-muted">{row.label}</td>
                    {ALGORITHMS.map((a) => <td key={a.id} className="px-3 py-3">{row.render(a)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </StaggerItem>
    </Stagger>
  )
}
