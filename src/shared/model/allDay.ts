/**
 * All-day and multi-day events (D405, HKU1; allday/<id>.json): a title, the dates from and to (inclusive), one of six
 * fixed colours, a one-line note and „To wolne (urlop, wyjazd)”. An event is information only: it never changes the
 * budget, the regeneration or the day's type – the engine of the day never reads it (its inputs have no place for it).
 * `calendarId` is reserved for calendars joined later (SNT2): always null from this version, kept as found.
 */
import { NOTE_MAX } from './note'
import { addDays, daysBetween, isIsoDate } from '../time/zone'
import type { DayTypeId } from './settings'

export const ALL_DAY_SCHEMA = 1

/** The six colours of events (their values: `ALL_DAY_COLOR_HEX` in `theme.ts`); the first is the default. */
export const ALL_DAY_COLORS = ['amber', 'teal', 'rose', 'lavender', 'sky', 'green'] as const
export type AllDayColor = (typeof ALL_DAY_COLORS)[number]
export const ALL_DAY_COLOR_NAMES: Record<AllDayColor, string> = { amber: 'bursztynowy', teal: 'morski', rose: 'różany', lavender: 'lawendowy', sky: 'niebieski', green: 'zielony' }

/** The longest title kept, and the longest event (days, inclusive) the window saves. */
export const ALL_DAY_TITLE_MAX = 120
export const ALL_DAY_MAX_DAYS = 366
/** The title of a record whose own title is missing (read, never written by this version). */
export const ALL_DAY_TITLE_DEFAULT = 'Wydarzenie'

export interface AllDayEvent {
  id: string
  title: string
  /** 'RRRR-MM-DD', the first and the last day (inclusive; the same for a one-day event). */
  startDate: string
  endDate: string
  calendarId: string | null
  color: AllDayColor
  note: string
  /** „To wolne (urlop, wyjazd)”: after its save the bar offers the type „Wolne” for its days (D405). */
  free: boolean
}

type Raw = Record<string, unknown>
const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const isColor = (v: unknown): v is AllDayColor => (ALL_DAY_COLORS as readonly unknown[]).includes(v)

/**
 * The event of a record, leniently: a record without an id or a valid date from (or with a date to before it) is no event
 * (null, never an error – it is left out of the views); other fields this version cannot read take their defaults.
 */
export function allDayFrom(v: unknown): AllDayEvent | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id || !isIsoDate(v.startDate)) return null
  const end = v.endDate === undefined || v.endDate === null ? v.startDate : v.endDate
  if (!isIsoDate(end) || end < v.startDate) return null
  const title = typeof v.title === 'string' ? v.title.trim().slice(0, ALL_DAY_TITLE_MAX) : ''
  return {
    id: v.id,
    title: title || ALL_DAY_TITLE_DEFAULT,
    startDate: v.startDate,
    endDate: end,
    calendarId: typeof v.calendarId === 'string' && v.calendarId ? v.calendarId : null,
    color: isColor(v.color) ? v.color : ALL_DAY_COLORS[0],
    note: typeof v.note === 'string' ? v.note.slice(0, NOTE_MAX) : '',
    free: v.free === true
  }
}

const FIELDS = ['title', 'startDate', 'endDate', 'calendarId', 'color', 'note', 'free'] as const

/**
 * The record as written. Over the file as it was (`before`) only the fields whose value differs from what this version
 * read of them are written: unknown fields, and values it cannot show (a colour of a newer version), stay (spec
 * „nieznane wartości zachowywane”).
 */
export function allDayJson(e: AllDayEvent, before?: Raw | null): Raw {
  const read = before ? allDayFrom(before) : null
  const out: Raw = before ? { ...before } : { schema: ALL_DAY_SCHEMA }
  out.id = e.id
  for (const k of FIELDS) if (!read || read[k] !== e[k]) out[k] = e[k]
  if (out.schema === undefined) out.schema = ALL_DAY_SCHEMA
  return out
}

/** A new event of `startDate` (to `endDate`, by default the same day): no title yet, the first colour. */
export function allDayDraft(id: string, startDate: string, endDate = startDate): AllDayEvent {
  return { id, title: '', startDate, endDate: endDate < startDate ? startDate : endDate, calendarId: null, color: ALL_DAY_COLORS[0], note: '', free: false }
}

/** Why the window does not save an event (null: it does). */
export function allDayProblem(e: Pick<AllDayEvent, 'title' | 'startDate' | 'endDate'>): string | null {
  if (!e.title.trim()) return 'Wpisz tytuł wydarzenia.'
  if (!isIsoDate(e.startDate) || !isIsoDate(e.endDate)) return 'Podaj daty wydarzenia.'
  if (e.endDate < e.startDate) return 'Data „do” nie może być przed datą „od”.'
  if (daysBetween(e.startDate, e.endDate) + 1 > ALL_DAY_MAX_DAYS) return 'Wydarzenie może trwać najwyżej rok.'
  return null
}

/** The order of events everywhere: the earlier start first, then the longer one, then by title (and id). */
export function compareAllDay(a: AllDayEvent, b: AllDayEvent): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1
  if (a.endDate !== b.endDate) return a.endDate > b.endDate ? -1 : 1
  return a.title.localeCompare(b.title, 'pl') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** The events that touch the days `from`–`to` (inclusive), in their order. */
