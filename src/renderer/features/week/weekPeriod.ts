/**
 * The period of „Agenda” (D6, UX8): its arrows move the first day by seven days, its title says where the list starts. Kept apart from
 * `weekViews.ts` (the formats of the dates there are another task's).
 */
import { weekday } from '@shared/time/zone'
import { dayHeading } from './weekText'

/** How far the arrows of „Agenda” move the list. */
export const AGENDA_STEP = 7

/** „7 dni od dziś” when the list starts today, else „7 dni od wt 25.11”. */
export function agendaTitle(from: string, today: string): string {
  return from === today ? '7 dni od dziś' : `7 dni od ${dayHeading(from, weekday(from) - 1)}`
}
