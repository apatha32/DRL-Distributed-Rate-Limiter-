import { describe, expect, it } from 'vitest'
import { compact, duration, ms, percent, rate, ratio } from './format'

describe('format', () => {
  it('keeps small numbers exact and compacts large ones', () => {
    expect(compact(1284)).toBe('1,284')
    expect(compact(12_900)).toBe('12.9K')
    expect(compact(4_200_000)).toBe('4.2M')
  })

  it('formats latencies by magnitude', () => {
    expect(ms(0.098)).toBe('0.10 ms')
    expect(ms(12.34)).toBe('12.3 ms')
    expect(ms(250)).toBe('250 ms')
    expect(ms(null)).toBe('—')
  })

  it('formats rates, ratios and durations', () => {
    expect(rate(3.14)).toBe('3.1')
    expect(rate(1234)).toBe('1,234')
    expect(percent(0.0912)).toBe('9.1%')
    expect(ratio(1, 0)).toBe(0)
    expect(duration(59)).toBe('59s')
    expect(duration(3725)).toBe('1h 2m')
    expect(duration(90_000)).toBe('1d 1h')
  })
})
