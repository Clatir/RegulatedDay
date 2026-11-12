/**
 * „Sprawy” (OPS2: D383, D384, D385, D402) – the pure rules, the same in the main window and in the main process:
 * - which list a sprawa is on today: as written, „Dziś” only on the day it was put there (at 04:00 after it, not done, it
 *   is in „W tym tygodniu” – counted from the date, never written, so two computers can never write it twice, T751); a
 *   file from before „Sprawy” by its `state` (D402: „w kolejce” → Skrzynka, „w planie” → Dziś for today's block, else W tym
 *   tygodniu, „zrobione” and „porzucone” → Zrobione);
 * - „zaplanowane <dzień> <godzina>”: the block it was put into is still in its day (the block removed or cancelled – the
 *   sprawa is back on its list without a write, its „Cofnij” brings „zaplanowane” back with the block, T752);
 * - the edits of a sprawa as new versions of its raw file – fields it does not set stay (an older version's too), and
 *   `state` is kept in step for the versions before „Sprawy” (T750);
 * - a sprawa put on the axis: a block of its category as long as its estimate (a task), or a block of requests – and the
 *   record „zaplanowane”, as one change of the day's file and the record (`casePlan`);
 * - the morning's step (requests and the tasks of „Dziś”), the bar's „Zadanie zrobione?” and the ritual's lines.
 */
import { REQUEST_CATEGORY, type CategoryRules } from '../model/categories'
import { dayRaw, isRaw, putBlock, takeBlock, type Raw } from '../data/dayEdits'
import { dayFileFrom, type DayFile, type PlanBlock } from '../model/plan'
import {
  CASE_NOTE_MAX,
  DEFAULT_ESTIMATE_MIN,
  DEFAULT_TASK_CATEGORY,
  DEFAULT_TASK_MIN,
  ESTIMATE_RANGE,
  requestFrom,
  titleOf,
  type CaseKind,
  type CaseList,
  type RequestRecord
} from '../model/requests'
import { logicalDayOf } from '../time/day'
import { addDays, isIsoDate, weekday } from '../time/zone'
import { durationLabel } from '../format'
import type { DayContext, DayState } from './day'
import { atOf } from './grid'
import { newUserBlock, requestsBlock } from './planEdit'

/** Done: the versions before „Sprawy” say it with `state` – their „Zrobiona” and „Do kolejki” keep working (T750). */
export const isDone = (r: Pick<RequestRecord, 'state'>): boolean => r.state === 'done' || r.state === 'dropped'

/** The estimate the plan counts a sprawa with: its own, else a task's 30 min (D384) or a request's 15. */
export const estimateOf = (r: Pick<RequestRecord, 'kind' | 'estimateMin'>): number => r.estimateMin ?? (r.kind === 'task' ? DEFAULT_TASK_MIN : DEFAULT_ESTIMATE_MIN)

/**
 * The logical day the sprawa was put on „Dziś” (not done): as written, or – a file from before „Sprawy” – a request „w
 * planie”: the day of its block (D402). Null: not on „Dziś” of any day.
 */
export function onTodayOf(r: RequestRecord): string | null {
  if (isDone(r)) return null
  if (r.list != null && r.list !== 'done') return r.list === 'today' ? r.listDay : null
  return r.state === 'planned' ? r.day : null
}

/** The list a sprawa is on, on the logical day `today`. */
export function listOf(r: RequestRecord, today: string): CaseList {
  if (isDone(r)) return 'done'
  if (r.list != null && r.list !== 'done') {
    if (r.list !== 'today') return r.list
    // „Dziś” of an earlier day: back in „W tym tygodniu” since the 04:00 after it (D383). A later day (another computer's
    // clock ahead) is today's; one without its day cannot be told – not „Dziś”.
    return r.listDay != null && r.listDay >= today ? 'today' : 'week'
  }
  // A file from before „Sprawy”, or one an older version took out of „Zrobione” („Do kolejki”): by its state (D402).
  if (r.state === 'planned') return r.day === today ? 'today' : 'week'
  return 'inbox'
}

