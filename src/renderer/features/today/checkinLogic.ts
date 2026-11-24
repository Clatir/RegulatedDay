/**
 * The first check-in's state across screens (B5, D563): „Pomiń” and the answers written but not saved live in `useUi` per day (as
 * „Strona B” and the goals do), so a trip to another screen does not lose them; another day starts clean.
 */
import type { ShortNight } from '@shared/engine/shortNight'
import type { Answer } from '@shared/model/events'

/** Your answers of a check-in, question by question; null – not answered by you yet (the form shows its answer beforehand). */
export type OwnAnswers = ReadonlyArray<Answer | null>

/**
 * The check-in shows: it is due (`needCheckin`) and „Pomiń” did not skip this very day – here (the window's state) or in the day's
 * log (`skippedInLog` – the facts' answer `checkinSkipId`, not undone; UX13: after a restart and on another computer it is not
 * asked again).
 */
export function checkinOpen(needCheckin: boolean, skippedDay: string | null, date: string, skippedInLog = false): boolean {
  return needCheckin && skippedDay !== date && !skippedInLog
}

/** Your eight answers of `date`: those kept for that day, else none yet. */
export function checkinAnswersOf(kept: { date: string; answers: OwnAnswers } | null, date: string): OwnAnswers {
  return kept?.date === date ? kept.answers : [null, null, null, null, null, null, null, null]
}

/**
 * The answers the form shows (and „Zapisz” saves): yours, where you answered – it always wins (D571) –, else the answer given
 * beforehand (`preset`: „nie”, or „tak” at „Spałem krócej niż zwykle?” after a short night).
 */
export function shownAnswers(own: OwnAnswers, preset: readonly Answer[]): Answer[] {
  return preset.map((p, i) => own[i] ?? p)
}

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** The line at „Spałem krócej niż zwykle?” after a short night (D571): „Wczoraj przy komputerze do 01:40 (pora snu 23:00)”. */
export function shortNightNote(n: ShortNight): string {
  return `Wczoraj przy komputerze do ${clockOf(n.lastInput)} (pora snu ${clockOf(n.bedtime)})`
}
