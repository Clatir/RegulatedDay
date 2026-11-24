/**
 * „Wstaw regenerację tutaj” (N3, D599, T2644–T2646): by the warning of energy at the reserve, a block of regeneration of 15 min
 * right before the block in whose time the pool first reaches the reserve, by the way the reserve's message proposes for that
 * pool (1.27: the lowest cost in it), with the blocks after it pushed apart (D367) – only when the lowest state of the pool rises,
 * judged by counting the day and its energy again once. Never before now; today and days to come.
 */
import { describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, shownOf, toUnits } from '@shared/engine/energy'
import { reserveWarned } from '@shared/engine/energyOrder'
import { newUserBlock } from '@shared/engine/planEdit'
import { REGEN_COUNTS, REGEN_HERE_ID, REGEN_HERE_MIN, descentPlace, regenHere, regenWayName, type RegenHere } from '@shared/engine/regenHere'
import { suggestRegen } from '@shared/engine/reserve'
import type { Costs, Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { block, hhmm, lm, Scenario } from './dsl'

// A pass-through spy: how many times the proposal counts the day again.
vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})

const DATE = '2026-10-28'
const FULL: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const ZERO: Costs = { head: 0, emotions: 0, senses: 0, body: 0 }

/**
 * The day (the reserve 20, no buffer) woken at 06:30 with a check-in (every pool 100) at 07:00, counted at `now` (by default 07:30),
 * and its proposal.
 */
function day(plan: PlanBlock[], o: { now?: string; events?: (s: Scenario) => void; checkin?: false; moduleOn?: boolean; settings?: Record<string, unknown>; id?: string } = {}) {
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0, reserve: 20, ...o.settings } }).observe('06:30', null)
  if (o.checkin !== false) s.checkin('07:00', FULL)
  o.events?.(s)
  const ctx = s.contextAt(s.at(o.now ?? '07:30'))
  const state = computeDay(ctx)
  const energy = computeEnergy(ctx, state, { moduleOn: o.moduleOn ?? true })
  return { s, ctx, state, energy, regen: regenHere(ctx, state, energy, o.id ? { id: o.id } : {}) }
}
type Day = ReturnType<typeof day>

/**
 * „Analiza” from 07:30 to 13:30, a meal, „Analiza” 14:00–17:00 – the head reaches the reserve at 16:40, in its time –, „Inne”
 * 17:00 and a fixed class at `w` (21:00).
 */
const workDay = (o: { w?: string; e?: Partial<PlanBlock>; mealMin?: number; extra?: PlanBlock[] } = {}): PlanBlock[] =>
  [
    block({ id: 'a', cat: 'analiza', at: '07:30', min: 240 }),
    block({ id: 'b', cat: 'analiza', at: '11:30', min: 120 }),
    block({ id: 'p', cat: 'posilek', at: '13:30', min: o.mealMin ?? 30 }),
    { ...block({ id: 'e', cat: 'analiza', at: '14:00', min: 180 }), ...o.e },
    block({ id: 'c', cat: 'inne', at: '17:00', min: 60 }),
    ...(o.extra ?? []),
    block({ id: 'w', cat: 'zajecia-zdalne', at: o.w ?? '21:00', min: 60, fixed: true })
  ]

/** The day with the proposal written as the window writes it: the block (with the proposal's id) and the pushed starts. */
function written(d: Day, r: Omit<RegenHere, 'takes'>) {
  const starts = new Map(r.pushed.map((p) => [p.id, p.startMin]))
  const regen = newUserBlock('regeneracja', r.startMin, r.durationMin, d.ctx.snapshot.settings.categories.regeneracja, { id: r.id, variantId: r.variantId })
  const ctx = { ...d.ctx, plan: [...d.ctx.plan.map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b)), regen] }
  const state = computeDay(ctx)
  return { ctx, state, energy: computeEnergy(ctx, state, { moduleOn: true }) }
}
const lowestShown = (e: ReturnType<typeof computeEnergy>, p: Pool) => shownOf(toUnits(e.forecast!.min[p]))
const placeIn = (st: { state: Day['state'] }, id: string) => {
  const p = st.state.forecast.find((x) => x.block.id === id)!
  return [hhmm(st.state as Day['state'], p.from), hhmm(st.state as Day['state'], p.to)]
}

