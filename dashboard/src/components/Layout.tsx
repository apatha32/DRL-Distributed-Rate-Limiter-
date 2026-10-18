import { ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, Layers, LayoutDashboard, Menu, Sparkles, WifiOff, X, Zap } from 'lucide-react'
import clsx from 'clsx'
import { API_BASE, errorMessage } from '../lib/api'
import { useHealth } from '../lib/queries'
import { ease } from '../lib/theme'
import { DemoIndicator } from './DemoPanel'
import { LiveDot, Status } from './ui'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/playground', label: 'Playground', icon: Zap },
  { to: '/agent', label: 'RL Agent', icon: Brain },
  { to: '/algorithms', label: 'Algorithms', icon: Layers },
  { to: '/analyst', label: 'AI Analyst', icon: Sparkles },
]

function ConnectionStatus() {
  const { data, isError, isPending } = useHealth()
  const [status, label]: [Status, string] = isPending
    ? ['neutral', 'Connecting']
    : isError
      ? ['critical', 'Offline']
      : data?.redis_available
        ? ['good', 'Live']
        : ['warning', 'Degraded']
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-xs text-ink-2"
      title={isError ? 'API unreachable' : data?.redis_available ? 'API and Redis healthy' : 'Redis unavailable'}
    >
      <LiveDot status={status} />
      {label}
    </span>
  )
}

function NavItems({ layoutId, onNavigate }: { layoutId: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive ? 'text-ink' : 'text-muted hover:text-ink-2',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-lg bg-white/[0.06]"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className="relative h-4 w-4" aria-hidden />
              <span className="relative">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </>
  )
}

function OfflineBanner() {
  const { isError, error, refetch, isFetching } = useHealth()
  return (
    <AnimatePresence>
      {isError && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease }}
          className="overflow-hidden border-b border-critical/30 bg-critical/10"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 text-xs sm:px-6">
            <span className="inline-flex items-center gap-2 text-ink">
              <WifiOff className="h-3.5 w-3.5 text-critical" aria-hidden />
              {errorMessage(error)}
            </span>
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-page/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5" aria-label="DRL Console home">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
              <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
                <path d="M9 21h4V11H9zm5 0h4V7h-4zm5 0h4v-6h-4z" fill="white" transform="translate(0 2)" />
              </svg>
            </span>
            <span className="font-semibold tracking-tight text-ink">DRL</span>
            <span className="hidden text-muted sm:inline">Console</span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            <NavItems layoutId="nav-pill" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DemoIndicator />
            <ConnectionStatus />
            <button
              className="rounded-lg p-2 text-ink-2 hover:bg-raised md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              aria-label="Main"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease }}
              className="overflow-hidden border-t border-white/10 md:hidden"
            >
              <div className="flex flex-col gap-1 px-4 py-3">
                <NavItems layoutId="nav-pill-mobile" onNavigate={() => setMenuOpen(false)} />
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <OfflineBanner />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
          <span>Distributed Rate Limiter · Redis Lua · Q-learning · Claude</span>
          <span className="font-mono">{API_BASE || (import.meta.env.PROD ? 'API via /v1 proxy' : 'local API')}</span>
        </div>
      </footer>
    </div>
  )
}
