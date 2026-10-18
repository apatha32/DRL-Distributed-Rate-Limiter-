import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ArrowDown, ArrowUp, Brain, Minus, PowerOff } from 'lucide-react'
import { ChartTooltip } from '../components/ChartTooltip'
import { StatTile } from '../components/numbers'
import { Card, CardHeader, ChartReveal, EmptyState, PageHeader, Skeleton, Stagger, StaggerItem } from '../components/ui'
import { agentKey, RLAction, RLDecision } from '../lib/api'
import { clockTime, integer, percent, rate } from '../lib/format'
import { useRLDiagnostics, useStats } from '../lib/queries'
import { axisTick, color, ease } from '../lib/theme'

const ACTION: Record<RLAction, { label: string; icon: typeof ArrowUp }> = {
  increase: { label: 'Raise 10%', icon: ArrowUp },
  keep: { label: 'Hold', icon: Minus },
  decrease: { label: 'Lower 10%', icon: ArrowDown },
}

function LimitChart({ decisions, ruleRate }: { decisions: RLDecision[]; ruleRate: number }) {
  const data = useMemo(() => {
    if (!decisions.length) return []
    const first = decisions[0]
    return [
      { t: first.ts - 10, limit: first.limit_before },
      ...decisions.map((d) => ({ t: d.ts, limit: d.limit_after })),
    ]
  }, [decisions])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 40, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={color.grid} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={clockTime} tick={axisTick}
          tickLine={false} axisLine={{ stroke: color.axis }} minTickGap={56} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} allowDecimals={false} />
        <Tooltip cursor={{ stroke: color.axis }}
          content={<ChartTooltip labelFormatter={clockTime} valueFormatter={(v) => `${integer(v)} req`} />} />
        <ReferenceLine y={ruleRate} stroke={color.ink2} strokeWidth={1}
          label={{ value: 'rule', position: 'right', fill: color.muted, fontSize: 11 }} />
        <Line dataKey="limit" name="Enforced limit" type="stepAfter" stroke={color.series1} strokeWidth={2}
          dot={false} activeDot={{ r: 4, stroke: color.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function RewardChart({ decisions }: { decisions: RLDecision[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={decisions} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={color.grid} />
        <XAxis dataKey="ts" tickFormatter={clockTime} tick={axisTick} tickLine={false} axisLine={{ stroke: color.axis }} minTickGap={56} />
        {/* Bars grow from zero, so the domain always includes it */}
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40}
          domain={[(min: number) => Math.min(0, Math.floor(min)), (max: number) => Math.max(0, Math.ceil(max))]} />
        <ReferenceLine y={0} stroke={color.axis} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          content={<ChartTooltip labelFormatter={clockTime} valueFormatter={(v) => v.toFixed(1)} />} />
        <Bar dataKey="reward" name="Reward" maxBarSize={24} radius={2} isAnimationActive={false}>
          {decisions.map((d) => <Cell key={d.ts} fill={d.reward >= 0 ? color.series1 : color.negative} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Agent() {
  const { data: stats, isPending } = useStats()
  const [params, setParams] = useSearchParams()

  const tracked = useMemo(
    () => (stats?.clients ?? []).filter((c) => c.rl_epsilon != null),
    [stats],
  )
  const selectedKey = params.get('client') ?? (tracked[0] ? agentKey(tracked[0].client_id, tracked[0].endpoint) : undefined)
  const selected = tracked.find((c) => agentKey(c.client_id, c.endpoint) === selectedKey)
  const { data: diag } = useRLDiagnostics(selectedKey)
  const decisions = diag?.recent_decisions ?? []

  if (isPending) return <Skeleton className="h-96" />

  if (stats && !stats.rl_enabled) {
    return (
      <div className="space-y-6">
        <PageHeader title="RL Agent" />
        <Card>
          <EmptyState icon={PowerOff} title="The RL agent is turned off"
            description={<>Set <code className="font-mono text-ink">ENABLE_RL=true</code> on the API service to let the Q-learning agent adapt limits.</>} />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="RL Agent"
        description={`A tabular Q-learning agent watches each client every ${stats?.rl_update_interval_sec ?? 10}s and raises, holds, or lowers its enforced limit by 10%.`}
        actions={tracked.length > 0 && (
          <select
            className="input w-auto font-mono"
            aria-label="Client"
            value={selectedKey}
            onChange={(e) => setParams({ client: e.target.value })}
          >
            {tracked.map((c) => {
              const key = agentKey(c.client_id, c.endpoint)
              return <option key={key} value={key}>{key}</option>
            })}
          </select>
        )}
      />

      {tracked.length === 0 ? (
        <Card>
          <EmptyState icon={Brain} title="No clients tracked yet"
            description="The agent starts tracking a client on its first request."
            action={<Link to="/playground" className="btn-primary">Send traffic</Link>} />
        </Card>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={selectedKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.2, ease }} className="space-y-6">
            <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StaggerItem>
                <StatTile label="Enforced limit" value={diag?.current_limit ?? selected?.effective_limit} format={(n) => integer(Math.round(n))}
                  hint={selected && `rule ${selected.rule_rate} per ${selected.rule_window}s`} />
              </StaggerItem>
              <StaggerItem>
                <StatTile label="Exploration (ε)" value={diag?.epsilon != null ? diag.epsilon * 100 : null} format={(n) => `${n.toFixed(1)}%`}
                  hint="Chance of a random action; decays as it learns" />
              </StaggerItem>
              <StaggerItem>
                <StatTile label="Traffic this window" value={diag?.rps ?? null} format={(n) => `${rate(n)}/s`}
                  hint={diag?.total_requests_window != null && `${diag.total_requests_window} requests so far`} />
              </StaggerItem>
              <StaggerItem>
                <StatTile label="Block ratio this window" value={diag?.block_ratio != null ? diag.block_ratio * 100 : null} format={(n) => `${n.toFixed(1)}%`}
                  hint="Share of requests answered with 429" />
              </StaggerItem>
            </Stagger>

            {decisions.length === 0 ? (
              <Card>
                <EmptyState icon={Brain} title="Waiting for the first decision"
                  description={`The agent decides once per ${stats?.rl_update_interval_sec ?? 10}s window with traffic. Keep sending requests for this client.`} />
              </Card>
            ) : (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Enforced limit" subtitle="After each decision, against the configured rule" />
                    <div className="h-64 px-2 pb-3 pt-2"><ChartReveal><LimitChart decisions={decisions} ruleRate={selected?.rule_rate ?? 0} /></ChartReveal></div>
                  </Card>
                  <Card>
                    <CardHeader title="Reward per window" subtitle="Throughput minus penalties for over- and under-blocking" />
                    <div className="h-64 px-2 pb-3 pt-2"><ChartReveal><RewardChart decisions={decisions} /></ChartReveal></div>
                  </Card>
                </div>

                <Card>
                  <CardHeader title="Decision log" subtitle="Most recent first" />
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                      <thead>
                        <tr className="border-b border-white/10 text-xs text-muted">
                          <th className="px-5 py-2.5 font-medium">Time</th>
                          <th className="px-3 py-2.5 font-medium">Action</th>
                          <th className="px-3 py-2.5 text-right font-medium">Limit</th>
                          <th className="px-3 py-2.5 text-right font-medium">Traffic</th>
                          <th className="px-3 py-2.5 text-right font-medium">Blocked</th>
                          <th className="px-5 py-2.5 text-right font-medium">Reward</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        <AnimatePresence initial={false}>
                          {[...decisions].reverse().map((d) => {
                            const a = ACTION[d.action]
                            return (
                              <motion.tr key={d.ts} layout initial={{ opacity: 0, backgroundColor: 'rgba(57,135,229,0.12)' }}
                                animate={{ opacity: 1, backgroundColor: 'rgba(57,135,229,0)' }} transition={{ duration: 0.8, ease }}
                                className="border-b border-white/5 last:border-0">
                                <td className="px-5 py-2.5 text-muted">{clockTime(d.ts)}</td>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center gap-1.5 text-ink"><a.icon className="h-3.5 w-3.5 text-ink-2" aria-hidden />{a.label}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right text-ink">
                                  {d.limit_before !== d.limit_after ? <>{d.limit_before} → {d.limit_after}</> : d.limit_after}
                                </td>
                                <td className="px-3 py-2.5 text-right text-ink-2">{rate(d.rps)}/s</td>
                                <td className="px-3 py-2.5 text-right text-ink-2">{percent(d.block_ratio, 0)}</td>
                                <td className="px-5 py-2.5 text-right text-ink">{d.reward.toFixed(1)}</td>
                              </motion.tr>
                            )
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <Card>
        <CardHeader title="How the agent decides" />
        <dl className="grid gap-4 p-5 text-xs text-ink-2 sm:grid-cols-3">
          <div><dt className="mb-1 font-medium text-ink">State (27)</dt><dd>Traffic level × block ratio × traffic trend, each low / medium / high.</dd></div>
          <div><dt className="mb-1 font-medium text-ink">Actions</dt><dd>Lower the limit 10%, hold it, or raise it 10%, within configured bounds.</dd></div>
          <div><dt className="mb-1 font-medium text-ink">Reward</dt><dd>+1 per allowed request, −0.5 per blocked, extra penalties for blocking almost nothing at high traffic or more than 70%.</dd></div>
        </dl>
      </Card>
    </div>
  )
}
