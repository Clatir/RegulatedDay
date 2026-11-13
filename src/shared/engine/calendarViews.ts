/**
 * The views of many days besides „Tydzień” (SNT1): which days a block may be dragged between (D417), the cell of a day of
 * the month (D418, D429: the bars of its all-day events, fixed and flexible blocks, „+N”, the load of work against the budget) and the
 * „Agenda” (D418: seven days, the all-day events on top, then the blocks by the hour). Pure: from the days of the horizon
 * (`HorizonDay`, one count of each day) and the all-day events (never an input of a day – D405, T725).
 */
import { namedOfPlan } from '../blockName'
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

/** Not taken off the day before it began (parked, cancelled). */
const onDay = (b: HorizonBlock): boolean => b.state !== 'parked' && b.state !== 'cancelled'

/** What names a block of the month (`blockName` reads these and nothing else – never the note nor the steps, T1015). */
export type MonthNamed = Omit<HorizonBlock['named'], 'note'>

/**
 * A block of the month's day (D429): what a bar needs – its name, category, hour and state – and what decides whether it gets
 * one (`fixed`: fixed in the plan; `session`: a trading session or the second shift – never a bar, D422; `state`, `background`:
 * a flexible block that was missed or runs in the background has none, T1014).
 */
export interface MonthBlock {
  id: string
  named: MonthNamed
  categoryId: string
  startMin: number
  endMin: number
  fixed: boolean
  session: boolean
  state: HorizonBlockState
  background: boolean
  outsidePlan: boolean
}

/** The block of the month's day of a block of the horizon (T1015): the fields `blockName` reads, the hour, the state. */
export function monthBlockOf(b: HorizonBlock): MonthBlock {
  // The fields that name it (`namedOfPlan`, the one list) without its note.
  const { note: _note, ...named } = namedOfPlan(b.named)
  return {
    id: b.id,
    named,
    categoryId: b.categoryId,
    startMin: b.startMin,
    endMin: b.endMin,
    fixed: b.fixed === true,
    session: b.session === true,
    state: b.state,
    background: b.background,
    outsidePlan: b.outsidePlan
  }
}

/**
 * Whether the block gets a bar (D429, T1014, T1016): never a session; a fixed block always (as in 1.18.0); a flexible one only when
 * it is or will be in the day – not one missed (`missed`: a day gone by, not done) nor one in the background.
 */
export const monthBarred = (b: MonthBlock): boolean => !b.session && (b.fixed || (b.state !== 'missed' && !b.background))

/** A day of the month as the main process gives it (D418): its blocks by the hour and its load. */
export interface MonthDay {
  date: string
  when: HorizonWhen
  read: HorizonRead
  /** The type in force (null – not read). */
  dayType: string | null
  /**
   * Every block of the day – fixed or not, sessions too – but the ones taken off it (parked, cancelled), by the hour (D429, T1013;
   * the order of `HorizonDay.blocks`, which `horizonDay` sorts): the bars (`monthCell`), „+N” (D422) and what the window leaves
   * out of the calendars it hides (D419) all come from this list.
   */
  blocks: MonthBlock[]
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
    blocks: d.blocks.filter(onDay).map(monthBlockOf),
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

/** One bar of a cell: an all-day event or a block. */
export type MonthItem = { kind: 'allDay'; event: AllDayEvent } | { kind: 'block'; block: MonthBlock }

export interface MonthCell {
  /** At most `MONTH_CELL_BARS`: the all-day events first (their order), then the fixed blocks by the hour, then the flexible ones by the hour (D429). */
  items: MonthItem[]
  /** All the rest of the day (D422, T1013): the all-day events and every block not shown as a bar – „+N”; 0 – none. */
  more: number
  load: LoadLevel | null
}

/**
 * The cell of a day of the month (D418, D422, D429): its all-day events, fixed blocks and flexible ones, at most `max` bars;
 * „+N” – everything else the day holds: the events and blocks without a bar – the sessions, the flexible ones missed or in the
 * background (`monthBarred`).
 */
export function monthCell(day: MonthDay, allDay: readonly AllDayEvent[], max = MONTH_CELL_BARS): MonthCell {
  const events = eventsOn(allDay, day.date)
  const barred = (fixed: boolean): MonthItem[] => day.blocks.filter((b) => monthBarred(b) && b.fixed === fixed).map((block) => ({ kind: 'block' as const, block }))
  const bars: MonthItem[] = [...events.map((event) => ({ kind: 'allDay' as const, event })), ...barred(true), ...barred(false)]
  const items = bars.slice(0, max)
  return { items, more: Math.max(0, events.length + day.blocks.length - items.length), load: day.load }
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
