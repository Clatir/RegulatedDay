/**
 * Energy live (N19, T2574–T2580): the lowest energy of a day before a change and with it, counted on trial while a block or a group is dragged,
 * an edge changes a length, or the window of a tile's cost is open – the same rule and the same numbers as the line after the change (D529,
 * `groupEnergy`), from now on today, from the day's first minute for a day to come (from the assumed check-in), nothing written.
 */
import { describe, expect, it, vi } from 'vitest'
import * as dayModule from '@shared/engine/day'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, shownOf, toUnits } from '@shared/engine/energy'
import { lowestEnergy } from '@shared/engine/energyOrder'
import { assumedEnergy } from '@shared/engine/energyTrack'
import { dragPreview } from '@shared/engine/groupDrag'
import { groupEnergy } from '@shared/engine/groupEdit'
import { idxOf } from '@shared/engine/grid'
import { pushApart } from '@shared/engine/pushApart'
import { costTrial, lowestBefore, resizeTrial, trialLowest, type TrialDay } from '@shared/engine/trialEnergy'
import type { Answer } from '@shared/model/events'
import type { Pool } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { addDays } from '@shared/time/zone'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday
const ZERO: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const HEAVY = { head: 6, emotions: 0, senses: 0, body: 0 }

/** An expensive block in the morning, a regeneration after it, work in the afternoon: the lowest is after the afternoon's work. */
const PLAN = [
  flex('drogi', '08:00', 120, { categoryId: 'analiza' }),
  flex('regen', '10:00', 120, { categoryId: 'regeneracja', fixed: true }),
  flex('praca', '14:00', 120, { categoryId: 'analiza' })
]

