/**
 * The morning plan's line about today's all-day events (D405): one information line, no question and no step – „Dziś:
 * Konferencja (2/3)”, with several „Dziś: A (2/3) · B” (all of them, in the order of `compareAllDay`). None – no line.
 */
import { dayOfText, eventsOn, type AllDayEvent } from '@shared/model/allDay'

export function morningAllDayLine(events: readonly AllDayEvent[], date: string): string | null {
  const today = eventsOn(events, date)
  if (!today.length) return null
  return `Dziś: ${today.map((e) => [e.title, dayOfText(e, date)].filter(Boolean).join(' ')).join(' · ')}`
}
