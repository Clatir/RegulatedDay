/**
 * The line „Przesunięto N bloków w K dniach · Cofnij” of „Tydzień” (D400) – kept in the window, not in the page: it
 * outlives a change of the page and is there again when „Tydzień” is opened, to the end of `UNDO_LINE_MS` (counted from the
 * save, not from the page's showing). Only the last one (a newer „Dodaj” that pushed blocks replaces it).
 */
import { create } from 'zustand'
import { UNDO_LINE_MS } from '@shared/widget'
import type { WeekPush } from '../features/week/weekActions'

export interface WeekPushLine {
  /** Which line it is (a newer one is another). */
  seq: number
  push: WeekPush
  /** The instant it ends (ms, the window's clock). */
  until: number
}

export const useWeekPush = create<{ line: WeekPushLine | null }>(() => ({ line: null }))

let seq = 0

/** The line of a „Dodaj” that pushed blocks apart, from `now`. */
export function showWeekPush(push: WeekPush, now = Date.now()): void {
  useWeekPush.setState({ line: { seq: ++seq, push, until: now + UNDO_LINE_MS } })
}

/** How long the line still stands (ms; 0 and less – it is over, or none). */
export const weekPushLeft = (line: WeekPushLine | null, now = Date.now()): number => (line ? line.until - now : 0)

/** The line `seq` gone (a newer line stays). */
export function clearWeekPush(which: number): void {
  useWeekPush.setState((s) => (s.line?.seq === which ? { line: null } : s))
}

/** The days of the line `seq` taken out (undone, or changed since – nothing more to take back there); none left that pushed blocks – the line is gone. */
export function dropWeekPushDays(which: number, dates: readonly string[]): void {
  useWeekPush.setState((s) => {
    if (s.line?.seq !== which) return s
    const days = s.line.push.days.filter((d) => !dates.includes(d.date))
    // Days that pushed nothing alone are no line (its text counts the pushed blocks).
    return { line: days.some((d) => d.moved > 0) ? { ...s.line, push: { days } } : null }
  })
}
