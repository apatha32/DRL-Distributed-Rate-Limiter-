import { describe, expect, it } from 'vitest'
import { nextSample } from './throughput'

describe('nextSample', () => {
  const a = { at: 100, allowed: 1000, blocked: 50 }

  it('needs a previous reading', () => {
    expect(nextSample(null, a)).toBeNull()
  })

  it('computes per-second rates between polls', () => {
    expect(nextSample(a, { at: 102, allowed: 1100, blocked: 60 })).toEqual({ t: 102, allowed: 50, blocked: 5 })
  })

  it('ignores repeated readings and counter resets after a restart', () => {
    expect(nextSample(a, { ...a })).toBeNull()
    expect(nextSample(a, { at: 104, allowed: 3, blocked: 0 })).toBeNull()
  })
})
