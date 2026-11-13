/**
 * „Sprawy” (OPS2: D383, D384, D385, D402) – the pure rules, the same in the main window and in the main process:
 * - which list a sprawa is on today: as written, „Dziś” only on the day it was put there (at 04:00 after it, not done, it
 *   is in „W tym tygodniu” – counted from the date, never written, so two computers can never write it twice, T751); a
 *   file from before „Sprawy” by its `state` (D402: „w kolejce” → Skrzynka, „w planie” → Dziś for today's block, else W tym
 *   tygodniu, „zrobione” and „porzucone” → Zrobione); the date of doing (HKU2: D409, D451) puts it on „Dziś” on its day
 *   and on „W tym tygodniu” before it in its week – counted the same way, a move by hand on the date or after it wins
 *   (`listSetDay`, T851); the lists ordered by the due date first (`caseCompare`, T854);
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
  dateFrom,
  DEFAULT_ESTIMATE_MIN,
  DEFAULT_TASK_CATEGORY,
  DEFAULT_TASK_MIN,
  ESTIMATE_RANGE,
  isPriority,
  PRIORITIES,
  requestFrom,
  titleOf,
  type CaseKind,
  type CaseList,
  type Priority,
  type RequestRecord
} from '../model/requests'
import { logicalDayOf, weekStart } from '../time/day'
import { addDays, isIsoDate, weekday } from '../time/zone'
import { durationLabel } from '../format'
import type { DayContext, DayState } from './day'
import { compareEvents, type AnyEvent } from '../model/events'
import { foldFacts, type DayFacts } from './facts'
import { atOf, gridOf } from './grid'
import { newUserBlock, requestsBlock } from './planEdit'

/** Done: the versions before „Sprawy” say it with `state` – their „Zrobiona” and „Do kolejki” keep working (T750). */
export const isDone = (r: Pick<RequestRecord, 'state'>): boolean => r.state === 'done' || r.state === 'dropped'

/** The estimate the plan counts a sprawa with: its own, else a task's 30 min (D384) or a request's 15. */
export const estimateOf = (r: Pick<RequestRecord, 'kind' | 'estimateMin'>): number => r.estimateMin ?? (r.kind === 'task' ? DEFAULT_TASK_MIN : DEFAULT_ESTIMATE_MIN)

/** The day „Dziś” the record itself says (not done): as written, or – a file from before „Sprawy” – a request „w planie”: its block's day (D402). */
function writtenTodayOf(r: RequestRecord): string | null {
  if (r.list != null && r.list !== 'done') return r.list === 'today' ? r.listDay : null
  return r.state === 'planned' ? r.day : null
}