/** The day whose „Dziś” the sprawa came back from at 04:00 (D383) – an earlier day than `today`; null: none. */
export function rolledFrom(r: RequestRecord, today: string): string | null {
  const d = onTodayOf(r)
  return d != null && d < today ? d : null
}

/**
 * The day a sprawa was done: its `doneAt`, else (done before „Sprawy”) the day of its block, else the day it was made;
 * null – not done or not known.
 */
export function doneDayOf(r: RequestRecord): string | null {
  if (!isDone(r)) return null
  if (r.doneAt != null) return logicalDayOf(r.doneAt)
  if (r.day) return r.day
  return r.createdAt > 0 ? logicalDayOf(r.createdAt) : null
}

/** „Zrobione” shows the last 7 days (today and six before, D402); older ones – „Pokaż starsze” and the search. */
export const DONE_RECENT_DAYS = 7
export function doneRecently(r: RequestRecord, today: string): boolean {
  const d = doneDayOf(r)
  return d == null || d >= addDays(today, -(DONE_RECENT_DAYS - 1))
}

/** Where a sprawa is „zaplanowane”: the day and the block, the block's planned start (null: anchored, or the day not read). */
export interface Scheduled {
  day: string
  block: string
  startMin: number | null
  /** The day's file was read (false: as the record says – the file not known now). */
  known: boolean
}

/** Moves of a block between days followed at most this many times (a chain of „przenieś”). */
const MOVES_FOLLOWED = 8

/**
 * „Zaplanowane” (D384, D402, T752): the block the sprawa was put into, while it is in its day – a block moved to another
 * day is followed there; one taken out of the file or cancelled is gone (the sprawa is back on its list). `fileOf(date)`:
 * the day's file (null – none), undefined – not read now (then as the record says).
 */
export function scheduledOf(r: Pick<RequestRecord, 'day' | 'block'>, fileOf: (date: string) => DayFile | null | undefined): Scheduled | null {
  if (!r.day || !r.block) return null
  let date = r.day
  for (let hop = 0; hop <= MOVES_FOLLOWED; hop++) {
    const f = fileOf(date)
    if (f === undefined) return { day: date, block: r.block, startMin: null, known: false }
    if (!f) return null
    const to = f.movedTo[r.block]
    if (to && to !== date) {
      date = to
      continue
    }
    if (f.cancelled.includes(r.block)) return null
    const b = f.blocks.find((x) => x.id === r.block)
    return b ? { day: date, block: r.block, startMin: b.startMin, known: true } : null
  }
  return null
}

/** The days whose files tell where the sprawy are planned (`scheduledOf` reads them). */
export function scheduledDays(records: readonly RequestRecord[]): string[] {
  return [...new Set(records.flatMap((r) => (r.day && r.block ? [r.day] : [])))].sort()
}

/** A sprawa as the lists show it on a day. */
export interface CaseItem {
  record: RequestRecord
  list: CaseList
  /** Came back from „Dziś” of that day at 04:00 (D383); null – not. */
  rolledFrom: string | null
  scheduled: Scheduled | null
  estimateMin: number
  /** The day it was done (Zrobione), null – not done or not known. */
  doneDay: string | null
  /** Done within the last 7 days (D402) – an open one too. */
  recent: boolean
}

export function caseItems(records: readonly RequestRecord[], today: string, fileOf: (date: string) => DayFile | null | undefined): CaseItem[] {
  return records.map((r) => ({
    record: r,
    list: listOf(r, today),
    rolledFrom: rolledFrom(r, today),
    scheduled: scheduledOf(r, fileOf),
    estimateMin: estimateOf(r),
    doneDay: doneDayOf(r),
    recent: doneRecently(r, today)
  }))
}

/**
 * The order within a list: „Zrobione” – the latest done first; the others – the newest first (a task just captured is on
 * top of „Skrzynka”).
 */