export function eventsInRange(events: readonly AllDayEvent[], from: string, to: string): AllDayEvent[] {
  return events.filter((e) => e.startDate <= to && e.endDate >= from).sort(compareAllDay)
}

/** The events of a day, in their order. */
export const eventsOn = (events: readonly AllDayEvent[], date: string): AllDayEvent[] => eventsInRange(events, date, date)

/** Which day of the event `date` is (1 – its first) of how many; null – not one of its days. */
export function dayIndexOf(e: AllDayEvent, date: string): { index: number; count: number } | null {
  if (date < e.startDate || date > e.endDate) return null
  return { index: daysBetween(e.startDate, date) + 1, count: daysBetween(e.startDate, e.endDate) + 1 }
}

/** „(2/3)” – the day of a multi-day event; '' for a one-day event or a day outside it. */
export function dayOfText(e: AllDayEvent, date: string): string {
  const d = dayIndexOf(e, date)
  return d && d.count > 1 ? `(${d.index}/${d.count})` : ''
}

const dayMonth = (date: string) => `${Number(date.slice(8, 10))}.${date.slice(5, 7)}`

/** The dates as the interface shows them: „18.11”, „18–20.11”, „30.11–2.12”, across a year „30.12.2026–2.01.2027”. */
export function rangeText(e: Pick<AllDayEvent, 'startDate' | 'endDate'>): string {
  const { startDate: a, endDate: b } = e
  if (a === b) return dayMonth(a)
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${dayMonth(a)}.${a.slice(0, 4)}–${dayMonth(b)}.${b.slice(0, 4)}`
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8, 10))}–${dayMonth(b)}`
  return `${dayMonth(a)}–${dayMonth(b)}`
}

/** The line „Usunięto „…”” after an event removed (its „Cofnij” for `UNDO_LINE_MS`). */
export const allDayRemovedText = (title: string): string => `Usunięto „${title}”`

/** A bar of an event over the columns of the days shown: its first and last column, its row, cut off at either side. */
export interface AllDayBar {
  event: AllDayEvent
  fromCol: number
  toCol: number
  lane: number
  /** The event began before the first day shown (‹). */
  cutLeft: boolean
  /** The event goes on after the last day shown (›). */
  cutRight: boolean
}

export interface AllDayLanes {
  /** The bars shown (rows below `maxLanes`), in the events' order. */
  bars: AllDayBar[]
  /** For every column, the events in it with no row shown („+N więcej”). */
  hidden: number[]
  /** The rows the bars take (at most `maxLanes`). */
  lanes: number
}

/**
 * The bars of `dates` (consecutive days: the seven of a week, or the one of „Dziś”): every event in its order takes the
 * first row free over all of its columns (greedy, stable – the same events give the same rows whatever their order in
 * the folder). The rows from `maxLanes` on are not shown: their events count in `hidden` of each of their columns; the
 * rows shown are the same when all are shown (`maxLanes` infinite – „+N więcej” unfolded).
 */
export function weekLanes(events: readonly AllDayEvent[], dates: readonly string[], maxLanes = 3): AllDayLanes {
  const hidden = dates.map(() => 0)
  if (!dates.length) return { bars: [], hidden, lanes: 0 }
  const first = dates[0]!
  const last = dates.at(-1)!
  const rows: boolean[][] = []
  const bars: AllDayBar[] = []
  let used = 0
  for (const event of eventsInRange(events, first, last)) {
    const fromCol = Math.max(0, daysBetween(first, event.startDate))
    const toCol = Math.min(dates.length - 1, daysBetween(first, event.endDate))
    let lane = 0
    while (rows[lane]?.slice(fromCol, toCol + 1).some(Boolean)) lane++
    const row = (rows[lane] ??= dates.map(() => false))
    for (let c = fromCol; c <= toCol; c++) row[c] = true
    if (lane < maxLanes) {
      bars.push({ event, fromCol, toCol, lane, cutLeft: event.startDate < first, cutRight: event.endDate > last })
      used = Math.max(used, lane + 1)
    } else for (let c = fromCol; c <= toCol; c++) hidden[c]!++
  }
  return { bars, hidden, lanes: used }
}

/** What the proposal „Wolne” knows of a day: its type now and whether it is closed (the ritual, „Jak zapisano”, „Wolne”). */
export interface FreeDayInfo {
  type: DayTypeId
  closed: boolean
}

/**
 * The days the proposal „Wolne” may be about for `e` (D405): none unless it is „To wolne”, else its days from today on
 * (`today` – the logical day), at most `ALL_DAY_MAX_DAYS`. The one place that counts them.
 */
export function freeCandidateDays(e: AllDayEvent, today: string): string[] {
  if (!e.free) return []
  const out: string[] = []
  for (let d = e.startDate > today ? e.startDate : today; d <= e.endDate && out.length < ALL_DAY_MAX_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * The days the bar offers the type „Wolne” for after an event „To wolne” is saved (D405): its days from today on
 * (`freeCandidateDays`), without those „Wolne” already and those closed; a day that cannot be read now (`info` null) is not
 * offered.
 */
export function freeDaysToAsk(e: AllDayEvent, today: string, info: (date: string) => FreeDayInfo | null): string[] {
  return freeCandidateDays(e, today).filter((d) => {
    const i = info(d)
    return i != null && i.type !== 'wolne' && !i.closed
  })
}
