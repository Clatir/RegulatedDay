/**
 * What a day of the month shows besides its colour and marks (D418, D422, D429): the miniature bars of its all-day events,
 * fixed and flexible blocks, „+N” for everything else it holds, the dot of the load and the dot of the energy (N21, D595). From `monthCell` (`@shared/engine/calendarViews`, the
 * same count for every place) – here only the words and the colours of what is drawn.
 */
import { monthCell, type LoadLevel, type MonthDay, type MoreOf } from '@shared/engine/calendarViews'
import type { DayEnergy } from '@shared/engine/energyTrack'
import { barTitle } from '../allday/allDayText'
import { durationLabel, logicalClock, plural } from '@shared/format'
import type { AllDayEvent } from '@shared/model/allDay'
import type { CalendarSieve } from '@shared/model/calendars'
import { ALL_DAY_COLOR_HEX, blockFill, hexToRgb } from '@shared/theme'
import { blockColor, blockName, type Names } from '../plan/blockView'
import { ASSUMED_CAPTION, ASSUMED_FACTOR, POOL_COLOR, POOL_NAME, STRIP_OPACITY, STRIP_STATE_NAME } from '../plan/energyDraw'
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

/** The dot of the energy (N21, D595): the weakest pool of the day in the strip's shade, its edge, the pool and the sentence under it. */
export interface MonthEnergy {
  pool: DayEnergy['pool']
  state: DayEnergy['state']
  /** Counted from the assumed check-in (a day to come, today before its own check-in): fainter, and the sentence says so. */
  assumed: boolean
  /** The pool's colour at the strip's opacity (× `ASSUMED_FACTOR` when assumed). */
  fill: string
  /** The pool's colour whole – the edge never fades (as the load dot's, D418). */
  edge: string
  title: string
}

export interface MonthCellView {
  bars: MonthBar[]
  /** „+N”: everything the day has that has no bar here (0 – none). */
  more: number
  /** What the cell says of it (P7): „+2 sesje”, „+1 blok”, „+3 pozycje” (more than one kind); empty – none. */
  moreText: string
  /** What it says when pointed at: the kinds, one by one („1 sesja, 3 bloki”); empty – none. */
  moreTitle: string
  load: MonthLoad | null
  energy: MonthEnergy | null
}

/** „Praca 5 h 10 min z 6 h” – what the dot says when pointed at. */
export const loadTitle = (workMin: number, limitMin: number): string => `Praca ${durationLabel(workMin)} z ${durationLabel(limitMin)}`

/** „Energia: najsłabsza bodźce 18 · poniżej rezerwy (rezerwa 20)”, assumed: + „ · przyjęte” – what the dot of the energy says when pointed at. */
export const energyTitle = (e: DayEnergy): string => `Energia: najsłabsza ${POOL_NAME[e.pool]} ${e.value} · ${STRIP_STATE_NAME[e.state]} (rezerwa ${e.reserve})${e.assumed ? ` · ${ASSUMED_CAPTION}` : ''}`

/** The dot of the energy of `e` (null – none): the shades of the strip of a column of „Tydzień”. */
export function monthEnergy(e: DayEnergy | null): MonthEnergy | null {
  if (!e) return null
  const { r, g, b } = hexToRgb(POOL_COLOR[e.pool])
  const alpha = STRIP_OPACITY[e.state] * (e.assumed ? ASSUMED_FACTOR : 1)
  return { pool: e.pool, state: e.state, assumed: e.assumed, fill: `rgba(${r}, ${g}, ${b}, ${alpha})`, edge: POOL_COLOR[e.pool], title: energyTitle(e) }
}

const KINDS: ReadonlyArray<{ of: keyof MoreOf; forms: [string, string, string] }> = [
  { of: 'events', forms: ['wydarzenie', 'wydarzenia', 'wydarzeń'] },
  { of: 'sessions', forms: ['sesja', 'sesje', 'sesji'] },
  { of: 'blocks', forms: ['blok', 'bloki', 'bloków'] }
]

/**
 * „+N” with what it hides (D5, P7): one kind – its noun („+2 sesje”, „+1 blok”, „+1 wydarzenie”); more kinds – „+N pozycje”, the kinds told
 * one by one in `title`. Nothing hidden – both empty.
 */
export function moreWords(more: MoreOf): { text: string; title: string } {
  const parts = KINDS.filter((k) => more[k.of] > 0)
  const n = parts.reduce((sum, k) => sum + more[k.of], 0)
  if (n === 0) return { text: '', title: '' }
  const told = parts.map((k) => `${more[k.of]} ${plural(more[k.of], ...k.forms)}`)
  return { text: parts.length === 1 ? `+${told[0]}` : `+${n} ${plural(n, 'pozycja', 'pozycje', 'pozycji')}`, title: told.join(', ') }
}

/** A day with nothing known of its blocks (a day of the neighbouring month's weeks, not read): its all-day events only. */
export const emptyMonthDay = (date: string): MonthDay => ({ date, when: 'future', read: 'unknown', dayType: null, blocks: [], load: null, workMin: null, limitMin: null, energy: null })

/**
 * The day as the cell shows it with the unchecked calendars' blocks left out (D419): their bars and their share of „+N” go;
 * the load, its numbers (the dot) and the energy stay as the engine counted them. `hiddenCount` – the blocks it took out (for „ukryte: N”).
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
  const more = moreWords(cell.moreOf)
  return { bars, more: cell.more, moreText: more.text, moreTitle: more.title, load, energy: monthEnergy(day.energy) }
}
