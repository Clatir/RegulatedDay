/**
 * The views of the page „Tydzień” (SNT1, D417, D418): which one is shown („Tydzień”, „3 dni”, „Agenda” – remembered by this
 * computer), the title of the three days, and where a block dragged over the columns would land (D305 in many columns). Pure
 * apart from the storage – the screens only draw what these give.
 */
import { mayMoveBetween } from '@shared/engine/calendarViews'
import { groupEndMin, groupOf, groupRootOf, PARALLEL_SAME_TEXT, parallelFullText, parallelJoinText } from '@shared/engine/parallel'
import type { HorizonBlock } from '@shared/engine/week'
import type { AgendaBlock } from '@shared/engine/calendarViews'
import { durationLabel } from '@shared/format'
import { categoryName } from '@shared/model/rd'
import { DRAG_STEP_MIN } from '@shared/model/plan'
import { addDays, weekday } from '@shared/time/zone'
import { blockName, type Names } from '../plan/blockView'
import { snapMinute } from '../plan/gridCreate'
import { dayHeading, WEEKDAY_FULL } from './weekText'

export type WeekMode = 'week' | '3days' | 'agenda'

/** The switch of the page's heading, in its order. */
export const WEEK_MODES: ReadonlyArray<{ id: WeekMode; label: string }> = [
  { id: 'week', label: 'Tydzień' },
  { id: '3days', label: '3 dni' },
  { id: 'agenda', label: 'Agenda' }
]

const MODE_KEY = 'rd.weekMode'

/** A stored value as a mode: anything but a known one is the week (the page as it was before the views). */
export const parseWeekMode = (raw: string | null | undefined): WeekMode => (WEEK_MODES.some((m) => m.id === raw) ? (raw as WeekMode) : 'week')

/**
 * The view this computer showed last, in the window's own storage (T936: a habit of this window, not data – as the category of
 * a new block). Storage that cannot be read or written is no memory, never an error.
 */
export function lastWeekMode(): WeekMode {
  try {
    return parseWeekMode(localStorage.getItem(MODE_KEY))
  } catch {
    return 'week'
  }
}

/** Remembers the view just chosen. */
export function rememberWeekMode(mode: WeekMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // No storage: the page opens with „Tydzień” again.
  }
}

/** The title of „3 dni”: „wt 17.11 – cz 19.11.2026” (the year of each end when they differ). */
export function threeDaysTitle(dates: readonly string[]): string {
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last) return ''
  const heading = (d: string) => dayHeading(d, weekday(d) - 1)
  const year = (d: string) => d.slice(0, 4)
  return year(first) === year(last) ? `${heading(first)} – ${heading(last)}.${year(last)}` : `${heading(first)}.${year(first)} – ${heading(last)}.${year(last)}`
}

/** The arrows of „3 dni” move by a day; the days stay around the one asked for. */
export const shiftDay = (date: string, n: number): string => addDays(date, n)

/** Where a block dragged over the columns would land: the column under the pointer, its start there, whether that day may take it. */
export interface BlockDrop {
  index: number
  startMin: number
  /** A day gone by (D417): the block is shown refused and a drop there changes nothing. */
  denied: boolean
  /** Dropped onto a block of the column (D492): beside it, or after its full group; absent – a move to `startMin`. */
  onto?: WeekOnto
}

/** A drop onto a block of a column (D492): the block, where the dragged one would start, what is said; `same` – its own group, nothing changes. */
export interface WeekOnto {
  target: string
  startMin: number
  text: string
  same: boolean
}

/** A block of a column that takes no drop onto it: begun outside the plan, run already, passed, parked or cancelled. */
const NO_ONTO: ReadonlySet<HorizonBlock['state']> = new Set(['ran', 'missed', 'parked', 'cancelled'])

/**
 * The dragged block over the right part of block `target` of a column (`blocks` – the column's, D492; the group by the rules of
 * `engine/parallel.ts`): beside the target's group at the start of its first block – „Równolegle z <its name>”; the group holding
 * `max` blocks – right after the group, with the note of a full group; a block of its own group – nothing changes. Null – the
 * target takes no drop (the drag stays a move). The save counts it again from the day's plan (`moveWeekBlock`).
 */
