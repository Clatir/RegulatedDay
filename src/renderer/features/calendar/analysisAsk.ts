/**
 * The weekly analysis asked about once when a Saturday becomes a „zjazd” (spec „Typy dni i szablony”): marked in the
 * calendar, or imported from a PDF of the schedule (D357). The question is Friday's: move the analysis to Friday
 * 20:00–21:00 in place of the second shift. The days' files are read after the save, so the Saturday has its type.
 */
import type { RawRecord } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { putBlock, setAsked, setCancelled } from '@shared/data/dayEdits'
import type { HolidayLookup } from '@shared/engine/createDay'
import { weeklyAnalysisMove } from '@shared/engine/morning'
import { dayFileFrom, type DayFile, type LectureSeries, type PlanBlock, type Template } from '@shared/model/plan'
import type { SeriesPlan } from '@shared/model/series'
import type { DayTypeId, SettingsChange } from '@shared/model/settings'
import { addDays, weekday } from '@shared/time/zone'

export interface AnalysisAsk {
  friday: string
  analysis: PlanBlock
  secondShift: string | null
}

export interface AnalysisContext {
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
  series: readonly SeriesPlan[]
  holidays?: HolidayLookup
  /** The files of days as they are now (default: the main process's); a day that cannot be read is not in the answer. */
  read?: (dates: string[]) => Promise<Record<string, RawRecord | null>>
  /** The type the Saturdays were just given (marked in the calendar): used when their files cannot be read now (`read` leaves them out). */
  dayType?: DayTypeId
  /** The file of any other day the question looks at. */
  fallback?: (date: string) => DayFile | null
}

/** The questions for the Saturdays among `dates` – each with Friday's file and its answer to move the analysis. */
export async function analysisAsks(dates: readonly string[], ctx: AnalysisContext): Promise<AnalysisAsk[]> {
  const read = ctx.read ?? ((d: string[]) => window.rd.dayFiles(d))
  const out: AnalysisAsk[] = []
  for (const d of dates.filter((x) => weekday(x) === 6)) {
    const friday = addDays(d, -1)
    const raw = await read([friday, d])
    // Friday's file there but not readable now (`dayFiles` leaves it out) is no Friday without a file: its answer may be
    // in it already – no question now (the morning plan of Friday asks, if it is not).
    if (!(friday in raw)) continue
    const file = (x: string): DayFile | null => {
      if (x === friday) return raw[x] ? dayFileFrom(raw[x], x) : null
      if (x === d) return raw[x] ? dayFileFrom(raw[x], x) : ctx.dayType ? { ...dayFileFrom({}, d), dayType: ctx.dayType } : null
      return ctx.fallback?.(x) ?? null
    }
    const m = weeklyAnalysisMove({ date: friday, changes: ctx.changes, templates: ctx.templates, lectures: ctx.lectures, series: ctx.series, holidays: ctx.holidays ?? marketDay, files: file }, friday)
    if (m) out.push({ friday, ...m })
  }
  return out
}

/** Friday's file after your answer: asked once, and with „Tak” the analysis put in and the second shift cancelled. */
export function answerOf(raw: RawRecord, ask: AnalysisAsk, yes: boolean): RawRecord {
  let next = setAsked(raw, 'weeklyAnalysisMove', yes ? 'yes' : 'no')
  if (yes) {
    next = putBlock(next, ask.analysis)
    if (ask.secondShift) next = setCancelled(next, ask.secondShift, true)
  }
  return next
}
