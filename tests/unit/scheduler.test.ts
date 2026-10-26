/**
 * The deadlines of the main process (spec „Terminy”): an exact timer for the nearest deadline and a check every 15 s, a
 * sleep told by a gap of more than 45 s, a change of the clock told by the two clocks moving apart, the change of the day
 * at 04:00 and after a wake – on a fake clock.
 */
import { describe, expect, it } from 'vitest'
import { CHECK_EVERY_MS, Scheduler, type CheckReason } from '../../src/main/engine/scheduler'

function harness(start: number) {
  let wall = start
  let mono = 0
  let pending: { fn: () => void; at: number } | null = null
  const log: Array<{ reason: CheckReason; at: number }> = []
  const days: string[] = []
  const wakes: number[] = []
  const jumps: number[] = []
  const s = new Scheduler({
    wall: () => wall,
    mono: () => mono,
    setTimer: (fn, ms) => (pending = { fn, at: mono + ms }),
    clearTimer: () => (pending = null),
    onCheck: (reason, at) => log.push({ reason, at }),
    onWake: (gap) => wakes.push(gap),
    onClockChange: (d) => jumps.push(d),
    onDayChange: (from, to) => days.push(`${from}→${to}`)
  })
  /** Time passes; the pending timer fires when its moment comes (on the monotonic clock). */
  const run = (ms: number) => {
    const end = mono + ms
    while (pending && pending.at <= end) {
      const p: { fn: () => void; at: number } = pending
      wall += p.at - mono
      mono = p.at
      pending = null
      p.fn()
    }
    wall += end - mono
    mono = end
  }
  return {
    s,
    log,
    days,
    wakes,
    jumps,
    run,
    sleep: (ms: number) => (wall += ms),
    setWall: (ms: number) => (wall += ms),
    get wall() {
      return wall
    }
  }
}

const T = Date.parse('2026-10-21T08:00:00Z')

describe('terminy w procesie głównym', () => {
  it('sprawdza wszystko co 15 s', () => {
    const h = harness(T)
    h.s.start()
    h.run(60_000)
    expect(h.log.filter((x) => x.reason === 'tick').length).toBe(5)
    expect(h.log[1]!.at - h.log[0]!.at).toBe(CHECK_EVERY_MS)
  })

  it('termin działa dokładnie w swojej chwili, raz', () => {
    const h = harness(T)
    const fired: number[] = []
    h.s.start()
    h.s.at('ostrzezenie', T + 20_500, (now) => fired.push(now))
    h.run(60_000)
    expect(fired).toEqual([T + 20_500])
    expect(h.s.has('ostrzezenie')).toBe(false)
  })

  it('przerwa ponad 45 s to uśpienie; termin przegapiony w uśpieniu działa po wybudzeniu', () => {
    const h = harness(T)
    const fired: number[] = []
    h.s.start()
    h.s.at('koniec', T + 30 * 60_000, (now) => fired.push(now))
    h.run(10_000)
    // The computer sleeps an hour: the monotonic clock stops, the wall clock goes on.
    h.sleep(60 * 60_000)
    h.run(5_000)
    expect(h.wakes.length).toBe(1)
    expect(fired.length).toBe(1)
    expect(h.log.some((x) => x.reason === 'wake')).toBe(true)
  })

  it('rozjazd zegara ściennego i monotonicznego bez przerwy to zmiana zegara', () => {
    const h = harness(T)
    h.s.start()
    h.run(5_000)
    h.setWall(-10 * 60_000)
    h.run(15_000)
    expect(h.jumps).toEqual([-10 * 60_000])
    expect(h.wakes).toEqual([])
  })

  it('o 04:00 ogłasza zmianę dnia logicznego', () => {
    const h = harness(Date.parse('2026-10-22T01:59:30Z'))
    h.s.start()
    h.run(60_000)
    expect(h.days).toEqual(['2026-10-21→2026-10-22'])
    expect(h.log.some((x) => x.reason === 'day')).toBe(true)
  })

  it('po wybudzeniu w następnym dniu ogłasza zmianę dnia', () => {
    const h = harness(Date.parse('2026-10-21T20:00:00Z'))
    h.s.start()
    h.sleep(10 * 3_600_000)
    h.run(15_000)
    expect(h.wakes.length).toBe(1)
    expect(h.days).toEqual(['2026-10-21→2026-10-22'])
  })

  it('dzień 25-godzinny: zmiana dnia o 04:00 czasu zimowego', () => {
    const h = harness(Date.parse('2026-10-25T02:59:30Z'))
    h.s.start()
    h.run(60_000)
    expect(h.days).toEqual(['2026-10-24→2026-10-25'])
  })
})