function scenario(plan: PlanBlock[] = PLAN, date = DATE): Scenario {
  return new Scenario({ date, plan, wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null)
}

/** The day as the window counts it (`countDay`): context, state and energy at `now` (`at` – another instant, e.g. the day before). */
function dayOf(s: Scenario, now: string, o: { at?: number; moduleOn?: boolean } = {}): TrialDay {
  const ctx = s.contextAt(o.at ?? s.at(now))
  const state = computeDay(ctx)
  return { ctx, state, energy: computeEnergy(ctx, state, { moduleOn: o.moduleOn !== false }) }
}

const moved = (plan: readonly PlanBlock[], id: string, at: string): PlanBlock[] => plan.map((b) => (b.id === id ? { ...b, startMin: lm(at) } : b))

describe('N19 – próbne policzenie dnia: przeciągnięcie, krawędź, grupa', () => {
  it('drogi blok przesunięty na niską energię (po pracy popołudniowej) – after < before, pula minimum po zmianie', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const t = trialLowest(day, { plan: moved(day.ctx.plan, 'drogi', '16:00') })!
    expect(t).not.toBeNull()
    expect(t.after).toBeLessThan(t.before)
    expect(t.pool).toBe('head')
    expect(t.beforePool).toBe('head')
    expect(t.assumed).toBe(false)
  })

  it('te same liczby co linia po zapisie (D529 `groupEnergy`) – podpis w trakcie i linia po upuszczeniu się zgadzają', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const plan = moved(day.ctx.plan, 'drogi', '16:00')
    const t = trialLowest(day, { plan })!
    expect(groupEnergy(day, { plan }, { moduleOn: true })).toEqual({ before: t.before, after: t.after })
    expect(t.before).toBe(shownOf(lowestEnergy(day.energy)!))
  })

  it('bez zmiany – after = before (podpis mówi „bez zmian”, nie null)', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const t = trialLowest(day, {})!
    expect(t.after).toBe(t.before)
    expect(trialLowest(day, { plan: day.ctx.plan })!.after).toBe(t.before)
  })

  it('rozsunięcie (D367): plan z przesuniętymi startami – drogi blok przed pracą popołudniową spycha ją dalej, minimum niżej', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const plan = moved(day.ctx.plan, 'drogi', '13:00')
    const pushed = pushApart(day.ctx, day.state, plan, 'drogi')
    const starts = new Map(pushed.map((p) => [p.id, p.startMin]))
    expect(starts.get('praca')).toBe(lm('15:00'))
    const t = trialLowest(day, { plan: plan.map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b)) })!
    expect(t.after).toBeLessThan(t.before)
  })

  it('krawędź: dłuższy blok (dolna krawędź) – niżej; krótszy – wyżej', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const longer = trialLowest(day, { plan: day.ctx.plan.map((b) => (b.id === 'praca' ? { ...b, durationMin: 240 } : b)) })!
    const shorter = trialLowest(day, { plan: day.ctx.plan.map((b) => (b.id === 'praca' ? { ...b, durationMin: 30 } : b)) })!
    expect(longer.after).toBeLessThan(longer.before)
    expect(shorter.after).toBeGreaterThan(shorter.before)
  })

  it('krawędź trwającego bloku (`resizeTrial`, kliknięcie `resize` timera) – dłuższy niżej; bez zmiany – brak próby', () => {
    const s = scenario([flex('a', '08:00', 60, { categoryId: 'analiza', costs: HEAVY })]).checkin('07:00', ZERO).start('a', '08:00')
    const day = dayOf(s, '08:30')
    const longer = resizeTrial(day, 'a', s.at('11:00'), day.ctx.now)
    expect(longer?.events?.map((e) => e.k)).toEqual(['block.extend'])
    const t = trialLowest(day, longer!)!
    expect(t.after).toBeLessThan(t.before)
    expect(resizeTrial(day, 'a', s.at('09:00'), day.ctx.now)).toBeNull()
    expect(resizeTrial(day, 'nic', s.at('11:00'), day.ctx.now)).toBeNull()
  })

  it('grupa (D531 `dragPreview`): dwa bloki przeciągnięte razem na popołudnie – plan podglądu daje after < before', () => {
    const plan = [flex('a', '08:00', 60, { categoryId: 'analiza' }), flex('b', '09:00', 60, { categoryId: 'analiza' }), ...PLAN.slice(1)]
    const day = dayOf(scenario(plan).checkin('07:00', ZERO), '07:30')
    const p = dragPreview(day, ['a', 'b'], 8 * 60, DATE, { axis: 'forecast' })!
    expect(p.plan?.find((b) => b.id === 'a')?.startMin).toBe(lm('16:00'))
    const t = trialLowest(day, { plan: p.plan! })!
    expect(t.after).toBeLessThan(t.before)
    expect(t.pool).toBe('head')
  })
})

