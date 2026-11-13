/**
 * The line „Przesunięto N bloków w K dniach · Cofnij” of „Tydzień” (D400) – kept in the window, not in the page: it
 * outlives a change of the page and is there again when „Tydzień” is opened, to the end of `UNDO_LINE_MS` (counted from the
 * save, not from the page's showing; the store ends it itself, a page need not be open). Only the last one (a newer „Dodaj”
 * that pushed blocks replaces it).
 */
import { create } from 'zustand'
import type { EditEntry, RawRecord } from '@shared/api'
import { blockName, nameById, type Names } from '@shared/blockName'
import { namingOf } from '@shared/engine/context'
import type { DayContext } from '@shared/engine/day'
import type { DayFacts } from '@shared/engine/facts'
import { stayHowOf, type StayHow } from '@shared/engine/planEdit'
import type { PlanBlock } from '@shared/model/plan'
import { UNDO_LINE_MS } from '@shared/widget'

/** What „Dodaj” did to one day of the range: the one edit of its file, the file it created, how many blocks it pushed apart. */
export interface WeekPushedDay {
  date: string
  entry: EditEntry
  /** The file the edit created (null: the file was there). */
  made: RawRecord | null
  moved: number
  /** How many of the pushed blocks an unchecked calendar hides (D419, T1003): the line says „(w tym M ukrytych)”. */
  hidden?: number
}

/** The days a „Dodaj” wrote (D400), for the one „Cofnij” of the line „Przesunięto N bloków w K dniach” – only when it pushed some. */
export interface WeekPush {
  days: WeekPushedDay[]
  /**
   * A block moved to another day (D417 – `moveWeekBlock` of „Tydzień” and „3 dni”, D426 – `moveDayBlock` of „Przenieś na…”):
   * its days go back together or not at all (`undoWeekPush`); the line says „Przeniesiono: <name> na <to>” (D422) and, for each
   * block anchored to it that stayed on its day, its name and why (`stayed` – D424, D426, T965: „został – już trwa”, „… –
   * zaparkowany”, „… w swoim dniu”…) – the names as the window named them at the move. Absent – a „Dodaj”, or a push within
   * one day.
   */
  move?: { blockId: string; name: string; from: string; to: string; stayed?: Stayed[] }
}

/** A block anchored to the moved one that stayed on its day: its name and why (D424, D426, T965). */
export interface Stayed {
  name: string
  how: StayHow
}

/** The text of a move refused because the block is not in its day's plan any more (another computer moved or removed it). */
export const MOVE_GONE_TEXT = 'tego bloku nie ma już w planie dnia'

/**
 * The blocks that stayed, named and with why (T982, one helper of „Tydzień” and „Przenieś na…”): from the day as counted –
 * or, when it cannot be counted now, as the window saw it (`day`); no names – „blok”.
 */
export function stayedOf(stayers: readonly PlanBlock[], day: { ctx: Pick<DayContext, 'date' | 'plan' | 'snapshot'>; facts: Pick<DayFacts, 'blocks'> } | null, names?: Names): Stayed[] {
  const naming = day ? namingOf(day.ctx, day.facts) : null
  return stayers.map((s) => ({ name: names ? (naming ? nameById(s.id, naming, names) : blockName(s, names)) : 'blok', how: stayHowOf(day?.facts.blocks.get(s.id)) }))
}

/** A day a move wrote, for its „Cofnij” (none when its edit changed nothing). */
export const movedDay = (date: string, entry: EditEntry | null, after: RawRecord, moved = 0, hidden = 0): WeekPushedDay[] => (entry ? [{ date, entry, made: entry.create ? after : null, moved, hidden }] : [])

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
  else useWeekPush.setState((s) => (s.line?.seq === which ? { line: { ...s.line, push: { ...s.line.push, days } } } : s))
}
