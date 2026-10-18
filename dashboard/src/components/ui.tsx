import { ReactNode, useId } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { ease } from '../lib/theme'

// ---- Layout primitives ------------------------------------------------------

export function PageHeader({ title, description, actions }: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('card', className)}>{children}</section>
}

export function CardHeader({ title, subtitle, actions }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

// ---- Motion helpers -----------------------------------------------------------

const staggerParent = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.03 } } }
const staggerChild = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease } },
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerParent} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerChild} className={className}>
      {children}
    </motion.div>
  )
}

/** Fade + rise on mount, for one-off elements. */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Charts grow in from their baseline the first time they have data. */
export function ChartReveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleY: 0.92 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ duration: 0.6, ease }}
      style={{ originY: 1 }}
      className={clsx('h-full', className)}
    >
      {children}
    </motion.div>
  )
}

// ---- Status -----------------------------------------------------------------

export type Status = 'good' | 'warning' | 'critical' | 'neutral'

const STATUS_ICON = { good: CheckCircle2, warning: AlertTriangle, critical: XCircle, neutral: CircleDashed }
const STATUS_COLOR = { good: 'text-good', warning: 'text-warning', critical: 'text-critical', neutral: 'text-muted' }

/** Status always reads as icon + label, never color alone. */
export function StatusPill({ status, label, detail }: { status: Status; label: string; detail?: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-raised/60 px-2.5 py-1 text-xs">
      <Icon className={clsx('h-3.5 w-3.5', STATUS_COLOR[status])} aria-hidden />
      <span className="font-medium text-ink">{label}</span>
      {detail && <span className="text-muted">{detail}</span>}
    </span>
  )
}

export function LiveDot({ status }: { status: Status }) {
  const bg = { good: 'bg-good', warning: 'bg-warning', critical: 'bg-critical', neutral: 'bg-muted' }[status]
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      {status === 'good' && <span className={clsx('absolute inset-0 rounded-full animate-pulse-ring', bg)} />}
      <span className={clsx('relative h-2 w-2 rounded-full', bg)} />
    </span>
  )
}

export function Chip({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-md border border-white/10 bg-raised/60 px-1.5 py-0.5 text-[11px] text-ink-2',
      mono && 'font-mono',
    )}>
      {children}
    </span>
  )
}

// ---- Meter --------------------------------------------------------------------

/** Fill carries severity (accent → warning → critical); the track is a quiet step of the surface. */
export function Meter({ value, severity = 'auto', label }: {
  value: number
  severity?: 'auto' | 'accent'
  label: string
}) {
  const v = Math.min(1, Math.max(0, value))
  const fill =
    severity === 'accent' ? 'bg-accent' : v < 0.1 ? 'bg-accent' : v < 0.3 ? 'bg-warning' : 'bg-critical'
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <motion.div
        className={clsx('h-full rounded-full', fill)}
        initial={false}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.5, ease }}
      />
    </div>
  )
}

// ---- Segmented control ----------------------------------------------------------

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-white/10 bg-page p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-md bg-raised"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---- Feedback states --------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-md bg-white/[0.04]', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 rounded-xl border border-white/10 bg-raised/60 p-3">
        <Icon className="h-5 w-5 text-ink-2" />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Legend for ≥ 2 series: colored swatch beside ink text (text never wears the series color). */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  )
}
