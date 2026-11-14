/**
 * The morning plan (spec „Plan poranny”): what it shows besides the day itself – blocks moved from yesterday („z wczoraj
 * +2 h 10”), the questions of the session layer („pytaj”) and of holidays (a week before a holiday, once), the warnings
 * (work after the maximum, the minimum of regeneration that does not fit before the bedtime, the budget), a lighter day
 * after a stationary „zjazd” and the announcement of the week of the session shift with its collisions.
 */
import type { HolidayLookup } from './createDay'
import { createDay, dayPlan, sessionWindow, sessionShiftMin } from './createDay'
import type { DaySnapshot } from '../model/events'
import type { DayFile, LectureSeries, PlanBlock, Template } from '../model/plan'
import type { SeriesPlan } from '../model/series'
import type { DayTypeId, SessionDef, SettingsChange } from '../model/settings'
import { settingsOn } from '../model/settings'
import { addDays, weekday } from '../time/zone'
import type { DayState } from './day'
import { atOf } from './grid'

export interface MorningInputs {
  date: string
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
  series: readonly SeriesPlan[]
  holidays: HolidayLookup
  /** The files of the days the morning looks at (yesterday, today, the next 7 days); a missing one: none. */
  files: (date: string) => DayFile | null
}

export interface HolidayQuestion {
  /** The day it is about. */
  date: string
  text: string
  /** What each answer „no” takes away from that day. */
  sessions: string[]
  lectures: string[]
}

export type MorningWarning = 'max' | 'minimum' | 'budget'

/** Blocks moved to `date` from the day before (the morning shows them as „z wczoraj”). */
export function fromYesterday(plan: readonly PlanBlock[], date: string): PlanBlock[] {
  const y = addDays(date, -1)
  return plan.filter((b) => b.movedFrom === y)
}

/** Sessions of the layer the morning asks about (the layer says „pytaj” and the day has no answer yet). */
export function sessionQuestions(snapshot: DaySnapshot, dayFile: DayFile | null, date: string): SessionDef[] {
  const choice = snapshot.settings.dayTypes[snapshot.dayType].sessions[weekday(date) - 1]
  if (choice !== 'ask') return []
  return snapshot.settings.sessions.filter((s) => !dayFile?.sessions[s.id] && sessionWindow(s, date))
}

function snapshotFor(inp: MorningInputs, date: string): DaySnapshot {
  return createDay({ date, changes: inp.changes, templates: inp.templates, lectures: inp.lectures, series: inp.series, dayFile: inp.files(date), holidays: inp.holidays, at: null })
}

const plDayMonth = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`
const hhmm = (at: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)

/**
 * A week before a holiday the app asks once about the sessions of that day („26.11 święto w USA — sesja NY?”); before a
 * Polish holiday once about the lectures of that day (D215). No answer: they stay. A day of an early close asks nothing
 * (a session of the layer ends at the close by itself; D467: no second shift to ask about).
 */
export function holidayQuestions(inp: MorningInputs): HolidayQuestion[] {
  const out: HolidayQuestion[] = []
  for (let i = 1; i <= 7; i++) {
    const date = addDays(inp.date, i)
    if (inp.files(date)?.asked.holiday) continue
    const snap = snapshotFor(inp, date)
    const plan = dayPlan(snap, inp.files(date))
    const us = (['NYSE', 'CME_FX'] as const).map((m) => inp.holidays(m, date))
    const closed = us.some((h) => h.closed)
    const sessionsHere = plan.filter((b) => b.origin === 'session' && b.sourceId).map((b) => b.sourceId!)
    if (closed && sessionsHere.length) {
      const names = snap.settings.sessions.filter((s) => sessionsHere.includes(s.id)).map((s) => `sesja ${s.name}`)
      out.push({ date, text: `${plDayMonth(date)} święto w USA — ${names.join(' i ')}?`, sessions: sessionsHere, lectures: [] })
      continue
    }
    const pl = inp.holidays('PL', date)
    const lectures = plan.filter((b) => b.origin === 'lecture')
    if (pl.closed && lectures.length) out.push({ date, text: `${plDayMonth(date)} ${pl.names[0] ?? 'święto'} — wykłady tego dnia?`, sessions: [], lectures: lectures.map((b) => b.id) })
  }
  return out
}

function clockOf(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** The warnings of the plan (spec: the plan warns, nothing is blocked). */
export function morningWarnings(state: DayState): MorningWarning[] {
  const out: MorningWarning[] = []
  if (state.forecastWorkEnd != null && state.forecastWorkEnd > state.boundary.max) out.push('max')
  if (state.hardEnd.unreachable || (state.forecastWorkEnd != null && state.hardEnd.at < state.forecastWorkEnd)) out.push('minimum')
  if (state.budgetUsedMin + state.budget.forecastMin > state.budget.limitMin) out.push('budget')
  return out
}

/** Yesterday was a stationary „zjazd”: a lighter day is proposed (spec „propozycja lżejszego dnia po zjeździe”). */
export function lighterDay(inp: MorningInputs, todayType: DayTypeId): boolean {
  if (todayType === 'regeneracyjny' || todayType === 'wolne') return false
  if (inp.files(inp.date)?.asked.lighterDay) return false
  return snapshotFor(inp, addDays(inp.date, -1)).dayType === 'zjazd-stacjonarny'
}

export interface ShiftNotice {
  /** The first day of the shifted sessions within the next week. */
  from: string
  /** Sessions as they start then (Polish time). */
  starts: Array<{ name: string; at: string }>
  /** Fixed blocks the shifted sessions meet (e.g. a lecture). */
  collisions: Array<{ date: string; text: string }>
}

/**
 * The week of the session shift announced a week before (spec „Tydzień wcześniej plan zapowiada zmianę i pokazuje
 * kolizje z blokami stałymi”): today without the shift, a day of the next seven with it.
 */
export function shiftNotice(inp: MorningInputs): ShiftNotice | null {
  const sessions = settingsOn(inp.changes, inp.date).sessions
  const shifted = (date: string) => sessions.some((s) => {
    const w = sessionWindow(s, date)
    return w != null && sessionShiftMin(s, w.start) !== 0
  })
  if (shifted(inp.date)) return null
  for (let i = 1; i <= 7; i++) {
    const date = addDays(inp.date, i)
    if (!shifted(date)) continue
    const starts = sessions.flatMap((s) => {
      const w = sessionWindow(s, date)
      return w ? [{ name: s.name, at: hhmm(w.start) }] : []
    })
    const collisions: ShiftNotice['collisions'] = []
    for (let j = i; j <= 7 && shifted(addDays(inp.date, j)); j++) {
      const d = addDays(inp.date, j)
      const plan = dayPlan(snapshotFor(inp, d), inp.files(d))
      for (const s of plan.filter((b) => b.origin === 'session' && b.startMin != null)) {
        for (const f of plan.filter((b) => b.fixed && b.origin !== 'session' && b.startMin != null)) {
          if (f.startMin! < s.startMin! + s.durationMin && s.startMin! < f.startMin! + f.durationMin) collisions.push({ date: d, text: `${plDayMonth(d)}: sesja ${clockOf(s.startMin!)} i blok stały ${clockOf(f.startMin!)}` })
        }
      }
    }
    return { from: date, starts, collisions }
  }
  return null
}

/** An index of the day as a Polish wall time (for texts). */
export function idxText(state: DayState, idx: number): string {
  return hhmm(atOf(state.grid, idx))
}
