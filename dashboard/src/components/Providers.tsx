import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { AdminKeyContext, ToastContext, ToastInput } from '../lib/context'
import { ease } from '../lib/theme'

// ---- Toasts -----------------------------------------------------------------

interface Toast extends ToastInput {
  id: number
}

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info }
const TOAST_ICON_COLOR = { success: 'text-good', error: 'text-critical', info: 'text-accent' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { ...toast, id }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const variant = t.variant ?? 'info'
            const Icon = TOAST_ICON[variant]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 32, transition: { duration: 0.15 } }}
                transition={{ duration: 0.25, ease }}
                className="card pointer-events-auto flex items-start gap-3 p-3.5 shadow-2xl shadow-black/50"
                role="status"
              >
                <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', TOAST_ICON_COLOR[variant])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-ink-2">{t.description}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded p-0.5 text-muted transition-colors hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// ---- Admin key --------------------------------------------------------------

const KEY_STORAGE = 'drl-admin-key'

function readKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function AdminKeyProvider({ children }: { children: ReactNode }) {
  const [adminKey, setAdminKey] = useState(readKey)

  useEffect(() => {
    try {
      if (adminKey) sessionStorage.setItem(KEY_STORAGE, adminKey)
      else sessionStorage.removeItem(KEY_STORAGE)
    } catch {
      /* storage unavailable: the key just isn't remembered */
    }
  }, [adminKey])

  const value = useMemo(() => ({ adminKey, setAdminKey }), [adminKey])
  return <AdminKeyContext.Provider value={value}>{children}</AdminKeyContext.Provider>
}
