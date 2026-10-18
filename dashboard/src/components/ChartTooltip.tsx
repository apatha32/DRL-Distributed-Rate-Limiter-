import type { TooltipProps } from 'recharts'

/** Shared hover tooltip: swatch + ink label + tabular value. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter = (v) => String(v),
}: TooltipProps<number, string> & {
  labelFormatter?: (label: number) => string
  valueFormatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      {label != null && (
        <p className="mb-1.5 text-muted">{labelFormatter ? labelFormatter(Number(label)) : label}</p>
      )}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
              {p.name}
            </span>
            <span className="tabular font-semibold text-ink">{valueFormatter(Number(p.value))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