/** The list as written, on the logical day `today` (not done) – without the date of doing. */
function writtenListOf(r: RequestRecord, today: string): CaseList {
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

/**
 * The last logical day the sprawa was moved to a list by hand (T851): `listSetDay`, or – a move to „Dziś” by a version
 * that does not write it – the day it was put on „Dziś”; the later of the two. Null: no move since its date was set.
 */
function movedDayOf(r: RequestRecord): string | null {
  const today = r.list === 'today' ? r.listDay : null
  if (r.listSetDay == null) return today
  return today != null && today > r.listSetDay ? today : r.listSetDay
}

/**
 * The date of doing that decides the list (D451): set, and no move by hand on that day or after it (that move wins – the
 * sprawa stays where you put it). Null: the list is the written one.
 */
function doDayOf(r: RequestRecord): string | null {
  if (r.doDate == null) return null
  const moved = movedDayOf(r)
  return moved != null && moved >= r.doDate ? null : r.doDate
}

/** The last day (Sunday) of the week of `day` – the week of „W tym tygodniu” is Monday to Sunday (D451). */
export const weekEndOf = (day: string): string => addDays(weekStart(day), 6)

/**
 * The logical day the sprawa is on „Dziś” of, as seen on the logical day `day` (not done): its date of doing once that
 * day has come (D451), else the day it was put there by hand, or – a file from before „Sprawy” – a request „w planie”:
 * the day of its block (D402). Null: not on „Dziś” of any day.
 */
export function onTodayOf(r: RequestRecord, day: string): string | null {
  if (isDone(r)) return null
  const d = doDayOf(r)
  return d != null && d <= day ? d : writtenTodayOf(r)
}

/**
 * The list a sprawa is on, on the logical day `today` – counted, never written (D383, D451): its date of doing puts it on
 * „Dziś” on that day and on „W tym tygodniu” after it, like any of „Dziś”; before it, a date in this week takes it out of
 * „Skrzynka” and „Kiedyś / Może” to „W tym tygodniu” – unless you moved it by hand since the date was set (that move holds
 * until the date). A move by hand on the date or after it wins over the date.
 */
export function listOf(r: RequestRecord, today: string): CaseList {
  if (isDone(r)) return 'done'
  const written = writtenListOf(r, today)
  const d = doDayOf(r)
  if (d == null) return written
  if (d === today) return 'today'
  if (d < today) return 'week'
  if (movedDayOf(r) != null) return written
  return (written === 'inbox' || written === 'someday') && d <= weekEndOf(today) ? 'week' : written
}

/** The day whose „Dziś” the sprawa came back from at 04:00 (D383) – an earlier day than `today`; null: none. */
export function rolledFrom(r: RequestRecord, today: string): string | null {
  const d = onTodayOf(r, today)
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
 * The facts of a day from its log as `computeDay` folds them (in the order of events) – all `taskQuestions` asks of a
 * day, without counting the whole day.
 */
export function dayFactsOf(date: string, events: readonly AnyEvent[]): { grid: ReturnType<typeof gridOf>; facts: DayFacts } {
  const grid = gridOf(date)
  return { grid, facts: foldFacts(grid, [...events].sort(compareEvents)) }
}

/** The blocks of a day parked or cancelled before they began (`block.park`, `block.cancel` in its log; „Cofnij” undoes them). */
export function goneBlocks(date: string, events: readonly AnyEvent[]): Set<string> {
  return new Set(blockFactsOf(date, events).gone)
}

/** The blocks of a day by its log (T768): `begun` – they ran; `gone` – parked or cancelled before they began. */
export function blockFactsOf(date: string, events: readonly AnyEvent[]): { gone: string[]; begun: string[] } {
  const out = { gone: [] as string[], begun: [] as string[] }
  for (const [id, f] of dayFactsOf(date, events).facts.blocks) {
    if (f.startedAt != null) out.begun.push(id)
    else if (f.parkedAt != null || f.cancelledAt != null) out.gone.push(id)
  }
  return out
}

/** The blocks of a day gone before they began (`goneBlocks`); undefined – the day's log not read (then as its file says). */
export type GoneOf = (date: string) => ReadonlySet<string> | undefined

/**
 * „Zaplanowane” (D384, D402, T752, T760): the block the sprawa was put into, while it is in its day – a block moved to
 * another day is followed there; one taken out of the file, cancelled in it, or parked or cancelled in the day's log
 * before it began (`goneOf`) is gone (the sprawa is back on its list). `fileOf(date)`: the day's file (null – none),
 * undefined – not read now (then as the record says).
 */
export function scheduledOf(r: Pick<RequestRecord, 'day' | 'block'>, fileOf: (date: string) => DayFile | null | undefined, goneOf?: GoneOf): Scheduled | null {
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
    if (f.cancelled.includes(r.block) || goneOf?.(date)?.has(r.block)) return null
    const b = f.blocks.find((x) => x.id === r.block)
    return b ? { day: date, block: r.block, startMin: b.startMin, known: true } : null
  }
  return null
}

/**
 * The days whose files (and logs) tell where the sprawy are planned (`scheduledOf` reads them): the days of every sprawa
 * not done with a block – as many as the open sprawy, never the history (T766: a block gone frees its sprawa however old
 * the day); a done one is not read (its day as the record says).
 */
export function scheduledDays(records: readonly RequestRecord[]): string[] {
  return [...new Set(records.flatMap((r) => (r.day && r.block && !isDone(r) ? [r.day] : [])))].sort()
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

export function caseItems(records: readonly RequestRecord[], today: string, fileOf: (date: string) => DayFile | null | undefined, goneOf?: GoneOf): CaseItem[] {
  return records.map((r) => ({
    record: r,
    list: listOf(r, today),
    rolledFrom: rolledFrom(r, today),
    scheduled: scheduledOf(r, fileOf, goneOf),
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

/**
 * The group of a sprawa in the order of a list (T854, T870): with a due date first (D409), then P1, P2, P3, P4 (1–4, D450),
 * then the rest – a sprawa without a priority (and every one done).
 */
export const DUE_GROUP = 0
export const REST_GROUP = 9
export const caseGroupOf = (x: CaseItem): number => {
  if (x.list === 'done') return REST_GROUP
  if (x.record.dueDate != null) return DUE_GROUP
  return x.record.priority != null ? 1 + PRIORITIES.indexOf(x.record.priority) : REST_GROUP
}

/**
 * The order of the lists (D409, T854, D450): the sprawy past their due date and with one first, the nearest date on top; then
 * P1, P2, P3, P4, then those without a priority – each group in the order of before (`caseOrder` – also within one due date).
 * „Zrobione” as before.
 */
export function caseCompare(a: CaseItem, b: CaseItem): number {
  if (a.list === 'done' && b.list === 'done') return caseOrder(a, b)
  const ga = caseGroupOf(a)
  const gb = caseGroupOf(b)
  if (ga !== gb) return ga - gb
  if (ga === DUE_GROUP) {
    const by = a.record.dueDate!.localeCompare(b.record.dueDate!)
    if (by) return by
  }
  return caseOrder(a, b)
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
 * it starts again without a block. Unchanged when it is there already (no edit). The day of the move is kept (T851): on
 * the date of doing or after it, it wins over the date (D451).
 */
export function listedRaw(raw: Raw, list: CaseList, at: number): Raw {
  const r = requestFrom(raw)
  if (!r) return raw
  const today = logicalDayOf(at)
  if (listOf(r, today) === list && r.list === list && (list !== 'today' || r.listDay === today)) return raw
  const next: Raw = { ...based(raw, r, today), list, listDay: list === 'today' ? today : null, listSetDay: today }
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
    // A change of its list like a move by hand (T851): a date of doing gone by does not take it off „Dziś” again.
    Object.assign(next, { list, listDay: list === 'today' ? today : null, doneAt: null, listSetDay: today })
  }
  return mirrored(next, { ...r, state: 'queued' })
}

/** The list a date of doing in the future puts a sprawa taken off „Dziś” on (D455): this week's – „W tym tygodniu”, a later one – „Skrzynka”. */
const futureDateList = (doDate: string, today: string): CaseList => (doDate <= weekEndOf(today) ? 'week' : 'inbox')

/**
 * No longer planned (D384 „Wraca na listę”): the block forgotten, the list as it was – except a sprawa a block held on „Dziś”
 * against a date of doing to come (`patchedRaw`, D455): it goes where that date puts it, as it would have without the block.
 */
export function unscheduledRaw(raw: Raw, at: number): Raw {
  const r = requestFrom(raw)
  if (!r) return raw
  const today = logicalDayOf(at)
  const next: Raw = { ...based(raw, r, today), day: null, block: null }
  // No move by hand since the date was set (`listSetDay` – a move to „Dziś” writes it, `patchedRaw` clears it).
  if (!isDone(r) && r.list === 'today' && r.doDate != null && r.doDate > today && r.listSetDay == null) {
    next.list = futureDateList(r.doDate, today)
    next.listDay = null
  }
  return mirrored(next, r)
}

/** A change of a sprawa's fields from a window. */
export interface CasePatch {
  kind?: CaseKind
  title?: string
  estimateMin?: number | null
  categoryId?: string | null
  note?: string
  person?: string | null
  /** „Termin” and „Wykonać” (D409): a day 'RRRR-MM-DD', null – cleared. */
  dueDate?: string | null
  doDate?: string | null
  /** The quarter of the matrix (D450): P1–P4, null – none. */
  priority?: Priority | null
}

/**
 * The fields changed (D384: a task needs its title; an estimate in its range or none; a request's person); the reason
 * when refused. Fields the patch does not name stay as they are.
 */
export function patchedRaw(raw: Raw, patch: CasePatch, at: number): { raw: Raw } | { error: string } {
  const r = requestFrom(raw)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  const today = logicalDayOf(at)
  const next: Raw = based(raw, r, today)
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
  if (patch.dueDate !== undefined) {
    if (patch.dueDate != null && !dateFrom(patch.dueDate)) return { error: 'Termin: nie ma takiego dnia.' }
    next.dueDate = patch.dueDate
  }
  if (patch.priority !== undefined) {
    if (patch.priority != null && !isPriority(patch.priority)) return { error: 'Priorytet: nie ma takiej ćwiartki.' }
    next.priority = patch.priority
  }
  if (patch.doDate !== undefined) {
    if (patch.doDate != null && !dateFrom(patch.doDate)) return { error: 'Wykonać: nie ma takiego dnia.' }
    next.doDate = patch.doDate
    if (patch.doDate !== r.doDate) {
      // A new date of doing is newer than any move by hand before it (T851): the date decides the list again.
      next.listSetDay = null
      if (patch.doDate != null && patch.doDate < today && !isDone(r)) {
        // Gone already when it is typed (D454): it changes nothing – the sprawa stays on the list it is on now (even if its
        // old date of doing put it there). That is written as a move by hand today (a move on the date or after it wins over
        // it, T851), so no „wróciło z „Dziś”” for a date of the past.
        const shown = listOf(r, today)
        if (shown !== writtenListOf(r, today)) Object.assign(next, { list: shown, listDay: shown === 'today' ? today : null })
        next.listSetDay = today
      } else if (patch.doDate != null && patch.doDate > today && next.list === 'today' && next.listDay != null && next.listDay >= today && !(r.day === today && r.block)) {
        // A day to come (D454): the date decides for a sprawa standing on „Dziś” now too – it goes to „W tym tygodniu” (the date
        // in this week) or „Skrzynka” (a later one, D455) and the date brings it back (its `listDay` would count as a move by hand
        // and hold it on „Dziś”). One planned today in a block stays (the block holds it; D455) – `unscheduledRaw` sends it on.
        next.list = futureDateList(patch.doDate, today)
        next.listDay = null
      }
    }
  }
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
  /**
   * The block has begun by its day's log (it stays where it ran – the sprawa only moves to the new one); undefined – not
   * known (the log not read in full): it stays too (`oldBlockTakeable`).
   */
  begun: (date: string, block: string) => boolean | undefined
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
 * The sprawa's block of before that a new planning takes out of its day whole (T764 – one rule for the write, `casePlan`
 * and `morningPlan`, and for the window's count of the push, `planningOf`): a block of yours made for it – its task's,
 * or a block of requests with this one only. A block of several requests only loses it (`withoutRequest`) and stays.
 */
export function ownTakenBlock(old: Pick<PlanBlock, 'origin' | 'task' | 'requests'>, r: Pick<RequestRecord, 'id'>): boolean {
  return old.origin === 'user' && (old.task === r.id || (old.requests.length === 1 && old.requests[0] === r.id))
}

/**
 * The sprawa's old block may leave its day (T769 – one rule for the drop and the morning's step): a day today or later,
 * the block not begun by that day's log (`begun` false; unknown – it stays); a day gone by never – history is not
 * rewritten.
 */
export function oldBlockTakeable(day: string, today: string, begun: boolean | undefined): boolean {
  return day >= today && begun === false
}

/**
 * The day's file without the sprawa's old block `id` (begun – never asked for): taken out whole (`ownTakenBlock`), a block
 * of several requests without this one; anything else – as it was.
 */
function withoutOld(raw: Raw, date: string, id: string, r: RequestRecord): Raw {
  const old = dayFileFrom(raw, date).blocks.find((b) => b.id === id)
  if (!old) return raw
  if (ownTakenBlock(old, r)) return takeBlock(raw, old.id)
  return old.origin === 'user' && old.requests.includes(r.id) ? putBlock(raw, { ...old, requests: old.requests.filter((x) => x !== r.id) }) : raw
}

/**
 * The block a sprawa makes on the axis at `startMin` (D384): a task – a flexible block of its category (a category gone:
 * „Inne”) as long as its estimate, named by the task; a request – a block of requests. The window counts what the block
 * pushes apart (D367) with it before the sprawa is written.
 */
export function caseBlock(r: RequestRecord, startMin: number, rules: Readonly<Record<string, CategoryRules>>): PlanBlock {
  const est = estimateOf(r)
  if (r.kind !== 'task') return requestsBlock([r.id], est, startMin, rules[REQUEST_CATEGORY])
  const cat = r.categoryId && rules[r.categoryId] ? r.categoryId : DEFAULT_TASK_CATEGORY
  return newUserBlock(cat, startMin, est, rules[cat], { task: r.id })
}

/**
 * A sprawa put on the axis of `date` at `startMin` (D384): a task – a flexible block of its category (a category gone:
 * „Inne”) as long as its estimate, the cost from the category, named by the task; a request – a block of requests (one
 * contact, as in the morning). The block it was planned in before is taken out of its day when it has not begun (a block
 * of several requests only loses this one) – the sprawa is planned once. Null: no sprawa in the file.
 */
/**
 * Why `casePlan` changes nothing (T774): `begunUnknown` – the sprawa's old block stands on a day today or later and that
 * day's log does not say whether it began: taking it out could undo a run, leaving it – a second block of the sprawa.
 */
export interface CasePlanRefusal {
  refused: 'begunUnknown'
}

export function casePlan(i: CasePlanInput): CasePlan | CasePlanRefusal | null {
  const r = requestFrom(i.record)
  if (!r) return null
  const days: Record<string, Raw> = {}
  const fileOf = (date: string): Raw => days[date] ?? dayRaw(i.files[date] ?? null, date)
  const today = logicalDayOf(i.at)
  const was = scheduledOf(r, (d) => (d in i.files || d in days ? dayFileFrom(fileOf(d), d) : undefined))
  if (was?.known && was.day >= today) {
    const raw = fileOf(was.day)
    const next = withoutOld(raw, was.day, was.block, r)
    const begun = i.begun(was.day, was.block)
    // Only what would change the day matters: a block of someone else's under that id, or none – nothing to ask.
    if (next !== raw && begun === undefined) return { refused: 'begunUnknown' }
    if (next !== raw && oldBlockTakeable(was.day, today, begun)) days[was.day] = next
  }
  const block = caseBlock(r, i.startMin, i.rules)
  days[i.date] = putBlock(fileOf(i.date), block)
  return { block, record: scheduledRaw(i.record, i.date, block.id, i.at), days }
}

/**
 * The day still to read before `casePlan` knows where the sprawa is planned now: the day its block was moved to (a chain
 * of „przenieś”) that `files` does not hold; null – everything needed is there.
 */
export function caseDayToRead(r: Pick<RequestRecord, 'day' | 'block'>, files: Readonly<Record<string, Raw | null>>): string | null {
  const s = scheduledOf(r, (d) => (d in files ? dayFileFrom(dayRaw(files[d] ?? null, d), d) : undefined))
  return s && !s.known ? s.day : null
}

// ------------------------------------------------------------------ the morning

/**
 * What the morning plan's step of requests offers (D384): the requests not done and not planned (in Skrzynka, Dziś or W
 * tym tygodniu – „Kiedyś / Może” stays out of the daily view), and the tasks of „Dziś” not planned – each in the order of
 * the lists (the due date first, `caseCompare`, D454).
 */
export function morningCases(items: readonly CaseItem[]): { requests: CaseItem[]; tasks: CaseItem[] } {
  const open = items.filter((x) => x.list !== 'done' && !x.scheduled)
  return {
    requests: open.filter((x) => x.record.kind === 'request' && x.list !== 'someday').sort(caseCompare),
    tasks: open.filter((x) => x.record.kind === 'task' && x.list === 'today').sort(caseCompare)
  }
}

/**
 * The sprawy of `items` with no place in today's plan: no block of their own (`PlanBlock.task`), not in a block of requests, not
 * „zaplanowane” today (D409, D450) – one reading for both morning cards (`deadlineCases`, `priorityWithoutPlace`). Order kept.
 */
export function withoutPlaceToday(items: readonly CaseItem[], blocks: readonly Pick<PlanBlock, 'task' | 'requests'>[], today: string): CaseItem[] {
  const inPlan = new Set(blocks.flatMap((b) => [...(b.task ? [b.task] : []), ...b.requests]))
  return items.filter((x) => !inPlan.has(x.record.id) && x.scheduled?.day !== today)
}

/** The minutes the chosen ones take (the place is looked for once, for all of them). */
export function morningMinutes(requests: readonly RequestRecord[], tasks: readonly RequestRecord[]): number {
  const req = requests.reduce((s, r) => s + estimateOf(r), 0)
  return (requests.length ? Math.max(5, req) : 0) + tasks.reduce((s, r) => s + estimateOf(r), 0)
}

/** What the morning's step is given: the chosen sprawy as their files are now, the day and where to put them. */
export interface MorningPlanInput {
  date: string
  dayFile: Raw | null
  requests: readonly Raw[]
  tasks: readonly Raw[]
  startMin: number
  rules: Readonly<Record<string, CategoryRules>>
  at: number
  /** The files of the other days the chosen ones are planned in (a day not here – not read: taken for planned). */
  files?: Readonly<Record<string, Raw | null>>
  /** The blocks parked or cancelled before their start in the days' logs (`goneBlocks`). */
  goneOf?: GoneOf
}

/** The morning's step done: the days after, the records after, the blocks made, the chosen ones left out (their ids). */
export interface MorningPlan {
  /** Every day's file the step changed – today's, and the day (today or later) of an old block it took out (T765, T769). */
  days: Record<string, Raw>
  records: Array<{ id: string; raw: Raw }>
  blocks: PlanBlock[]
  /** Chosen but done or planned meanwhile (or gone): nothing made for them – the window says so, never in silence. */
  skipped: string[]
}

/**
 * The chosen ones into today's plan from `startMin`, one after another: the requests as one block of requests (one
 * contact – as before), each task its own block (`caseBlock`, D384); the records „zaplanowane” in them. The records are
 * their files as they are now: planned by the same rule as the step offers them (`scheduledOf` – a sprawa whose block is
 * gone is planned again, T752); one done or planned meanwhile is left out and named in `skipped` (a second click adds
 * nothing).
 */
export function morningPlan(i: MorningPlanInput): MorningPlan {
  const today = logicalDayOf(i.at)
  const days: Record<string, Raw> = {}
  const rawOf = (d: string): Raw | undefined => days[d] ?? (d === i.date ? dayRaw(i.dayFile, i.date) : i.files && d in i.files ? dayRaw(i.files[d] ?? null, d) : undefined)
  const fileOf = (d: string) => {
    const raw = rawOf(d)
    return raw ? dayFileFrom(raw, d) : undefined
  }
  const skipped: string[] = []
  const open = (raw: Raw, kind: CaseKind) => {
    const r = requestFrom(raw)
    if (r && r.kind === kind && !isDone(r) && !scheduledOf(r, fileOf, i.goneOf)) return true
    if (r) skipped.push(r.id)
    return false
  }
  const requests = i.requests.filter((raw) => open(raw, 'request'))
  const tasks = i.tasks.filter((raw) => open(raw, 'task'))
  // A sprawa planned again because its block was parked or cancelled before its start (T760): that block, still in its
  // day's file, goes out – the sprawa is planned once, and a „Cofnij” of the parking brings back nothing of it (T765);
  // never from a day gone by (T769: it never began – `gone` – but history stays).
  for (const raw of [...requests, ...tasks]) {
    const r = requestFrom(raw)!
    const where = scheduledOf(r, fileOf)
    if (!where?.known || !oldBlockTakeable(where.day, today, false)) continue
    const before = rawOf(where.day)!
    const after = withoutOld(before, where.day, where.block, r)
    if (after !== before) days[where.day] = after
  }
  let day = rawOf(i.date)!
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
    const b = caseBlock(r, at, i.rules)
    day = putBlock(day, b)
    blocks.push(b)
    at += b.durationMin
    records.push({ id: r.id, raw: scheduledRaw(raw, i.date, b.id, i.at) })
  }
  if (blocks.length) days[i.date] = day
  return { days, records, blocks, skipped }
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
    back: records.filter((r) => onTodayOf(r, date) === date && !asked.has(r.id)).sort((a, b) => a.createdAt - b.createdAt),
    questions: [...questions],
    someday: weekday(date) === 7 ? records.filter((r) => listOf(r, today) === 'someday').length : null
  }
}

/** A raw sprawa file of the list (the window's view, the folder's collection) as a record; the broken ones left out. */
export const casesFrom = (list: readonly unknown[]): RequestRecord[] => list.flatMap((v) => (isRaw(v) ? [requestFrom(v)] : [])).filter((r): r is RequestRecord => !!r)
