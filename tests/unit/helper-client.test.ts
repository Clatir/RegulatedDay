import { describe, expect, it } from 'vitest'
import { HELPER_CRASH_WINDOW_MS, helperUnavailable, restartDelay } from '../../src/main/helper/client'

describe('pomocnik po awarii (Widget → Pomocnik)', () => {
  it('ponowny start po 5 s, potem coraz rzadziej, najwyżej co 5 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(restartDelay)).toEqual([5000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000])
  })

  it('3 awarie w 10 min: „niedostępny”; starsze się nie liczą', () => {
    const now = 1_000_000_000
    expect(helperUnavailable([now - 1000, now - 2000], now)).toBe(false)
    expect(helperUnavailable([now - 1000, now - 2000, now - 3000], now)).toBe(true)
    expect(helperUnavailable([now - HELPER_CRASH_WINDOW_MS - 1, now - 2000, now - 3000], now)).toBe(false)
  })
})