export function weekOnto(blocks: readonly HorizonBlock[], dragged: string, target: string, max: number, nameOf: (b: HorizonBlock) => string): WeekOnto | null {
  const t = blocks.find((b) => b.id === target)
  if (!t || t.id === dragged || t.outsidePlan || NO_ONTO.has(t.state)) return null
  const linked = blocks.filter((b) => !b.outsidePlan).map((b) => ({ id: b.id, alongside: b.alongside ?? null }))
  const rootId = groupRootOf(new Map(linked.map((b) => [b.id, b])), target) ?? target
  const root = blocks.find((b) => b.id === rootId) ?? t
  const group = groupOf(linked, rootId)
  if (group.includes(dragged)) return { target, startMin: root.startMin, text: PARALLEL_SAME_TEXT, same: true }
  const ends = new Map(blocks.map((b) => [b.id, b.endMin]))
  if (group.length + 1 > max) return { target, startMin: groupEndMin(linked, rootId, (id) => ends.get(id) ?? null), text: parallelFullText(max), same: false }
  return { target, startMin: root.startMin, text: parallelJoinText(nameOf(root)), same: false }
}

/**
 * The start the dragged block would have (D305: the 5-minute grid, as the axis of „Dziś”): from where the pointer is in the
 * column, less where the block was grabbed (`grabPx` from its top – it follows the hand); never before the axis nor with
 * its end beyond it.
 */
export function dropStart(o: { pointerY: number; colTop: number; grabPx: number; ppm: number; lo: number; hi: number; durationMin: number }): number {
  const raw = o.lo + (o.pointerY - o.colTop - o.grabPx) / o.ppm
  // The last start on the grid that leaves the block's end on the axis (the axis itself ends on a full hour).
  const latest = Math.max(o.lo, Math.floor((o.hi - o.durationMin) / DRAG_STEP_MIN) * DRAG_STEP_MIN)
  return Math.min(Math.max(snapMinute(raw), o.lo), latest)
}

/** The drop under the pointer: its column's date decides whether it is allowed (`mayMoveBetween`, from the clock of the page). */
export function dropOn(index: number, startMin: number, from: string, to: string, today: string): BlockDrop {
  return { index, startMin, denied: !mayMoveBetween(from, to, today) }
}

/** A drop that has not changed: nothing to draw again (the pointer moves a good deal more often than a minute of the grid). */
export const sameDrop = (a: BlockDrop | null, b: BlockDrop | null): boolean =>
  a === b || (a != null && b != null && a.index === b.index && a.startMin === b.startMin && a.denied === b.denied && a.onto?.target === b.onto?.target && a.onto?.text === b.onto?.text)

/** What a drop that changes nothing is: the same day and the same start. */
export const dropStays = (from: string, to: string, was: number, now: number): boolean => from === to && was === now

/** The words over the band of a refused drop. */
export const DENIED_TEXT = 'dzień minął'

/** The first line of a day of „Agenda”: „Dziś · środa 18.11”, „Jutro · czwartek 19.11”, else „piątek 20.11”. */
export function agendaHeading(date: string, today: string): string {
  const day = `${WEEKDAY_FULL[weekday(date) - 1]} ${Number(date.slice(8, 10))}.${date.slice(5, 7)}`
  if (date === today) return `Dziś · ${day}`
  return date === addDays(today, 1) ? `Jutro · ${day}` : day
}

/** The line of a day without anything in „Agenda”. */
export const AGENDA_EMPTY = 'nic'

/** What a block says in „Agenda”: its name, its length and its category (the hour stands apart, in its own column). */
export interface AgendaRow {
  name: string
  length: string
  category: string
}

export function agendaRow(b: AgendaBlock, names: Names): AgendaRow {
  const category = categoryName(names.rd, b.categoryId)
  return { name: `${b.outsidePlan ? '+ ' : ''}${blockName(b.named, names)}`, length: durationLabel(b.durationMin), category }
}
