/**
 * Statystyki (D358): each measure on examples – the energy of a check-in (the mean of its three pools) by the time of
 * day and the day of the week, the felt cost „ciężej” by category, the accuracy of the estimates (the conditions of the
 * reward „Trafne szacowanie”), the requests by person, the boundaries by week; only the events a freeze names; a day
 * that cannot be read counted apart; an empty period.
 */
import { describe, expect, it } from 'vitest'
import { lastEventsOf } from '@shared/engine/freeze'
import { dayStats, MIN_STATS_DAYS, periodFrom, statsOf, storedBoundary, type DayStats } from '@shared/engine/stats'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayEnd } from '@shared/time/day'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const ON = { energy: true, projects: true, requests: true }
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }

function counted(s: Scenario, modules = ON, grade: Record<string, unknown> | null = null, know?: Record<string, number>): DayStats {
  const end = dayEnd(s.opts.date)
  return dayStats({ ...s.contextAt(end), now: end }, know ?? lastEventsOf(s.events), modules, grade)
}

const felt = (s: Scenario, category: string, feel: 'lighter' | 'usual' | 'heavier', at: string) => s.raw({ k: 'cost.felt', at: s.at(at), category, feel }, at)

function day(date: string, o: { checkin?: [string, Record<Pool, [Answer, Answer]>] } = {}): Scenario {
  const s = new Scenario({ date, plan: [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 })], settings: { transitionBufferMin: 0 } })
  s.presence('07:30')
  if (o.checkin) s.checkin(...o.checkin)
  return s
}

describe('energia z check-inów', () => {
  it('energia check-inu to średnia trzech pul (25–100), w przedziale dwóch godzin od 04:00 i w dniu tygodnia', () => {
    // 08:00 → bucket 2 (08:00–10:00); the pools 100, 85, 25 → 70. 2026-10-28 is a Wednesday.
    const a = counted(day(DATE, { checkin: ['08:00', { head: [0, 0], emotions: [0, 1], senses: [2, 2] }] }))
    expect(a.checkins).toEqual([{ minute: 480, energy: 70 }])
    const b = counted(day('2026-10-29', { checkin: ['09:30', MID] }))
    expect(b.checkins).toEqual([{ minute: 570, energy: 65 }])
    const r = statsOf('all', [a, b], 0)
    expect(r.energy.checkins).toBe(2)
    expect(r.energy.byHour).toHaveLength(12)
    expect(r.energy.byHour[2]).toEqual({ key: 2, checkins: 2, mean: 67.5 })
    expect(r.energy.byHour.filter((x) => x.checkins === 0).every((x) => x.mean === null)).toBe(true)
    expect(r.energy.byWeekday.map((x) => [x.key, x.checkins, x.mean])).toEqual([[1, 0, null], [2, 0, null], [3, 1, 70], [4, 1, 65], [5, 0, null], [6, 0, null], [7, 0, null]])
  })

  it('check-in po północy należy do wieczornego przedziału dnia logicznego (02:00–04:00)', () => {
    const s = day(DATE)
    s.checkin('01:30', MID)
    // 01:30 after midnight is the logical minute 1530 → bucket (1530 − 240) / 120 = 10.
    const r = statsOf('all', [counted(s)], 0)
    expect(r.energy.byHour[10]).toMatchObject({ checkins: 1, mean: 65 })
  })

  it('moduł energii wyłączony w dniu: check-iny nie liczą się (brak pomiaru); cofnięty check-in też nie', () => {
    const off = counted(day(DATE, { checkin: ['08:00', MID] }), { ...ON, energy: false })
    expect(off.checkins).toEqual([])
    const s = day(DATE, { checkin: ['08:00', MID] })
    const id = s.events.find((e) => e.k === 'energy.checkin')!.id
    s.raw({ k: 'undo', target: id, at: s.at('08:05') }, '08:05')
    expect(counted(s).checkins).toEqual([])
  })

  it('moduł energii wyłączony choćby na chwilę dnia: check-iny i odczuwany koszt nie liczą się, dzień to „brak pomiaru” (modulesOfDay jak w podsumowaniu)', () => {
    // On at the start of the day (what the grade of an old day would give), switched off at 15:00 – off for the day.
    const s = day(DATE, { checkin: ['08:00', MID] })
    felt(s, 'analiza', 'heavier', '21:00')
    s.module(false, '15:00')
    const d = counted(s)
    expect(d).toMatchObject({ energyOn: false, checkins: [], felt: {} })
    const ok = counted(day('2026-10-29', { checkin: ['08:00', MID] }))
    expect(ok.energyOn).toBe(true)
    const r = statsOf('all', [d, ok], 0).energy
    expect(r).toMatchObject({ missing: 1, checkins: 1 })
    // Off at the start, on again later: off for the day as well.
    const t = day(DATE, { checkin: ['08:00', MID] })
    t.module(true, '15:00', false)
    expect(counted(t, { ...ON, energy: false }).checkins).toEqual([])
  })

  it('odczuwany koszt: ostatnia odpowiedź kategorii w dniu; udział „ciężej” z liczby odpowiedzi, kategorie od 3 odpowiedzi w rankingu przed resztą', () => {
    const days: DayStats[] = []
    for (let i = 0; i < 4; i++) {
      const s = day(`2026-10-${10 + i}`)
      felt(s, 'analiza', i < 3 ? 'heavier' : 'usual', '21:00')
      felt(s, 'inne', 'lighter', '21:00')
      if (i === 0) {
        // The first answer is replaced by the later one of the same day.
        felt(s, 'nauka', 'usual', '20:00')
        felt(s, 'nauka', 'heavier', '21:30')
      }
      days.push(counted(s))
    }
    const rows = statsOf('all', days, 0).energy.felt
    expect(rows.map((r) => [r.category, r.answers, r.heavier, r.share, r.reliable])).toEqual([
      ['analiza', 4, 3, 0.75, true],
      ['inne', 4, 0, 0, true],
      ['nauka', 1, 1, 1, false]
    ])
  })
})

