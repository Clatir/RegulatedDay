/**
 * The end of a block (D464): next to every start hour a field „Koniec”. Typing it changes the length (the start stays), a
 * new length changes the end; an end at or before the start is the next day's („+1 dzień”). Pure – the field is
 * `EndField` in the window, the rules of the examples are in `tests/unit/block-end.test.ts`.
 */
import { durationLabel, logicalClock, parseLogicalTime, type Parsed } from './format'
import { MAX_BLOCK_MIN, MIN_BLOCK_MIN } from './model/plan'

const MINUTES_IN_DAY = 1440

/** The end of a block: its start and length (logical minutes; 1440 and more – after midnight of the day's date). */
export const endOf = (startMin: number, durationMin: number): number => startMin + durationMin

/** The length that ends at `endMin` when it starts at `startMin`: an end at or before the start is the next day's. */
export function lengthTo(startMin: number, endMin: number): number {
  let end = endMin
  while (end <= startMin) end += MINUTES_IN_DAY
  return end - startMin
}

/**
 * An end typed (D464): „9:30”, „0:15” (the night after, as every hour), or with „+1” – the next day's. Answers the end as
 * logical minutes after `startMin` (the next day's one past 1440); refused when it makes the block shorter than 5 min or
 * longer than 24 h (the limits of the dragging and of the field „Długość”), with the message the field shows.
 */
export function parseEnd(text: string, startMin: number): Parsed<number> {
  const typed = parseLogicalTime(text)
  if (!typed.ok) return typed
  let end = typed.value
  if (/\+1$/.test(text.trim()) && end < MINUTES_IN_DAY) end += MINUTES_IN_DAY
  end = startMin + lengthTo(startMin, end)
  const length = end - startMin
  if (length < MIN_BLOCK_MIN) return { ok: false, message: `Blok trwa najkrócej ${durationLabel(MIN_BLOCK_MIN)}.` }
  if (length > MAX_BLOCK_MIN) return { ok: false, message: `Najdłużej ${durationLabel(MAX_BLOCK_MIN)}.` }
  return { ok: true, value: end }
}

/** „+1 dzień” when the block ends on a later date than it starts on (after midnight of the day it starts on); null otherwise. */
export function nextDayNote(startMin: number, endMin: number): string | null {
  return Math.floor(endMin / MINUTES_IN_DAY) > Math.floor(startMin / MINUTES_IN_DAY) ? '+1 dzień' : null
}

/** The end of a block that follows another („po bloku”): not known by itself – the forecast's one, „ok. 14:30”; null – no forecast. */
export function forecastEndText(endMin: number | null | undefined): string | null {
  return endMin == null ? null : `ok. ${logicalClock(endMin)}`
}
