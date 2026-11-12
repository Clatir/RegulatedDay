/**
 * All-day events never reach the engine of the day (D405: an event never changes the budget, the regeneration nor the
 * day's type). A guard for later: the engine's inputs are listed here field by field – a field added to them fails the
 * typecheck of this file, and must not carry events (their place is the window's views, the bar's line, the search).
 * The same day with an event in the folder and without is checked on a real folder in `tests/fs/all-day.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf, type DaySource, type PlanInputs } from '@shared/engine/context'
import { computeDay, type DayContext } from '@shared/engine/day'
import { allDayDraft } from '@shared/model/allDay'
import { placeLogical } from '@shared/time/day'

// Every field of what the day is counted from. A new one: add it here only if it is no event of the calendar.
const CONTEXT_FIELDS: Record<keyof DayContext, true> = { date: true, snapshot: true, plan: true, wakeMin: true, nextWakeMin: true, events: true, now: true, typicalSessionMin: true, asWritten: true }
const INPUT_FIELDS: Record<keyof PlanInputs, true> = { changes: true, templates: true, lectures: true, series: true }
const SOURCE_FIELDS: Record<keyof DaySource, true> = { date: true, events: true, dayFile: true, nextFile: true }

const DATE = '2026-11-18'
const inputs: PlanInputs = { changes: [], templates: [], lectures: [], series: [] }
const source: DaySource = { date: DATE, events: [], dayFile: null, nextFile: null }

describe('wydarzenia całodniowe poza silnikiem dnia (D405)', () => {
  it('kontekst dnia ma tylko pola z listy – żadnego z wydarzeniami', () => {
    const ctx = dayContextOf(inputs, source, marketDay, placeLogical(DATE, 12 * 60))
    for (const k of Object.keys(ctx)) expect(Object.hasOwn(CONTEXT_FIELDS, k)).toBe(true)
    for (const k of [...Object.keys(CONTEXT_FIELDS), ...Object.keys(INPUT_FIELDS), ...Object.keys(SOURCE_FIELDS)]) expect(k).not.toMatch(/all.?day|calendar|wydarz/i)
  })

  it('wydarzenie dołożone do wejść (gdyby ktoś je tam podał) nie zmienia dnia ani nie trafia do kontekstu', () => {
    const at = placeLogical(DATE, 12 * 60)
    const event = { ...allDayDraft('urlop', DATE, '2026-11-20'), title: 'ZNACZNIK-URLOPU', free: true }
    const plain = dayContextOf(inputs, source, marketDay, at)
    const withEvent = dayContextOf({ ...inputs, allDay: [event] } as PlanInputs, { ...source, allDay: [event] } as DaySource, marketDay, at)
    expect(JSON.stringify(withEvent)).not.toContain('ZNACZNIK-URLOPU')
    expect(computeDay(withEvent)).toEqual(computeDay(plain))
  })
})
