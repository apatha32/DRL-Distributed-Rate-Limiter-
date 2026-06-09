import React from 'react'

interface ProgressBarProps {
  label: string
  value: number
  max: number
  color?: string
}

export default function ProgressBar({ label, value, max, color = 'bg-cyan-500' }: ProgressBarProps) {
  const percentage = (value / max) * 100

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className="text-sm font-mono text-cyan-400">{value}/{max}</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <div className="text-xs text-slate-500 mt-1">{percentage.toFixed(1)}%</div>
    </div>
  )
}
