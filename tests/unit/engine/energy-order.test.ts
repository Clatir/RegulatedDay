/**
 * „Ułóż pod energię” (D369, D374, D377, FBL2c): a variant that only changes the order of flexible blocks – protected ones
 * too – within their own gap between fixed blocks, offered when the lowest energy of the day is below 60 and the new order
 * raises it by 5 at least – judged by counting the day and its energy again (D340); fixed, begun and anchored blocks stay.
 */
import { describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, shownOf } from '@shared/engine/energy'
import { ENERGY_ORDER_BELOW, ENERGY_ORDER_GAIN, ORDER_COUNTS, energyOrderLabel, energyOrderVariant, lowestEnergy } from '@shared/engine/energyOrder'
import { applyVariant, planWith } from '@shared/engine/variants'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

// A pass-through spy: how many times the variant counts the day again.
vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})

const DATE = '2026-10-28'
const NAMES: Record<string, string> = { inne: 'Inne obowiązki', analiza: 'Analiza', regeneracja: 'Regeneracja', 'zajecia-zdalne': 'Zajęcia zdalne' }
const names = (b: { categoryId: string }) => NAMES[b.categoryId] ?? b.categoryId
type Answers = Record<Pool, [Answer, Answer]>
const ZERO: Answers = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }

/** The day with a check-in at 07:00 (every pool 100 – or as `answers` say), counted at `now`, and its variant. */
function day(plan: PlanBlock[], o: { now?: string; settings?: Record<string, unknown>; events?: (s: Scenario) => void; checkin?: boolean; answers?: Answers; calibration?: boolean } = {}) {
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0, ...o.settings } }).observe('06:30', null)
  if (o.checkin !== false) s.checkin('07:00', o.answers ?? ZERO)
  o.events?.(s)
  const now = o.now ?? '07:30'
  const ctx = s.contextAt(s.at(now))
  const state = computeDay(ctx)
  const energy = computeEnergy(ctx, state, { calibration: o.calibration === true })
  return { s, ctx, state, energy, v: energyOrderVariant(ctx, state, energy, names) }
}

/** The lowest energy of the day (as shown) with the variant's changes laid on. */
function lowestWith(d: ReturnType<typeof day>): number {
  const ctx = { ...d.ctx, plan: planWith(d.ctx, d.v!.changes) }
  return shownOf(lowestEnergy(computeEnergy(ctx, computeDay(ctx)))!)
}

/**
 * Before the fixed remote class (from 11:00, `classMin` long): „Inne” 08:00, a nap 09:00, „Analiza” 10:00 – the most
 * expensive block stands last, where the energy is lowest. The nap after „Inne” fills the head back to 100 and wastes 6 of
 * its 9; with „Analiza” first it gives all of them: the head after the class (the lowest of the day) rises by 6.
 */
const napDay = (classMin = 370) => [
  block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
  block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
  block({ id: 'e', cat: 'analiza', at: '10:00', min: 60 }),
  block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: classMin, fixed: true })
]