export function caseOrder(a: CaseItem, b: CaseItem): number {
  if (a.list === 'done' && b.list === 'done') return (b.record.doneAt ?? 0) - (a.record.doneAt ?? 0) || (b.doneDay ?? '').localeCompare(a.doneDay ?? '') || b.record.createdAt - a.record.createdAt
  return b.record.createdAt - a.record.createdAt
}

/** The sum of the estimates of „Dziś” (D402: the header „Dziś · 3 h 30 min”, nothing compared with the plan). */
export function todayMinutes(items: readonly CaseItem[]): number {
  return items.reduce((sum, x) => sum + (x.list === 'today' ? x.estimateMin : 0), 0)
}
export const todayHeader = (minutes: number): string => (minutes > 0 ? `Dziś · ${durationLabel(minutes)}` : 'Dziś')

/** How a sprawa is named in a line (the bar, the ritual): a task by its title, a request by its person (`person`) and note. */
export function caseName(r: RequestRecord, person: (id: string | null) => string): string {
  if (r.kind === 'task') return r.title || 'zadanie'
  return r.note ? `${person(r.person)}: ${r.note}` : person(r.person)
}

// ------------------------------------------------------------------ edits (raw files)

/**
 * The record as the next edit starts from it: a file from before „Sprawy” gets its list written as it reads today (D402)
 * – from then on its `state` only mirrors it; a written list stays as it is (a „Dziś” of an earlier day goes on reading as
 * „W tym tygodniu”, and the ritual of that day still names it).
 */
function based(raw: Raw, r: RequestRecord, today: string): Raw {
  if (r.list != null && !(r.list === 'done' && !isDone(r))) return { ...raw }
  const list = listOf(r, today)
  return { ...raw, kind: r.kind, list, listDay: list === 'today' ? today : null }
}

/** `state` as the versions before „Sprawy” read it, from what the edit leaves (T750). */
function mirrored(next: Raw, was: RequestRecord): Raw {
  if (next.list === 'done') return { ...next, state: was.state === 'dropped' ? 'dropped' : 'done' }
  return { ...next, state: isIsoDate(next.day) && typeof next.block === 'string' && next.block ? 'planned' : 'queued' }
}

/**
 * A sprawa moved to a list at `at` (D383): „Dziś” keeps the day; „Zrobione” – the moment it was done; out of „Zrobione”
 * it starts again without a block. Unchanged when it is there already (no edit).
 */
export function listedRaw(raw: Raw, list: CaseList, at: number): Raw {
  const r = requestFrom(raw)
  if (!r) return raw
  const today = logicalDayOf(at)
  if (listOf(r, today) === list && r.list === list && (list !== 'today' || r.listDay === today)) return raw
  const next: Raw = { ...based(raw, r, today), list, listDay: list === 'today' ? today : null }
  // Done already (before „Sprawy” without its moment): the moment stays as it was.
  if (list === 'done') next.doneAt = isDone(r) ? r.doneAt : at
  else {
    next.doneAt = null
    if (isDone(r)) {
      next.day = null
      next.block = null
    }
  }
  return mirrored(next, { ...r, state: list === 'done' ? r.state : 'queued' })
}

/** Put into a block of a day („zaplanowane”, D384); a done one starts again on „Dziś” (today's block) or „W tym tygodniu”. */
export function scheduledRaw(raw: Raw, day: string, block: string, at: number): Raw {
  const r = requestFrom(raw)
  if (!r) return raw
  const today = logicalDayOf(at)
  const next: Raw = { ...based(raw, r, today), day, block }
  if (isDone(r) || next.list === 'done') {
    const list: CaseList = day <= today ? 'today' : 'week'
    Object.assign(next, { list, listDay: list === 'today' ? today : null, doneAt: null })
  }
  return mirrored(next, { ...r, state: 'queued' })
}

/** No longer planned (D384 „Wraca na listę”): the block forgotten, the list as it was. */
export function unscheduledRaw(raw: Raw, at: number): Raw {
  const r = requestFrom(raw)
  if (!r) return raw
  return mirrored({ ...based(raw, r, logicalDayOf(at)), day: null, block: null }, r)
}

