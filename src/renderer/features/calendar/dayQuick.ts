/**
 * The quick picks of the window of days (UX19, D565 P28): „pn–pt” and „każdy <dzień>” of the month the window shows. Pure – the window only
 * puts the days they give into its selection (as a click on the grid would).
 */
import { addDays, weekday } from '@shared/time/zone'

/** Every day of `month` (`RRRR-MM`) in its order. */
export function daysOfMonth(month: string): string[] {
  const out: string[] = []
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d)
  return out
}

/** The days of `month` that are Monday to Friday. */
export const workdaysOfMonth = (month: string): string[] => daysOfMonth(month).filter((d) => weekday(d) <= 5)

/** The days of `month` that are `day` of the week (1 = Monday … 7 = Sunday): every Tuesday of it, …. */
export const weekdaysOfMonth = (month: string, day: number): string[] => daysOfMonth(month).filter((d) => weekday(d) === day)