describe('trafność szacowania', () => {
  function estimates(): Scenario {
    const s = new Scenario({
      date: DATE,
      plan: [
        block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
        block({ id: 'b', cat: 'analiza', at: '10:00', min: 60 }),
        block({ id: 'c', cat: 'nauka', at: '12:00', min: 20 }),
        block({ id: 'd', cat: 'analiza', at: '13:00', min: 15 }),
        block({ id: 'f', cat: 'analiza', at: '14:00', min: 60, fixed: true }),
        block({ id: 'e', cat: 'analiza', at: '16:00', min: 60 })
      ],
      settings: { transitionBufferMin: 0 }
    })
    s.presence('07:30')
    s.ran('a', '08:00', '09:05') // 65 of 60: within 15 % (9 min)
    s.ran('b', '10:00', '11:30') // 90 of 60: out
    s.ran('c', '12:00', '12:30') // 30 of 20: out (tolerance 5 min)
    s.ran('d', '13:00', '13:15') // 15 min planned: below 20 – not judged
    s.ran('f', '14:00', '15:00') // fixed – not judged
    s.ran('e', '16:00', '17:00')
    s.write([{ k: 'block.fix', block: 'e', at: s.at('17:10'), start: s.at('16:00'), end: null }], s.at('17:10')) // corrected – not judged
    return s
  }

  it('bloki tak jak w nagrodzie „Trafne szacowanie” (elastyczny, ≥ 20 min, kliknięcia, bez korekty); liczba, mediana real/plan i odsetek trafnych na kategorię', () => {
    const d = counted(estimates())
    expect(d.estimates).toEqual(
      expect.arrayContaining([
        { category: 'analiza', plannedMin: 60, realMin: 65, accurate: true },
        { category: 'analiza', plannedMin: 60, realMin: 90, accurate: false },
        { category: 'nauka', plannedMin: 20, realMin: 30, accurate: false }
      ])
    )
    expect(d.estimates).toHaveLength(3)
    const r = statsOf('all', [d], 0).accuracy
    expect(r).toMatchObject({ blocks: 3, accurate: 1 })
    expect(r.rows).toEqual([
      // The median of 65/60 and 90/60 (1.0833, 1.5) = 1.2917.
      { category: 'analiza', blocks: 2, medianRatio: 1.29, accurate: 1, share: 0.5 },
      { category: 'nauka', blocks: 1, medianRatio: 1.5, accurate: 0, share: 0 }
    ])
  })

  it('mediana nieparzystej liczby bloków to środkowy', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '10:00', min: 60 }), block({ id: 'c', cat: 'analiza', at: '12:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').ran('a', '08:00', '08:30').ran('b', '10:00', '11:00').ran('c', '12:00', '14:00')
    const row = statsOf('all', [counted(s)], 0).accuracy.rows[0]!
    expect(row).toMatchObject({ blocks: 3, medianRatio: 1, accurate: 1 })
  })
})

describe('czas próśb na osobę', () => {
  const request = (s: Scenario, id: string, person: string | null, from: string, to: string) =>
    s.raw({ k: 'request.start', request: id, at: s.at(from), mode: 'now', person, estimateMin: null, hardEndAt: null }, from).raw({ k: 'request.end', request: id, at: s.at(to) }, to)

  it('liczba i minuty na osobę z kilku dni; prośba bez osoby jako „?”, sortowanie po minutach', () => {
    const a = day(DATE)
    request(a, 'r1', 'mama', '12:00', '12:20')
    request(a, 'r2', 'brat', '13:00', '13:05')
    request(a, 'r3', null, '14:00', '14:10')
    const b = day('2026-10-29')
    request(b, 'r4', 'mama', '12:00', '12:40')
    const r = statsOf('all', [counted(a), counted(b)], 0).requests
    expect(r.people).toEqual([
      { person: 'mama', count: 2, minutes: 60 },
      { person: '?', count: 1, minutes: 10 },
      { person: 'brat', count: 1, minutes: 5 }
    ])
    expect(r).toMatchObject({ count: 4, minutes: 75, missing: 0 })
  })

  it('moduł próśb wyłączony w dniu: „brak pomiaru” (dzień policzony osobno), nie zero minut', () => {
    const a = day(DATE)
    request(a, 'r1', 'mama', '12:00', '12:20')
    const off = counted(a, { ...ON, requests: false })
    expect(off.requests).toBeNull()
    const r = statsOf('all', [off, counted(day('2026-10-29'))], 0).requests
    expect(r).toMatchObject({ count: 0, minutes: 0, missing: 1, people: [] })
  })
})

