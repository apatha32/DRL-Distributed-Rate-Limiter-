import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, ApiNotConnectedError } from './api'

// Retrying can't fix a wrong API address, so don't
const retry = (count: number, err: unknown) => !(err instanceof ApiNotConnectedError) && count < 2

export const STATS_POLL_MS = 2000

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 5000, retry })

export const useStats = () =>
  useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: STATS_POLL_MS,
    placeholderData: keepPreviousData,
    retry,
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
