import { describe, expect, it } from 'vitest'
import { ALGORITHMS, algorithmName, peakPerWindow, raceSchedule } from './algorithms'

describe('raceSchedule', () => {
  it('burst sends twice the limit up front, then trickles', () => {
    const times = raceSchedule('burst', 10, 10)
    expect(times.slice(0, 20).every((t) => t < 1000)).toBe(true)
    expect(times.length).toBeGreaterThan(20)
    expect(Math.max(...times)).toBeLessThan(22_000)
  })

  it('steady overload runs at twice the allowed rate', () => {
    const times = raceSchedule('steady', 10, 10)
    expect(times[1] - times[0]).toBe(500) // 20 per 10s
  })

  it('boundary straddles the next window edge at least 1.5s away', () => {
    const times = raceSchedule('boundary', 5, 10, 4000)
    const before = times.filter((t) => t < 4000)
    const after = times.filter((t) => t > 4000 && t < 4400)
    expect(before).toHaveLength(5)
    expect(after).toHaveLength(5)
    // Too close to the boundary: use the following one
    expect(raceSchedule('boundary', 5, 10, 500)[0]).toBeGreaterThan(9000)
  })
})

describe('peakPerWindow', () => {
  it('finds the most admissions inside any window', () => {
    // [1, 11) holds 1, 2, 9.5, 10.2, 10.4
    expect(peakPerWindow([0, 1, 2, 9.5, 10.2, 10.4], 10)).toBe(5)
    // Fixed Window across a boundary: 5 just before + 5 just after = 2x a limit of 5
    expect(peakPerWindow([9.1, 9.2, 9.3, 9.4, 9.5, 10.2, 10.3, 10.4, 10.5, 10.6], 5)).toBe(10)
    expect(peakPerWindow([], 10)).toBe(0)
  })
})

describe('metadata', () => {
  it('covers the four algorithms with distinct colors', () => {
    expect(ALGORITHMS.map((a) => a.id)).toEqual(['token_bucket', 'leaky_bucket', 'fixed_window', 'sliding_window'])
    expect(new Set(ALGORITHMS.map((a) => a.color)).size).toBe(4)
    expect(algorithmName('fixed_window')).toBe('Fixed Window')
  })
})