describe('„Wstaw regenerację tutaj” (N3)', () => {
  it('zejście głowy w bloku 14:00: drzemka 15 min staje na jego starcie, blok i kolejne elastyczne przesunięte o 15 min, minimum rośnie', () => {
    const d = day(workDay())
    expect(reserveWarned(d.energy)).toBe(true)
    expect(hhmm(d.state, d.energy.forecast!.reserveAt.head)).toBe('16:40')
    expect(d.regen).toMatchObject({ pool: 'head', beforeId: 'e', startMin: lm('14:00'), durationMin: REGEN_HERE_MIN, variantId: 'drzemka', before: 12, after: 14 })
    expect(d.regen!.pushed.map((p) => [p.id, p.fromMin, p.startMin])).toEqual([
      ['e', lm('14:00'), lm('14:15')],
      ['c', lm('17:00'), lm('17:15')]
    ])
    // What it says is what the day shows once written (with the window's own id): the regeneration at 14:00, the class stays.
    const w = written(d, d.regen!)
    expect(lowestShown(w.energy, 'head')).toBe(14)
    expect(placeIn(w, REGEN_HERE_ID)).toEqual(['14:00', '14:15'])
    expect(placeIn(w, 'e')).toEqual(['14:15', '17:15'])
    expect(placeIn(w, 'w')).toEqual(placeIn(d, 'w'))
  })

  it('T2644: miejsce zejścia (jedna reguła z podpowiedzią N20) – pula pierwsza w czasie, blok, przez który biegnie ta minuta', () => {
    const d = day(workDay())
    expect(descentPlace(d.state, d.energy)).toMatchObject({ pool: 'head', at: d.energy.forecast!.reserveAt.head, placed: { block: { id: 'e' } } })
    // No warning – no place.
    const calm = day(workDay({ e: { durationMin: 120 } }))
    expect(descentPlace(calm.state, calm.energy)).toBeNull()
  })

  it('T2644: zejście przełączeniem na starcie bloku (16:47) – to ten blok; regeneracja w minucie zejścia zdejmuje z niego przełączenie', () => {
    // „Analiza” 527 min leaves the head at 20,95; the switch into „Analiza” after the meal takes it to 18,95 at 16:47.
    const d = day([
      block({ id: 'a', cat: 'analiza', at: '07:30', min: 527 }),
      block({ id: 'p', cat: 'posilek', at: '16:17', min: 30 }),
      block({ id: 'e', cat: 'analiza', at: '16:47', min: 60 })
    ])
    expect(hhmm(d.state, d.energy.forecast!.reserveAt.head)).toBe('16:47')
    expect(descentPlace(d.state, d.energy)!.placed.block.id).toBe('e')
    expect(d.regen).toMatchObject({ pool: 'head', beforeId: 'e', startMin: lm('16:47') })
    expect(d.regen!.after).toBeGreaterThan(d.regen!.before)
  })

  it('T2871: pula już na rezerwie teraz (głowa 16:45) nie zabiera propozycji – bodźce schodzą w zajęciach 21:00, cisza przed nimi', () => {
    // „Inne” 18:00–19:30 dear in the senses (its own costs); now 16:45, „Analiza” running, the head at the reserve since 16:40.
    const d = day(workDay({ extra: [{ ...block({ id: 'x', cat: 'inne', at: '18:00', min: 90 }), costs: { ...ZERO, senses: 10 } }] }), {
      now: '16:45',
      events: (s) => s.ran('a', '07:30', '11:30').ran('b', '11:30', '13:30').ran('p', '13:30', '14:00').start('e', '14:00')
    })
    expect(d.energy.forecast!.reserveAt.head).toBe(d.state.now)
    expect(hhmm(d.state, d.energy.forecast!.reserveAt.senses)).toBe('21:35')
    expect(d.regen).toMatchObject({ pool: 'senses', beforeId: 'w', startMin: lm('20:45'), variantId: 'cisza', before: 18, after: 20 })
  })

  it('T2872: remis startów rozstrzygają id – propozycja liczona z id, które się zapisze; inne id daje inny układ', () => {
    // A meal planned at 14:00 beside „Analiza” 14:00 (shown after it): the regeneration at 14:00 meets it on the same start.
    const plan = workDay({ extra: [block({ id: 'q', cat: 'posilek', at: '14:00', min: 30 })] })
    const first = day(plan, { id: '0aaa' })
    expect(first.regen).toMatchObject({ id: '0aaa', beforeId: 'e', startMin: lm('14:00') })
    // Written with its own id the day is the one counted: the regeneration at 14:00, the pool as said.
    const same = written(first, first.regen!)
    expect(placeIn(same, '0aaa')).toEqual(['14:00', '14:15'])
    expect(lowestShown(same.energy, 'head')).toBe(first.regen!.after)
    // The same proposal written with an id after the meal's – the meal goes first, the regeneration is not where it was said.
    const other = written(first, { ...first.regen!, id: 'zzzz' })
    expect(placeIn(other, 'zzzz')).not.toEqual(['14:00', '14:15'])
    // Counted with that id, there is no proposal at all.
    expect(day(plan, { id: 'zzzz' }).regen).toBeNull()
  })

  it('T2873: start nigdy przed końcem bieżącego kroku 5 min – stały 14:02: o 13:43 regeneracja 13:47, o 13:46 już nie', () => {
    const plan = workDay({ e: { fixed: true, startMin: lm('14:02') }, mealMin: 15 })
    const events = (s: Scenario) => s.ran('a', '07:30', '11:30').ran('b', '11:30', '13:30').start('p', '13:30')
    expect(day(plan, { now: '13:43', events }).regen).toMatchObject({ beforeId: 'e', startMin: lm('13:47') })
    // 13:46: the start would be 13:47 – within the step 13:45–13:49 the window shows one count: the next full 5 min (13:50) does not fit.
    expect(day(plan, { now: '13:46', events }).regen).toBeNull()
  })

  /** „Sprawy” or „Inne” 4 h, „Inne” 4 h with its own costs (the senses reach the reserve in it), „Inne” `cMin`; the way `x` when given. */
  const sensesDay = (first: string, costs: Partial<typeof ZERO>, cMin: number, x?: typeof ZERO) =>
    day([block({ id: 'a', cat: first, at: '07:30', min: 240 }), { ...block({ id: 'd', cat: 'inne', at: '11:30', min: 240 }), costs: { ...ZERO, ...costs } }, block({ id: 'c', cat: 'inne', at: '15:30', min: cMin })], x ? { settings: { categories: { regeneracja: { variants: [{ id: 'x', name: 'X', costs: x }] } } } } : {})
  /** The day with the regeneration written by hand before „Inne” 11:30 (the way `variantId`), and the pool's lowest shown before / after. */
  const byHand = (d: Day, variantId: string, p: Pool) => {
    const w = written(d, { id: REGEN_HERE_ID, pool: 'senses', beforeId: 'd', startMin: lm('11:30'), durationMin: 15, variantId, before: 0, after: 0, pushed: [{ id: 'd', startMin: lm('11:45') }, { id: 'c', startMin: lm('15:45') }] as RegenHere['pushed'] })
    return [lowestShown(d.energy, p), lowestShown(w.energy, p)]
  }

  it('T2874, T2876: inna pula daleko nad rezerwą może stracić punkt – głowa 85 → 84 (przełączenie po regeneracji), propozycja zostaje', () => {
    // „Inne”, the regeneration, „Inne”: the switch back costs the head 2, the quiet gives it 0,75.
    const d = sensesDay('inne', { senses: 6 }, 60)
    expect(byHand(d, 'cisza', 'head')).toEqual([85, 84])
    expect(d.regen).toMatchObject({ pool: 'senses', beforeId: 'd', variantId: 'cisza', before: 13, after: 15 })
  })

  it('T2874, T2876: inna pula spada w strefę „uwaga” paska (rezerwa 20 + 15) – głowa 36 → 33: bez propozycji', () => {
    // The only way: −10 senses, +4 head an hour; „Inne” 11:30 dear in the head too: the head's lowest 36 falls to 33 < 35.
    const d = sensesDay('sprawy', { head: 4, senses: 6 }, 40, { head: 4, emotions: 0, senses: -10, body: 0 })
    expect(byHand(d, 'x', 'head')).toEqual([36, 33])
    expect(byHand(d, 'x', 'senses')[1]).toBeGreaterThan(byHand(d, 'x', 'senses')[0]!)
    expect(d.regen).toBeNull()
  })


  it(`T2871: najwyżej REGEN_COUNTS (${REGEN_COUNTS}) przeliczenia dnia`, () => {
    const d = day(workDay())
    const counted = vi.mocked(computeDay)
    counted.mockClear()
    regenHere(d.ctx, d.state, d.energy)
    expect(counted.mock.calls.length).toBeLessThanOrEqual(REGEN_COUNTS)
  })

  it('dzień liczony ponownie raz (jedno przeliczenie dnia i energii)', () => {
    const d = day(workDay())
    const counted = vi.mocked(computeDay)
    counted.mockClear()
    expect(regenHere(d.ctx, d.state, d.energy)).toEqual(d.regen)
    expect(counted).toHaveBeenCalledTimes(1)
  })

  it('stały za blokiem nie przesuwa się: „Inne”, które trafiłoby na zajęcia 18:00, przeskakuje je (D367)', () => {
    const d = day(workDay({ w: '18:00' }))
    expect(d.regen).toMatchObject({ beforeId: 'e', startMin: lm('14:00'), before: 4, after: 9 })
    expect(d.regen!.pushed.map((p) => [p.id, p.startMin])).toEqual([
      ['e', lm('14:15')],
      ['c', lm('19:00')]
    ])
    const w = written(d, d.regen!)
    expect(placeIn(w, 'w')).toEqual(['18:00', '19:00'])
    expect(placeIn(w, 'c')).toEqual(['19:00', '20:00'])
  })

  it('wariant najbardziej odciążający pulę (jak komunikat 1.27): bodźce – cisza, ciało – drzemka', () => {
    // „Sprawy domowe” 4 h, then „Inne” 4 h dear in one pool (its own costs) and „Inne” 1 h: that pool reaches the reserve in it. „Inne”
    // after „Sprawy” switches either way – the regeneration between them adds no switch (T2874: no other pool goes lower).
    const poolDay = (p: Pool, cost: number) =>
      day([block({ id: 'a', cat: 'sprawy', at: '07:30', min: 240 }), { ...block({ id: 'd', cat: 'inne', at: '11:30', min: 240 }), costs: { ...ZERO, [p]: cost } }, block({ id: 'c', cat: 'inne', at: '15:30', min: 60 })])
    const senses = poolDay('senses', 6)
    expect(senses.regen).toMatchObject({ pool: 'senses', beforeId: 'd', startMin: lm('11:30'), variantId: 'cisza' })
    expect(senses.regen!.variantId).toBe(suggestRegen(senses.state.settings, 'senses'))
    const body = poolDay('body', 6)
    expect(body.regen).toMatchObject({ pool: 'body', beforeId: 'd', startMin: lm('11:30'), variantId: 'drzemka' })
    expect(regenWayName(body.state.settings, 'drzemka')).toBe('Leżenie, drzemka')
    for (const x of [senses, body]) {
      expect(x.regen!.after).toBeGreaterThan(x.regen!.before)
      expect(lowestShown(written(x, x.regen!).energy, x.regen!.pool)).toBe(x.regen!.after)
    }
  })

  it('nie przed teraz: blok z zejściem należny od 14:00, teraz 14:12 – regeneracja o 14:15, blok za nią', () => {
    const d = day(workDay(), { now: '14:12', events: (s) => s.ran('a', '07:30', '11:30').ran('b', '11:30', '13:30').ran('p', '13:30', '14:00') })
    expect(d.regen).toMatchObject({ beforeId: 'e', startMin: lm('14:15') })
    expect(d.regen!.pushed.map((p) => [p.id, p.startMin])).toEqual([
      ['e', lm('14:30')],
      ['c', lm('17:30')]
    ])
    expect(placeIn(written(d, d.regen!), REGEN_HERE_ID)).toEqual(['14:15', '14:30'])
  })

  it('blok z zejściem trwa – regeneracja po teraz nie stanie przed zejściem (prognoza dokończy blok): nic', () => {
    const d = day(workDay(), { now: '15:02', events: (s) => s.ran('a', '07:30', '11:30').ran('b', '11:30', '13:30').ran('p', '13:30', '14:00').start('e', '14:00') })
    expect(reserveWarned(d.energy)).toBe(true)
    expect(d.regen).toBeNull()
  })

  it('blok z zejściem stały: regeneracja kończy się na jego starcie, gdy tam się mieści; nie mieści się (posiłek przed nim) – nic', () => {
    // The meal 13:30–13:45: the quarter before the fixed „Analiza” is free.
    const free = day(workDay({ e: { fixed: true }, mealMin: 15 }))
    expect(free.regen).toMatchObject({ beforeId: 'e', startMin: lm('13:45') })
    expect(free.regen!.after).toBeGreaterThan(free.regen!.before)
    const w = written(free, free.regen!)
    expect(placeIn(w, REGEN_HERE_ID)).toEqual(['13:45', '14:00'])
    expect(placeIn(w, 'e')).toEqual(placeIn(free, 'e'))
    // The meal 13:30–14:00 holds the place: the regeneration would go behind the fixed block (D340) – no proposal.
    expect(day(workDay({ e: { fixed: true } })).regen).toBeNull()
  })

  it('brak ostrzeżenia – nic', () => {
    // „Analiza” 14:00 for 2 h only: the head stays above the reserve.
    const d = day(workDay({ e: { durationMin: 120 } }))
    expect(reserveWarned(d.energy)).toBe(false)
    expect(d.regen).toBeNull()
  })

  it('brak poprawy – nic: „Analiza” po „Analizie” – przełączenie po regeneracji zjada jej zysk', () => {
    const d = day([
      block({ id: 'a', cat: 'analiza', at: '07:30', min: 240 }),
      block({ id: 'b', cat: 'analiza', at: '11:30', min: 180 }),
      block({ id: 'e', cat: 'analiza', at: '14:30', min: 120 }),
      block({ id: 'c', cat: 'inne', at: '16:30', min: 60 })
    ])
    expect(reserveWarned(d.energy)).toBe(true)
    expect(d.regen).toBeNull()
    // The same regeneration written by hand: the lowest head as shown stays.
    const by = written(d, { id: REGEN_HERE_ID, pool: 'head', beforeId: 'e', startMin: lm('14:30'), durationMin: 15, variantId: 'drzemka', before: 0, after: 0, pushed: [{ id: 'e', startMin: lm('14:45') }, { id: 'c', startMin: lm('16:45') }] as RegenHere['pushed'] })
    expect(lowestShown(by.energy, 'head')).toBe(lowestShown(d.energy, 'head'))
  })

  it('dzień przyszły – liczony przed swoją pierwszą minutą, z check-inem o 04:00 (jak przyjęty, T903) – też ma propozycję', () => {
    const s = new Scenario({ date: DATE, plan: workDay(), wake: '06:30', settings: { transitionBufferMin: 0, reserve: 20 } }).checkin('04:00', FULL)
    const ctx = { ...s.contextAt(s.at('04:00') - 86_400_000), events: s.contextAt(s.at('04:00')).events }
    const state = computeDay(ctx)
    expect(state.now).toBe(0)
    const energy = computeEnergy(ctx, state)
    expect(reserveWarned(energy)).toBe(true)
    expect(regenHere(ctx, state, energy)).toMatchObject({ pool: 'head', variantId: 'drzemka' })
  })

  it('dzień miniony, bez check-inu i z wyłączonym modułem energii – nic', () => {
    const gone = day(workDay(), { now: '05:00+1' })
    expect(gone.state.now).toBeGreaterThanOrEqual(gone.state.grid.length)
    expect(gone.regen).toBeNull()
    expect(day(workDay(), { checkin: false }).regen).toBeNull()
    expect(day(workDay(), { moduleOn: false }).regen).toBeNull()
    const d = day(workDay())
    expect(regenHere(d.ctx, d.state, null)).toBeNull()
  })
})
