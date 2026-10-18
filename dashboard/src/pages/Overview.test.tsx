import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { api, Stats } from '../lib/api'
import { renderWithProviders } from '../test/render'
import Overview from './Overview'

const baseStats: Stats = {
  generated_at: 1_700_000_000,
  uptime_sec: 3725,
  node: 'limiter',
  algorithm: 'token_bucket',
  rl_enabled: true,
  rl_update_interval_sec: 10,
  fail_mode: 'open',
  circuit_breaker: 'closed',
  totals: { allowed: 90, blocked: 10 },
  latency_ms: { p50: 0.098, p95: 0.14, p99: 0.29, samples: 100 },
  clients: [{
    client_id: 'client_b', endpoint: 'global', allowed: 90, blocked: 10,
    rule_rate: 50, rule_window: 60, effective_limit: 55, rl_epsilon: 0.9,
  }],
  clients_total: 1,
}

describe('Overview', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'health').mockResolvedValue({ status: 'healthy', service: 'limiter', redis_available: true })
  })

  it('shows live status, clients and the RL-adjusted limit', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue(baseStats)
    renderWithProviders(<Overview />)

    expect(await screen.findByText('client_b')).toBeInTheDocument()
    expect(screen.getByText('token_bucket')).toBeInTheDocument()
    expect(screen.getByText('rule 50')).toBeInTheDocument()   // 55 enforced vs rule 50
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(await screen.findByText('connected')).toBeInTheDocument()
  })

  it('invites the user to the playground when there is no traffic', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue({ ...baseStats, clients: [], clients_total: 0, totals: { allowed: 0, blocked: 0 } })
    renderWithProviders(<Overview />)

    expect(await screen.findByText('No traffic yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the Playground' })).toHaveAttribute('href', '/playground')
  })
})
