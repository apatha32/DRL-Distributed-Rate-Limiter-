import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowRight, ArrowUpRight, PlugZap, Radar } from 'lucide-react'
import { AlgorithmGlyph } from '../components/AlgorithmGlyph'
import { DemoPanel } from '../components/DemoPanel'
import { ChartTooltip } from '../components/ChartTooltip'
import { StatTile } from '../components/numbers'
import {
  Card, CardHeader, ChartReveal, Chip, EmptyState, Legend, Meter, PageHeader, Skeleton, Stagger, StaggerItem, Status, StatusPill,
} from '../components/ui'
import { algorithmById } from '../lib/algorithms'
import { agentKey, ClientStat, errorMessage, Stats } from '../lib/api'
import { clockTime, compact, duration, integer, ms, percent, rate, ratio } from '../lib/format'
import { useHealth, useStats } from '../lib/queries'
import { axisTick, color, ease } from '../lib/theme'
import { ThroughputSample, useThroughput } from '../lib/throughput'

const BREAKER: Record<Stats['circuit_breaker'], [Status, string]> = {
  closed: ['good', 'Closed'],
  half_open: ['warning', 'Half-open'],
  open: ['critical', 'Open'],
}

function StatusStrip({ stats }: { stats: Stats | undefined }) {
  const health = useHealth()
  const redisOk = health.data?.redis_available
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill
        status={health.isError ? 'critical' : health.data ? 'good' : 'neutral'}
        label="API"
        detail={health.isError ? 'unreachable' : health.data ? 'healthy' : 'checking'}
      />
      <StatusPill
        status={redisOk === undefined ? 'neutral' : redisOk ? 'good' : 'critical'}
        label="Redis"
        detail={health.isError ? 'unknown' : redisOk === undefined ? 'checking' : redisOk ? 'connected' : 'down'}
      />
      {stats && (
        <>
          <StatusPill status={BREAKER[stats.circuit_breaker][0]} label="Circuit breaker" detail={BREAKER[stats.circuit_breaker][1]} />
          <Chip mono>{stats.algorithm}</Chip>
          <Chip>{stats.rl_enabled ? `RL on · every ${stats.rl_update_interval_sec}s` : 'RL off'}</Chip>
          <Chip>fail {stats.fail_mode}</Chip>
          <Chip>up {duration(stats.uptime_sec)}</Chip>
        </>
      )}
    </div>
  )
}

