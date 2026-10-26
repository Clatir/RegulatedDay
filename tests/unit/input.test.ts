/**
 * Input and use of this computer (spec „Użycie komputera”): samples every 5 s, a streak of 30 s outside the app is use,
 * the app's own focus and 10 s after a click of the bar are not, gaps from 2 min are written when they reach 2 min and
 * closed at the next input or use, a gap through 04:00 is split between the days.
 */
import { describe, expect, it } from 'vitest'
import { dayStart } from '@shared/time/day'
import { InputTracker, SAMPLE_MS } from '../../src/main/engine/input'

function setup(start: number) {
  const clock = { now: start, lastInput: start }
  let focused = false
  const written: Array<Record<string, unknown>> = []
  const presence: Array<{ at: number; outside: boolean }> = []
  const t = new InputTracker({
    now: () => clock.now,
    idleSeconds: () => Math.floor((clock.now - clock.lastInput) / 1000),
    appFocused: () => focused,
    write: (d) => written.push(d),
    presence: (at, outside) => presence.push({ at, outside }),
    idle: () => undefined,
    computer: 'pca'
  })
  /** Runs the clock in 5-second samples; `input` keeps the user typing. */
  const run = (ms: number, input: boolean) => {
    for (let x = 0; x < ms; x += SAMPLE_MS) {
      clock.now += SAMPLE_MS
      if (input) clock.lastInput = clock.now - 1000
      t.sample()
    }
  }
  return { t, clock, written, presence, run, focus: (v: boolean) => (focused = v) }
}

const START = Date.UTC(2026, 9, 28, 9, 0)

describe('wejście i użycie komputera', () => {
  it('przerwy w wejściu i użyciu od 2 min: zapis przy 2 min, zamknięcie przy następnym wejściu i użyciu', () => {
    const s = setup(START)
    s.run(60_000, true)
    expect(s.written).toEqual([])
    s.run(3 * 60_000, false)
    expect(s.written.map((w) => [w.k, w.kind])).toEqual([
      ['gap.open', 'input'],
      ['gap.open', 'use']
    ])
    expect(s.written[0]!.from).toBe(START + 60_000 - 1000)
    s.run(40_000, true)
    // The input gap closes at the first input; the use gap once the streak lasted 30 s (at the streak's start).
    expect(s.written.slice(2).map((w) => [w.k, w.to])).toEqual([
      ['gap.close', START + 4 * 60_000 + 5_000 - 1000],
      ['gap.close', START + 4 * 60_000 + 5_000 - 1000]
    ])
  })

  it('wejście w oknie aplikacji to obecność, ale nie użycie', () => {
    const s = setup(START)
    s.focus(true)
    s.run(3 * 60_000, true)
    expect(s.written.map((w) => [w.k, w.kind])).toEqual([['gap.open', 'use']])
    expect(s.presence.every((p) => !p.outside)).toBe(true)
    s.focus(false)
    s.run(40_000, true)
    expect(s.written.at(-1)).toMatchObject({ k: 'gap.close' })
  })

  it('obecność „bez wejścia” dopiero po 15 s bez wejścia: czytanie z ruchem myszy co kilka sekund jej nie przełącza', () => {
    let idles = 0
    const clock = { now: START, lastInput: START }
    const t = new InputTracker({ now: () => clock.now, idleSeconds: () => Math.floor((clock.now - clock.lastInput) / 1000), appFocused: () => false, write: () => undefined, presence: () => undefined, idle: () => idles++, computer: 'pca' })
    for (let i = 0; i < 12; i++) {
      clock.now += SAMPLE_MS
      // Input every 10 s: samples see 5 s of idle time between them.
      if (i % 2 === 1) clock.lastInput = clock.now
      t.sample()
    }
    expect(idles).toBe(0)
    clock.now += 20_000
    t.sample()
    expect(idles).toBe(1)
  })

  it('10 s po kliknięciu w pasek pulpitu wejście jest obsługą aplikacji', () => {
    const s = setup(START)
    s.t.clickedApp(START)
    s.run(10_000, true)
    expect(s.presence.filter((p) => p.outside)).toEqual([])
    s.run(10_000, true)
    expect(s.presence.some((p) => p.outside)).toBe(true)
  })

  it('przerwa przez 04:00 dzieli się między oba dni', () => {
    const four = dayStart('2026-10-29')
    const s = setup(four - 10 * 60_000)
    s.run(60_000, true)
    s.run(15 * 60_000, false)
    const input = s.written.filter((w) => String(w.gap).includes('-input-'))
    expect(input.map((w) => [w.k, w.day, w.k === 'gap.close' ? w.to : w.from])).toEqual([
      ['gap.open', '2026-10-28', four - 9 * 60_000 - 1000],
      ['gap.close', '2026-10-28', four],
      ['gap.open', '2026-10-29', four]
    ])
  })
})
