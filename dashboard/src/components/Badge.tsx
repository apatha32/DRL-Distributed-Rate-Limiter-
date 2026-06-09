import React from 'react'

interface BadgeProps {
  variant?: 'success' | 'error' | 'warning' | 'info'
  children: React.ReactNode
}

export default function Badge({ variant = 'info', children }: BadgeProps) {
  const variants = {
    success: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    info: 'bg-cyan-500/20 text-cyan-400',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
