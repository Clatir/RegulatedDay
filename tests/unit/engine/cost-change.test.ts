/**
 * D501, rule A: the cost of a begun block changed in the window of its tile – `energy.cost` in the day's log from its minute on. The engine
 * counts the block by its start (`block.start.planned`) up to that minute and by the new cost from it to the block's end; the minutes gone by
 * stay as they were counted, the log counted again gives the same, the last change wins, a block behind (D38 – its share) and a block of a
 * parallel group (D476: behind – nothing, in front – its cost) follow the same rule. The tile says what the engine counts now (`begunCosts`).
 */
import { describe, expect, it } from 'vitest'
import { costEvidence } from '@shared/engine/calibration'
import { computeDay } from '@shared/engine/day'
import { begunCosts } from '@shared/engine/costChange'
import { computeEnergy } from '@shared/engine/energy'
import { isPassive } from '@shared/engine/facts'
import type { Costs, Pool } from '@shared/model/categories'
import { isKnown, parseEvent, type AnyEvent, type Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { lm, Scenario, block } from './dsl'

const DATE = '2026-10-21'
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }
/** A work block late in the day: the morning is not a day without work. */
const LATER = block({ id: 'later', cat: 'analiza', at: '20:00', min: 30, fixed: true })
const sc = (plan: PlanBlock[]) => new Scenario({ date: DATE, plan: [...plan, LATER], settings: { transitionBufferMin: 0 } })
const A = () => block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 })
const HIGH: Costs = { head: 5, emotions: 0, senses: -1 }

/** The change written as the window writes it (`energy.cost`, the energy's domain) at the instant of `time`. */
function change(s: Scenario, id: string, time: string, costs: Costs | null): Scenario {
  const t = s.at(time)
  return s.write([{ k: 'energy.cost', dom: 'energy', block: id, at: t, costs }], t)
}
const now = (s: Scenario, time: string) => s.energy(time).now!
/** The state at the start of the minute `time` as the engine counts it at `at` (the past, then the forecast). */
const seriesAt = (s: Scenario, at: string, time: string) => {
  const e = s.energy(at)
  const k = lm(time) - 4 * 60
  return { head: e.series.head[k], emotions: e.series.emotions[k], senses: e.series.senses[k] }
}