/** A change of a sprawa's fields from a window. */
export interface CasePatch {
  kind?: CaseKind
  title?: string
  estimateMin?: number | null
  categoryId?: string | null
  note?: string
  person?: string | null
}

/**
 * The fields changed (D384: a task needs its title; an estimate in its range or none; a request's person); the reason
 * when refused. Fields the patch does not name stay as they are.
 */
export function patchedRaw(raw: Raw, patch: CasePatch, at: number): { raw: Raw } | { error: string } {
  const r = requestFrom(raw)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  const next: Raw = based(raw, r, logicalDayOf(at))
  const kind = patch.kind ?? r.kind
  if (patch.kind !== undefined) next.kind = patch.kind
  if (patch.title !== undefined) next.title = titleOf(patch.title)
  const title = patch.title !== undefined ? titleOf(patch.title) : r.title
  if (kind === 'task' && !title) return { error: 'Zadanie potrzebuje tytułu.' }
  if (patch.estimateMin !== undefined) {
    const e = patch.estimateMin
    if (e != null && !(Number.isInteger(e) && e >= ESTIMATE_RANGE[0] && e <= ESTIMATE_RANGE[1])) return { error: `Szacunek: od ${ESTIMATE_RANGE[0]} min do ${ESTIMATE_RANGE[1] / 60} h.` }
    next.estimateMin = e
  }
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId || null
  if (kind === 'task' && next.categoryId == null && r.categoryId == null) next.categoryId = DEFAULT_TASK_CATEGORY
  if (patch.note !== undefined) next.note = patch.note.slice(0, CASE_NOTE_MAX)
  if (patch.person !== undefined) next.person = patch.person || null
  return { raw: next }
}

// ------------------------------------------------------------------ a sprawa on the axis

/** What a sprawa put on the axis is made of. */
export interface CasePlanInput {
  /** The sprawa's file as it is now. */
  record: Raw
  /** The day of the axis and the logical minute it was dropped at. */
  date: string
  startMin: number
  /** The files of the days the change reads: the day of the axis and the day the sprawa is planned in now (null – none). */
  files: Readonly<Record<string, Raw | null>>
  /** The categories in force on that day. */
  rules: Readonly<Record<string, CategoryRules>>
  at: number
  /** The block has begun (its run in the log): it stays where it ran – the sprawa only moves to the new one. */
  begun: (date: string, block: string) => boolean
}

export interface CasePlan {
  /** The new block (a task: its category and estimate, D384; a request: a block of requests). */
  block: PlanBlock
  /** The record after: „zaplanowane” in the new block. */
  record: Raw
  /** The days' files after (the new block's day; the old block's day, when it was taken out of it). */
  days: Record<string, Raw>
}

/**
 * A sprawa put on the axis of `date` at `startMin` (D384): a task – a flexible block of its category (a category gone:
 * „Inne”) as long as its estimate, the cost from the category, named by the task; a request – a block of requests (one
 * contact, as in the morning). The block it was planned in before is taken out of its day when it has not begun (a block
 * of several requests only loses this one) – the sprawa is planned once. Null: no sprawa in the file.
 */
