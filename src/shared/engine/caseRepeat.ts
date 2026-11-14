/**
 * The next task of a task that repeats (D465, T1036–T1042) – the same pure rule for the window (`store/cases.ts`) and the
 * bar's „Zadanie zrobione? · Tak” (`main/widget.ts`):
 * - only a task with `repeat` that this change takes to „Zrobione” (from not done) makes one – a task not done never
 *   multiplies, a second tick of a done one makes nothing;
 * - its date: the next day of the rule after the date it moves – „Wykonać”, without it „Termin”, both: „Wykonać” and „Termin”
 *   the same number of days after it as before (T1038); no date – counted from the day of the tick and set as „Wykonać”; never
 *   on the day of the tick or before it (a task done late skips the days gone by – T1037);
 * - the end: after `count` tasks or past `until` – none;
 * - its fields from the task (title, person, estimate, category, note, priority, the steps unticked – the same ids, its
 *   `createdAt`), its list as a new task's with dates („Skrzynka”, the date of doing moves it – `listOf`), the rule with the
 *   next number (`n`);
 * - its id derived from the task's (`nextTaskId`): two computers ticking the same task off (or a view not fresh) write one
 *   and the same file with the same content – the queue lays the second one without a question, a conflict copy joins at once.
 */
import { isRaw, type Raw } from '../data/dayEdits'
import { derivedId } from '../model/ids'
import { REQUEST_SCHEMA, requestFrom, type RequestRecord } from '../model/requests'
import { ruleFallsOn, type PlHolidays, type SeriesRule } from '../model/series'
import { freshSteps, stepsJson } from '../model/steps'
import { taskRepeatJson, type TaskRepeat } from '../model/taskRepeat'
import { seriesRuleText } from '../seriesText'
import { logicalDayOf } from '../time/day'
import { addDays, daysBetween } from '../time/zone'
import { isDone } from './cases'

/** How far the next day of a rule is looked for (a rule of every 52 weeks falls within it). */
export const REPEAT_SCAN_DAYS = 2 * 366

/** The id of the task that follows the task `id` (the same on every computer). */
export const nextTaskId = (id: string): string => derivedId('task.repeat', id)

/** The first day of `rule` after `after` (the holidays – for „w dni robocze”); null – none within `REPEAT_SCAN_DAYS`. */
export function nextRuleDate(rule: SeriesRule, after: string, holidays: PlHolidays): string | null {
  for (let i = 1; i <= REPEAT_SCAN_DAYS; i++) {
    const d = addDays(after, i)
    if (ruleFallsOn(rule, d, holidays)) return d
  }
  return null
}

/** The dates of the task after `r` ticked off on `doneDay`, and its number; null – the repeat has ended (or no rule day). */
export function repeatNext(r: Pick<RequestRecord, 'doDate' | 'dueDate'> & { repeat: TaskRepeat }, doneDay: string, holidays: PlHolidays): { doDate: string | null; dueDate: string | null; n: number } | null {
  const rep = r.repeat
  const n = rep.n + 1
  if (rep.count != null && n > rep.count) return null
  const moved = r.doDate ?? r.dueDate
  const from = moved != null && moved > doneDay ? moved : doneDay
  const d = nextRuleDate(rep.rule, from, holidays)
  if (d == null || (rep.until != null && d > rep.until)) return null
  if (r.doDate == null && r.dueDate != null) return { doDate: null, dueDate: d, n }
  return { doDate: d, dueDate: r.doDate != null && r.dueDate != null ? addDays(d, daysBetween(r.doDate, r.dueDate)) : null, n }
}

/**
 * The next task when the change `before` → `after` (the task's file) at `at` ticks off a task that repeats: its id and its
 * file; null – none (not a tick, no repeat, the end reached).
 */
export function nextTaskRaw(before: Raw, after: Raw, at: number, holidays: PlHolidays): { id: string; raw: Raw } | null {
  const was = requestFrom(before)
  const now = requestFrom(after)
  if (!was || !now || was.kind !== 'task' || now.kind !== 'task' || isDone(was) || !isDone(now) || !now.repeat) return null
  const next = repeatNext({ doDate: now.doDate, dueDate: now.dueDate, repeat: now.repeat }, logicalDayOf(at), holidays)
  if (!next) return null
  const id = nextTaskId(now.id)
  const steps = stepsJson(freshSteps(now.steps))
  const raw: Raw = {
    schema: REQUEST_SCHEMA,
    id,
    kind: 'task',
    title: now.title,
    person: now.person,
    estimateMin: now.estimateMin,
    categoryId: now.categoryId,
    note: now.note,
    createdAt: now.createdAt,
    state: 'queued',
    day: null,
    block: null,
    list: 'inbox',
    listDay: null,
    doneAt: null,
    dueDate: next.dueDate,
    doDate: next.doDate,
    listSetDay: null,
    priority: now.priority,
    ...(steps ? { steps } : {}),
    repeat: taskRepeatJson({ ...now.repeat, n: next.n }, isRaw(after.repeat) ? after.repeat : undefined)
  }
  return { id, raw }
}

/** The repeat in words by the task (D465): „co tydzień w poniedziałek i czwartek, 10 razy (2 z 10)”, „codziennie, do 30.11”. */
export function repeatText(rep: TaskRepeat, today: string): string {
  return `${seriesRuleText(rep.rule, rep, today)}${rep.count != null ? ` (${rep.n} z ${rep.count})` : ''}`
}