describe('N19 – okienko kosztu przed zapisem (`costTrial`, D501)', () => {
  it('niezaczęty: własny koszt w planie – droższy niżej, „Jak podkategoria” (null) wraca do before', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const dearer = costTrial(day, 'praca', { head: 9, emotions: 1, senses: 1, body: 0 })!
    expect(dearer.plan?.find((b) => b.id === 'praca')?.costs).toEqual({ head: 9, emotions: 1, senses: 1, body: 0 })
    expect(dearer.events).toBeUndefined()
    const t = trialLowest(day, dearer)!
    expect(t.after).toBeLessThan(t.before)
    expect(trialLowest(day, costTrial(day, 'praca', null)!)!.after).toBe(t.before)
  })

  it('zaczęty i trwający: `block.cost` od teraz – minuty minione po staremu, prognoza niżej', () => {
    const s = scenario().checkin('07:00', ZERO).start('drogi', '08:00')
    const day = dayOf(s, '09:00')
    const c = costTrial(day, 'drogi', { head: 12, emotions: 0, senses: 0, body: 0 }, day.ctx.now)!
    expect(c.plan).toBeUndefined()
    expect(c.events?.map((e) => [e.k, (e as { at?: number }).at])).toEqual([['block.cost', day.ctx.now]])
    const t = trialLowest(day, c)!
    expect(t.after).toBeLessThan(t.before)
    // The minutes gone by stay counted by the old cost: the state now is the same with the change.
    const ctx = { ...day.ctx, events: [...day.ctx.events, ...c.events!] }
    expect(computeEnergy(ctx, computeDay(ctx), {}).shown).toEqual(day.energy.shown)
  })

  it('chwila próby to chwila liczenia (T2580): dzień policzony 5 min wcześniej (liczby całkowite nie zauważą 25 s) – before i after liczone w tej samej, późniejszej chwili', () => {
    const s = scenario().checkin('07:00', ZERO).start('drogi', '08:00')
    const old = dayOf(s, '09:00')
    const at = old.ctx.now + 300_000
    const fresh = dayOf(s, '09:00', { at })
    const dear = { head: 15, emotions: 0, senses: 0, body: 0 }
    // The old day tried at the later instant says what the day counted at that instant says (the change is laid, the two numbers counted, at `at`).
    const late = trialLowest(old, costTrial(old, 'drogi', dear, at)!)!
    expect(late).toEqual(trialLowest(fresh, costTrial(fresh, 'drogi', dear, at)!))
    expect(costTrial(old, 'drogi', dear, at)?.at).toBe(at)
    // At the instant the day was counted at, the same cost would have begun 5 min earlier: another number.
    const early = trialLowest(old, costTrial(old, 'drogi', dear, old.ctx.now)!)!
    expect(early.after).not.toBe(late.after)
  })

  it('„przed” w późniejszej chwili liczone raz na stan dnia i minutę: kolejna próba w tej samej minucie liczy już tylko „po”', () => {
    const s = scenario().checkin('07:00', ZERO).start('drogi', '08:00')
    const old = dayOf(s, '09:00')
    const at = old.ctx.now + 120_000
    const spy = vi.spyOn(dayModule, 'computeDay')
    try {
      trialLowest(old, costTrial(old, 'drogi', { head: 9, emotions: 0, senses: 0, body: 0 }, at)!)
      const first = spy.mock.calls.length
      // Before and after: two counts of the day.
      expect(first).toBe(2)
      const next = trialLowest(old, costTrial(old, 'drogi', { head: 12, emotions: 0, senses: 0, body: 0 }, at + 5_000)!)!
      expect(spy.mock.calls.length - first).toBe(1)
      // The same number „before” as the first trial said.
      expect(next.before).toBe(trialLowest(old, costTrial(old, 'drogi', { head: 9, emotions: 0, senses: 0, body: 0 }, at)!)!.before)
      // Another minute: counted again.
      const before = spy.mock.calls.length
      trialLowest(old, costTrial(old, 'drogi', { head: 9, emotions: 0, senses: 0, body: 0 }, at + 120_000)!)
      expect(spy.mock.calls.length - before).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('dzień, który w chwili liczenia już minął (zegar okna przeszedł 04:00 po policzeniu dnia): bez próby', () => {
    const s = scenario().checkin('07:00', ZERO)
    const day = dayOf(s, '09:00')
    expect(trialLowest(day, { plan: moved(day.ctx.plan, 'praca', '16:00') })).not.toBeNull()
    // The same change counted a day later (the instant of the count – `at`): that day is history now.
    expect(trialLowest(day, { plan: moved(day.ctx.plan, 'praca', '16:00'), at: day.ctx.now + 24 * 3600_000 })).toBeNull()
  })

  it('krawędź trwającego bloku też w chwili liczenia: zdarzenia i liczba w `at`', () => {
    const s = scenario([flex('a', '08:00', 60, { categoryId: 'analiza', costs: HEAVY })]).checkin('07:00', ZERO).start('a', '08:00')
    const old = dayOf(s, '08:30')
    const at = old.ctx.now + 25_000
    const c = resizeTrial(old, 'a', s.at('11:00'), at)!
    expect(c.at).toBe(at)
    expect(trialLowest(old, c)).toEqual(trialLowest(dayOf(s, '08:30', { at }), resizeTrial(dayOf(s, '08:30', { at }), 'a', s.at('11:00'), at)!))
  })

  it('skończony blok i blok spoza dnia – brak próby (null)', () => {
    const s = scenario().checkin('07:00', ZERO).ran('drogi', '08:00', '09:00')
    const day = dayOf(s, '09:30')
    expect(costTrial(day, 'drogi', HEAVY, day.ctx.now)).toBeNull()
    expect(costTrial(day, 'nic', HEAVY, day.ctx.now)).toBeNull()
  })
})

describe('N19 – od kiedy liczy się minimum (T2574, T2576)', () => {
  it('dziś: od teraz – niższy stan sprzed teraz się nie liczy', () => {
    const s = scenario([flex('drogi', '08:00', 120, { categoryId: 'analiza', costs: HEAVY }), flex('regen', '10:00', 120, { categoryId: 'regeneracja', fixed: true })])
      .checkin('07:00', ZERO)
      .ran('drogi', '08:00', '10:00')
      .ran('regen', '10:00', '12:00')
    const day = dayOf(s, '12:30')
    const low = lowestBefore(day)!
    const series = day.energy.series[low.pool]
    const at10 = shownOf(toUnits(series[idxOf(day.state.grid, s.at('10:00'))]!))
    expect(at10).toBeLessThan(low.value)
    expect(low.value).toBe(shownOf(lowestEnergy(day.energy)!))
    expect(trialLowest(day, {})!.before).toBe(low.value)
  })

  it('dzień przyszły: od pierwszej minuty, z przyjętego check-inu (`assumed`) – ta sama krzywa co kolumna', () => {
    const s = scenario()
    const day = dayOf(s, '07:30', { at: scenario(PLAN, addDays(DATE, -1)).at('20:00') })
    expect(day.energy.known).toBe(false)
    const t = trialLowest(day, { plan: moved(day.ctx.plan, 'drogi', '16:00') })!
    expect(t.assumed).toBe(true)
    expect(t.after).toBeLessThan(t.before)
    // The lowest of the curve the column draws (`assumedEnergy`) – at its samples – is the trial's „before”.
    const track = assumedEnergy(day.ctx, day.state, true)!
    const lowest = Math.min(...track.samples.filter((x) => x.at <= lm('20:00')).map((x) => Math.round(x.head)))
    expect(t.before).toBe(lowest)
  })

  it('dziś bez check-inu – też z przyjętego (T2430); po check-inie – z Twojego', () => {
    const none = dayOf(scenario(), '07:30')
    expect(trialLowest(none, {})!.assumed).toBe(true)
    const own = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    expect(trialLowest(own, {})!.assumed).toBe(false)
  })
})

describe('N19 – kiedy nic (null) i że nic się nie zapisuje', () => {
  it('moduł energii wyłączony – null', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30', { moduleOn: false })
    expect(trialLowest(day, { plan: moved(day.ctx.plan, 'drogi', '16:00') })).toBeNull()
  })

  it('dzień miniony – null (historia, bez próby), także z check-inem', () => {
    const s = scenario().checkin('07:00', ZERO)
    const day = dayOf(s, '07:30', { at: scenario(PLAN, addDays(DATE, 1)).at('09:00') })
    expect(trialLowest(day, {})).toBeNull()
    expect(trialLowest(dayOf(scenario(), '07:30', { at: scenario(PLAN, addDays(DATE, 1)).at('09:00') }), {})).toBeNull()
  })

  it('czysta funkcja: dzień, log i plan zostają nietknięte; before liczone raz na dzień', () => {
    const day = dayOf(scenario().checkin('07:00', ZERO), '07:30')
    const events = Object.freeze([...day.ctx.events])
    const plan = Object.freeze(day.ctx.plan.map((b) => Object.freeze({ ...b })))
    const frozen: TrialDay = { ...day, ctx: { ...day.ctx, events, plan } }
    const shown = day.energy.shown
    const c = costTrial(frozen, 'praca', HEAVY)!
    trialLowest(frozen, c)
    trialLowest(frozen, { plan: moved(plan, 'drogi', '16:00') })
    expect(frozen.ctx.events).toHaveLength(events.length)
    expect(frozen.ctx.plan.find((b) => b.id === 'praca')?.costs).toBeNull()
    expect(day.energy.shown).toEqual(shown)
    expect(lowestBefore(frozen)).toBe(lowestBefore(frozen))
  })
})

describe('N19 – wydajność: ≤ 100 ms na odświeżenie (T2578)', () => {
  /** A typical day: 15 blocks (work, meals, routines, a regeneration, a session, projects in the evening), the morning's log up to 13:00. */
  const plan: PlanBlock[] = [
    flex('r1', '06:45', 30, { categoryId: 'rutyny' }),
    flex('p1', '07:15', 30, { categoryId: 'posilek' }),
    flex('a1', '07:45', 90, { categoryId: 'analiza' }),
    flex('i1', '09:15', 30),
    flex('a2', '09:45', 60, { categoryId: 'analiza' }),
    flex('g1', '10:45', 30, { categoryId: 'regeneracja', fixed: true }),
    flex('n1', '11:15', 60, { categoryId: 'nauka' }),
    flex('p2', '12:15', 45, { categoryId: 'posilek' }),
    flex('a3', '13:00', 90, { categoryId: 'analiza' }),
    flex('i2', '14:30', 30),
    { ...flex('s1', '15:30', 120, { categoryId: 'sesja', fixed: true }), origin: 'template' },
    flex('r2', '17:30', 30, { categoryId: 'rutyny' }),
    flex('p3', '18:00', 45, { categoryId: 'posilek' }),
    flex('j1', '19:00', 60, { categoryId: 'projekty' }),
    flex('g2', '20:15', 45, { categoryId: 'regeneracja', fixed: true })
  ]
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0 } })
    .using('06:30', '13:00')
    .checkin('06:40', ZERO)
    .ran('r1', '06:45', '07:15')
    .ran('p1', '07:15', '07:45')
    .ran('a1', '07:45', '09:15')
    .ran('i1', '09:15', '09:45')
    .ran('a2', '09:45', '10:45')
    .signal('glasses', '10:40')
    .ran('g1', '10:45', '11:15')
    .ran('n1', '11:15', '12:15')
    .start('p2', '12:15')

  const median = (f: () => unknown): number => {
    const times: number[] = []
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now()
      f()
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    return times[3]!
  }

  it('dziś z logiem i prognozą: próbne przesunięcie (rozsunięcie + policzenie dnia) – mediana ≤ 100 ms', () => {
    const day = dayOf(s, '12:40')
    expect(day.state.blocks).toHaveLength(15)
    expect(trialLowest(day, {})).not.toBeNull()
    // What one refresh of the caption costs: the change as the drag preview counts it (`pushApart`) and the day counted with it.
    const refresh = () => {
      const plan = moved(day.ctx.plan, 'a3', '14:00')
      const pushed = new Map(pushApart(day.ctx, day.state, plan, 'a3').map((p) => [p.id, p.startMin]))
      return trialLowest(day, { plan: plan.map((b) => (pushed.has(b.id) ? { ...b, startMin: pushed.get(b.id)! } : b)) })
    }
    const trial = median(() => trialLowest(day, { plan: moved(day.ctx.plan, 'a3', '14:00') }))
    const whole = median(refresh)
    expect(trial, `próba ${trial.toFixed(1)} ms`).toBeLessThan(100)
    expect(whole, `rozsunięcie i próba ${whole.toFixed(1)} ms`).toBeLessThan(100)
  })

  it('dzień przyszły (przyjęty check-in) – mediana ≤ 100 ms', () => {
    const future = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0 } })
    const day = dayOf(future, '07:00', { at: scenario(plan, addDays(DATE, -1)).at('20:00') })
    const t = median(() => trialLowest(day, { plan: moved(day.ctx.plan, 'a3', '16:00') }))
    expect(trialLowest(day, {})!.assumed).toBe(true)
    expect(t, `próba ${t.toFixed(1)} ms`).toBeLessThan(100)
  })
})
