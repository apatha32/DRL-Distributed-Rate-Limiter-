import { ReactNode, useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import clsx from 'clsx'
import { color } from '../lib/theme'
import { Skeleton } from './ui'

/** Number that springs to each new value (jumps instead when reduced motion is on). */
export function AnimatedNumber({ value, format, className }: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const reduce = useReducedMotion()
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.6 })
  const fmt = useRef(format)
  fmt.current = format
  const display = useTransform(spring, (v) => fmt.current(v))

  useEffect(() => {
    if (reduce) spring.jump(value)
    else spring.set(value)
  }, [value, reduce, spring])

  return <motion.span className={className}>{display}</motion.span>
}

/** 12-ish point trend line; decorative, the tile's number carries the value. */
export function Sparkline({ values, stroke = color.series1, height = 32 }: {
  values: number[]
  stroke?: string
  height?: number
}) {
  const width = 120
  const path = useMemo(() => {
    if (values.length < 2) return null
    const max = Math.max(...values, 1e-9)
    const step = width / (values.length - 1)
    const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)])
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
    return { line, area: `${line}L${width},${height}L0,${height}Z` }
  }, [values, height])

  if (!path) return <div style={{ height }} />
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={path.area} fill={stroke} fillOpacity={0.1} />
      <path d={path.line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Stat tile: label · value · hint · optional trend. `hero` is the one headline number per view. */
export function StatTile({ label, value, format, hint, trend, hero, loading }: {
  label: string
  value: number | null | undefined
  format: (n: number) => string
  hint?: ReactNode
  trend?: number[]
  hero?: boolean
  loading?: boolean
}) {
  return (
    <div className={clsx('card flex h-full flex-col justify-between gap-3 p-5', hero && 'lg:p-6')}>
      <div>
        <p className="label">{label}</p>
        <div className={clsx('mt-2 font-semibold tracking-tight text-ink', hero ? 'text-5xl' : 'text-2xl')}>
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <Skeleton className={hero ? 'h-12 w-32' : 'h-7 w-20'} />
              </motion.div>
            ) : (
              <motion.div key="value" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {value == null ? '—' : <AnimatedNumber value={value} format={format} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {hint && <div className="mt-1.5 text-xs text-ink-2">{hint}</div>}
      </div>
      {trend && <Sparkline values={trend} height={hero ? 48 : 28} />}
    </div>
  )
}
