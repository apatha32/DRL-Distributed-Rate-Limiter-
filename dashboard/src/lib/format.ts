const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 1,284 · 12.9K · 4.2M */
export const compact = (n: number) => (Math.abs(n) < 10_000 ? intFmt.format(n) : compactFmt.format(n))

export const integer = (n: number) => intFmt.format(n)

export const percent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`

/** Requests per second: one decimal below 10, whole numbers above. */
export const rate = (perSec: number) => (perSec < 10 ? perSec.toFixed(1) : compact(Math.round(perSec)))

export const ms = (value: number | null | undefined) => {
  if (value == null) return '—'
  if (value < 1) return `${value.toFixed(2)} ms`
  if (value < 100) return `${value.toFixed(1)} ms`
  return `${Math.round(value)} ms`
}

export function duration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s % 60}s`
  return `${s}s`
}

/** Unix seconds → 14:05:09 */
export const clockTime = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleTimeString('en-GB', { hour12: false })

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)
