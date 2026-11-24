/**
 * The quick picks of the window of days (UX19, D565 P28): „pn–pt” and „każdy <dzień>” of the month the window shows; the whole weeks of the
 * window of weeks (N16). Pure – the window only puts the days they give into its selection (as a click on the grid would).
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

/** The seven days (Monday to Sunday) of the week of `date`. */
export function weekDays(date: string): string[] {
  const monday = addDays(date, 1 - weekday(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Every day of the weeks `days` touch, in their order. */
export function wholeWeeks(days: Iterable<string>): string[] {
  return [...new Set([...days].map((d) => addDays(d, 1 - weekday(d))))].sort().flatMap(weekDays)
}

/**
 * The window of weeks (N16, T2945): what a pick of the month makes of the selection `prev` (whole weeks). With Ctrl (`ctrl` – the press that
 * made it): one selected day less – its week taken off, a day more – its week added; any other pick (a plain click, Shift+click, a drag, a quick
 * pick) – every week the days picked touch (a plain click: the week of that day only).
 */
export function weekPick(prev: ReadonlySet<string>, next: ReadonlySet<string>, ctrl: boolean): string[] {
  if (!ctrl) return wholeWeeks(next)
  const added = [...next].filter((d) => !prev.has(d))
  const removed = [...prev].filter((d) => !next.has(d))
  if (!added.length && removed.length) {
    const off = new Set(removed.flatMap(weekDays))
    return [...prev].filter((d) => !off.has(d)).sort()
  }
  return wholeWeeks([...prev, ...added])
}

/** The Mondays of the `n` weeks after the week of `date`. */
export const nextWeeks = (date: string, n: number): string[] => Array.from({ length: n }, (_, i) => addDays(date, 1 - weekday(date) + 7 * (i + 1)))