export function casePlan(i: CasePlanInput): CasePlan | null {
  const r = requestFrom(i.record)
  if (!r) return null
  const days: Record<string, Raw> = {}
  const fileOf = (date: string): Raw => days[date] ?? dayRaw(i.files[date] ?? null, date)
  const was = scheduledOf(r, (d) => (d in i.files || d in days ? dayFileFrom(fileOf(d), d) : undefined))
  if (was?.known && !i.begun(was.day, was.block)) {
    const raw = fileOf(was.day)
    const old = dayFileFrom(raw, was.day).blocks.find((b) => b.id === was.block)
    if (old && old.origin === 'user') {
      const others = old.requests.filter((x) => x !== r.id)
      days[was.day] = old.task === r.id || (old.requests.includes(r.id) && !others.length) ? takeBlock(raw, old.id) : old.requests.includes(r.id) ? putBlock(raw, { ...old, requests: others }) : raw
    }
  }
  const est = estimateOf(r)
  let block: PlanBlock
  if (r.kind === 'task') {
    const cat = r.categoryId && i.rules[r.categoryId] ? r.categoryId : DEFAULT_TASK_CATEGORY
    block = newUserBlock(cat, i.startMin, est, i.rules[cat], { task: r.id })
  } else block = requestsBlock([r.id], est, i.startMin, i.rules[REQUEST_CATEGORY])
  days[i.date] = putBlock(fileOf(i.date), block)
  return { block, record: scheduledRaw(i.record, i.date, block.id, i.at), days }
}

// ------------------------------------------------------------------ the morning

/**
 * What the morning plan's step of requests offers (D384): the requests not done and not planned (in Skrzynka, Dziś or W
 * tym tygodniu – „Kiedyś / Może” stays out of the daily view), and the tasks of „Dziś” not planned.
 */
export function morningCases(items: readonly CaseItem[]): { requests: CaseItem[]; tasks: CaseItem[] } {
  const open = items.filter((x) => x.list !== 'done' && !x.scheduled)
  return {
    requests: open.filter((x) => x.record.kind === 'request' && x.list !== 'someday').sort(caseOrder),
    tasks: open.filter((x) => x.record.kind === 'task' && x.list === 'today').sort(caseOrder)
  }
}

/** The minutes the chosen ones take (the place is looked for once, for all of them). */
export function morningMinutes(requests: readonly RequestRecord[], tasks: readonly RequestRecord[]): number {
  const req = requests.reduce((s, r) => s + estimateOf(r), 0)
  return (requests.length ? Math.max(5, req) : 0) + tasks.reduce((s, r) => s + estimateOf(r), 0)
}

/**
 * The chosen ones into today's plan from `startMin`, one after another: the requests as one block of requests (one
 * contact – as before), each task its own block (its category and estimate, D384); the records „zaplanowane” in them. The
 * records are their files as they are now (one gone or done meanwhile is left out – a second click adds nothing).
 */
export function morningPlan(i: { date: string; dayFile: Raw | null; requests: readonly Raw[]; tasks: readonly Raw[]; startMin: number; rules: Readonly<Record<string, CategoryRules>>; at: number }): { day: Raw; records: Array<{ id: string; raw: Raw }>; blocks: PlanBlock[] } {
  const open = (raw: Raw) => {
    const r = requestFrom(raw)
    return r && !isDone(r) && !(r.day && r.block) ? r : null
  }
  const requests = i.requests.flatMap((raw) => (open(raw)?.kind === 'request' ? [raw] : []))
  const tasks = i.tasks.flatMap((raw) => (open(raw)?.kind === 'task' ? [raw] : []))
  let day = dayRaw(i.dayFile, i.date)
  let at = i.startMin
  const blocks: PlanBlock[] = []
  const records: Array<{ id: string; raw: Raw }> = []
  if (requests.length) {
    const recs = requests.map((raw) => requestFrom(raw)!)
    const b = requestsBlock(
      recs.map((r) => r.id),
      recs.reduce((s, r) => s + estimateOf(r), 0),
      at,
      i.rules[REQUEST_CATEGORY]
    )
    day = putBlock(day, b)
    blocks.push(b)
    at += b.durationMin
    for (const [k, raw] of requests.entries()) records.push({ id: recs[k]!.id, raw: scheduledRaw(raw, i.date, b.id, i.at) })
  }
  for (const raw of tasks) {
    const r = requestFrom(raw)!
    const cat = r.categoryId && i.rules[r.categoryId] ? r.categoryId : DEFAULT_TASK_CATEGORY
    const b = newUserBlock(cat, at, estimateOf(r), i.rules[cat], { task: r.id })
    day = putBlock(day, b)
    blocks.push(b)
    at += b.durationMin
    records.push({ id: r.id, raw: scheduledRaw(raw, i.date, b.id, i.at) })
  }
  return { day, records, blocks }
}

