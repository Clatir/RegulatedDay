/**
 * The morning plan (spec „Plan poranny”): what it shows besides the day itself – blocks moved from yesterday („z wczoraj
 * +2 h 10”), the questions of the session layer („pytaj”) and of holidays (a week before a holiday, once), the warnings
 * (work after the maximum, the minimum of regeneration that does not fit before the bedtime, the bedtime not later than
 * the end of the second shift), a lighter day after a stationary „zjazd”, the announcement of the week of the session
 * shift with its collisions, and the weekly analysis moved to Friday when Saturday is a „zjazd”.
 */
import type { HolidayLookup } from './createDay'
import { createDay, dayPlan, sessionWindow, sessionShiftMin } from './createDay'
import type { DaySnapshot } from '../model/events'
import { planBlock, type DayFile, type LectureSeries, type PlanBlock, type Template } from '../model/plan'
import type { DayTypeId, SessionDef, SettingsChange } from '../model/settings'
import { settingsOn } from '../model/settings'
import { addDays, placeWall, weekday } from '../time/zone'
import { derivedId } from '../model/ids'
import type { DayState } from './day'
import { atOf } from './grid'

export interface MorningInputs {
  date: string
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
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
  secondShift: string | null
  lectures: string[]
}

export type MorningWarning = 'max' | 'minimum' | 'bedtimeSecondShift' | 'budget'

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
  return createDay({ date, changes: inp.changes, templates: inp.templates, lectures: inp.lectures, dayFile: inp.files(date), holidays: inp.holidays, at: null })
}

const plDayMonth = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`
const hhmm = (at: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)

/**
 * A week before a holiday the app asks once about the single session and the second shift of that day („26.11 święto w
 * USA — sesja NY i druga zmiana?”), also on a day of an early close, then with the market's closing („27.11 CME zamyka o
 * 19:15 — druga zmiana 20:00?”); before a Polish holiday once about the lectures of that day (D215). No answer: they stay.
 */
export function holidayQuestions(inp: MorningInputs): HolidayQuestion[] {
  const out: HolidayQuestion[] = []
  for (let i = 1; i <= 7; i++) {
    const date = addDays(inp.date, i)
    if (inp.files(date)?.asked.holiday) continue
    const snap = snapshotFor(inp, date)
    const plan = dayPlan(snap, inp.files(date))
    const second = plan.find((b) => b.tag === 'secondShift' && b.startMin != null) ?? null
    const secondText = second ? `druga zmiana ${clockOf(second.startMin!)}` : null
    const us = (['NYSE', 'CME_FX'] as const).map((m) => inp.holidays(m, date))
    const closed = us.some((h) => h.closed)
    const sessionsHere = plan.filter((b) => b.origin === 'session' && b.sourceId).map((b) => b.sourceId!)
    if (closed && (sessionsHere.length || second)) {
      const names = snap.settings.sessions.filter((s) => sessionsHere.includes(s.id)).map((s) => `sesja ${s.name}`)
      out.push({ date, text: `${plDayMonth(date)} święto w USA — ${[...names, ...(second ? ['druga zmiana'] : [])].join(' i ')}?`, sessions: sessionsHere, secondShift: second?.id ?? null, lectures: [] })
      continue
    }
    // An early close: CME's (the currency futures the second shift trades), else the exchange's.
    const [nyse, cme] = us
    const early = cme?.earlyClose ? { market: 'CME', ec: cme.earlyClose } : nyse?.earlyClose ? { market: 'NYSE', ec: nyse.earlyClose } : null
    if (early && second) {
      const at = placeWall(early.ec.zone, date, early.ec.hour * 60 + early.ec.minute)
      out.push({ date, text: `${plDayMonth(date)} ${early.market} zamyka o ${hhmm(at)} — ${secondText}?`, sessions: [], secondShift: second.id, lectures: [] })
      continue
    }
    const pl = inp.holidays('PL', date)
    const lectures = plan.filter((b) => b.origin === 'lecture')
    if (pl.closed && lectures.length) out.push({ date, text: `${plDayMonth(date)} ${pl.names[0] ?? 'święto'} — wykłady tego dnia?`, sessions: [], secondShift: null, lectures: lectures.map((b) => b.id) })
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
  const secondEnd = state.forecast.filter((p) => p.block.secondShift).reduce((m, p) => Math.max(m, p.to), Number.NEGATIVE_INFINITY)
  if (secondEnd > Number.NEGATIVE_INFINITY && state.bedtime.forecast <= secondEnd) out.push('bedtimeSecondShift')
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

/**
 * Saturday a „zjazd” and its template has the weekly analysis: on Friday (and when the Saturday is marked) the app
 * proposes the analysis on Friday 20:00–21:00 in place of the second shift, once (spec „Typy dni i szablony”).
 */
export function weeklyAnalysisMove(inp: MorningInputs, friday: string): { analysis: PlanBlock; secondShift: string | null } | null {
  if (weekday(friday) !== 5) return null
  const fileF = inp.files(friday)
  if (fileF?.asked.weeklyAnalysisMove) return null
  const sat = addDays(friday, 1)
  const satType = inp.files(sat)?.dayType
  if (satType !== 'zjazd-stacjonarny' && satType !== 'zjazd-zdalny') return null
  // The analysis the Saturday would have without the „zjazd”: its weekend template's.
  const plain = createDay({ date: sat, changes: inp.changes, templates: inp.templates, lectures: inp.lectures, dayFile: null, holidays: inp.holidays, at: null })
  const analysis = plain.blocks.find((b) => b.tag === 'weeklyAnalysis')
  if (!analysis) return null
  const fri = dayPlan(snapshotFor(inp, friday), fileF)
  const second = fri.find((b) => b.tag === 'secondShift' && b.startMin != null) ?? null
  return {
    analysis: planBlock({ ...analysis, id: derivedId(friday, 'weekly-analysis', analysis.id), startMin: 20 * 60, anchor: null, tag: 'secondShift', waitUntilMin: null, origin: 'user', sourceId: analysis.sourceId }),
    secondShift: second?.id ?? null
  }
}

/** An index of the day as a Polish wall time (for texts). */
export function idxText(state: DayState, idx: number): string {
  return hhmm(atOf(state.grid, idx))
}
