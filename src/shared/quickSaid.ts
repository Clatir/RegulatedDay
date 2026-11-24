/**
 * What the quick capture says about the place it put a sprawa on (N10, D601, D603): the reasons it did not put one on the axis – one
 * set, one wording for the main process (`hub.quickAdd`), the window (`createTask`) and the bar – and the line the bar and the
 * window's toast say after a save. Pure and light.
 */
import { logicalDayOf, logicalMinuteOf } from './time/day'
import { shortTitle } from './widget'

/** The reasons a „@dzień godzina” was saved without its block (the line says them after „nie postawiono na osi:”). */
export const NOT_PLACED = {
  dayGone: 'ten dzień już minął',
  hourGone: 'ta godzina już minęła',
  dayUnreadable: 'pliku dnia nie da się teraz odczytać',
  refused: 'nie da się postawić bloku',
  settingsUnreadable: 'ustawień nie da się teraz odczytać',
  dayGivenApart: 'dzień podany osobno'
} as const

/**
 * Why a block cannot stand on `date` at `startMin` (a minute of the logical day) at the moment `at` (D601, D603): the day gone by, or
 * today with the hour already gone (before the current minute – the current one still stands). Null: it can.
 */
export function notPlacedBefore(date: string, startMin: number, at: number): string | null {
  const today = logicalDayOf(at)
  if (date < today) return NOT_PLACED.dayGone
  if (date === today && startMin < logicalMinuteOf(today, at)) return NOT_PLACED.hourGone
  return null
}

/**
 * The logical minute of `at` for a field's preview and the save (D604): the night after the date (00:00–03:59) is 1440 and more – a bare
 * „@15:00” typed then means the next logical day. `today` – the logical day of `at`; a minute outside the logical day (0 – 1679) – null (no night).
 */
export function quickNowMin(today: string, at: number): number | null {
  const m = logicalMinuteOf(today, at)
  return m >= 0 && m < 1680 ? m : null
}

/** The longest title the bar repeats after a quick capture (D470): the bar has a line, not a field. */
export const QUICK_SAID_MAX = 40

/**
 * What the bar and the window say after a quick capture (D470): the title as the folder saved it, cut when long. D601: put on the axis
 * („Dodano na oś: Raport – jutro 15:00”), or saved though „@dzień godzina” was asked for – and why not put („Zapisano: Raport – nie
 * postawiono na osi: ten dzień już minął”; no word of „Skrzynka” – the date of doing may have put it on another list).
 */
export function quickSavedText(saved: string, o: { placed?: string; notPlaced?: string; asked?: boolean } = {}): string {
  const title = shortTitle(saved, QUICK_SAID_MAX)
  // D601: the queue asks about an entry (the day's file, the sprawa – a change on another computer) – saved and waiting for the answer;
  // „Dodano na oś” would be said too soon (the answer „ich wersja” takes the sprawa with its block).
  if (o.asked) return `Zapisano: ${title} – czeka na odpowiedź o zmianie z innego komputera`
  if (o.placed) return `Dodano na oś: ${title} – ${o.placed}`
  if (o.notPlaced) return `Zapisano: ${title} – nie postawiono na osi: ${o.notPlaced}`
  return `Dodano do Skrzynki: ${title}`
}