// ------------------------------------------------------------------ „Zadanie zrobione?” and the ritual

/** How long after its block's end the bar asks (quietly, D384); then only the ritual has it (T754). */
export const TASK_LINE_MIN = 180

export const taskQuestionId = (day: string, block: string): string => `task:${day}:${block}`

/** A task whose block ended and nobody said whether it is done (D384). */
export interface TaskQuestion {
  /** The bar's line (`task:<dzień>:<blok>`) – the same on every computer. */
  id: string
  task: string
  block: string
  title: string
  /** When its block ended (ms – the minute of its end). */
  endedAt: number
}

/**
 * „Zadanie zrobione?” of a day (D384, T754): a task planned in a block of the day's plan (moved there too) that has run and
 * ended (not cancelled), and the task is neither done nor taken back to its list – the answer is the record itself (done,
 * or no block), so every computer asks the same one question and none asks after it was answered on another.
 */
export function taskQuestions(ctx: Pick<DayContext, 'plan'>, state: Pick<DayState, 'grid' | 'facts'>, records: readonly RequestRecord[]): TaskQuestion[] {
  const date = state.grid.date
  const inPlan = new Set(ctx.plan.map((b) => b.id))
  const out: TaskQuestion[] = []
  for (const r of records) {
    // By its block (the record keeps the day it was put in; a block moved to another day keeps its id there).
    if (r.kind !== 'task' || isDone(r) || !r.block || !inPlan.has(r.block)) continue
    const f = state.facts.blocks.get(r.block)
    if (!f || f.startedAt == null || f.endedAt == null || f.cancelledAt != null) continue
    out.push({ id: taskQuestionId(date, r.block), task: r.id, block: r.block, title: r.title || 'zadanie', endedAt: atOf(state.grid, f.endedAt) })
  }
  return out.sort((a, b) => a.endedAt - b.endedAt)
}

/** The bar's line of a question (quiet: no dot – D384). */
export const taskLineText = (title: string): string => `Zadanie zrobione? „${title}”`
export const TASK_ANSWERS = [
  { id: 'done', label: 'Tak' },
  { id: 'back', label: 'Wraca na listę' }
] as const

/** An answer to „Zadanie zrobione?” (the bar, the ritual): „Tak” – Zrobione; „Wraca na listę” – no longer planned. */
export function taskAnswerRaw(raw: Raw, answer: 'done' | 'back', at: number): Raw {
  return answer === 'done' ? listedRaw(raw, 'done', at) : unscheduledRaw(raw, at)
}

/** What the evening ritual of a day says about „Sprawy” (D383, D384, D402). */
export interface CasesRitual {
  /** On „Dziś” of the day and not done: back in „W tym tygodniu” at the 04:00 after it (D383). */
  back: RequestRecord[]
  /** „Zadanie zrobione?” nobody answered (D384). */
  questions: TaskQuestion[]
  /** Sunday (D402): how many sprawy wait in „Kiedyś / Może” (null – not Sunday). */
  someday: number | null
}

export function casesRitual(date: string, today: string, records: readonly RequestRecord[], questions: readonly TaskQuestion[]): CasesRitual {
  const asked = new Set(questions.map((q) => q.task))
  return {
    back: records.filter((r) => onTodayOf(r) === date && !asked.has(r.id)).sort((a, b) => a.createdAt - b.createdAt),
    questions: [...questions],
    someday: weekday(date) === 7 ? records.filter((r) => listOf(r, today) === 'someday').length : null
  }
}

/** A raw sprawa file of the list (the window's view, the folder's collection) as a record; the broken ones left out. */
export const casesFrom = (list: readonly unknown[]): RequestRecord[] => list.flatMap((v) => (isRaw(v) ? [requestFrom(v)] : [])).filter((r): r is RequestRecord => !!r)
