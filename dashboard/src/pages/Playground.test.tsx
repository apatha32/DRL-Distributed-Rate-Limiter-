import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { api } from '../lib/api'
import { renderWithProviders } from '../test/render'
import Playground from './Playground'

describe('Playground', () => {
  it('sends real checks and shows allowed and 429 decisions', async () => {
    const check = vi.spyOn(api, 'checkLimit')
      .mockResolvedValueOnce({ algorithm: 'token_bucket', allowed: true, status: 200, remaining: 1, limit: 2, window: 60, retryAfterMs: 0, rttMs: 12 })
      .mockResolvedValueOnce({ algorithm: 'token_bucket', allowed: false, status: 429, remaining: 0, limit: 2, window: 60, retryAfterMs: 4200, rttMs: 9 })
    renderWithProviders(<Playground />)

    fireEvent.click(screen.getByRole('button', { name: /Send 1/ }))
    expect(await screen.findByText('200 Allowed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Send 1/ }))
    expect(await screen.findByText('429 Blocked')).toBeInTheDocument()
    expect(screen.getByText(/retry in 5s/)).toBeInTheDocument()
    expect(check).toHaveBeenCalledWith('client_b', 'global', 1)
    expect(screen.getAllByText('Token Bucket').length).toBeGreaterThan(0)   // which algorithm decided
    expect(screen.getByText('Decisions per second')).toBeInTheDocument()
  })

  it('reports request failures in a toast', async () => {
    vi.spyOn(api, 'checkLimit').mockRejectedValueOnce(new Error('Network Error'))
    renderWithProviders(<Playground />)

    fireEvent.click(screen.getByRole('button', { name: /Send 1/ }))
    expect(await screen.findByText('Request failed')).toBeInTheDocument()
  })
})
