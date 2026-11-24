/**
 * „Najtańsza zamiana” (N22, D598, T2621–T2623): when the day's forecast of energy reaches the reserve, one proposal – two
 * flexible blocks of one gap between fixed blocks change places – the swap that raises the lowest energy of the day most, by
 * `ENERGY_ORDER_GAIN` at least, judged by counting the day and its energy again under the rules of „Ułóż pod energię”.
 */
import { describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, shownOf } from '@shared/engine/energy'
import { ENERGY_ORDER_BELOW, ENERGY_ORDER_GAIN, SWAP_COUNTS, cheapestSwap, energyOrderVariant, lowestEnergy, reserveWarned } from '@shared/engine/energyOrder'
import { planWith, type VariantChange } from '@shared/engine/variants'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

// A pass-through spy: how many times the search counts the day again.
vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})

const DATE = '2026-10-28'
const FULL: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }

/**
 * The day (the reserve 20, no buffer) woken at `wake`, with a check-in (every pool 100) half an hour later, counted at `now`
 * (by default 07:30 of a day woken at 06:30), and its cheapest swap.
 */
function day(plan: PlanBlock[], o: { wake?: string; checkin?: string | false; now?: string; events?: (s: Scenario) => void; moduleOn?: boolean } = {}) {
  const wake = o.wake ?? '06:30'
  const s = new Scenario({ date: DATE, plan, wake, settings: { transitionBufferMin: 0, reserve: 20 } }).observe(wake, null)
  if (o.checkin !== false) s.checkin(o.checkin ?? '07:00', FULL)
  o.events?.(s)
  const ctx = s.contextAt(s.at(o.now ?? '07:30'))
  const state = computeDay(ctx)
  const energy = computeEnergy(ctx, state, { moduleOn: o.moduleOn ?? true })
  return { s, ctx, state, energy, swap: cheapestSwap(ctx, state, energy) }
}
type Day = ReturnType<typeof day>

/** The lowest energy of the day (units) with `changes` laid on, counted again. */
function lowestWith(d: Day, changes: readonly VariantChange[]): number {
  const ctx = { ...d.ctx, plan: planWith(d.ctx, changes) }
  return lowestEnergy(computeEnergy(ctx, computeDay(ctx)))!
}
const starts = (...xs: Array<[string, string]>): VariantChange[] => xs.map(([b, t]) => ({ k: 'start', block: b, startMin: lm(t) }))
const placeOf = (d: Day, id: string) => {
  const p = d.state.forecast.find((x) => x.block.id === id)!
  return [p.from, p.to]
}
const placeWith = (d: Day, id: string) => {
  const p = computeDay({ ...d.ctx, plan: planWith(d.ctx, d.swap!.changes) }).forecast.find((x) => x.block.id === id)!
  return [p.from, p.to]
}

/**
 * Before a long fixed class (12:00–22:00): a nap 08:00 – on a full head it gives nothing –, „Inne” 09:00 and „Analiza” 2 h
 * right before the class, where the head goes down to the reserve: the dear block at the dip.
 */
const dipDay = (classMin = 600) => [
  block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '08:00', min: 60 }),
  block({ id: 'c', cat: 'inne', at: '09:00', min: 60 }),
  block({ id: 'e', cat: 'analiza', at: '10:00', min: 120 }),
  block({ id: 'w', cat: 'zajecia-zdalne', at: '12:00', min: classMin, fixed: true })
]

