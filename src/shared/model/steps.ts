/**
 * Steps of a block (SNT5, D440, T786–T790): a list „Kroki” of a block of a day, of a template's block, of a series'
 * version and of a task of „Sprawy” – each step a title of one line in an order of its own. Steps count nothing (energy,
 * points): the only number is the counter „✓ 3/4” on the tile of the axis and in the panel (`stepsCounter`).
 *
 * As written (T786): a list of `{ id, title, order }` – never `done`. A step is ticked off for a day, not for good: the
 * ticks of a day's blocks live in the day's file (`stepsDone`: block id → step id → true, `dayEdits.ts`), those of a task in
 * its record (`stepsDone`: step id → true) – a block of a template or a series starts every day with nothing ticked, and a
 * tick is a field of its own that two computers merge without a question (a tick on either one stays – T788). In memory a
 * step has `done` as its day (or its task) has it (`dayPlan`, `requestFrom`).
 *
 * The file keeps its order of the list (T787): a change of the order changes the steps' `order` and nothing else, a new step
 * goes at the end of the list in the file – every change is a field of one step, merged with another computer's change of
 * another step. Read tolerantly: a step without an id or a title is left out of the list shown, yet stays in the file – as
 * every item a write does not change, with the fields this version does not know.
 *
 * A step's time (D460): `min` of its item, 1–240 min, optional – a step of a routine copied into a block brings its own. The
 * sum of the times never changes the block's length: the panel says „kroki: X min z Y” and warns when it is over (D72). A
 * version before it keeps the field in every item it writes (an item changed – its other fields stay; a step it adds has none).
 */
import { newId } from './ids'
import { STEP_RANGE, type Routine } from './routines'

export interface Step {
  id: string
  title: string
  /** Its place in the list (the list shown goes by it, ties in the file's order). */
  order: number
  /** Ticked off – on its day (a block) or in its task; never written into the list. */
  done: boolean
  /** Its time (D460), whole minutes within `STEP_MIN_RANGE`; absent – none (a step need not have one). */
  min?: number
}

/**
 * At most this many steps in one list – counted only when adding (T789: a list may hold more after two computers added) – and
 * each title at most this long. 40 – as many as a routine may have (D460: its steps are copied into a block whole).
 */
export const STEPS_MAX = 40
export const STEP_TITLE_MAX = 200
/** A step's time: the range of a routine's step (D460). */
export const STEP_MIN_RANGE = STEP_RANGE

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A title as stored: one line, trimmed, at most `STEP_TITLE_MAX`. */
export const stepTitleOf = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, STEP_TITLE_MAX) : '')

/** A step's time as read (a file, an op): whole minutes within `STEP_MIN_RANGE`; anything else – none. */
export const stepMinOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= STEP_MIN_RANGE[0] && v <= STEP_MIN_RANGE[1] ? v : undefined)

/** `s` with its time `min` (none – the field left out, never `min: undefined`). */
function withMin<T extends { min?: number }>(s: T, min: number | undefined): T {
  if (min === undefined) {
    if (!('min' in s)) return s
    const { min: _m, ...rest } = s
    return rest as T
  }
  return s.min === min ? s : { ...s, min }
}

/** The items of a file's list this version reads: for each id the first item with a title, with its place in the file. */
function readItems(v: readonly unknown[]): Array<{ at: number; step: Omit<Step, 'done'> }> {
  const seen = new Set<string>()
  const out: Array<{ at: number; step: Omit<Step, 'done'> }> = []
  v.forEach((x, at) => {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id)) return
    const title = stepTitleOf(x.title)
    if (!title) return
    seen.add(x.id)
    out.push({ at, step: withMin<Omit<Step, 'done'>>({ id: x.id, title, order: typeof x.order === 'number' && Number.isFinite(x.order) ? x.order : at }, stepMinOf(x.min)) })
  })
  return out
}

/**
 * The steps of a list as written (any version, also a snapshot of the log): in their order (`order`, ties – the file's;
 * an item without a number – its place in the file), each id once, every one read – the limit counts only when adding
 * (T789: two computers adding at once may leave more); `done` from `done` (the ticks of its day or task), never from the
 * file's item.
 */
export function stepsFrom(v: unknown, done?: ReadonlySet<string>): Step[] {
  if (!Array.isArray(v) || v.length === 0) return []
  return readItems(v)
    .sort((a, b) => a.step.order - b.step.order || a.at - b.at)
    .map(({ step }) => ({ ...step, done: done?.has(step.id) === true }))
}

/** The same list to show (ids, titles and times in the same order) – ticks and the numbers of `order` aside. */
export function sameStepList(a: readonly Pick<Step, 'id' | 'title' | 'min'>[], b: readonly Pick<Step, 'id' | 'title' | 'min'>[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i]!.id && x.title === b[i]!.title && sameMin(x.min, b[i]!.min))
}