function ThroughputChart({ series }: { series: ThroughputSample[] }) {
  return (
    <Card className="h-full">
      <CardHeader
        title="Throughput"
        subtitle="Decisions per second, since this page opened"
        actions={
          <Legend items={[{ label: 'Allowed', color: color.series1 }, { label: 'Blocked (429)', color: color.series2 }]} />
        }
      />
      <div className="h-72 px-2 pb-3 pt-4">
        {series.length < 2 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted">
            <Skeleton className="h-full w-full" />
            <span>Collecting samples…</span>
          </div>
        ) : (
          <ChartReveal>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={color.grid} />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={clockTime}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: color.axis }}
                minTickGap={56}
              />
              <YAxis tickFormatter={(v: number) => compact(v)} tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                cursor={{ stroke: color.axis }}
                content={<ChartTooltip labelFormatter={clockTime} valueFormatter={(v) => `${rate(v)}/s`} />}
              />
              {(['allowed', 'blocked'] as const).map((key) => {
                const stroke = key === 'allowed' ? color.series1 : color.series2
                return (
                  <Area
                    key={key}
                    dataKey={key}
                    name={key === 'allowed' ? 'Allowed' : 'Blocked'}
                    stackId="decisions"
                    type="monotone"
                    stroke={stroke}
                    strokeWidth={2}
                    fill={stroke}
                    fillOpacity={0.1}
                    isAnimationActive={false}
                    activeDot={{ r: 4, stroke: color.surface, strokeWidth: 2 }}
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
          </ChartReveal>
        )}
      </div>
    </Card>
  )
}

function ActiveAlgorithm({ stats }: { stats: Stats | undefined }) {
  const algo = algorithmById(stats?.algorithm)
  if (!stats || !algo) return <Skeleton className="h-28" />
  return (
    <Link to="/algorithms" className="card-interactive group flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <AlgorithmGlyph id={algo.id} color={algo.color} size={64} />
      <div className="min-w-0 flex-1">
        <p className="label">Active algorithm</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{algo.name}</p>
        <p className="mt-1 text-ink-2">{algo.summary}</p>
      </div>
      <div className="flex shrink-0 items-center gap-6 sm:text-right">
        <div>
          <p className="label">Benchmark p50</p>
          <p className="mt-1 font-semibold text-ink tabular">{algo.p50.toFixed(3)} ms</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors group-hover:text-ink">
          Race all four
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}

function LimitCell({ c }: { c: ClientStat }) {
  const delta = c.effective_limit - c.rule_rate
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink">{integer(c.effective_limit)}</span>
      {delta !== 0 && (
        <span className="inline-flex items-center text-xs text-ink-2" title={`Rule is ${c.rule_rate}; RL adjusted it`}>
          {delta > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
          rule {integer(c.rule_rate)}
        </span>
      )}
      <span className="text-muted">/ {c.rule_window}s</span>
    </span>
  )
}

function ClientsTable({ stats }: { stats: Stats | undefined }) {
  const navigate = useNavigate()
  if (!stats) return <Skeleton className="m-5 h-48" />
  if (stats.clients.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No traffic yet"
        description="Send some requests and clients will appear here within a couple of seconds."
        action={<Link to="/playground" className="btn-primary">Open the Playground</Link>}
      />
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-white/10 text-xs text-muted">
            <th className="px-5 py-2.5 font-medium">Client</th>
            <th className="px-3 py-2.5 text-right font-medium">Decisions</th>
            <th className="px-3 py-2.5 text-right font-medium">Blocked</th>
            <th className="w-40 px-3 py-2.5 font-medium">Block ratio</th>
            <th className="px-5 py-2.5 font-medium">Enforced limit</th>
          </tr>
        </thead>
        <tbody className="tabular">
          <AnimatePresence initial={false}>
            {stats.clients.map((c) => {
              const total = c.allowed + c.blocked
              const r = ratio(c.blocked, total)
              const clickable = c.rl_epsilon != null
              return (
                <motion.tr
                  key={`${c.client_id}|${c.endpoint}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease }}
                  onClick={clickable ? () => navigate(`/agent?client=${encodeURIComponent(agentKey(c.client_id, c.endpoint))}`) : undefined}
                  className={`border-b border-white/5 last:border-0 ${clickable ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
                >
                  <td className="px-5 py-3">
                    <span className="font-mono text-ink">{c.client_id}</span>
                    {c.endpoint !== 'global' && <span className="ml-2"><Chip mono>/{c.endpoint}</Chip></span>}
                  </td>
                  <td className="px-3 py-3 text-right text-ink">{integer(total)}</td>
                  <td className="px-3 py-3 text-right text-ink-2">{integer(c.blocked)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Meter value={r} label={`Block ratio for ${c.client_id}`} />
                      <span className="w-12 text-right text-xs text-ink-2">{percent(r, 0)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3"><LimitCell c={c} /></td>
                </motion.tr>
              )
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}

export default function Overview() {
  const { data: stats, isPending, isError, error } = useStats()
  const series = useThroughput(stats)
  const current = series.at(-1)
  const totals = stats?.totals
  const totalDecisions = totals ? totals.allowed + totals.blocked : null
  const trend = useMemo(() => series.slice(-30).map((s) => s.allowed + s.blocked), [series])

  return (
    <Stagger className="space-y-6">
      <StaggerItem className="space-y-4">
        <PageHeader
          title="Overview"
          description="Live decisions from the limiter node. Counters are per node and reset when it restarts."
        />
        <StatusStrip stats={stats} />
      </StaggerItem>

      {isError && !stats && (
        <StaggerItem>
          <Card>
            <EmptyState icon={PlugZap} title="No live data" description={errorMessage(error)} />
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <DemoPanel />
      </StaggerItem>

      {!(isError && !stats) && (
        <StaggerItem>
          <ActiveAlgorithm stats={stats} />
        </StaggerItem>
      )}

      <StaggerItem>
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StaggerItem className="col-span-2 lg:row-span-2">
          <StatTile
            hero
            label="Decisions / sec"
            value={current ? current.allowed + current.blocked : stats ? 0 : null}
            format={rate}
            loading={isPending}
            hint={current ? `${rate(current.blocked)}/s blocked` : 'Measured between polls'}
            trend={trend}
          />
        </StaggerItem>
        <StaggerItem className="col-span-1 lg:col-span-2">
          <StatTile label="Total decisions" value={totalDecisions} format={(n) => compact(Math.round(n))} loading={isPending} hint={stats && `${stats.clients_total} clients`} />
        </StaggerItem>
        <StaggerItem className="col-span-1 lg:col-span-2">
          <StatTile
            label="Allowed"
            value={totals && totalDecisions ? ratio(totals.allowed, totalDecisions) * 100 : null}
            format={(n) => `${n.toFixed(1)}%`}
            loading={isPending}
            hint={totals && `${integer(totals.blocked)} blocked with 429`}
          />
        </StaggerItem>
        <StaggerItem className="col-span-1 lg:col-span-2">
          <StatTile
            label="Decision latency p50"
            value={stats?.latency_ms.p50 ?? null}
            format={(n) => ms(n)}
            loading={isPending}
            hint={stats?.latency_ms.p99 != null ? `p99 ${ms(stats.latency_ms.p99)} · server-side` : 'Server-side, per check'}
          />
        </StaggerItem>
        <StaggerItem className="col-span-1 lg:col-span-2">
          <StatTile
            label="RL-adjusted clients"
            value={stats ? stats.clients.filter((c) => c.effective_limit !== c.rule_rate).length : null}
            format={(n) => integer(Math.round(n))}
            loading={isPending}
            hint={stats?.rl_enabled ? 'Limits moved by the agent' : 'RL is off'}
          />
        </StaggerItem>
      </Stagger>
      </StaggerItem>

      <StaggerItem>
        <ThroughputChart series={series} />
      </StaggerItem>

      <StaggerItem>
      <Card>
        <CardHeader
          title="Busiest clients"
          subtitle={stats?.rl_enabled ? 'Click a client to see what the RL agent is doing' : 'Top clients by decisions'}
        />
        <div className="mt-3">
          <ClientsTable stats={stats} />
        </div>
      </Card>
      </StaggerItem>
    </Stagger>
  )
}
