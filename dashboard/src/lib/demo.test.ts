import { describe, expect, it } from 'vitest'
import type { CheckResult } from './api'
import {
  DEMO_PHASES, explainFirstBlock, explainFirstRequest, explainLimitChange, summarizeTally,
} from './demo'

const result = (over: Partial<CheckResult> = {}): CheckResult => ({
  algorithm: 'token_bucket', allowed: true, status: 200, remaining: 99, limit: 100, window: 60, retryAfterMs: 0, rttMs: 42.4, ...over,
})

describe('demo scenario', () => {
  it('stays gentle on the API (at most 10 requests per second in any phase)', () => {
    for (const p of DEMO_PHASES) {
      expect(p.clients.reduce((sum, c) => sum + c.rps, 0)).toBeLessThanOrEqual(10)
    }
  })
})

describe('narration', () => {
  it('walks through a single request step by step', () => {
    const steps = explainFirstRequest('demo_web', 'global', result())
    expect(steps).toHaveLength(5)
    expect(steps[1]).toContain('100 requests per minute')
    expect(steps[2]).toContain('took one')
    expect(steps[3]).toContain('200 OK')
    expect(steps[4]).toContain('42 ms')
  })

  it('describes the algorithm that actually decided', () => {
    expect(explainFirstRequest('a', 'global', result({ algorithm: 'sliding_window' }))[2]).toContain('last window')
  })

  it('summarizes each client in plain English', () => {
    expect(summarizeTally({ clientId: 'demo_web', endpoint: 'global', allowed: 6, blocked: 0, last: result({ remaining: 80 }) }))
      .toBe('demo_web sent 6 and all were allowed (80 of 100 left).')
    expect(summarizeTally({ clientId: 'demo_scraper', endpoint: 'global', allowed: 4, blocked: 31, last: result() }))
      .toContain('4 allowed, 31 blocked')
    expect(summarizeTally({ clientId: 'client_a', endpoint: 'login', allowed: 0, blocked: 20, last: result({ limit: 20 }) }))
      .toContain('client_a /login sent 20 and all were blocked')
  })

  it('explains the first block and RL limit changes', () => {
    expect(explainFirstBlock('demo_scraper', 'global', result({ allowed: false, retryAfterMs: 600 })))
      .toContain('retry in 1 second.')
    expect(explainLimitChange('demo_scraper', 100, 90, { rps: 6.94, block_ratio: 0.78, action: 'decrease' }))
      .toBe(
        "The RL agent lowered demo_scraper's limit from 100 to 90. In the last window it saw 6.9 requests per second " +
        'with 78% blocked, and decided to lower the limit. It learns from the result, so its choices improve the longer it runs.',
      )
    expect(explainLimitChange('client_a/login', 20, 22)).toBe("The RL agent raised client_a /login's limit from 20 to 22.")
  })

  it('never uses em dashes', () => {
    const text = [
      ...DEMO_PHASES.flatMap((p) => [p.title, p.explanation]),
      ...explainFirstRequest('a', 'global', result()),
      explainFirstBlock('a', 'global', result()),
    ].join(' ')
    expect(text).not.toContain('—')
  })
})
