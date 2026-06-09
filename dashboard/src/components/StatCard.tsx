import React from 'react'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  title: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  description?: string
}

export default function StatCard({ icon: Icon, title, value, change, trend, description }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-slate-400 text-sm font-medium mb-2">{title}</p>
          <h3 className="text-3xl font-bold mb-2">{value}</h3>
          {description && <p className="text-slate-500 text-xs">{description}</p>}
        </div>
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      {change && (
        <div className={`mt-4 flex items-center space-x-2 text-sm ${
          trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400'
        }`}>
          <span>{change}</span>
        </div>
      )}
    </div>
  )
}