/** The same time (none equal to none). */
const sameMin = (a: number | undefined, b: number | undefined): boolean => (a ?? null) === (b ?? null)
/** A step as the file's list holds it: its id, title, order and – when it has one – its time. */
const itemOf = (s: Step): Record<string, unknown> => (s.min !== undefined ? { id: s.id, title: s.title, order: s.order, min: s.min } : { id: s.id, title: s.title, order: s.order })

/** An item a version reads as a step where it is the first of its id: an object with an id and a title. */
const readable = (x: unknown): x is Record<string, unknown> & { id: string } => isPlain(x) && typeof x.id === 'string' && !!x.id && !!stepTitleOf(x.title)

/**
 * The list as written over the file's list `before` (T787):
 * - the list read is the list given (ids, titles, order) – the file's list as it is, every item untouched (items without a
 *   number `order` too);
 * - else, in the file's order: the item read for a step kept unchanged – the file's own, its other items too; for a step
 *   changed – its title and order set (its other fields kept), the other items of its id this version reads (a duplicate
 *   with a title) out; for a step removed – every item of its id this version reads out (a duplicate never comes back as
 *   the step); an item of an id without a title or not read at all (not an object, no id) – the file's own; an item read
 *   without a number `order` gets the place it is read at (its order no longer moves when items before it go);
 * - a step new to the file at the end;
 * - a step's time (D460) as `min` of its item: a time changed or cleared is a change of the step (its other fields kept).
 * No `done` is ever written – a tick is the day's (or the task's). Undefined: no steps and no list in the file.
 */
export function stepsJson(steps: readonly Step[], before?: unknown): unknown[] | undefined {
  if (!Array.isArray(before)) return steps.length ? steps.map(itemOf) : undefined
  const items = readItems(before)
  const now = [...items].sort((a, b) => a.step.order - b.step.order || a.at - b.at).map((r) => r.step)
  if (now.length === steps.length && now.every((x, i) => x.id === steps[i]!.id && x.title === steps[i]!.title && x.order === steps[i]!.order && sameMin(x.min, steps[i]!.min))) return [...before]
  const read = new Map(items.map((r) => [r.step.id, r]))
  const byId = new Map(steps.map((s) => [s.id, s]))
  /** Whether the step of `id` (read) stays exactly as the file has it – its own item and every other of its id stay. */
  const untouched = (id: string): boolean => {
    const r = read.get(id)!
    const s = byId.get(id)
    const x = before[r.at] as Record<string, unknown>
    return !!s && s.title === r.step.title && s.order === r.step.order && sameMin(s.min, r.step.min) && typeof x.order === 'number' && Number.isFinite(x.order)
  }
  const out: unknown[] = []
  before.forEach((x, at) => {
    const r = readable(x) ? read.get(x.id) : undefined
    // Not read by this version (no title, not an object, no id): the file's own, as it is.
    if (!r || untouched(r.step.id)) {
      out.push(x)
      return
    }
    // Changed or removed: only the read item of its id, with the change (removed – none); its other readable items out.
    const s = byId.get(r.step.id)
    if (!s || r.at !== at) return
    const item: Record<string, unknown> = { ...x, title: s.title, order: s.order }
    // Its time only when this version changed it: a value it cannot read stays as the file has it.
    if (!sameMin(s.min, r.step.min)) {
      if (s.min !== undefined) item.min = s.min
      else delete item.min
    }
    out.push(item)
  })
  for (const s of steps) if (!read.has(s.id)) out.push(itemOf(s))
  return out
}

/** `obj` with its field `steps` written as `stepsJson` makes it (removed when there are none and the file had none). */
export function withStepsJson<T extends Record<string, unknown>>(obj: T, steps: readonly Step[] | undefined, before?: unknown): T {
  const { steps: _s, ...rest } = obj
  const json = stepsJson(steps ?? [], before)
  return (json === undefined ? rest : { ...rest, steps: json }) as T
}

/** The steps with nothing ticked off (a template's, a series', a copy of a day – D404: the copy starts again). */
export const freshSteps = (steps: readonly Step[] | undefined): Step[] => (steps ?? []).map((s) => (s.done ? { ...s, done: false } : s))

/** The steps with the ticks of `done` (by id). */
export const withDone = (steps: readonly Step[] | undefined, done: ReadonlySet<string>): Step[] => (steps ?? []).map((s) => (s.done === done.has(s.id) ? s : { ...s, done: done.has(s.id) }))