describe('dotrzymane granice', () => {
  it('status z zapisanej oceny: dotrzymana, niedotrzymana, bez danych, wolny; bez oceny – z dnia', () => {
    expect(storedBoundary({ boundary: 'kept', free: false })).toBe('kept')
    expect(storedBoundary({ boundary: 'broken', free: false })).toBe('broken')
    expect(storedBoundary({ boundary: 'noData', free: false })).toBe('noData')
    expect(storedBoundary({ boundary: 'kept', free: true })).toBe('free')
    expect(storedBoundary({})).toBeNull()
    expect(storedBoundary(null)).toBeNull()
    // Without a grade: the day without presence nobody answered is free; one with the end of work confirmed is kept.
    expect(counted(new Scenario({ date: DATE, plan: [] })).boundary).toBe('free')
    const s = day(DATE)
    s.using('07:30', '23:00').approve('17:00', '07:30').ran('a', '09:00', '10:00').workEnd('10:00')
    expect(counted(s).boundary).toBe('kept')
    expect(counted(s, ON, { boundary: 'broken', free: false }).boundary).toBe('broken')
  })

  it('na tydzień od poniedziałku: dotrzymane, niedotrzymane, bez danych i wolne', () => {
    const d = (date: string, boundary: DayStats['boundary']): DayStats => ({ date, energyOn: true, checkins: [], felt: {}, estimates: [], requests: {}, boundary })
    // 2026-10-26 is a Monday.
    const r = statsOf('all', [d('2026-11-02', 'free'), d('2026-10-26', 'kept'), d('2026-10-27', 'kept'), d('2026-11-01', 'broken'), d('2026-10-28', 'noData')], 0).boundaries
    expect(r.weeks).toEqual([
      { week: '2026-10-26', kept: 2, broken: 1, noData: 1, free: 0 },
      { week: '2026-11-02', kept: 0, broken: 0, noData: 0, free: 1 }
    ])
    expect(r.totals).toEqual({ kept: 2, broken: 1, noData: 1, free: 1 })
  })
})

describe('dni zamrożone i okres', () => {
  it('tylko zdarzenia z zamrożenia (know): późniejsze są „poza oceną”', () => {
    const s = day(DATE, { checkin: ['08:00', MID] })
    const know = lastEventsOf(s.events)
    s.checkin('15:00', { head: [2, 2], emotions: [2, 2], senses: [2, 2] })
    felt(s, 'analiza', 'heavier', '21:00')
    const d = counted(s, ON, null, know)
    expect(d.checkins).toEqual([{ minute: 480, energy: 65 }])
    expect(d.felt).toEqual({})
  })

  it('dzień nieczytelny jest pominięty i policzony; pusty okres daje zera, „za mało danych”', () => {
    const empty = statsOf('4w', [], 0)
    expect(empty).toMatchObject({ days: 0, first: null, last: null, unreadable: 0, enough: false })
    expect(empty.energy.checkins).toBe(0)
    expect(empty.energy.byHour.every((x) => x.mean === null)).toBe(true)
    expect(empty.accuracy).toEqual({ blocks: 0, accurate: 0, rows: [] })
    expect(empty.boundaries).toEqual({ weeks: [], totals: { kept: 0, broken: 0, noData: 0, free: 0 } })
    const some = statsOf('3m', [counted(day(DATE)), counted(day('2026-10-29'))], 2)
    expect(some).toMatchObject({ days: 2, unreadable: 2, enough: false, first: DATE, last: '2026-10-29' })
    const three = statsOf('3m', ['2026-10-27', DATE, '2026-10-29'].map((x) => counted(day(x))), 0)
    expect(MIN_STATS_DAYS).toBe(3)
    expect(three).toMatchObject({ days: 3, enough: true, first: '2026-10-27', last: '2026-10-29' })
  })

  it('okres: 4 tygodnie i 3 miesiące wstecz od dziś, od początku – bez granicy', () => {
    expect(periodFrom('4w', '2026-11-09')).toBe('2026-10-12')
    expect(periodFrom('3m', '2026-11-09')).toBe('2026-08-10')
    expect(periodFrom('all', '2026-11-09')).toBeNull()
  })
})
