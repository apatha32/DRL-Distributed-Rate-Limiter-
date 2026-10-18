import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { api } from '../lib/api'
import { renderWithProviders } from '../test/render'
import Algorithms from './Algorithms'

describe('Algorithm race', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs the same traffic against all four algorithms and summarizes them', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(api, 'stats').mockRejectedValue(new Error('not needed for burst'))
    // Fixed window admits everything in this fake; the others admit the first 5 per algorithm
    const seen: Record<string, number> = {}
    const sandbox = vi.spyOn(api, 'sandboxCheck').mockImplementation(async (algorithm) => {
      seen[algorithm] = (seen[algorithm] ?? 0) + 1
      const allowed = algorithm === 'fixed_window' || seen[algorithm] <= 5
      return { algorithm, allowed, status: allowed ? 200 : 429, remaining: 0, limit: 5, window: 5, retryAfterMs: 0, rttMs: 1 }
    })
    renderWithProviders(<Algorithms />)

    fireEvent.click(screen.getByRole('radio', { name: 'Burst' }))
    fireEvent.change(screen.getByLabelText('Limit'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Per window'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Start race/ }))

    await act(() => vi.advanceTimersByTimeAsync(15_000))

    const algorithms = new Set(sandbox.mock.calls.map((c) => c[0]))
    expect(algorithms).toEqual(new Set(['token_bucket', 'leaky_bucket', 'fixed_window', 'sliding_window']))
    // One session id and the chosen limit for every call
    expect(new Set(sandbox.mock.calls.map((c) => c[1])).size).toBe(1)
    expect(sandbox.mock.calls.every((c) => c[2] === 5 && c[3] === 5)).toBe(true)
    expect(await screen.findByRole('button', { name: /Start race/ })).toBeEnabled()
    expect(screen.getAllByText('admitted')).toHaveLength(4)
  })
})
