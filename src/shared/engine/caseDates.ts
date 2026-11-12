/**
 * „Sprawy” – the due date („Termin”) and the date of doing („Wykonać”) in words (HKU2: D409, D451), pure, the same in
 * the main window and in the main process (the words of the quick capture – `shared/quickDates.ts`, light for its window):
 * - the badge of the due date („Po terminie”, „Termin dziś”, „Termin jutro”, „Termin za N dni” up to 7 days, then the
 *   date) and the note „wykonać <dzień>” of a date of doing that does not decide the list yet (the lists themselves –
 *   `listOf` in `engine/cases.ts`);
 * - the morning plan's card of due dates: the sprawy past their date and due within the threshold without a block today,
 *   „Pomiń” kept to the day's end in the day's `asked` (as the plan's other answers – T855).
 */
import { dayRaw, setAsked, type Raw } from '../data/dayEdits'
import { plural } from '../format'
import type { PlanBlock } from '../model/plan'
import type { RequestRecord } from '../model/requests'
import { dayWord, shortDay } from '../quickDates'
import { addDays, daysBetween } from '../time/zone'
import { caseCompare, isDone, listOf, weekEndOf, type CaseItem } from './cases'

/** Up to this many days ahead the badge counts the days („Termin za 7 dni”); further – the date (D409). */
export const DUE_DAYS_COUNTED = 7

/**
 * The badge of the due date (D409): past it (red – `over`), today, tomorrow, in 2–7 days (`days` – the days from today,
 * negative past it), then the date itself. Null: no due date, or done.
 */
export type DueBadge = { kind: 'over' | 'today' | 'tomorrow' | 'days'; days: number; text: string } | { kind: 'date'; date: string; text: string }

export function dueBadge(r: Pick<RequestRecord, 'dueDate' | 'state'>, today: string): DueBadge | null {
  if (r.dueDate == null || isDone(r)) return null
  const days = daysBetween(today, r.dueDate)
  if (days < 0) return { kind: 'over', days, text: 'Po terminie' }
  if (days === 0) return { kind: 'today', days, text: 'Termin dziś' }
  if (days === 1) return { kind: 'tomorrow', days, text: 'Termin jutro' }
  if (days <= DUE_DAYS_COUNTED) return { kind: 'days', days, text: `Termin za ${days} ${plural(days, 'dzień', 'dni', 'dni')}` }
  return { kind: 'date', date: r.dueDate, text: `Termin ${shortDay(r.dueDate, today)}` }
}

/**
 * The note of a date of doing still ahead that does not put the sprawa on „Dziś” or „W tym tygodniu” (D451): a date
 * beyond this week, or one a move by hand holds the sprawa away from until it comes – „wykonać pn 23.11”. Null: none,
 * done, the date come or gone, or the date's „W tym tygodniu”.
 */
export function doText(r: RequestRecord, today: string): string | null {
  if (r.doDate == null || isDone(r) || r.doDate <= today) return null
  if (listOf(r, today) === 'week' && r.doDate <= weekEndOf(today)) return null
  return `wykonać ${dayWord(r.doDate, today)}`
}

// ------------------------------------------------------------------ the morning plan

/** The answer „Pomiń” of the morning's card of due dates in the day's `asked` (T855) – one key per sprawa. */
export const DEADLINE_SKIP = 'skip'
export const deadlineAskKey = (id: string): string => `deadline:${id}`

/** „Pomiń” of a sprawa on the morning's card of due dates: kept in the day's file to the day's end, on every computer. */
export function deadlineSkippedRaw(raw: Raw | null, date: string, id: string): Raw {
  return setAsked(dayRaw(raw, date), deadlineAskKey(id), DEADLINE_SKIP)
}

/**
 * The morning plan's card of due dates (D409): the sprawy not done past their due date or due within `thresholdDays`
 * after today (2: today, tomorrow and the day after), without a block on today's axis (a task's block – `PlanBlock.task`;
 * a request – in a block of requests; or „zaplanowane” today), not on „Dziś” already (its „Na Dziś” would do nothing –
 * T855) and not skipped today (`asked` of the day's file). In the order of the lists – the nearest date first. Nothing is
 * blocked (D72); the module of requests is the caller's (the page's rule – T763).
 */
export function deadlineCases(items: readonly CaseItem[], blocks: readonly Pick<PlanBlock, 'task' | 'requests'>[], today: string, thresholdDays: number, asked: Readonly<Record<string, string>> = {}): CaseItem[] {
  const last = addDays(today, thresholdDays)
  const inPlan = new Set(blocks.flatMap((b) => [...(b.task ? [b.task] : []), ...b.requests]))
  return items
    .filter((x) => {
      const due = x.record.dueDate
      if (due == null || due > last || x.list === 'done' || x.list === 'today') return false
      return !inPlan.has(x.record.id) && x.scheduled?.day !== today && asked[deadlineAskKey(x.record.id)] == null
    })
    .sort(caseCompare)
}
