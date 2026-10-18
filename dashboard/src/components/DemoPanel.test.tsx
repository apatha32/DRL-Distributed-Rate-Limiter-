import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { api } from '../lib/api'
import { renderWithProviders } from '../test/render'
import { DemoIndicator, DemoPanel } from './DemoPanel'

describe('Live demo', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends real requests and narrates what happened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(api, 'stats').mockRejectedValue(new Error('no stats in this test'))
    let calls = 0
    const check = vi.spyOn(api, 'checkLimit').mockImplementation(async () => {
      calls++
      const allowed = calls <= 3
      return {
        algorithm: 'token_bucket', allowed, status: allowed ? 200 : 429,
        remaining: allowed ? 3 - calls : 0, limit: 100, window: 60, retryAfterMs: allowed ? 0 : 1500, rttMs: 30,
      }
    })
    renderWithProviders(<><DemoIndicator /><DemoPanel /></>)

    fireEvent.click(screen.getByRole('button', { name: /Run live demo/ }))
    expect(await screen.findByText('Phase 1: Normal traffic')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(6000))

    expect(check).toHaveBeenCalled()
    expect(screen.getByText('What happens when a request arrives')).toBeInTheDocument()
    expect(screen.getAllByText(/was blocked$/).length).toBeGreaterThan(0)
    expect(screen.getByText('Last 5 seconds')).toBeInTheDocument()
    expect(screen.getByText('Demo running')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Stop demo/ }))
    expect(await screen.findByText('Demo stopped')).toBeInTheDocument()
    const sentAtStop = check.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(check.mock.calls.length).toBe(sentAtStop)
  })
})
