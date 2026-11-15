/**
 * D514 with D512 (T1395): the cost of a routine changed while a block of it runs – from „Rutyny” or from ✎ – reaches the block from that
 * moment on: the window writes `block.routineCost` for each begun block of the routine (its start's routine and category of the kind
 * „rutyna”), and the engine counts the routine's cost of the start up to that minute, the new one from it (the minutes gone by as they were).
 * It changes the block's routine's cost, not its own: a block with its own cost keeps it, and „Jak rutyna” (`block.cost` null) goes back to
 * the new cost of the routine, never the old one. The same order as `block.cost`: only after the block's start in the log's order, the
 * last of a minute wins whatever computer wrote it.
 */
import { describe, expect, it } from 'vitest'
import { costEvidence } from '@shared/engine/calibration'
import { begunCosts, routineCostTargets } from '@shared/engine/costChange'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, type EnergyState } from '@shared/engine/energy'
import { isPassive } from '@shared/engine/facts'
import type { Costs, Pool } from '@shared/model/categories'
import { parseEvent, type Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-11-18'
const R: Costs = { head: 5, emotions: 4, senses: -2 }
const R2: Costs = { head: -1, emotions: 2, senses: 3 }
const OWN: Costs = { head: 2, emotions: 2, senses: 2 }
/** The category „Rutyny” (the kind „rutyna”): 1 · 0 · 1. */
const RUTYNY: Costs = { head: 1, emotions: 0, senses: 1 }
const ANSWERS: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }

const curve = (e: EnergyState) => (['head', 'emotions', 'senses'] as const).map((p) => Array.from(e.series[p]))
/** A block of „Rutyny” with the routine „poranna”, 08:00–09:30. */
const m = (o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id: 'm', cat: 'rutyny', at: '08:00', min: 90 }), routine: 'poranna', ...o })
/** A day with a check-in at 07:00; `routineCosts` – the routines' costs the window knows. */
const day = (plan: PlanBlock[], routineCosts: Record<string, Costs> = { poranna: R }) =>
  new Scenario({ date: DATE, plan, wake: '06:30', routineCosts }).observe('06:30', null).checkin('07:00', ANSWERS)
/** The change of the routine's cost as the window writes it for a begun block (`block.routineCost`, the timer's domain) at `time`. */
const routineCost = (s: Scenario, time: string, costs: Costs | null, computer?: string) => s.write([{ k: 'block.routineCost', block: 'm', at: s.at(time), costs }], s.at(time), computer)
const ownCost = (s: Scenario, time: string, costs: Costs | null) => s.write([{ k: 'block.cost', block: 'm', at: s.at(time), costs }], s.at(time))
const tile = (s: Scenario, time: string) => {
  const ctx = s.contextAt(s.at(time))
  const state = computeDay(ctx)
  return begunCosts(ctx, state, state.blocks.find((b) => b.id === 'm')!)
}

