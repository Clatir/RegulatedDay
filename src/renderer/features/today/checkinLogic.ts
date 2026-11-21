/**
 * The first check-in's state across screens (B5, D563): „Pomiń” and the answers written but not saved live in `useUi` per day (as
 * „Strona B” and the goals do), so a trip to another screen does not lose them; another day starts clean.
 */
import type { Answer } from '@shared/model/events'

/** The check-in shows: it is due (`needCheckin`) and „Pomiń” did not skip this very day. */
export function checkinOpen(needCheckin: boolean, skippedDay: string | null, date: string): boolean {
  return needCheckin && skippedDay !== date
}

/** The eight answers of `date`: those kept for that day, else all „nie”. */
export function checkinAnswersOf(kept: { date: string; answers: Answer[] } | null, date: string): Answer[] {
  return kept?.date === date ? kept.answers : [0, 0, 0, 0, 0, 0, 0, 0]
}
