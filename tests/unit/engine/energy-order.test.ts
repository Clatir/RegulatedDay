/**
 * „Ułóż pod energię” (D369, D374, FBL2c): a variant that only changes the order of flexible blocks within their own gap
 * between fixed blocks, offered when the new order clearly raises the lowest energy of the day – judged by counting the
 * day and its energy again (D340); fixed, protected and begun blocks stay where they are.
 */
import { describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { ENERGY_ORDER_GAIN, ORDER_COUNTS, energyOrderVariant, lowestEnergy } from '@shared/engine/energyOrder'
import { shownOf } from '@shared/engine/energy'
import { applyVariant, planWith } from '@shared/engine/variants'
import type { PlanBlock } from '@shared/model/plan'
import { dayFileFrom } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

// A pass-through spy: how many times the variant counts the day again.
vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})

const DATE = '2026-10-28'
const NAMES: Record<string, string> = { inne: 'Inne obowiązki', analiza: 'Analiza', regeneracja: 'Regeneracja', 'zajecia-zdalne': 'Zajęcia zdalne' }
const names = (b: { categoryId: string }) => NAMES[b.categoryId] ?? b.categoryId
const ZERO = { head: [0, 0], emotions: [0, 0], senses: [0, 0] } as const

/** The day with a check-in at 07:00 (every pool 100), counted at `now`, and its variant. */
function day(plan: PlanBlock[], o: { now?: string; settings?: Record<string, unknown>; events?: (s: Scenario) => void; checkin?: boolean } = {}) {
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0, ...o.settings } }).observe('06:30', null)
  if (o.checkin !== false) s.checkin('07:00', ZERO as never)
  o.events?.(s)
  const now = o.now ?? '07:30'
  const ctx = s.contextAt(s.at(now))
  const { day: state, energy } = s.energyWithDay(now)
  return { s, ctx, state, energy, v: energyOrderVariant(ctx, state, energy, names) }
}

/** The lowest energy of the day (as shown) with the variant's changes laid on. */
function lowestWith(d: ReturnType<typeof day>): number {
  const ctx = { ...d.ctx, plan: planWith(d.ctx, d.v!.changes) }
  return shownOf(lowestEnergy(computeEnergy(ctx, computeDay(ctx)))!)
}

/**
 * Before the fixed remote class (11:00–14:00): „Inne” 08:00, a nap (regeneration, protected) 09:00, „Analiza” 10:00 –
 * the most expensive block stands last, where the energy is lowest. The nap after „Inne” fills the head back to 100 and
 * wastes 6 of its 9; with „Analiza” first it gives all of them, and the lowest energy (the head after the class) rises.
 */
const NAP_DAY = [
  block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
  block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
  block({ id: 'e', cat: 'analiza', at: '10:00', min: 60 }),
  block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 180, fixed: true })
]