describe('zmiana kosztu rutyny przy zaczętym bloku (D514, T1395)', () => {
  it('stary koszt rutyny do chwili zmiany, nowy od niej – jak ten sam koszt własny bloku od tej minuty', () => {
    const s = routineCost(day([m()]).start('m', '08:00'), '08:30', R2)
    const same = ownCost(day([m()]).start('m', '08:00'), '08:30', R2)
    expect(curve(s.energy('09:00'))).toEqual(curve(same.energy('09:00')))
    // The minutes before the change – as without it (the state at the change; the forecast from it is the new cost's).
    const plain = day([m()]).start('m', '08:00')
    expect(s.energy('08:30').now).toEqual(plain.energy('08:30').now)
    expect(s.energy('09:00').now).not.toEqual(plain.energy('09:00').now)
  })

  it('kafelek: przed zmianą – koszt rutyny ze startu, od niej – nowy (nie własny), „Jak rutyna”', () => {
    const s = day([m()]).start('m', '08:00')
    expect(tile(s, '08:20')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
    routineCost(s, '08:30', R2)
    expect(tile(s, '08:20')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
  })

  it('rutyna bez kosztu od chwili zmiany (null) – blok kosztuje jak podkategoria', () => {
    const s = routineCost(day([m()]).start('m', '08:00'), '08:30', null)
    expect(tile(s, '08:40')).toEqual({ costs: RUTYNY, base: RUTYNY, own: false })
    expect(curve(s.energy('09:00'))).toEqual(curve(ownCost(day([m()]).start('m', '08:00'), '08:30', RUTYNY).energy('09:00')))
  })

  it('blok z kosztem rutyny od zmiany, choć start był bez niego (rutyna nie miała kosztu)', () => {
    const s = routineCost(day([m()], {}).start('m', '08:00'), '08:30', R2)
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
  })

  it('własny koszt bloku wygrywa; „Jak rutyna” potem wraca do nowego kosztu rutyny, nie do starego', () => {
    const s = day([m()]).start('m', '08:00')
    ownCost(s, '08:10', OWN)
    routineCost(s, '08:20', R2)
    expect(tile(s, '08:25')).toEqual({ costs: OWN, base: R2, own: true, baseFrom: 'routine' })
    ownCost(s, '08:30', null)
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
    // The energy: own from 08:10, the routine's new cost from 08:30 (the change of 08:20 is under the own cost).
    const same = day([m()]).start('m', '08:00')
    ownCost(same, '08:10', OWN)
    ownCost(same, '08:30', R2)
    expect(curve(s.energy('09:00'))).toEqual(curve(same.energy('09:00')))
  })

  it('przeliczenie później daje to samo: minione minuty zostają po staremu', () => {
    const s = routineCost(day([m()]).start('m', '08:00'), '08:30', R2)
    const then = s.energy('08:45').now
    s.end('m', '09:30')
    const later = s.energy('11:00')
    const k = lm('08:45') - 4 * 60
    expect({ head: later.series.head[k], emotions: later.series.emotions[k], senses: later.series.senses[k] }).toEqual(then)
  })

  it('dwa komputery: zmiana zapisana na drugim komputerze liczy się tak samo; w jednej minucie wygrywa późniejsza w logu', () => {
    const one = routineCost(day([m()]).start('m', '08:00'), '08:30', R2, 'pcb')
    const here = routineCost(day([m()]).start('m', '08:00'), '08:30', R2)
    expect(curve(one.energy('09:00'))).toEqual(curve(here.energy('09:00')))
    const both = day([m()]).start('m', '08:00')
    routineCost(both, '08:30', OWN, 'pcb')
    routineCost(both, '08:30', R2, 'pcc')
    // The logs arrive in any order: the later of the minute (the log's full order) wins.
    const n = both.events.length
    ;[both.events[n - 2], both.events[n - 1]] = [both.events[n - 1]!, both.events[n - 2]!]
    expect(tile(both, '08:40').costs).toEqual(R2)
    expect(curve(both.energy('09:00'))).toEqual(curve(here.energy('09:00')))
  })

  it('zmiana należy do startu, po którym ją zapisano: start cofnięty i ponowny – blok liczy koszt rutyny swojego startu', () => {
    const s = day([m()])
    const t = s.at('08:00')
    s.write([{ id: 'first', k: 'block.start', block: 'm', at: t, bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null, routine: 'poranna', routineCosts: R }, confirmUntil: null, how: 'click' }], t)
    routineCost(s, '08:10', R2)
    s.write([{ k: 'undo', at: s.at('08:20'), target: 'first' }], s.at('08:20'))
    s.start('m', '08:30')
    expect(tile(s, '08:40')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
  })

  it('kalibracja: minuty z kosztem rutyny nie są dowodem; po zmianie rutyny na „jak podkategoria” – znów są', () => {
    const s = day([m()]).start('m', '08:00')
    routineCost(s, '08:40', null).end('m', '09:30')
    const ctx = s.contextAt(s.at('10:00'))
    expect(costEvidence(ctx, computeDay(ctx), true)!.minutes).toEqual({ rutyny: 50 })
  })

  it('zdarzenie: znane z polem block, at i costs (−5…5 albo null); bierne dla silnika dnia', () => {
    const line = (o: Record<string, unknown>) => JSON.stringify({ id: 'x', c: 'pca', n: 1, t: 1, l: 1, v: 14, day: DATE, dom: 'timer', at: 1, ...o })
    expect(parseEvent(line({ k: 'block.routineCost', block: 'm', costs: R2 }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'block.routineCost', block: 'm', costs: null }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'block.routineCost', block: 'm', costs: { head: 6, emotions: 0, senses: 0 } }))).toEqual({ ok: false, why: 'pole costs' })
    expect(parseEvent(line({ k: 'block.routineCost', costs: null }))).toEqual({ ok: false, why: 'pole block' })
    const parsed = parseEvent(line({ k: 'block.routineCost', block: 'm', costs: null }))
    expect(parsed.ok && isPassive(parsed.event)).toBe(true)
    // Passive: the day (its facts, the end of work, the bedtime) as without it.
    const s = day([m()]).start('m', '08:00')
    const plain = s.state('09:00')
    routineCost(s, '08:30', R2)
    const changed = s.state('09:00')
    expect([changed.boundary, changed.workEnd, changed.bedtime, changed.facts.blocks.get('m')]).toEqual([plain.boundary, plain.workEnd, plain.bedtime, plain.facts.blocks.get('m')])
  })
})

