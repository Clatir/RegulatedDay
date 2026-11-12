/**
 * The window's lines of all-day events (D406): „Usunięto „…” · Cofnij” and „Typ dnia „Wolne” na K dniach · Cofnij” stand
 * on top of the page where the change was made („Dziś” or „Tydzień”), `UNDO_LINE_MS` from it – in the window only, the bar
 * of the desktop has none. As the line of „Przesunięto N bloków” (D400, `store/weekPush`) they are kept in the window, not in
 * the page: they outlive a change of the page and are there again when it is opened; the store ends each by itself.
 */
import { create } from 'zustand'
import type { RawRecord } from '@shared/api'
import { UNDO_LINE_MS } from '@shared/widget'
import type { FreeDaysChange } from '../features/allday/freeDays'

/** The page whose top a line stands on. */
export type AllDayLinePage = 'today' | 'week'

export type AllDayLineWhat = { kind: 'removed'; title: string; raw: RawRecord } | { kind: 'free'; change: FreeDaysChange }

export type AllDayLine = AllDayLineWhat & {
  /** Which line it is. */
  seq: number
  page: AllDayLinePage
  /** The instant it ends (ms, the window's clock). */
  until: number
}

export const useAllDayLines = create<{ lines: AllDayLine[] }>(() => ({ lines: [] }))

let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

/** A line on top of `page` from `now`; it ends by itself after `UNDO_LINE_MS`. Returns which line it is. */
export function showAllDayLine(page: AllDayLinePage, what: AllDayLineWhat, now = Date.now()): number {
  const which = ++seq
  timers.set(
    which,
    setTimeout(() => dropAllDayLine(which), UNDO_LINE_MS)
  )
  useAllDayLines.setState((s) => ({ lines: [...s.lines, { ...what, seq: which, page, until: now + UNDO_LINE_MS }] }))
  return which
}

/** The line `which` gone (its „Cofnij” done, or its time out). */
export function dropAllDayLine(which: number): void {
  clearTimeout(timers.get(which))
  timers.delete(which)
  useAllDayLines.setState((s) => (s.lines.some((l) => l.seq === which) ? { lines: s.lines.filter((l) => l.seq !== which) } : s))
}

/** The line „Wolne” `which` left with only `dates` of its days (the others were given back; those are still to be). */
export function narrowFreeLine(which: number, dates: readonly string[]): void {
  useAllDayLines.setState((s) => ({
    lines: s.lines.map((l) => (l.seq === which && l.kind === 'free' ? { ...l, change: { days: l.change.days.filter((d) => dates.includes(d.date)) } } : l))
  }))
}

/** How long a line still stands (ms; 0 and less – it is over). */
export const allDayLineLeft = (line: AllDayLine, now = Date.now()): number => line.until - now

/** The lines of `page` still standing at `now`, the oldest first. */
export const linesOf = (lines: readonly AllDayLine[], page: AllDayLinePage, now = Date.now()): AllDayLine[] => lines.filter((l) => l.page === page && allDayLineLeft(l, now) > 0)
