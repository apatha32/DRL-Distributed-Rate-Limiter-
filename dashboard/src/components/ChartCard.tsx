import React from 'react'

interface ChartCardProps {
  title: string
  description?: string
  children: React.ReactNode
}

export default function ChartCard({ title, description, children }: ChartCardProps) {
  return (
    <div className="card">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        {description && <p className="text-sm text-slate-400">{description}</p>}
      </div>
      <div className="w-full h-80">
        {children}
      </div>
    </div>
  )
}
