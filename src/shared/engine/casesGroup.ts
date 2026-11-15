/**
 * Group changes of „Sprawy” (D527–D531, ciąg Z): what one change of several sprawy does to each file, pure – the window
 * writes the files in one edit (`store/casesGroup.ts`). Each sprawa is changed as the action of one sprawa changes it
 * (`listedRaw`, `patchedRaw`); one the action does not concern is left out with its reason, never refused (D72: nothing
 * is blocked – the line says „pominięto 2: prośba”). „Cofnij” (D529, D313) takes back, field by field, only what the
 * change set and what still stands as it left it (`revertedRaw`).
 */
import { REQUEST_CATEGORY, type Costs, type CategoryRules } from '../model/categories'
import { deepEqual, sameContentAs, BOOKKEEPING } from '../data/merge'
import type { Raw } from '../data/dayEdits'
import { DEFAULT_TASK_CATEGORY, requestFrom, type CaseList, type RequestRecord } from '../model/requests'
import { logicalDayOf } from '../time/day'
import { estimateOf, listedRaw, listOf, patchedRaw, type CaseItem, type CasePatch } from './cases'

/** A sprawa left out of a group change, and why (the reason is the word the line of the change says). */
export interface GroupSkip {
  id: string
  reason: string
}

/** The reasons a sprawa is left out – one place, the line and the tests use them. */
export const SKIP = {
  /** The file is gone (removed on another computer, or never there). */
  gone: 'nie ma jej',
  /** A request has no category of its own (its block is one of requests). */
  request: 'prośba',
  /** It is on that list already. */
  sameList: 'już tam jest',
  /** It has that value already. */
  same: 'bez zmiany',
  /** „Zrobione” of one already done. */
  done: 'zrobiona',
  /** „Przywróć” of one not done. */
  notDone: 'niezrobiona',
  /** The step of one sprawa was refused (a task without a title): left out, the others are written (D72). */
  refused: 'nie da się'
} as const

/** What a group change makes of one file: the file after, or why it is left out (a step never refuses the whole change – D72). */
export type GroupStep = { raw: Raw } | { skip: string }

/** The step of a file `after` the edit: nothing to write (the same content) – left out as `reason`. */
function written(before: Raw, after: Raw, reason: string): GroupStep {
  return sameContentAs(before, after) ? { skip: reason } : { raw: after }
}

/** „Przenieś na listę”: to a list, one on it already is left out; out of „Zrobione” it starts again without its block (`listedRaw`). */
export function movedStep(raw: Raw, list: CaseList, at: number): GroupStep {
  if (!requestFrom(raw)) return { skip: SKIP.gone }
  const next = listedRaw(raw, list, at)
  return next === raw ? { skip: SKIP.sameList } : written(raw, next, SKIP.sameList)
}

/** „Zrobione”: one already done is left out (a task that repeats gets its next one in the same edit – the store). */
export function doneStep(raw: Raw, at: number): GroupStep {
  const r = requestFrom(raw)
  if (!r) return { skip: SKIP.gone }
  if (listOf(r, logicalDayOf(at)) === 'done') return { skip: SKIP.done }
  return written(raw, listedRaw(raw, 'done', at), SKIP.done)
}

/** „Przywróć”: a done sprawa back on `list` without its block (`listedRaw`); one not done is left out. */
export function restoredStep(raw: Raw, list: Exclude<CaseList, 'done'>, at: number): GroupStep {
  const r = requestFrom(raw)
  if (!r) return { skip: SKIP.gone }
  if (listOf(r, logicalDayOf(at)) !== 'done') return { skip: SKIP.notDone }
  return written(raw, listedRaw(raw, list, at), SKIP.notDone)
}

/** The step of a field: `patchedRaw` of the one sprawa; its refusal (a task without a title) leaves this sprawa out, the others go on (D72). */
function patchedStep(raw: Raw, patch: CasePatch, at: number): GroupStep {
  const p = patchedRaw(raw, patch, at)
  return 'error' in p ? { skip: SKIP.refused } : written(raw, p.raw, SKIP.same)
}

