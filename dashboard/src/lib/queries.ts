import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './api'

export const STATS_POLL_MS = 2000

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 5000 })

export const useStats = () =>
  useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: STATS_POLL_MS,
    placeholderData: keepPreviousData,
  })

export const useRLDiagnostics = (key: string | undefined) =>
  useQuery({
    queryKey: ['rl', key],
    queryFn: () => api.rlDiagnostics(key as string),
    enabled: Boolean(key),
    refetchInterval: 4000,
    placeholderData: keepPreviousData,
  })

export const useAnalystStatus = (apiKey: string) =>
  useQuery({
    queryKey: ['analyst-status', apiKey],
    queryFn: () => api.analystStatus(apiKey),
    enabled: Boolean(apiKey),
    retry: false,
  })