/** The counter on the tile of the axis and in the panel (D440): „✓ 3/4”; null – no steps. */
export function stepsCounter(steps: readonly Pick<Step, 'done'>[] | undefined): string | null {
  if (!steps?.length) return null
  return `✓ ${steps.filter((s) => s.done).length}/${steps.length}`
}

/** The step the bar shows (D440): the first not ticked off in the list's order with its place (1 = the first); null – all ticked or none. */
export function firstOpen(steps: readonly Step[] | undefined): { step: Step; n: number; total: number } | null {
  const list = steps ?? []
  const i = list.findIndex((s) => !s.done)
  return i < 0 ? null : { step: list[i]!, n: i + 1, total: list.length }
}

/**
 * A change of a list (T790) – the panel's „Enter” (a new step after one, or at the end), a title changed, a step removed,
 * one dragged to a new place (`before`: the step it now stands before, null – the end). Every op names its steps by id, so
 * the same op lays onto the copy of a task's list in its block (and back) even when the two lists differ.
 */
export type StepOp =
  | { op: 'add'; id: string; title: string; after?: string | null }
  | { op: 'rename'; id: string; title: string }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; before: string | null }
  /** Its time set (D460) – null: cleared. */
  | { op: 'min'; id: string; min: number | null }

/** An op from the window (untrusted – the series API): its shape checked; null – not one. */
export function stepOpFrom(v: unknown): StepOp | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id) return null
  const idOrNull = (x: unknown) => x === null || x === undefined || (typeof x === 'string' && !!x)
  switch (v.op) {
    case 'add':
      return typeof v.title === 'string' && idOrNull(v.after) ? { op: 'add', id: v.id, title: v.title, after: (v.after as string | null | undefined) ?? null } : null
    case 'rename':
      return typeof v.title === 'string' ? { op: 'rename', id: v.id, title: v.title } : null
    case 'remove':
      return { op: 'remove', id: v.id }
    case 'move':
      return idOrNull(v.before) ? { op: 'move', id: v.id, before: (v.before as string | null | undefined) ?? null } : null
    case 'min':
      // A time out of its range is still an op (`applyStepOp` refuses it with its message); here only its shape.
      return v.min === null || (typeof v.min === 'number' && Number.isFinite(v.min)) ? { op: 'min', id: v.id, min: v.min as number | null } : null
    default:
      return null
  }
}

/** A new step's op (its id made here): after `after` (null / undefined – at the end). */
export const addStepOp = (title: string, after?: string | null): StepOp => ({ op: 'add', id: newId(8), title, after: after ?? null })

/** A drag to the place `to` of the list shown (0 = first) as an op that names the step it now stands before. */
export function moveStepOp(steps: readonly Pick<Step, 'id'>[], id: string, to: number): StepOp {
  const rest = steps.filter((s) => s.id !== id)
  const at = Math.max(0, Math.min(rest.length, Math.round(to)))
  return { op: 'move', id, before: rest[at]?.id ?? null }
}

/** Why a change of a list is refused (the panel says it under the field). */
export const STEP_NO_TITLE = 'Krok potrzebuje treści.'
export const STEPS_FULL = `Najwyżej ${STEPS_MAX} kroków w bloku.`
/** A time out of its range (D460). */
export const STEP_MIN_BAD = `Czas kroku: od ${STEP_MIN_RANGE[0]} min do ${STEP_MIN_RANGE[1] / 60} h, w pełnych minutach.`
/** The same of a task's list (its own, or the task of a block refusing the block's change – T792). */
export const STEPS_FULL_TASK = `Najwyżej ${STEPS_MAX} kroków w zadaniu.`
/** Whose list a refusal is about: a block's (a day, a template, a series) or a task's. */
export type StepsKind = 'block' | 'task'
/** A refusal of the model said for the list it is about (the full list of a task – „w zadaniu”). */
export const refusalFor = (error: string, kind: StepsKind): string => (kind === 'task' && error === STEPS_FULL ? STEPS_FULL_TASK : error)

/** The list numbered again 0, 1, 2 … in the order given (only the steps whose place changed get a new `order`). */
function renumbered(list: readonly Step[]): Step[] {
  return list.map((s, i) => (s.order === i ? s : { ...s, order: i }))
}

/**
 * The list after `op` (T790): a new step not ticked off; a title cut to one line (empty – refused); a step the list does
 * not have – the list as it is (a change of another computer took it away). Refused – the reason.
 */
