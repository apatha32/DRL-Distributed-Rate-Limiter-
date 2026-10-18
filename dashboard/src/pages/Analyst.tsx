import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Card, CardHeader, Chip, EmptyState, FadeIn, PageHeader, Stagger, StaggerItem, Status, StatusPill } from '../components/ui'
import { AnalysisRecord, api, errorMessage } from '../lib/api'
import { useAdminKey, useToast } from '../lib/context'
import { integer } from '../lib/format'
import { useAnalystStatus } from '../lib/queries'
import { ease } from '../lib/theme'

const ANALYSIS_STATUS: Record<AnalysisRecord['analysis']['status'], [Status, string]> = {
  healthy: ['good', 'Healthy'],
  watch: ['warning', 'Watch'],
  incident: ['critical', 'Incident'],
}
const SEVERITY: Record<string, Status> = { info: 'neutral', warning: 'warning', critical: 'critical' }

function AdminAccess() {
  const { adminKey, setAdminKey } = useAdminKey()
  const [draft, setDraft] = useState(adminKey)
  const [show, setShow] = useState(false)
  const status = useAnalystStatus(adminKey)

  const state = !adminKey
    ? null
    : status.isPending
      ? <StatusPill status="neutral" label="Checking key" />
      : status.isError
        ? <StatusPill status="critical" label="Key rejected" detail={errorMessage(status.error)} />
        : status.data?.enabled
          ? <StatusPill status="good" label="Connected" detail={status.data.model ?? undefined} />
          : <StatusPill status="warning" label="Analyst off" detail="ANTHROPIC_API_KEY not set on the API" />

  return (
    <Card>
      <CardHeader title="Admin access" subtitle="Your ADMIN_API_KEY. Kept in this browser tab only." actions={state} />
      <form
        className="flex flex-col gap-3 p-5 sm:flex-row"
        onSubmit={(e) => { e.preventDefault(); setAdminKey(draft.trim()) }}
      >
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9 pr-10 font-mono"
            type={show ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your admin password"
            autoComplete="off"
            aria-label="Admin API key"
          />
          <button type="button" onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
            aria-label={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button type="submit" className="btn-ghost" disabled={draft.trim() === adminKey}>Save</button>
        {adminKey && (
          <button type="button" className="btn-ghost" onClick={() => { setDraft(''); setAdminKey('') }}>Forget</button>
        )}
      </form>
    </Card>
  )
}

function Results({ record, onApplied }: { record: AnalysisRecord; onApplied: (index: number) => void }) {
  const { adminKey } = useAdminKey()
  const toast = useToast()
  const apply = useMutation({
    mutationFn: (index: number) => api.applyRecommendation(adminKey, record.id, index),
    onSuccess: (_, index) => {
      const r = record.analysis.recommendations[index]
      onApplied(index)
      toast({ variant: 'success', title: 'Rule applied', description: `${r.client_id}${r.endpoint ? ` /${r.endpoint}` : ''} → ${r.rate} per ${r.window}s` })
    },
    onError: (err) => toast({ variant: 'error', title: 'Could not apply', description: errorMessage(err) }),
  })
  const { analysis } = record
  const [status, statusLabel] = ANALYSIS_STATUS[analysis.status]

  return (
    <Stagger className="space-y-6">
      <StaggerItem>
        <Card>
          <CardHeader title="Summary" actions={<StatusPill status={status} label={statusLabel} />} />
          <div className="p-5 pt-3">
            <p className="text-[15px] leading-relaxed text-ink">{analysis.summary}</p>
            <p className="mt-4 text-xs text-muted">
              {new Date(record.created_at * 1000).toLocaleString()} · {record.model} ·{' '}
              {integer(record.usage.input_tokens)} in / {integer(record.usage.output_tokens)} out tokens
            </p>
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader title="Findings" subtitle={`${analysis.findings.length} flagged`} />
          {analysis.findings.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nothing to flag" description="Claude didn't find anything unusual in current traffic." />
          ) : (
            <ul className="divide-y divide-white/5">
              {analysis.findings.map((f, i) => (
                <li key={i} className="space-y-1.5 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={SEVERITY[f.severity] ?? 'neutral'} label={f.severity} />
                    <span className="font-mono text-xs text-ink-2">{f.client_id}{f.endpoint !== 'global' && ` /${f.endpoint}`}</span>
                  </div>
                  <p className="text-ink">{f.issue}</p>
                  <p className="text-xs text-muted">{f.evidence}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader title="Recommended rule changes" subtitle="Nothing changes until you apply one" />
          {analysis.recommendations.length === 0 ? (
            <EmptyState icon={Check} title="No changes recommended" />
          ) : (
            <ul className="divide-y divide-white/5">
              {analysis.recommendations.map((r, i) => {
                const applied = record.applied[i]
                const pending = apply.isPending && apply.variables === i
                return (
                  <li key={i} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-mono text-sm">
                        <span className="text-ink">{r.client_id}{r.endpoint && ` /${r.endpoint}`}</span>
                        <span className="text-muted"> → </span>
                        <span className="text-ink">{r.rate} req / {r.window}s</span>
                      </p>
                      <p className="text-xs text-ink-2">{r.rationale}</p>
                    </div>
                    <motion.button
                      layout
                      onClick={() => apply.mutate(i)}
                      disabled={applied || apply.isPending}
                      className={applied ? 'btn-ghost' : 'btn-primary'}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={applied ? 'done' : pending ? 'busy' : 'idle'} className="inline-flex items-center gap-2"
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                          {applied ? <><Check className="h-4 w-4 text-good" /> Applied</> : pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying</> : 'Apply'}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </StaggerItem>
    </Stagger>
  )
}

export default function Analyst() {
  const { adminKey } = useAdminKey()
  const status = useAnalystStatus(adminKey)
  const toast = useToast()
  const [record, setRecord] = useState<AnalysisRecord | null>(null)

  const run = useMutation({
    mutationFn: () => api.runAnalysis(adminKey),
    onSuccess: setRecord,
    onError: (err) => toast({ variant: 'error', title: 'Analysis failed', description: errorMessage(err) }),
  })

  const ready = Boolean(adminKey && status.data?.enabled)

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Analyst"
        description="Claude reviews live limiter state and the RL agent's recent decisions, explains what is happening, and proposes rule changes for you to approve."
        actions={
          <button className="btn-primary" onClick={() => run.mutate()} disabled={!ready || run.isPending}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {run.isPending ? 'Analyzing…' : 'Run analysis'}
          </button>
        }
      />

      <FadeIn delay={0.08}>
        <AdminAccess />
      </FadeIn>

      <AnimatePresence mode="wait">
        {run.isPending ? (
          <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease }}>
            <Card>
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}>
                  <Sparkles className="h-6 w-6 text-accent" />
                </motion.div>
                <p className="font-medium text-ink">Claude is reading the traffic snapshot</p>
                <p className="max-w-sm text-ink-2">Rules, per-client counters and the agent's recent decisions. This usually takes 10–40 seconds.</p>
              </div>
            </Card>
          </motion.div>
        ) : record ? (
          <motion.div key={record.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Results
              record={record}
              onApplied={(i) => setRecord((r) => r && { ...r, applied: r.applied.map((a, j) => (j === i ? true : a)) })}
            />
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <EmptyState
                icon={Sparkles}
                title={ready ? 'Ready when you are' : 'Add your admin key to begin'}
                description={ready
                  ? 'Run an analysis to get a summary, flagged clients and proposed rule changes. Each run is one Claude call.'
                  : 'The analyst runs on admin endpoints, so it needs the ADMIN_API_KEY you set on Railway.'}
                action={ready && <Chip>{status.data?.model}</Chip>}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
