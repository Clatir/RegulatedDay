/**
 * „Strona B tygodnia” (spec „Plan poranny”): a day's measure – „Odcinam się”, overload signals, the boundary, hours of
 * projects and of study counted as a project, shifts of the bedtime, the use of the computer outside blocks after the end
 * of work, projects and the last use after the bedtime, the regeneration, requests by person – „brak pomiaru” for a day
 * its module was off on; the week's totals against the week before; preliminary until Sunday is frozen.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { gridOf } from '@shared/engine/grid'
import { dayMeasure, modulesOfDay, sideBOf, weekTotals, type DayMeasure } from '@shared/engine/sideB'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayEnd } from '@shared/time/day'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }
const ON = { energy: true, projects: true, requests: true }

/** Work 08:00–09:00 („Koniec pracy”), a project 18:00–19:00, journaling 19:00–19:30 (after the end of work: a project). */
function day(): Scenario {
  const s = new Scenario({
    date: DATE,
    plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'p', cat: 'projekty', at: '18:00', min: 60 }), block({ id: 'j', cat: 'journaling', at: '19:00', min: 30 })],
    settings: { transitionBufferMin: 0 }
  })
  s.presence('07:30').using('07:30', '23:00').approve('17:00', '07:30').checkin('07:45', MID)
  s.ran('a', '08:00', '09:00').workEnd('09:00')
  s.signal('glasses', '10:00').signal('rocking', '11:00')
  s.raw({ k: 'request.start', request: 'r1', at: s.at('12:00'), mode: 'now', person: 'mama', estimateMin: null, hardEndAt: null }, '12:00').raw({ k: 'request.end', request: 'r1', at: s.at('12:20') }, '12:20')
  s.ran('p', '18:00', '19:00').ran('j', '19:00', '19:30').disconnect('20:00', '20:30')
  return s
}

function measure(s: Scenario, modules = ON, free = false): DayMeasure {
  const end = dayEnd(DATE)
  const state = s.stateAt(end, { asWritten: true })
  const events = s.events.filter((e) => e.t <= end)
  return dayMeasure(state, events, activityOf(events, gridOf(DATE).start, end), modulesOfDay(events, modules), free)
}

describe('miara dnia', () => {
  it('liczy każdą miarę z dnia', () => {
    const m = measure(day())
    expect(m).toMatchObject({
      date: DATE,
      disconnects: 1,
      signals: 2,
      boundary: 'kept',
      projectsMin: 60,
      asProjectMin: 30,
      bedtimeShiftMin: 0,
      projectsAfterBedMin: 0,
      // The computer used 22:00–23:00, after the bedtime (22:00).
      lastUseAfterBedMin: 60,
      requestsByPerson: { mama: 20 }
    })
    // 09:00–22:00 without a block, „Odcinam się” or a request: 09:00–12:00, 12:20–18:00, 19:30–20:00, 20:30–22:00.
    expect(m.afterWorkUseMin).toBe(180 + 340 + 30 + 90)
    expect(m.regenMin).toBeGreaterThan(0)
  })

  it('moduł wyłączony choćby na chwilę: „brak pomiaru”, nie zero; dzień wolny – bez granicy w „x z y”', () => {
    const s = day()
    s.module(false, '15:00').module(true, '15:10')
    s.raw({ k: 'module.set', at: s.at('16:00'), module: 'requests', on: false, was: true }, '16:00')
    const m = measure(s)
    expect(m.signals).toBeNull()
    expect(m.requestsByPerson).toBeNull()
    expect(m.projectsMin).toBe(60)
    // Off before the day (no change that day): no measure either.
    expect(measure(day(), { ...ON, projects: false }).projectsMin).toBeNull()
    expect(measure(day(), ON, true).boundary).toBeNull()
  })

  it('użycie komputera po końcu pracy bez czasu do wyjaśnienia, który nazwałeś „odpoczynek”', () => {
    const day = () => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })], settings: { transitionBufferMin: 0 } })
      s.presence('07:00').using('07:00', '23:00').start('a', '08:00')
      // Ended by itself after two asks; the computer used to 10:30 (time to explain), then a break.
      s.write([{ id: 'auto-a', k: 'block.end', block: 'a', at: s.at('09:00'), done: null, rule: 'twoQuestions', autoRule: 'twoQuestions' }], s.at('10:00'))
      return s.gap('10:30', '11:15')
    }
    const plain = measure(day())
    const s = day()
    const id = s.stateAt(dayEnd(DATE), { asWritten: true }).explains[0]!.id
    s.write([{ k: 'question.answer', at: s.at('12:00'), question: id, answer: 'rest', value: null }], s.at('12:00'))
    const rested = measure(s)
    // 09:00–10:30 without an answer counts; named „odpoczynek” – not (11:15–22:00 counts either way).
    expect(plain.afterWorkUseMin).toBe(90 + 645)
    expect(rested.afterWorkUseMin).toBe(645)
  })

  it('stan modułu na początku dnia mówi jego pierwsza zmiana (włączony w ciągu dnia – rano był wyłączony)', () => {
    const s = day().module(true, '12:00', false)
    expect(modulesOfDay(s.events, ON).energy).toBe(false)
  })

  it('projekty po porze snu i użycie komputera po końcu pracy bez czasu, który nazwałeś odpoczynkiem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'p', cat: 'projekty', at: '21:30', min: 60 })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '22:40').ran('p', '21:30', '22:30')
    const m = measure(s)
    expect(m.projectsAfterBedMin).toBe(30)
    expect(m.lastUseAfterBedMin).toBe(40)
  })
})

describe('tydzień', () => {
  const m = (date: string, o: Partial<DayMeasure> = {}): DayMeasure => ({
    date,
    disconnects: 1,
    signals: 2,
    boundary: 'kept',
    projectsMin: 60,
    asProjectMin: 0,
    bedtimeShiftMin: 0,
    afterWorkUseMin: 30,
    projectsAfterBedMin: 0,
    lastUseAfterBedMin: null,
    regenMin: 100,
    requestsByPerson: { mama: 10 },
    ...o
  })

  it('sumy tygodnia z dniami „brak pomiaru”, granice x z y bez dni wolnych, osoby, użycie po porze snu', () => {
    const t = weekTotals([m('2026-11-02'), m('2026-11-03', { signals: null, boundary: 'broken', requestsByPerson: null }), m('2026-11-04', { boundary: null, lastUseAfterBedMin: 25, requestsByPerson: { brat: 5, mama: 5 } })])
    expect(t).toMatchObject({
      days: 3,
      disconnects: 3,
      signals: { value: 4, missing: 1 },
      boundaries: { kept: 1, of: 2 },
      projectsMin: { value: 180, missing: 0 },
      usedAfterBed: { days: 1, latestMin: 25 },
      requestsByPerson: { mama: 15, brat: 5 },
      requestsMissing: 1
    })
  })

  it('Strona B: tydzień od poniedziałku wobec poprzedniego, wstępna do zamrożenia niedzieli', () => {
    const days = [m('2026-11-02'), m('2026-11-08', { disconnects: 3 }), m('2026-10-27', { disconnects: 5 })]
    const b = sideBOf('2026-11-02', days, false)
    expect(b.preliminary).toBe(true)
    expect(b.days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-08'])
    expect(b.totals.disconnects).toBe(4)
    expect(b.previous?.disconnects).toBe(5)
    expect(sideBOf('2026-11-02', days.slice(0, 2), true)).toMatchObject({ preliminary: false, previous: null })
  })
})