describe('zmiana kosztu zaczętego bloku (D501, energy.cost)', () => {
  it('przed zmianą – koszt ze startu, od minuty zmiany do końca bloku – nowy', () => {
    const s = sc([A()]).checkin('08:00', MID).start('a', '09:00')
    change(s, 'a', '09:30', HIGH).end('a', '10:00')
    // 3·1·1 for 30 min, then 5·0·−1 for 30 min: a cost k takes 3·k an hour.
    expect(now(s, '10:00')).toEqual({ head: 65 - 4.5 - 7.5, emotions: 65 - 1.5 - 0, senses: 65 - 1.5 + 1.5 })
  })

  it('minione minuty zostają policzone po starym koszcie: stan w chwili zmiany się nie zmienia, zmienia się prognoza', () => {
    const s = sc([A()]).checkin('08:00', MID).start('a', '09:00')
    const before = now(s, '09:30')
    const forecast = seriesAt(s, '09:30', '10:00')
    change(s, 'a', '09:30', HIGH)
    expect(now(s, '09:30')).toEqual(before)
    // The forecast of the rest of the block (to its planned end, 10:00) – by the new cost.
    expect(seriesAt(s, '09:30', '10:00')).not.toEqual(forecast)
    expect(seriesAt(s, '09:30', '10:00')).toEqual({ head: 53, emotions: 63.5, senses: 65 })
  })

  it('przeliczenie od nowa daje to samo: stan każdej minuty liczony później jest tym, który był liczony wtedy', () => {
    const s = sc([A()]).checkin('08:00', MID).start('a', '09:00')
    change(s, 'a', '09:30', HIGH)
    const then = ['09:30', '09:45', '10:00'].map((t) => now(s, t))
    s.end('a', '10:00')
    const later = ['09:30', '09:45', '10:00'].map((t) => seriesAt(s, '12:00', t))
    expect(later).toEqual(then)
    // The minutes before the change – as without it.
    const plain = sc([A()]).checkin('08:00', MID).start('a', '09:00').end('a', '10:00')
    expect(seriesAt(s, '12:00', '09:30')).toEqual(seriesAt(plain, '12:00', '09:30'))
    expect(seriesAt(s, '12:00', '09:31')).not.toEqual(seriesAt(plain, '12:00', '09:31'))
  })

  it('wiele zmian: każda od swojej minuty; null wraca do kosztu kategorii; w jednej minucie wygrywa późniejsza w logu', () => {
    const s = sc([A()]).checkin('08:00', MID).start('a', '09:00')
    change(s, 'a', '09:20', HIGH)
    change(s, 'a', '09:40', null).end('a', '10:00')
    expect(now(s, '10:00')).toEqual({ head: 65 - 3 - 5 - 3, emotions: 65 - 1 - 0 - 1, senses: 65 - 1 + 1 - 1 })
    const same = sc([A()]).checkin('08:00', MID).start('a', '09:00')
    change(same, 'a', '09:30', { head: 1, emotions: 1, senses: 1 })
    change(same, 'a', '09:30', HIGH).end('a', '10:00')
    expect(now(same, '10:00')).toEqual({ head: 53, emotions: 63.5, senses: 65 })
  })

  it('własny koszt ze startu też zastępuje zmiana od swojej minuty', () => {
    const s = sc([{ ...A(), costs: { head: 0, emotions: 0, senses: 0 } }]).checkin('08:00', MID).start('a', '09:00')
    change(s, 'a', '09:30', null).end('a', '10:00')
    expect(now(s, '10:00')).toEqual({ head: 65 - 4.5, emotions: 65 - 1.5, senses: 65 - 1.5 })
  })

  it('blok w tle: nowy koszt razy jego udział tła (D38 – 50%)', () => {
    const lecture = block({ id: 'w', cat: 'wyklad', at: '09:00', min: 60, fixed: true, origin: 'lecture' })
    const s = sc([A(), lecture]).checkin('08:00', MID).start('a', '09:00').start('w', '09:00', { bg: true })
    change(s, 'w', '09:30', { head: 4, emotions: 2, senses: 0 }).end('a', '10:00').end('w', '10:00')
    // a 3·1·1 an hour in front; w 1·0·1 for 30 min, then 4·2·0, each at 50%.
    expect(now(s, '10:00')).toEqual({ head: 65 - 9 - 0.75 - 3, emotions: 65 - 3 - 0 - 1.5, senses: 65 - 3 - 0.75 - 0 })
  })

  it('grupa równoległa: blok w tle grupy nic nie kosztuje także po zmianie, a po przejęciu przodu – nowy koszt (D476)', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '08:00', min: 120 })]
    const planned = (id: string) => ({ categoryId: 'analiza', variantId: null, durationMin: id === 'a' ? 60 : 120, fixed: false, costs: null, bgCostPct: null })
    const group = () => {
      const s = new Scenario({ date: DATE, plan: [...plan, LATER], settings: { transitionBufferMin: 0 } }).observe('07:00', null).checkin('07:30', MID)
      const t = s.at('08:00')
      return s.write(['a', 'b'].map((id) => ({ k: 'block.start', block: id, at: t, bg: id !== 'a', planned: planned(id), confirmUntil: null, how: 'click', group: 'a' })), t)
    }
    const plain = group()
    const changed = change(group(), 'b', '08:10', { head: 5, emotions: 5, senses: 5 })
    // Behind its group's front: nothing, before and after the change.
    expect(now(changed, '08:25')).toEqual(now(plain, '08:25'))
    plain.end('a', '08:30')
    changed.end('a', '08:30')
    // In front from 08:30: 5·5·5 instead of 3·1·1.
    const d = (x: Scenario) => now(x, '09:00')
    expect(d(changed).head).toBe(d(plain).head - 3 * (5 - 3) * 0.5)
    expect(d(changed).emotions).toBe(d(plain).emotions - 3 * (5 - 1) * 0.5)
    // The block in front of the group changed: from the minute of the change.
    const front = change(group(), 'a', '08:15', { head: 0, emotions: 0, senses: 0 })
    expect(now(front, '08:30').head).toBe(now(group(), '08:30').head + 3 * 3 * 0.25)
  })

  it('kafelek mówi koszt, którym silnik liczy teraz (begunCosts): ze startu, po zmianie – nowy, „Jak kategoria” – koszt kategorii', () => {
    const s = sc([{ ...A(), costs: HIGH }]).checkin('08:00', MID).start('a', '09:00')
    // The plan changed after the start: the engine still counts the start's cost – so does the tile.
    s.opts.plan[0] = { ...s.opts.plan[0]!, costs: { head: 1, emotions: 1, senses: 1 } }
    const tile = (time: string) => {
      const ctx = s.contextAt(s.at(time))
      const day = computeDay(ctx)
      return begunCosts(ctx, day, day.blocks.find((b) => b.id === 'a')!)
    }
    expect(tile('09:10')).toEqual({ costs: HIGH, base: { head: 3, emotions: 1, senses: 1 }, own: true })
    change(s, 'a', '09:20', null)
    expect(tile('09:20')).toEqual({ costs: { head: 3, emotions: 1, senses: 1 }, base: { head: 3, emotions: 1, senses: 1 }, own: false })
    change(s, 'a', '09:30', { head: 2, emotions: 2, senses: 2 })
    expect(tile('09:30').costs).toEqual({ head: 2, emotions: 2, senses: 2 })
  })

  it('kalibracja: minuty po zmianie na własny koszt nie są dowodem dla kategorii, po „Jak kategoria” – znów są', () => {
    const s = sc([A()]).checkin('08:00', MID).start('a', '09:00')
    change(s, 'a', '09:20', HIGH)
    change(s, 'a', '09:40', null).end('a', '10:00')
    const ctx = s.contextAt(s.at('10:30'))
    expect(costEvidence(ctx, computeDay(ctx), true)!.minutes).toEqual({ analiza: 40 })
  })

  it('zdarzenie: znane z polem block, at i costs (−5…5 albo null); bierne dla silnika dnia; nieznany rodzaj energii nic nie psuje', () => {
    const line = (o: Record<string, unknown>) => JSON.stringify({ id: 'x', c: 'pca', n: 1, t: 1, l: 1, v: 13, day: DATE, dom: 'energy', at: 1, ...o })
    expect(parseEvent(line({ k: 'energy.cost', block: 'a', costs: HIGH }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.cost', block: 'a', costs: null }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.cost', block: 'a', costs: { head: 6, emotions: 0, senses: 0 } }))).toEqual({ ok: false, why: 'pole costs' })
    expect(parseEvent(line({ k: 'energy.cost', block: 'a', costs: { head: 1.5, emotions: 0, senses: 0 } }))).toEqual({ ok: false, why: 'pole costs' })
    expect(parseEvent(line({ k: 'energy.cost', costs: null }))).toEqual({ ok: false, why: 'pole block' })
    const parsed = parseEvent(line({ k: 'energy.cost', block: 'a', costs: null }))
    expect(parsed.ok && isPassive(parsed.event)).toBe(true)
    // As a version before it reads it: an unknown kind, kept and skipped – the energy as without it.
    const s = sc([A()]).checkin('08:00', MID).start('a', '09:00').end('a', '10:00')
    const ctx = s.contextAt(s.at('10:00'))
    const unknown = { ...ctx.events[0]!, id: 'pcb-1', c: 'pcb', k: 'energy.later', unknown: true, raw: {} } as unknown as AnyEvent
    expect(isKnown(unknown)).toBe(false)
    const withUnknown = { ...ctx, events: [...ctx.events, unknown] }
    expect(computeEnergy(withUnknown, computeDay(withUnknown)).now).toEqual(now(s, '10:00'))
  })
})
