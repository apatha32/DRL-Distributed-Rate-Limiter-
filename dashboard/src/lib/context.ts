import { createContext, useContext } from 'react'

// ---- Toasts -----------------------------------------------------------------

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
}

export const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)

// ---- Admin key (kept for this browser tab only) -------------------------------

export interface AdminKeyState {
  adminKey: string
  setAdminKey: (key: string) => void
}

export const AdminKeyContext = createContext<AdminKeyState>({ adminKey: '', setAdminKey: () => {} })

export const useAdminKey = () => useContext(AdminKeyContext)

// ---- Live demo -------------------------------------------------------------------

export type DemoLogKind = 'phase' | 'first' | 'block' | 'summary' | 'rl' | 'info' | 'error'

export interface DemoLogEntry {
  id: number
  at: number // unix seconds
  kind: DemoLogKind
  title: string
  lines: string[]
}

export interface DemoState {
  running: boolean
  phaseIndex: number
  phaseStartedAt: number | null
  startedAt: number | null
  sent: number
  allowed: number
  blocked: number
  log: DemoLogEntry[]
  start: () => void
  stop: (reason?: string) => void
}

export const DemoContext = createContext<DemoState>({
  running: false,
  phaseIndex: 0,
  phaseStartedAt: null,
  startedAt: null,
  sent: 0,
  allowed: 0,
  blocked: 0,
  log: [],
  start: () => {},
  stop: () => {},
})

export const useDemo = () => useContext(DemoContext)