describe('„Ułóż pod energię” (D369, D374, D377)', () => {
  it('dzień z najdroższym blokiem przy najniższej energii dostaje wariant, który podnosi minimum energii (50 → 56)', () => {
    const d = day(napDay())
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.id).toBe('energyOrder')
    // „Analiza” goes before the nap, the nap (protected, D377) after it; „Inne” and the class stay. (Analiza first, the
    // nap, then „Inne” gives as much – of equal orders with as many moves the first one in the order of the plan stays.)
    expect(v.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('09:00') },
      { k: 'start', block: 'r', startMin: lm('10:00') }
    ])
    expect(v.energy).toEqual({ before: 50, after: 56 })
    expect(v.label).toBe('Ułóż pod energię – najniższa energia dnia 50 → 56')
    expect(v.details).toEqual(['Analiza 10:00 → 09:00', 'Regeneracja 09:00 → 10:00'])
    // Judged by counting the day and its energy again (D340): what the label says is what the day then shows.
    expect(lowestWith(d)).toBe(56)
    expect(v.energy!.before).toBe(shownOf(lowestEnergy(d.energy)!))
    expect(v.effect.extensionMin).toBe(0)
  })

  it(`próg D377: najniższa energia dnia ${ENERGY_ORDER_BELOW} i więcej – bez wariantu, choć kolejność dałaby 80 → 86`, () => {
    // The same day with a shorter class: the head after it is 80, with the order 86 – the day is not low enough.
    const d = day(napDay(70))
    expect(shownOf(lowestEnergy(d.energy)!)).toBe(80)
    expect(d.v).toBeNull()
    const ctx = { ...d.ctx, plan: planWith(d.ctx, [{ k: 'start', block: 'e', startMin: lm('08:00') }, { k: 'start', block: 'c', startMin: lm('10:00') }]) }
    expect(shownOf(lowestEnergy(computeEnergy(ctx, computeDay(ctx)))!)).toBe(86)
  })

  it('regeneracja (kategoria chroniona) może się przestawić: przed najdroższym blokiem podnosi minimum (D377)', () => {
    // A tired head (45 at the check-in), no fixed block: „Analiza” 2 h, then a nap of 1,5 h, then „Inne” – the head after
    // „Analiza” is the lowest of the day. „Inne”, the nap, then „Analiza”: the nap before the most expensive block.
    const d = day(
      [
        block({ id: 'e', cat: 'analiza', at: '10:00', min: 120 }),
        block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '12:00', min: 90 }),
        block({ id: 'c', cat: 'inne', at: '13:30', min: 60 })
      ],
      { answers: { ...ZERO, head: [2, 1] } }
    )
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.changes).toEqual([
      { k: 'start', block: 'c', startMin: lm('10:00') },
      { k: 'start', block: 'r', startMin: lm('11:00') },
      { k: 'start', block: 'e', startMin: lm('12:30') }
    ])
    expect(v.energy!.after - v.energy!.before).toBeGreaterThanOrEqual(ENERGY_ORDER_GAIN)
    expect(lowestWith(d)).toBe(v.energy!.after)
  })

  it('także w okresie kalibracji (D377: to nie reakcja na rezerwę)', () => {
    const d = day(napDay(), { calibration: true })
    expect(d.energy.variants).toBe(false)
    expect(d.v).toMatchObject({ id: 'energyOrder', energy: { before: 50, after: 56 } })
  })

  it('deterministyczny: ten sam dzień daje ten sam wariant; dzień liczony ponownie najwyżej ORDER_COUNTS razy', () => {
    const d = day(napDay())
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
      block({ id: 'w', cat: 'zajecia-zdalne', at: '10:00', min: 420, fixed: true })
    ])
    expect(shownOf(lowestEnergy(d.energy)!)).toBeLessThan(ENERGY_ORDER_BELOW)
    expect(d.v).toBeNull()
  })

  it('poprawa mniejsza niż próg (5) – bez wariantu', () => {
    // „Inne” without a cost of the head and a quiet regeneration (+3 an hour for the head): no order gains 5.
    const d = day([
      { ...block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }), costs: { head: 0, emotions: 1, senses: 1 } },
      block({ id: 'r', cat: 'regeneracja', variant: 'cisza', at: '09:00', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '10:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 370, fixed: true })
    ])
    expect(shownOf(lowestEnergy(d.energy)!)).toBeLessThan(ENERGY_ORDER_BELOW)
    expect(d.v).toBeNull()
  })

  it('stałe i zaczęte zostają na miejscu', () => {
    // „s” (begun at 07:30) is „Analiza” without costs: the head stays 100 before the nap, „Analiza” after it is no switch.
    const plan = [{ ...block({ id: 's', cat: 'analiza', at: '07:30', min: 30 }), costs: { head: 0, emotions: 0, senses: 0 } }, ...napDay()]
    const d = day(plan, { now: '07:40', events: (s) => s.start('s', '07:30') })
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.changes.map((c) => (c as { block: string }).block).sort()).toEqual(['c', 'e'])
    // The forecast with the changes: the begun „s” and the fixed class where they were.
    const after = computeDay({ ...d.ctx, plan: planWith(d.ctx, v.changes) })
    for (const id of ['s', 'w']) {
      const was = d.state.forecast.find((p) => p.block.id === id)!
      const now = after.forecast.find((p) => p.block.id === id)!
      expect([now.from, now.to]).toEqual([was.from, was.to])
    }
  })

  it('zakotwiczone zostają (T611): kolejność, która przesunęłaby blok z zakotwiczonym albo wypchnęła blok za stały, odpada', () => {
    // „x” has the nap anchored to it: both stay. „Analiza” (90 min) in the place of „Inne” (30 min) would push „x” – no
    // other order is left, so no variant.
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 30 }),
      block({ id: 'x', cat: 'inne', at: '08:30', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', after: 'x', min: 60 }),
      block({ id: 'e', cat: 'analiza', at: '10:30', min: 90 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '12:00', min: 360, fixed: true })
    ])
    expect(shownOf(lowestEnergy(d.energy)!)).toBeLessThan(ENERGY_ORDER_BELOW)
    expect(d.v).toBeNull()
  })

  it('tylko ta sama przerwa między blokami stałymi: blok zza stałego nie przechodzi przed niego', () => {
    // „Analiza” after the class would raise the minimum before the nap, but it is in another gap: the variant orders only
    // the first gap (the nap after both „Inne”).
    const d = day([
      block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
      block({ id: 'x', cat: 'inne', at: '10:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 180, fixed: true }),
      block({ id: 'e', cat: 'analiza', at: '14:00', min: 60 }),
      block({ id: 'w2', cat: 'zajecia-zdalne', at: '15:00', min: 180, fixed: true })
    ])
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.changes.map((c) => (c as { block: string }).block).sort()).toEqual(['r', 'x'])
    const after = computeDay({ ...d.ctx, plan: planWith(d.ctx, v.changes) })
    for (const id of ['w', 'e', 'w2']) expect(after.forecast.find((p) => p.block.id === id)!.from).toBe(d.state.forecast.find((p) => p.block.id === id)!.from)
  })

  it('z buforem przejścia między kategoriami: bloki stoją po przestawieniu tam, gdzie pokaże je prognoza', () => {
    const d = day(
      [
        block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
        block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
        block({ id: 'e', cat: 'analiza', at: '10:05', min: 60 }),
        block({ id: 'w', cat: 'zajecia-zdalne', at: '11:30', min: 370, fixed: true })
      ],
      { settings: { transitionBufferMin: 5 } }
    )
    const v = d.v!
    expect(v).not.toBeNull()
    // „Inne” keeps 08:00; „Analiza” and the nap after it, each with the buffer of a change of category.
    expect(v.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('09:05') },
      { k: 'start', block: 'r', startMin: lm('10:10') }
    ])
    const after = computeDay({ ...d.ctx, plan: planWith(d.ctx, v.changes) })
    const at = (id: string) => after.forecast.find((p) => p.block.id === id)!.from
    for (const id of ['e', 'r']) expect(at(id)).toBe(after.blocks.find((b) => b.id === id)!.start)
    expect(at('c')).toBe(d.state.forecast.find((p) => p.block.id === 'c')!.from)
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
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:20', min: 360, fixed: true })
    ]
    const d = day(plan)
    const v = d.v!
    expect(v).not.toBeNull()
    expect(v.energy!.after - v.energy!.before).toBeGreaterThanOrEqual(ENERGY_ORDER_GAIN)
    expect(lowestWith(d)).toBe(v.energy!.after)
    expect(v.changes.every((c) => c.k === 'start' && c.block !== 'w')).toBe(true)
    expect(energyOrderVariant(d.ctx, d.state, d.energy, names)).toEqual(v)
  })

  it('etykieta z liczb wariantu w jednym miejscu (`energyOrderLabel`)', () => {
    const v = day(napDay()).v!
    expect(v.label).toBe(energyOrderLabel(v.energy!))
  })

  it('T613: blok tej samej kategorii co blok przed przerwą zaczyna się bez bufora – szacunek liczy go od końca tamtego', () => {
    // „a” („Analiza” without costs) runs to 08:30; „Inne” planned 08:30 stands at 08:35 after the buffer. „Analiza” put first
    // would start at 08:30 – before the first slot as it is: counted from there, it no longer looks free of cost, and the
    // nap before the costly blocks wins (a tired head, 45; the class at 13:30 holds the end of work).
    const d = day(
      [
        { ...block({ id: 'a', cat: 'analiza', at: '07:30', min: 60 }), costs: { head: 0, emotions: 0, senses: 0 } },
        block({ id: 'b', cat: 'inne', at: '08:30', min: 60 }),
        block({ id: 'c', cat: 'analiza', at: '09:40', min: 120 }),
        block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '11:45', min: 90 }),
        block({ id: 'w', cat: 'zajecia-zdalne', at: '13:30', min: 30, fixed: true })
      ],
      { answers: { ...ZERO, head: [2, 1] }, settings: { transitionBufferMin: 5 }, now: '07:40', events: (s) => s.start('a', '07:30') }
    )
    expect(d.v?.energy).toEqual({ before: 20, after: 29 })
    expect(d.v!.changes).toEqual([
      { k: 'start', block: 'r', startMin: lm('09:40') },
      { k: 'start', block: 'c', startMin: lm('11:15') }
    ])
  })

  it('T610: start „koniec poprzedniego + bufor” (jak zapisuje rozsuwanie) to nie przerwa – nowi sąsiedzi tej samej kategorii bez dziury', () => {
    // Every start as rozsuwanie writes them (the end of the block before and 5 min); „Analiza” goes first, the two „Inne”
    // meet after the nap – the second right at the end of the first, no 5 min between them.
    const d = day(
      [
        block({ id: 'c1', cat: 'inne', at: '08:00', min: 60 }),
        block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:05', min: 60 }),
        block({ id: 'c2', cat: 'inne', at: '10:10', min: 60 }),
        block({ id: 'e', cat: 'analiza', at: '11:15', min: 60 }),
        block({ id: 'w', cat: 'zajecia-zdalne', at: '12:30', min: 370, fixed: true })
      ],
      { settings: { transitionBufferMin: 5 } }
    )
    expect(d.v!.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('08:00') },
      { k: 'start', block: 'c1', startMin: lm('11:10') }
    ])
    expect(d.v!.details).toEqual(['Analiza 11:15 → 08:00', 'Inne obowiązki 08:00 → 11:10'])
  })

  it('T611: kotwica bloku odwołanego (poza prognozą) nie stoi – przestawia się jak inne', () => {
    // „z” anchored to „Analiza” is cancelled: „Analiza” may go before the nap.
    const plan = [...napDay(), block({ id: 'z', cat: 'inne', after: 'e', min: 30 })].map((b) => (b.id === 'w' ? { ...b, startMin: lm('11:30') } : b))
    const d = day(plan, { events: (s) => s.raw({ k: 'block.cancel', block: 'z', at: s.at('07:10'), rule: 'click' }, '07:10') })
    expect(d.v!.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('09:00') },
      { k: 'start', block: 'r', startMin: lm('10:00') }
    ])
  })

  it('T609: najlepsze kolejności szacunku liczone ponownie – wygrywa prawdziwie najlepsza (bez przełączenia na stały blok tej samej kategorii)', () => {
    // The fixed block after the gap is „Inne” (10 h): the order that ends with „Inne” has no switch into it, which the
    // estimate of the gap does not see – both orders tie there; counted again, that one gives 2 more.
    const d = day(napDay().map((b) => (b.id === 'w' ? { ...b, categoryId: 'inne', durationMin: 600 } : b)))
    expect(d.v?.energy).toEqual({ before: 57, after: 65 })
    expect(d.v!.changes).toEqual([
      { k: 'start', block: 'e', startMin: lm('08:00') },
      { k: 'start', block: 'c', startMin: lm('10:00') }
    ])
  })

  it('D378, T617: przed zatwierdzeniem granicy koniec pracy może przejść za propozycję (w maksimum dnia); po zatwierdzeniu – nie', () => {
    // A tired head (45); „Analiza” 2 h, „Inne”, then the nap ends the day's blocks – the end of work 13:00. The nap before
    // „Analiza” raises the lowest energy and moves the end of work to 14:30: past the proposal (13:15), within the
    // maximum (19:00).
    const plan = [
      block({ id: 'e', cat: 'analiza', at: '10:00', min: 120 }),
      block({ id: 'c', cat: 'inne', at: '12:00', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '13:00', min: 90 })
    ]
    const answers = { ...ZERO, head: [2, 1] as [Answer, Answer] }
    const open = day(plan, { answers })
    expect(open.state.boundary.approved).toBeNull()
    // Indexes of the day's minutes from 04:00 (an ordinary day).
    expect(open.state.lastWorkForecast).toBe(lm('13:00') - 240)
    const v = open.v!
    expect(v).not.toBeNull()
    expect(v.effect.workEndMin).toBe(lm('14:30'))
    expect(lm('14:30') - 240).toBeGreaterThan(open.state.boundary.proposal!)
    expect(lm('14:30') - 240).toBeLessThanOrEqual(open.state.boundary.max)
    // The same morning with the boundary approved at its proposal: that order is no variant any more.
    const approved = day(plan, { answers, events: (s) => s.approve('13:15', '07:20') })
    expect(approved.state.boundary.approved).toBe(lm('13:15') - 240)
    expect(approved.v).toBeNull()
  })

  it('bez check-inu (energia nieznana) i z wyłączonym modułem energii – bez wariantu', () => {
    expect(day(napDay(), { checkin: false }).v).toBeNull()
    const s = new Scenario({ date: DATE, plan: napDay(), wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null)
    s.checkin('07:00', ZERO)
    const ctx = s.contextAt(s.at('07:30'))
    const state = computeDay(ctx)
    expect(energyOrderVariant(ctx, state, computeEnergy(ctx, state, { moduleOn: false }), names)).toBeNull()
  })

  it('wybrany wariant jako plik dnia: nowe starty na blokach z pliku, bez znaku wariantu (długość jak w planie)', () => {
    const d = day(napDay().map((b) => ({ ...b, origin: 'user' as const })))
    const ctx = d.ctx
    // The file holds a note written meanwhile on the nap: the new start goes over it.
    const raw = { schema: 1, date: DATE, blocks: ctx.plan.map((b) => (b.id === 'r' ? { ...b, note: 'nowa notatka' } : b)) }
    const r = applyVariant(ctx, raw, null, d.v!, '2026-10-29')
    const file = dayFileFrom(r.today, DATE)
    expect(file.blocks.find((b) => b.id === 'e')).toMatchObject({ startMin: lm('09:00'), byVariant: false })
    expect(file.blocks.find((b) => b.id === 'r')).toMatchObject({ startMin: lm('10:00'), note: 'nowa notatka', byVariant: false })
    expect(file.blocks.find((b) => b.id === 'c')!.startMin).toBe(lm('08:00'))
    expect(r.tomorrow).toBeNull()
    expect(r.start).toBeNull()
  })
})