describe('„Najtańsza zamiana” (N22)', () => {
  it('drogi blok przy dołku: drzemka ↔ Analiza – najniższa energia dnia 13 → 24 (poprawa ≥ progu)', () => {
    const d = day(dipDay())
    expect(reserveWarned(d.energy)).toBe(true)
    expect(d.energy.warnings).toEqual(['prognoza energii na poziomie rezerwy'])
    expect(d.swap).toEqual({
      a: 'r',
      b: 'e',
      before: 13,
      after: 24,
      // Laid out as „Ułóż” lays an order (T610): „Analiza” takes the first place, „Inne” between them follows its 2 h, the nap
      // comes right before the class.
      changes: starts(['e', '08:00'], ['c', '10:00'], ['r', '11:00'])
    })
    expect(d.swap!.after - d.swap!.before).toBeGreaterThanOrEqual(ENERGY_ORDER_GAIN)
    expect(d.swap!.before).toBe(shownOf(lowestEnergy(d.energy)!))
    // Judged by counting the day and its energy again (D340): what it says is what the day then shows.
    expect(shownOf(lowestWith(d, d.swap!.changes))).toBe(24)
    expect(placeWith(d, 'w')).toEqual(placeOf(d, 'w'))
  })

  it('bez ostrzeżenia o rezerwie – bez zamiany, choć „Ułóż pod energię” (poniżej 60) ma wariant', () => {
    // The class to 17:00: the lowest energy 43 – under 60, above the reserve.
    const d = day(dipDay(300))
    expect(shownOf(lowestEnergy(d.energy)!)).toBe(43)
    expect(shownOf(lowestEnergy(d.energy)!)).toBeLessThan(ENERGY_ORDER_BELOW)
    expect(reserveWarned(d.energy)).toBe(false)
    expect(d.energy.warnings).toEqual([])
    expect(energyOrderVariant(d.ctx, d.state, d.energy, (b) => b.id)).not.toBeNull()
    expect(d.swap).toBeNull()
  })

  it('dzień bez poprawy – nic: same bloki pracy przed stałym (zamiana nie zmienia sumy kosztów)', () => {
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '09:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '10:00', min: 660, fixed: true })
    ])
    expect(reserveWarned(d.energy)).toBe(true)
    expect(d.swap).toBeNull()
  })

  it(`poprawa mniejsza niż próg (${ENERGY_ORDER_GAIN}) – nic: najlepsze zamiany dają 8 → 12`, () => {
    // „Inne”, the nap, „Analiza” before a fixed „Analiza” of 9 h: „Analiza” before the nap (either swap) gives 4 only.
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '10:00', min: 60 }),
      block({ id: 'w', cat: 'analiza', at: '11:00', min: 540, fixed: true })
    ])
    expect(reserveWarned(d.energy)).toBe(true)
    expect(shownOf(lowestEnergy(d.energy)!)).toBe(8)
    expect(shownOf(lowestWith(d, starts(['e', '08:00'], ['c', '10:00'])))).toBe(12)
    expect(shownOf(lowestWith(d, starts(['e', '09:00'], ['r', '10:00'])))).toBe(12)
    expect(d.swap).toBeNull()
  })

  it('stałe i zaczęte nie biorą udziału – zostają na miejscu', () => {
    // „s” (begun at 07:30) is „Analiza” without costs.
    const plan = [{ ...block({ id: 's', cat: 'analiza', at: '07:30', min: 30 }), costs: { head: 0, emotions: 0, senses: 0, body: 0 } }, ...dipDay()]
    const d = day(plan, { now: '07:40', events: (s) => s.start('s', '07:30') })
    expect(d.swap).toMatchObject({ a: 'r', b: 'e', before: 13, after: 24 })
    expect(d.swap!.changes.map((c) => (c as { block: string }).block)).not.toContain('s')
    for (const id of ['s', 'w']) expect(placeWith(d, id)).toEqual(placeOf(d, id))
  })

  it('zakotwiczone nie biorą udziału (T611): „Analiza” zakotwiczona do „Inne” – obie stoją, sama drzemka nie ma pary', () => {
    const d = day(dipDay().map((b) => (b.id === 'e' ? { ...b, startMin: null, anchor: 'c' } : b)))
    expect(reserveWarned(d.energy)).toBe(true)
    expect(d.swap).toBeNull()
  })

  it('tylko w jednej przerwie między stałymi: bloki z różnych przerw nie są parowane', () => {
    // A fixed class 10:00–11:00 splits the morning: the nap and „Inne” before it, „Inne” and „Analiza” after it.
    const d = day([
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '08:00', min: 60 }),
      block({ id: 'c', cat: 'inne', at: '09:00', min: 60 }),
      block({ id: 'w1', cat: 'zajecia-zdalne', at: '10:00', min: 60, fixed: true }),
      block({ id: 'x', cat: 'inne', at: '11:00', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '12:00', min: 120 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '14:00', min: 480, fixed: true })
    ])
    expect(d.swap).toEqual({ a: 'r', b: 'c', before: 12, after: 17, changes: starts(['c', '08:00'], ['r', '09:00']) })
    for (const id of ['w1', 'x', 'e', 'w']) expect(placeWith(d, id)).toEqual(placeOf(d, id))
  })

  it('remis – deterministycznie: wcześniejszy pierwszy blok („Inne” ↔ „Analiza”, nie drzemka ↔ „Analiza”); ten sam dzień – ta sama zamiana', () => {
    // From 05:00: „Inne” 06:00, a nap 07:00, „Analiza” 08:00, the class 09:00–21:00. „Analiza” before the nap either way:
    // both swaps give the same lowest energy (to the unit) – the one of the earlier first block wins.
    const d = day(
      [
        block({ id: 'c', cat: 'inne', at: '06:00', min: 60 }),
        block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '07:00', min: 60 }),
        block({ id: 'e', cat: 'analiza', at: '08:00', min: 60 }),
        block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 720, fixed: true })
      ],
      { wake: '05:00', checkin: '05:30', now: '05:45' }
    )
    const ce = starts(['e', '06:00'], ['c', '08:00'])
    const re = starts(['e', '07:00'], ['r', '08:00'])
    expect(lowestWith(d, ce)).toBe(lowestWith(d, re))
    expect(d.swap).toEqual({ a: 'c', b: 'e', before: 15, after: 21, changes: ce })
    expect(cheapestSwap(d.ctx, d.state, d.energy)).toEqual(d.swap)
  })

  it(`dzień liczony ponownie najwyżej SWAP_COUNTS (${SWAP_COUNTS}) razy`, () => {
    const d = day(dipDay())
    const counted = vi.mocked(computeDay)
    counted.mockClear()
    expect(cheapestSwap(d.ctx, d.state, d.energy)).toEqual(d.swap)
    expect(counted.mock.calls.length).toBeLessThanOrEqual(SWAP_COUNTS)
    counted.mockClear()
    cheapestSwap(d.ctx, d.state, d.energy, { counts: 1 })
    expect(counted).toHaveBeenCalledTimes(1)
  })

  it('dzień miniony – nic', () => {
    const d = day(dipDay(), { now: '05:00+1' })
    expect(d.state.now).toBeGreaterThanOrEqual(d.state.grid.length)
    expect(d.swap).toBeNull()
  })

  it('dzień przyszły – liczony przed swoją pierwszą minutą, z check-inem o 04:00 (jak przyjęty, T903) – też ma zamianę', () => {
    // Counted the day before: every block is from „now” (the day's first minute).
    const s = new Scenario({ date: DATE, plan: dipDay(), wake: '06:30', settings: { transitionBufferMin: 0, reserve: 20 } }).checkin('04:00', FULL)
    const ctx = { ...s.contextAt(s.at('04:00') - 86_400_000), events: s.contextAt(s.at('04:00')).events }
    const state = computeDay(ctx)
    expect(state.now).toBe(0)
    const energy = computeEnergy(ctx, state)
    expect(reserveWarned(energy)).toBe(true)
    expect(cheapestSwap(ctx, state, energy)).toMatchObject({ a: 'r', b: 'e' })
  })

  it('bez check-inu (energia nieznana) i z wyłączonym modułem energii – nic', () => {
    expect(day(dipDay(), { checkin: false }).swap).toBeNull()
    expect(day(dipDay(), { moduleOn: false }).swap).toBeNull()
    expect(cheapestSwap(day(dipDay()).ctx, day(dipDay()).state, null)).toBeNull()
  })
})
