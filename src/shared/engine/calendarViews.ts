/**
 * The views of many days besides „Tydzień” (SNT1): which days a block may be dragged between (D417), the cell of a day of
 * the month (D418: the bars of its fixed blocks and all-day events, „+N”, the load of work against the budget) and the
 * „Agenda” (D418: seven days, the all-day events on top, then the blocks by the hour). Pure: from the days of the horizon
 * (`HorizonDay`, one count of each day) and the all-day events (never an input of a day – D405, T725).
 */
import { eventsOn, type AllDayEvent } from '../model/allDay'
import type { HorizonBlock, HorizonBlockState, HorizonDay, HorizonRead, HorizonWhen } from './week'

/**
 * Whether a block may be dragged from the day `from` to the day `to` (D417): only between today and the days to come – a day
 * gone by is never changed, neither as the source nor as the target. Which blocks: `HorizonBlock.movable`.
 */
export const mayMoveBetween = (from: string, to: string, today: string): boolean => !!today && from >= today && to >= today

/** The load of a day (D418): its work against its budget – under `LOAD_MID_PCT`, up to `LOAD_HIGH_PCT`, over it (T904). */
export type LoadLevel = 'low' | 'mid' | 'high'

/** From this share of the budget (%) the load is „mid” (T904). */
export const LOAD_MID_PCT = 80
/** Over this share of the budget (%) the load is „high” (T904). */
export const LOAD_HIGH_PCT = 100

/**
 * The load of `workMin` against `limitMin` (T904): under 80 % – low, 80–100 % – mid, over 100 % – high; a day without a
 * budget (0) – low without work, high with any.
 */
export function loadLevel(workMin: number, limitMin: number): LoadLevel {
  if (limitMin <= 0) return workMin > 0 ? 'high' : 'low'
  const pct = (workMin / limitMin) * 100
  return pct > LOAD_HIGH_PCT ? 'high' : pct >= LOAD_MID_PCT ? 'mid' : 'low'
}

/**
 * A fixed block of the month's cell (D418: meetings, lectures, the classes of a „zjazd”, T905): fixed in the plan, not a
 * trading session nor the second shift (they are on every working day), not taken off the day (parked, cancelled).
 */
export const monthFixed = (b: HorizonBlock): boolean => b.fixed === true && b.session !== true && onDay(b)

/** Not taken off the day before it began (parked, cancelled). */
const onDay = (b: HorizonBlock): boolean => b.state !== 'parked' && b.state !== 'cancelled'

/** A day of the month as the main process gives it (D418): its fixed blocks by the hour and its load. */
export interface MonthDay {
  date: string
  when: HorizonWhen
  read: HorizonRead
  /** The type in force (null – not read). */
  dayType: string | null
  /** Every fixed block of the day (`monthFixed`), by the hour. */
  fixed: HorizonBlock[]
  /** Every block of the day – fixed or not, sessions too – but the ones taken off it (parked, cancelled): „+N” (D422). */
  blockCount: number
  /** The category of each block `blockCount` counts, in any order – what the window needs to leave out the blocks of a calendar it hides (D419). */
  categories: string[]
  /** The work of the day against its budget; null – not read, or a day gone by nobody used. */
  load: LoadLevel | null
  workMin: number | null
  limitMin: number | null
}

/** The month's day of a day of the horizon. */
export function monthDayOf(d: HorizonDay): MonthDay {
  const b = d.read === 'unknown' ? null : d.budget
  return {
    date: d.date,
    when: d.when,
    read: d.read,
    dayType: d.dayType,
    fixed: d.blocks.filter(monthFixed).sort((a, b) => a.startMin - b.startMin || (a.id < b.id ? -1 : 1)),
    blockCount: d.blocks.filter(onDay).length,
    categories: d.blocks.filter(onDay).map((b) => b.categoryId),
    load: b ? loadLevel(b.workMin, b.limitMin) : null,
    workMin: b?.workMin ?? null,
    limitMin: b?.limitMin ?? null
  }
}

/** The month visible in „Kalendarz” (D418): each of its days, from the first to the last. */
export interface MonthView {
  /** 'RRRR-MM'. */
  month: string
  today: string
  days: MonthDay[]
}

/** The dates of a month ('RRRR-MM'), from the first to the last. */
export function monthDates(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

/** The bars a cell of the month shows at most (D418). */
export const MONTH_CELL_BARS = 3

/** One bar of a cell: an all-day event or a fixed block. */
export type MonthItem = { kind: 'allDay'; event: AllDayEvent } | { kind: 'block'; block: HorizonBlock }

export interface MonthCell {
  /** At most `MONTH_CELL_BARS`: the all-day events first (their order), then the fixed blocks by the hour. */
  items: MonthItem[]
  /** All the rest of the day (D422, T905): the all-day events and every block not shown as a bar – „+N”; 0 – none. */
  more: number
  load: LoadLevel | null
}

/**
 * The cell of a day of the month (D418, D422): its all-day events and fixed blocks, at most `max` bars; „+N” – everything
 * else the day holds: the events and blocks without a bar, the flexible ones and the sessions too.
 */
export function monthCell(day: MonthDay, allDay: readonly AllDayEvent[], max = MONTH_CELL_BARS): MonthCell {
  const events = eventsOn(allDay, day.date)
  const bars: MonthItem[] = [...events.map((event) => ({ kind: 'allDay' as const, event })), ...day.fixed.map((block) => ({ kind: 'block' as const, block }))]
  const items = bars.slice(0, max)
  return { items, more: Math.max(0, events.length + day.blockCount - items.length), load: day.load }
}

/** A block of „Agenda” (D418): its hour, what names it, its length and category. */
export interface AgendaBlock {
  id: string
  named: HorizonBlock['named']
  categoryId: string
  startMin: number
  durationMin: number
  state: HorizonBlockState
  background: boolean
  outsidePlan: boolean
}

/** A day of „Agenda” (D418): the all-day events on top, then the blocks by the hour; none of both – one line. */
export interface AgendaDay {
  date: string
  when: HorizonWhen
  read: HorizonRead
  allDay: AllDayEvent[]
  blocks: AgendaBlock[]
}

/**
 * „Agenda” of the days given (D418, `agendaDates`): each day's all-day events (their order) and its blocks by the hour, as
 * the day's axis shows them (a begun one where it ran) – without the ones taken off the day (parked, cancelled, T906).
 */
export function agendaOf(days: readonly HorizonDay[], allDay: readonly AllDayEvent[]): AgendaDay[] {
  return days.map((d) => ({
    date: d.date,
    when: d.when,
    read: d.read,
    allDay: eventsOn(allDay, d.date),
    blocks: d.blocks
      .filter((b) => b.state !== 'parked' && b.state !== 'cancelled')
      .map((b) => ({ id: b.id, named: b.named, categoryId: b.categoryId, startMin: b.startMin, durationMin: b.endMin - b.startMin, state: b.state, background: b.background, outsidePlan: b.outsidePlan }))
  }))
}