export function applyStepOp(steps: readonly Step[], op: StepOp): { steps: Step[] } | { error: string } {
  const list = [...steps]
  const i = list.findIndex((s) => s.id === op.id)
  switch (op.op) {
    case 'add': {
      const title = stepTitleOf(op.title)
      if (!title) return { error: STEP_NO_TITLE }
      if (i >= 0) return { steps: list }
      if (list.length >= STEPS_MAX) return { error: STEPS_FULL }
      const after = op.after != null ? list.findIndex((s) => s.id === op.after) : -1
      const step: Step = { id: op.id, title, order: (list.at(-1)?.order ?? -1) + 1, done: false }
      // At the end: a number after the last – the others keep theirs; after a step: the list numbered again.
      if (after < 0 || after === list.length - 1) return { steps: [...list, step] }
      list.splice(after + 1, 0, step)
      return { steps: renumbered(list) }
    }
    case 'rename': {
      const title = stepTitleOf(op.title)
      if (!title) return { error: STEP_NO_TITLE }
      if (i < 0 || list[i]!.title === title) return { steps: list }
      list[i] = { ...list[i]!, title }
      return { steps: list }
    }
    case 'remove':
      return { steps: i < 0 ? list : list.filter((s) => s.id !== op.id) }
    case 'move': {
      // Before a step this list does not have (removed elsewhere, only on the other side of a task and its block): it stays.
      if (i < 0 || op.before === op.id || (op.before != null && !list.some((x) => x.id === op.before))) return { steps: list }
      const [s] = list.splice(i, 1)
      const at = op.before != null ? list.findIndex((x) => x.id === op.before) : list.length
      list.splice(at, 0, s!)
      return { steps: renumbered(list) }
    }
    case 'min': {
      const min = op.min === null ? undefined : stepMinOf(op.min)
      if (op.min !== null && min === undefined) return { error: STEP_MIN_BAD }
      if (i < 0) return { steps: list }
      list[i] = withMin(list[i]!, min)
      return { steps: list }
    }
  }
}

/**
 * The time of a list (D460): the sum of its steps' times, null – no step has one. With the block's length (`lengthMin`) the
 * panel says „kroki: 45 min z 1 h” and warns when the sum is over it (`over` – never a block, D72); a task's list has no
 * length – „kroki: 45 min”.
 */
export function stepsTime(steps: readonly Pick<Step, 'min'>[] | undefined, lengthMin?: number | null): { minutes: number; over: number } | null {
  const timed = (steps ?? []).filter((s) => s.min !== undefined)
  if (!timed.length) return null
  const minutes = timed.reduce((sum, s) => sum + s.min!, 0)
  return { minutes, over: lengthMin != null && minutes > lengthMin ? minutes - lengthMin : 0 }
}

/**
 * The steps of a routine copied into a block (D460, T1030): its usual version 1:1 – a name as the title (none – „krok N”, as
 * the routine's card names it), its time – with new ids, after the list as it is. The block's list empty, or exactly the
 * copy of the routine chosen before (`was`: the same titles and times in the same order, nothing ticked) – it is replaced;
 * any other list keeps its steps and gets the routine's at its end. At most `STEPS_MAX`: the steps that do not fit are left
 * out (`cut` – how many; the panel says so). The ticks of the steps kept stay as they are.
 */
export function routineStepsCopy(steps: readonly Step[], was: Pick<Routine, 'normal'> | null | undefined, next: Pick<Routine, 'normal'>): { steps: Step[]; cut: number } {
  const copyOf = (r: Pick<Routine, 'normal'>) => r.normal.map((x, k) => ({ title: stepTitleOf(x.name) || `krok ${k + 1}`, min: stepMinOf(x.min) }))
  const prior = was ? copyOf(was) : null
  const replace = steps.length === 0 || (prior != null && prior.length === steps.length && prior.every((p, k) => p.title === steps[k]!.title && sameMin(p.min, steps[k]!.min) && !steps[k]!.done))
  const kept = replace ? [] : [...steps]
  const room = Math.max(0, STEPS_MAX - kept.length)
  const add = copyOf(next)
  const first = (kept.at(-1)?.order ?? -1) + 1
  const made: Step[] = add.slice(0, room).map((x, k) => withMin<Step>({ id: newId(8), title: x.title, order: first + k, done: false }, x.min))
  return { steps: [...kept, ...made], cut: add.length - made.length }
}

/** A text with the titles of its steps after it (the search, Ctrl K – D387: the steps are found as the text of their block or task). */
export function textWithSteps(text: string | undefined, steps: readonly Pick<Step, 'title'>[] | undefined): string {
  const titles = (steps ?? []).map((s) => s.title).join(' · ')
  return [text ?? '', titles].filter(Boolean).join('\n')
}

/** The ticks of a day's block in its file (`stepsDone`), read tolerantly: the ids set to true. */
export function doneSetFrom(v: unknown): Set<string> {
  const out = new Set<string>()
  if (isPlain(v)) for (const [k, x] of Object.entries(v)) if (x === true) out.add(k)
  return out
}
