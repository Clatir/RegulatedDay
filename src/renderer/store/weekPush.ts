/**
 * The line „Przesunięto N bloków w K dniach · Cofnij” of „Tydzień” (D400) – kept in the window, not in the page: it
 * outlives a change of the page and is there again when „Tydzień” is opened, to the end of `UNDO_LINE_MS` (counted from the
 * save, not from the page's showing; the store ends it itself, a page need not be open). Only the last one (a newer „Dodaj”
 * that pushed blocks replaces it).
 */
import { create } from 'zustand'
import type { EditEntry, RawRecord } from '@shared/api'
import { UNDO_LINE_MS } from '@shared/widget'

/** What „Dodaj” did to one day of the range: the one edit of its file, the file it created, how many blocks it pushed apart. */
export interface WeekPushedDay {
  date: string
  entry: EditEntry
  /** The file the edit created (null: the file was there). */
  made: RawRecord | null
  moved: number
}

/** The days a „Dodaj” wrote (D400), for the one „Cofnij” of the line „Przesunięto N bloków w K dniach” – only when it pushed some. */
export interface WeekPush {
  days: WeekPushedDay[]
  /**
   * A block dragged to another place of a column or to another day (D417, `moveWeekBlock`): its days go back together or
   * not at all (`undoWeekPush`); the line names the move. Absent – a „Dodaj”.
   */
  move?: { blockId: string; from: string; to: string }
}

export interface WeekPushLine {
  /** Which line it is (a newer one is another). */
  seq: number
  push: WeekPush
  /** The instant it ends (ms, the window's clock). */
  until: number
}

export const useWeekPush = create<{ line: WeekPushLine | null }>(() => ({ line: null }))

let seq = 0
let ending: ReturnType<typeof setTimeout> | null = null

/** The line of a „Dodaj” that pushed blocks apart, from `now`; it ends by itself after `UNDO_LINE_MS`. */
export function showWeekPush(push: WeekPush, now = Date.now()): void {
  const which = ++seq
  if (ending) clearTimeout(ending)
  ending = setTimeout(() => clearWeekPush(which), UNDO_LINE_MS)
  useWeekPush.setState({ line: { seq: which, push, until: now + UNDO_LINE_MS } })
}

/** How long the line still stands (ms; 0 and less – it is over, or none). */
export const weekPushLeft = (line: WeekPushLine | null, now = Date.now()): number => (line ? line.until - now : 0)

/** The line `which` gone (a newer line stays). */
export function clearWeekPush(which: number): void {
  useWeekPush.setState((s) => {
    if (s.line?.seq !== which) return s
    if (ending) clearTimeout(ending)
    ending = null
    return { line: null }
  })
}

/**
 * The days of the line `which` taken out (undone, or changed since – nothing more to take back there); none left – the line
 * is gone. A day whose file could not be read stays, whatever it pushed: its „Cofnij” is still to be done.
 */
export function dropWeekPushDays(which: number, dates: readonly string[]): void {
  const days = useWeekPush.getState().line?.seq === which ? useWeekPush.getState().line!.push.days.filter((d) => !dates.includes(d.date)) : null
  if (!days) return
  if (!days.length) clearWeekPush(which)
  else useWeekPush.setState((s) => (s.line?.seq === which ? { line: { ...s.line, push: { days } } } : s))
}
