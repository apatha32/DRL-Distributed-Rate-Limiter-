import React from 'react'
import { Activity, BarChart3, Zap, Settings, Moon, Sun } from 'lucide-react'

interface NavbarProps {
  currentPage: 'dashboard' | 'algorithms' | 'metrics' | 'demo'
  setCurrentPage: (page: 'dashboard' | 'algorithms' | 'metrics' | 'demo') => void
  isDark: boolean
  setIsDark: (dark: boolean) => void
}

export default function Navbar({ currentPage, setCurrentPage, isDark, setIsDark }: NavbarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'algorithms', label: 'Algorithms', icon: BarChart3 },
    { id: 'metrics', label: 'Metrics', icon: Zap },
    { id: 'demo', label: 'Demo', icon: Settings },
  ]

  return (
    <nav className="sticky top-0 z-50 glass border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">DRL Dashboard</span>
          </div>

          {/* Navigation Items */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </nav>
  )
}
