/**
 * The strip of all-day events (D405) without the screen: the rows of its bars (at most three, the rest „+N więcej”, unfolded
 * on a click), the days a drag over the strip takes, and the words of the strip, the card's question „Wolne” and the lines.
 * Pure – the screens (`AllDayBar`, `AllDayCard`) only draw what this says.
 */
import { weekLanes, type AllDayEvent, type AllDayLanes } from '@shared/model/allDay'
import { addDays, weekday } from '@shared/time/zone'
import { WEEKDAY_SHORT } from '../week/weekText'
import { dayIndexes } from '../week/weekLayout'

/** How many rows of bars the strip shows before „+N więcej”. */
export const ALL_DAY_MAX_LANES = 3

export interface AllDayLayout {
  /** The bars to draw (every row when unfolded). */
  lanes: AllDayLanes
  /** The rows of the strip: the bars' rows (one at least – an empty strip is one line high) and the row of „+N więcej”. */
  rows: number
  /** The row (1-based, for the grid) of the „+N więcej” buttons; null when no column has events hidden. */
  moreRow: number | null
  /** Per column: the events not shown while the strip is folded (what „+N więcej” counts; the button stands also when unfolded, as „Zwiń”). */
  more: number[]
}

/** The layout of the strip over `dates` (the seven days of a week, or the one of „Dziś”); `expanded` – every row shown. */
export function allDayLayout(events: readonly AllDayEvent[], dates: readonly string[], expanded: boolean): AllDayLayout {
  const folded = weekLanes(events, dates, ALL_DAY_MAX_LANES)
  const lanes = expanded ? weekLanes(events, dates, Number.POSITIVE_INFINITY) : folded
  const body = Math.max(1, lanes.lanes)
  const any = folded.hidden.some((n) => n > 0)
  return { lanes, rows: body + (any ? 1 : 0), moreRow: any ? body + 1 : null, more: folded.hidden }
}

/** The dates a drag over the strip took, from the column it began in to the one it ended in (either way round). */
export function dragDates(dates: readonly string[], from: number, to: number): { startDate: string; endDate: string } {
  const idx = dayIndexes(from, to)
  return { startDate: dates[idx[0]!]!, endDate: dates[idx.at(-1)!]! }
}

/** A day as the interface words it in the question and the lines: „śr 18.11”. */
export const dayWord = (date: string): string => `${WEEKDAY_SHORT[weekday(date) - 1]} ${Number(date.slice(8, 10))}.${date.slice(5, 7)}`

/** The days of the question „Wolne”, in runs: „śr 18.11 – pt 20.11”, a lone day „czw 19.11”, runs apart „pn 16.11, śr 18.11 – pt 20.11”. */
export function freeAskDays(dates: readonly string[]): string {
  const runs: string[][] = []
  for (const d of [...dates].sort()) {
    const run = runs.at(-1)
    if (run && addDays(run.at(-1)!, 1) === d) run.push(d)
    else runs.push([d])
  }
  return runs.map((r) => (r.length === 1 ? dayWord(r[0]!) : `${dayWord(r[0]!)} – ${dayWord(r.at(-1)!)}`)).join(', ')
}

/** The question under the card after a save of an event „To wolne” (D405). */
export const freeAskText = (dates: readonly string[]): string => `Ustawić typ dnia „Wolne” na ${freeAskDays(dates)}?`

/** The line after „Tak” (D406): „Typ dnia „Wolne” na 3 dniach”. */
export const freeLineText = (days: number): string => `Typ dnia „Wolne” na ${days} ${days === 1 ? 'dniu' : 'dniach'}`