describe('które zaczęte bloki zmiana kosztu rutyny sięga (routineCostTargets, T1395)', () => {
  const plan = [
    m(),
    m({ id: 'own', costs: OWN }),
    m({ id: 'ended' }),
    m({ id: 'later', startMin: lm('12:00') }),
    m({ id: 'other', routine: 'wieczorna' }),
    { ...block({ id: 'inne', cat: 'inne', at: '08:00', min: 30 }), routine: 'poranna' }
  ]
  const s = day(plan)
  /** A start as this version writes it (`startPlanned`: with the block's routine and the routine's cost). */
  const begin = (id: string) => {
    const p = plan.find((b) => b.id === id)!
    const planned = { categoryId: p.categoryId, variantId: null, durationMin: p.durationMin, fixed: false, costs: p.costs, bgCostPct: null, routine: p.routine, routineCosts: null }
    s.write([{ k: 'block.start', block: id, at: s.at('08:00'), bg: false, planned, confirmUntil: null, how: 'click' }], s.at('08:00'))
  }
  for (const id of ['m', 'own', 'ended', 'other', 'inne']) begin(id)
  s.end('ended', '08:20')
  const facts = (t: string) => s.state(t).facts

  it('zaczęte i nieskończone bloki tej rutyny w kategorii rodzaju „rutyna” – także z własnym kosztem; bez skończonych, niezaczętych, innej rutyny i innej kategorii', () => {
    expect(routineCostTargets(plan, facts('08:30'), s.settings, 'poranna').sort()).toEqual(['m', 'own'])
    expect(routineCostTargets(plan, facts('08:30'), s.settings, 'wieczorna')).toEqual(['other'])
    expect(routineCostTargets(plan, facts('08:30'), s.settings, 'nic')).toEqual([])
  })

  it('rutyna i kategoria ze startu: blok, któremu po starcie zmieniono rutynę w planie, idzie za rutyną startu', () => {
    const changed = plan.map((b) => (b.id === 'm' ? { ...b, routine: 'wieczorna' } : b))
    expect(routineCostTargets(changed, facts('08:30'), s.settings, 'poranna')).toContain('m')
    expect(routineCostTargets(changed, facts('08:30'), s.settings, 'wieczorna')).not.toContain('m')
  })

  it('start bez rutyny w zdarzeniu (starsza wersja) – rutyna z planu', () => {
    const old = day([m()])
    old.write([{ k: 'block.start', block: 'm', at: old.at('08:00'), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null }, confirmUntil: null, how: 'click', v: 13 }], old.at('08:00'))
    expect(routineCostTargets([m()], old.state('08:30').facts, old.settings, 'poranna')).toEqual(['m'])
  })
})