describe('„Ułóż pod energię” (D369, D374)', () => {
  it('dzień z najdroższym blokiem przy najniższej energii dostaje wariant, który podnosi minimum energii', () => {
    const d = day(NAP_DAY)
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.id).toBe('energyOrder')
    // „Analiza” goes first, „Inne” after the nap; the nap and the class stay.
    expect(v.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('08:00') },
      { k: 'start', block: 'c', startMin: lm('10:00') }
    ])
    expect(v.energy!.after - v.energy!.before).toBeGreaterThanOrEqual(ENERGY_ORDER_GAIN)
    expect(v.label).toBe(`Ułóż pod energię – najniższa energia dnia ${v.energy!.before} → ${v.energy!.after}`)
    expect(v.details).toEqual(['Analiza 10:00 → 08:00', 'Inne obowiązki 08:00 → 10:00'])
    // Judged by counting the day and its energy again (D340): what the label says is what the day then shows.
    expect(lowestWith(d)).toBe(v.energy!.after)
    expect(v.energy!.before).toBe(shownOf(lowestEnergy(d.energy)!))
    expect(v.effect.extensionMin).toBe(0)
  })

  it('deterministyczny: ten sam dzień daje ten sam wariant; dzień liczony ponownie najwyżej ORDER_COUNTS razy', () => {
    const d = day(NAP_DAY)
    const counted = vi.mocked(computeDay)
    counted.mockClear()
    const again = energyOrderVariant(d.ctx, d.state, d.energy, names)
    expect(counted.mock.calls.length).toBeLessThanOrEqual(ORDER_COUNTS)
    expect(again).toEqual(d.v)
  })

  it('dzień bez poprawy – bez wariantu: same bloki pracy przed stałym (kolejność nie zmienia sumy kosztów)', () => {
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '09:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '10:00', min: 180, fixed: true })
    ])
    expect(d.v).toBeNull()
  })

  it('poprawa mniejsza niż próg (5) – bez wariantu', () => {
    // „Inne” without a cost of the head and a quiet regeneration (+3 an hour for the head): the order gains 3 at most.
    const d = day([
      { ...block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }), costs: { head: 0, emotions: 1, senses: 1 } },
      block({ id: 'r', cat: 'regeneracja', variant: 'cisza', at: '09:00', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '10:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 180, fixed: true })
    ])
    expect(d.v).toBeNull()
  })

  it('stałe, chronione i zaczęte zostają na miejscu', () => {
    // „s” (begun at 07:30) is „Analiza” without costs: the head stays 100 before the nap, „Analiza” after it is no switch.
    const plan = [{ ...block({ id: 's', cat: 'analiza', at: '07:30', min: 30 }), costs: { head: 0, emotions: 0, senses: 0 } }, ...NAP_DAY]
    const d = day(plan, { now: '07:40', events: (s) => s.start('s', '07:30') })
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.changes.map((c) => (c as { block: string }).block).sort()).toEqual(['c', 'e'])
    // The forecast with the changes: the begun „s”, the protected nap and the fixed class where they were.
    const ctx = { ...d.ctx, plan: planWith(d.ctx, v.changes) }
    const after = computeDay(ctx)
    for (const id of ['s', 'r', 'w']) {
      const was = d.state.forecast.find((p) => p.block.id === id)!
      const now = after.forecast.find((p) => p.block.id === id)!
      expect([now.from, now.to]).toEqual([was.from, was.to])
    }
  })

  it('kolejność, która przesunęłaby blok chroniony albo wypchnęła blok za stały, nie jest wariantem', () => {
    // „Analiza” (90 min) before the nap would push the nap planned at 08:30: no order fits, so no variant.
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 30 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '08:30', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '09:30', min: 90 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 180, fixed: true })
    ])
    expect(d.v).toBeNull()
  })

  it('tylko ta sama przerwa między blokami stałymi: blok zza stałego nie przechodzi przed niego', () => {
    // „Analiza” after the class would raise the minimum before the nap, but it is in another gap; in the first gap the two
    // „Inne” are the same – no order helps there.
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
      block({ id: 'x', cat: 'inne', at: '10:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 180, fixed: true }),
      block({ id: 'e', cat: 'analiza', at: '14:00', min: 60 }),
      block({ id: 'w2', cat: 'zajecia-zdalne', at: '15:00', min: 120, fixed: true })
    ])
    expect(d.v).toBeNull()
  })

  it('z buforem przejścia między kategoriami: bloki stoją po przestawieniu tam, gdzie pokaże je prognoza', () => {
    const d = day(
      [
        block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
        block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
        block({ id: 'e', cat: 'analiza', at: '10:05', min: 60 }),
        block({ id: 'w', cat: 'zajecia-zdalne', at: '11:30', min: 180, fixed: true })
      ],
      { settings: { transitionBufferMin: 5 } }
    )
    const v = d.v!
    expect(v).not.toBeNull()
    // The nap keeps its 09:05 (after the block before it and the buffer); „Inne” follows it with the buffer.
    expect(v.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('08:00') },
      { k: 'start', block: 'c', startMin: lm('10:10') }
    ])
    const after = computeDay({ ...d.ctx, plan: planWith(d.ctx, v.changes) })
    const at = (id: string) => after.forecast.find((p) => p.block.id === id)!.from
    expect(at('c')).toBe(after.blocks.find((b) => b.id === 'c')!.start)
    expect(at('r')).toBe(d.state.forecast.find((p) => p.block.id === 'r')!.from)
  })

  it('przerwa większa niż ORDER_EXACT_MAX bloków: zamiany po dwa, nadal deterministycznie', () => {
    const plan = [
      block({ id: 'a1', cat: 'inne', at: '08:00', min: 20 }),
      block({ id: 'a2', cat: 'inne', at: '08:20', min: 20 }),
      block({ id: 'a3', cat: 'inne', at: '08:40', min: 20 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
      block({ id: 'b1', cat: 'analiza', at: '10:00', min: 20 }),
      block({ id: 'b2', cat: 'analiza', at: '10:20', min: 20 }),
      block({ id: 'b3', cat: 'analiza', at: '10:40', min: 20 }),
      block({ id: 'b4', cat: 'inne', at: '11:00', min: 20 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:20', min: 180, fixed: true })
    ]
    const d = day(plan)
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.energy!.after - v.energy!.before).toBeGreaterThanOrEqual(ENERGY_ORDER_GAIN)
    expect(lowestWith(d)).toBe(v.energy!.after)
    expect(v.changes.every((c) => c.k === 'start' && !['r', 'w'].includes(c.block))).toBe(true)
    expect(energyOrderVariant(d.ctx, d.state, d.energy, names)).toEqual(v)
  })

  it('bez check-inu (energia nieznana) i z wyłączonym modułem energii – bez wariantu', () => {
    expect(day(NAP_DAY, { checkin: false }).v).toBeNull()
    const s = new Scenario({ date: DATE, plan: NAP_DAY, wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null)
    s.checkin('07:00', ZERO as never)
    const ctx = s.contextAt(s.at('07:30'))
    const state = computeDay(ctx)
    expect(energyOrderVariant(ctx, state, computeEnergy(ctx, state, { moduleOn: false }), names)).toBeNull()
  })

  it('wybrany wariant jako plik dnia: nowe starty na blokach z pliku, bez znaku wariantu (długość jak w planie)', () => {
    const d = day(NAP_DAY.map((b) => ({ ...b, origin: 'user' as const })))
    const ctx = { ...d.ctx, plan: d.ctx.plan }
    // The file holds a note written meanwhile on „c”: the new start goes over it.
    const raw = { schema: 1, date: DATE, blocks: ctx.plan.map((b) => (b.id === 'c' ? { ...b, note: 'nowa notatka' } : b)) }
    const r = applyVariant(ctx, raw, null, d.v!, '2026-10-29')
    const file = dayFileFrom(r.today, DATE)
    expect(file.blocks.find((b) => b.id === 'e')).toMatchObject({ startMin: lm('08:00'), byVariant: false })
    expect(file.blocks.find((b) => b.id === 'c')).toMatchObject({ startMin: lm('10:00'), note: 'nowa notatka', byVariant: false })
    expect(file.blocks.find((b) => b.id === 'r')!.startMin).toBe(lm('09:00'))
    expect(r.tomorrow).toBeNull()
    expect(r.start).toBeNull()
  })
})
