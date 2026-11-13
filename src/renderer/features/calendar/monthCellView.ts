/**
 * What a day of the month shows besides its colour and marks (D418, D422, D429): the miniature bars of its all-day events,
 * fixed and flexible blocks, „+N” for everything else it holds, and the dot of the load. From `monthCell` (`@shared/engine/calendarViews`, the
 * same count for every place) – here only the words and the colours of what is drawn.
 */
import { monthCell, type LoadLevel, type MonthDay } from '@shared/engine/calendarViews'
import { barTitle } from '../allday/allDayText'
import { durationLabel, logicalClock } from '@shared/format'
import type { AllDayEvent } from '@shared/model/allDay'
import type { CalendarSieve } from '@shared/model/calendars'
import { ALL_DAY_COLOR_HEX, blockFill } from '@shared/theme'
import { blockColor, blockName, type Names } from '../plan/blockView'
import { blockStateText } from '../week/weekText'

/** One miniature bar of a cell. */
export interface MonthBar {
  key: string
  /** What it says on the bar: the title of the event, the name of the block. */
  label: string
  /** The bar's fill and its left edge. */
  fill: string
  edge: string
  /** What it says when pointed at. */
  title: string
}

/** The dot of the load: its level and the sentence under it. */
export interface MonthLoad {
  level: LoadLevel
  title: string
}

export interface MonthCellView {
  bars: MonthBar[]
  /** „+N”: everything the day has that has no bar here (0 – none). */
  more: number
  load: MonthLoad | null
}

/** „Praca 5 h 10 min z 6 h” – what the dot says when pointed at. */
export const loadTitle = (workMin: number, limitMin: number): string => `Praca ${durationLabel(workMin)} z ${durationLabel(limitMin)}`

/** A day with nothing known of its blocks (a day of the neighbouring month's weeks, not read): its all-day events only. */
export const emptyMonthDay = (date: string): MonthDay => ({ date, when: 'future', read: 'unknown', dayType: null, blocks: [], load: null, workMin: null, limitMin: null })

/**
 * The day as the cell shows it with the unchecked calendars' blocks left out (D419): their bars and their share of „+N” go;
 * the load, its numbers (the dot) stay as the engine counted them. `hiddenCount` – the blocks it took out (for „ukryte: N”).
 * Nothing hidden – the very `day`.
 */
export function visibleMonthDay(day: MonthDay, sieve: CalendarSieve): { day: MonthDay; hiddenCount: number } {
  if (sieve.none) return { day, hiddenCount: 0 }
  const blocks = day.blocks.filter((b) => !sieve.hidesCategory(b.categoryId))
  if (blocks.length === day.blocks.length) return { day, hiddenCount: 0 }
  return { day: { ...day, blocks }, hiddenCount: day.blocks.length - blocks.length }
}

/** The cell of `day` (null – not counted: `emptyMonthDay`), its words and colours; `names` as the window names blocks. */
export function monthCellView(day: MonthDay, allDay: readonly AllDayEvent[], names: Names, brightness: number): MonthCellView {
  const cell = monthCell(day, allDay)
  const bars = cell.items.map<MonthBar>((item) => {
    if (item.kind === 'allDay') {
      const color = ALL_DAY_COLOR_HEX[item.event.color]
      return { key: `allday-${item.event.id}`, label: item.event.title, fill: blockFill(color, brightness), edge: color, title: barTitle(item.event) }
    }
    const b = item.block
    const color = blockColor(b.categoryId, names)
    // `note` names nothing – the month does not carry it (T1015).
    const name = blockName({ ...b.named, note: '' }, names)
    return { key: `block-${b.id}`, label: name, fill: blockFill(color, brightness), edge: color, title: `${name} · ${logicalClock(b.startMin)}–${logicalClock(b.endMin)} · ${blockStateText(b.state, b.outsidePlan)}` }
  })
  const load = cell.load && day.workMin != null && day.limitMin != null ? { level: cell.load, title: loadTitle(day.workMin, day.limitMin) } : null
  return { bars, more: cell.more, load }
}