/** The category of a task (a request has none – left out as `SKIP.request`); the same one – left out as `SKIP.same`. */
export function categoryStep(raw: Raw, categoryId: string, at: number): GroupStep {
  const r = requestFrom(raw)
  if (!r) return { skip: SKIP.gone }
  return r.kind !== 'task' ? { skip: SKIP.request } : patchedStep(raw, { categoryId }, at)
}

/** The estimate in minutes (null – none: a task then counts 30, a request 15); the same one – left out as `SKIP.same`. */
export function estimateStep(raw: Raw, estimateMin: number | null, at: number): GroupStep {
  return requestFrom(raw) ? patchedStep(raw, { estimateMin }, at) : { skip: SKIP.gone }
}

/**
 * Why an estimate typed for the whole group cannot be set (the one value is the same for all: the change is refused whole, with the
 * text the field of one sprawa gives – `patchedRaw`); null – it can.
 */
export function estimateRefusal(estimateMin: number | null): string | null {
  const p = patchedRaw({ id: 'probe', kind: 'task', title: 'probe' }, { estimateMin }, 0)
  return 'error' in p ? p.error : null
}

/**
 * Whether „Zaplanuj” puts the sprawa on the axis: a done one is left out; a sprawa already „zaplanowane” is planned again as „Zaplanuj”
 * of one does (its old block, not begun, leaves its day); a copy (Ctrl) is always made. The reason when not.
 */
export const planSkip = (x: Pick<CaseItem, 'list'>, copy: boolean): string | null => (!copy && x.list === 'done' ? SKIP.done : null)

/** The minutes the block of a sprawa takes on the axis (the estimate; a block of requests at least 5 – `requestsBlock`). */
export const blockMinutes = (r: Pick<RequestRecord, 'kind' | 'estimateMin'>): number => (r.kind === 'task' ? estimateOf(r) : Math.max(5, estimateOf(r)))

/** The minutes a group takes one after another – the length of the free place „Zaplanuj…” proposes. */
export const groupBlockMinutes = (rs: readonly Pick<RequestRecord, 'kind' | 'estimateMin'>[]): number => rs.reduce((s, r) => s + blockMinutes(r), 0)

/**
 * One sprawa of the line over a selection (D527): its estimate and its cost per hour in the pools (null – none known: it adds
 * nothing to the energy). A task – the cost of its category (one gone: „Inne”), a request – the cost of contact (`REQUEST_CATEGORY`,
 * as the energy counts it), else „Inne”. Same shape as the line's items (`SummaryItem`).
 */
export function caseSummaryItem(r: Pick<RequestRecord, 'kind' | 'estimateMin' | 'categoryId'>, rules: Readonly<Record<string, CategoryRules>>): { minutes: number; costs: Costs | null } {
  const own = r.kind === 'task' ? (r.categoryId ? rules[r.categoryId] : undefined) : rules[REQUEST_CATEGORY]
  const cat = own ?? rules[DEFAULT_TASK_CATEGORY]
  return { minutes: estimateOf(r), costs: cat ? cat.costs : null }
}

/** What „Cofnij” makes of a record: the file as it is put back, or that it stays (changed since), or that there is nothing to put back. */
export type Reverted = { raw: Raw } | 'kept' | 'same'

/**
 * „Cofnij” of a change of a record (D529, D313): the fields the change set (`before` → `after`) go back to their value before – each
 * only while it still has the value the change gave it; fields changed since and the others stay as they are. A sprawa with a field
 * that is no longer as the change left it (changed here or on another computer since) stays whole – `'kept'`, the line counts it.
 * Nothing that differed – `'same'`.
 */
export function revertedRaw(now: Raw, before: Raw, after: Raw): Reverted {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !BOOKKEEPING.has(k) && !deepEqual(before[k], after[k]))
  if (!keys.length) return 'same'
  if (keys.some((k) => !deepEqual(now[k], after[k]))) return 'kept'
  const out: Raw = { ...now }
  for (const k of keys) {
    if (k in before) out[k] = before[k]
    else delete out[k]
  }
  return { raw: out }
}
