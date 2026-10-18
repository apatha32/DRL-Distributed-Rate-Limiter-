import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Brain, Flag, Info, MessageSquareText, Play, Square, Sparkles, TriangleAlert, Waves } from 'lucide-react'
import clsx from 'clsx'
import { DemoLogKind, useDemo } from '../lib/context'
import { DEMO_MAX_MINUTES, DEMO_PHASES } from '../lib/demo'
import { clockTime, duration, integer } from '../lib/format'
import { ease } from '../lib/theme'
import { LiveDot } from './ui'

const KIND: Record<DemoLogKind, { icon: typeof Info; tint: string }> = {
  phase: { icon: Flag, tint: 'text-accent' },
  first: { icon: Sparkles, tint: 'text-accent' },
  block: { icon: Ban, tint: 'text-critical' },
  summary: { icon: Waves, tint: 'text-ink-2' },
  rl: { icon: Brain, tint: 'text-accent' },
  info: { icon: Info, tint: 'text-ink-2' },
  error: { icon: TriangleAlert, tint: 'text-critical' },
}

function useNow(active: boolean) {
  const [t, setT] = useState(() => Date.now() / 1000)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setT(Date.now() / 1000), 500)
    return () => window.clearInterval(id)
  }, [active])
  return t
}

export function DemoPanel() {
  const demo = useDemo()
  const t = useNow(demo.running)
  const phase = DEMO_PHASES[demo.phaseIndex]
  const phaseProgress = demo.running && demo.phaseStartedAt ? Math.min(1, (t - demo.phaseStartedAt) / phase.seconds) : 0

  return (
    <section className="card overflow-hidden" aria-labelledby="demo-title">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="demo-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
            {demo.running && <LiveDot status="good" />}
            Live demo
          </h2>
          <p className="mt-1 max-w-2xl text-ink-2">
            Sends real requests to the API in four looping phases (normal traffic, a scraper, a login attack, calm)
            and explains what the limiter does, in plain English. It keeps running while you look at other pages
            and stops by itself after {DEMO_MAX_MINUTES} minutes.
          </p>
        </div>
        <motion.button
          layout
          onClick={() => (demo.running ? demo.stop() : demo.start())}
          className={clsx('shrink-0', demo.running ? 'btn-ghost' : 'btn-primary')}
        >
          {demo.running ? <><Square className="h-4 w-4" /> Stop demo</> : <><Play className="h-4 w-4" /> Run live demo</>}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {(demo.running || demo.log.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className="overflow-hidden border-t border-white/10"
          >
            {/* Phase stepper */}
            <ol className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4" aria-label="Demo phases">
              {DEMO_PHASES.map((p, i) => {
                const current = demo.running && i === demo.phaseIndex
                return (
                  <li key={p.id} className="relative bg-surface px-4 py-3" aria-current={current ? 'step' : undefined}>
                    <p className={clsx('text-xs', current ? 'text-ink' : 'text-muted')}>
                      <span className="tabular">{i + 1}.</span> {p.title}
                    </p>
                    <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                      {current && (
                        <motion.div className="h-full bg-accent" initial={false}
                          animate={{ width: `${phaseProgress * 100}%` }} transition={{ duration: 0.5, ease: 'linear' }} />
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="grid gap-px bg-white/5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              {/* Now happening */}
              <div className="space-y-4 bg-surface p-5">
                <AnimatePresence mode="wait">
                  <motion.div key={demo.running ? phase.id : 'stopped'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease }}>
                    <p className="label">{demo.running ? 'Happening now' : 'Demo finished'}</p>
                    <p className="mt-1 text-base font-semibold text-ink">{demo.running ? phase.title : 'Stopped'}</p>
                    <p className="mt-2 leading-relaxed text-ink-2">
                      {demo.running ? phase.explanation : 'Press Run live demo to start again. The Overview keeps the traffic it produced.'}
                    </p>
                  </motion.div>
                </AnimatePresence>
                <dl className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-xs">
                  {[
                    ['Sent', demo.sent],
                    ['Allowed', demo.allowed],
                    ['Blocked', demo.blocked],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted">{label}</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{integer(value as number)}</dd>
                    </div>
                  ))}
                </dl>
                {demo.startedAt && demo.running && (
                  <p className="text-xs text-muted tabular">Running for {duration(t - demo.startedAt)}</p>
                )}
              </div>

              {/* Plain-English log */}
              <div className="bg-surface">
                <p className="flex items-center gap-2 px-5 pt-5 text-xs font-medium text-muted">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  What just happened
                </p>
                <ol className="max-h-[380px] space-y-1 overflow-y-auto px-3 pb-4 pt-2" aria-live="polite">
                  <AnimatePresence initial={false}>
                    {demo.log.map((entry) => {
                      const { icon: Icon, tint } = KIND[entry.kind]
                      return (
                        <motion.li
                          key={entry.id}
                          layout="position"
                          initial={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.35, ease }}
                          className={clsx('rounded-lg px-2 py-2.5', (entry.kind === 'first' || entry.kind === 'phase') && 'bg-white/[0.03]')}
                        >
                          <div className="flex items-start gap-2.5">
                            <Icon className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0', tint)} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-ink">
                                <span className="font-medium">{entry.title}</span>
                                <span className="text-[11px] text-muted tabular">{clockTime(entry.at)}</span>
                              </p>
                              <div className="mt-1 space-y-1 text-xs leading-relaxed text-ink-2">
                                {entry.lines.map((line, i) => <p key={i}>{line}</p>)}
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ol>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Compact indicator for the header, visible on every page while the demo runs. */
export function DemoIndicator() {
  const demo = useDemo()
  return (
    <AnimatePresence>
      {demo.running && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          onClick={() => demo.stop()}
          className="hidden items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-ink transition-colors hover:bg-accent/20 sm:inline-flex"
          title="Stop the live demo"
        >
          <LiveDot status="good" />
          Demo running
          <span className="text-muted">· Stop</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
