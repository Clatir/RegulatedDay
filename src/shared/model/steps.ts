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
 * another step. Read tolerantly: a step without an id or a title is left out, fields this version does not know stay.
 */
import { newId } from './ids'

export interface Step {
  id: string
  title: string
  /** Its place in the list (the list shown goes by it, ties in the file's order). */
  order: number
  /** Ticked off – on its day (a block) or in its task; never written into the list. */
  done: boolean
}

/** At most this many steps in one list, each title at most this long (T789). */
export const STEPS_MAX = 30
export const STEP_TITLE_MAX = 200

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A title as stored: one line, trimmed, at most `STEP_TITLE_MAX`. */
export const stepTitleOf = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, STEP_TITLE_MAX) : '')

/**
 * The steps of a list as written (any version, also a snapshot of the log): in their order (`order`, ties – the file's),
 * at most `STEPS_MAX`, each id once; `done` from `done` (the ticks of its day or task), never from the file's item.
 */
export function stepsFrom(v: unknown, done?: ReadonlySet<string>): Step[] {
  if (!Array.isArray(v) || v.length === 0) return []
  const seen = new Set<string>()
  const out: Array<Step & { at: number }> = []
  v.forEach((x, at) => {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id)) return
    const title = stepTitleOf(x.title)
    if (!title) return
    seen.add(x.id)
    out.push({ id: x.id, title, order: typeof x.order === 'number' && Number.isFinite(x.order) ? x.order : at, done: done?.has(x.id) === true, at })
  })
  out.sort((a, b) => a.order - b.order || a.at - b.at)
  return out.slice(0, STEPS_MAX).map(({ at: _at, ...s }) => s)
}

/** The same list to show (ids and titles in the same order) – ticks and the numbers of `order` aside. */
export function sameStepList(a: readonly Pick<Step, 'id' | 'title'>[], b: readonly Pick<Step, 'id' | 'title'>[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i]!.id && x.title === b[i]!.title)
}

/**
 * The list as written over the file's list `before` (T787): the file's items in the file's order, each with its fields
 * this version does not know, its title and order set; a step new to the file at the end; one not in `steps` out. No
 * `done` – a tick is the day's (or the task's). Undefined: no steps and none in the file (the field is not written).
 */
export function stepsJson(steps: readonly Step[], before?: unknown): Array<Record<string, unknown>> | undefined {
  const raw = Array.isArray(before) ? before.filter(isPlain) : []
  if (!steps.length && !Array.isArray(before)) return undefined
  const byId = new Map(steps.map((s) => [s.id, s]))
  const out: Array<Record<string, unknown>> = []
  const written = new Set<string>()
  for (const x of raw) {
    const s = typeof x.id === 'string' ? byId.get(x.id) : undefined
    if (!s || written.has(s.id)) continue
    written.add(s.id)
    const { done: _done, ...rest } = x
    out.push({ ...rest, id: s.id, title: s.title, order: s.order })
  }
  for (const s of steps) if (!written.has(s.id)) out.push({ id: s.id, title: s.title, order: s.order })
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

/** The ids of the ticked steps. */
export const doneIds = (steps: readonly Step[] | undefined): string[] => (steps ?? []).filter((s) => s.done).map((s) => s.id)

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
      if (i < 0 || op.before === op.id) return { steps: list }
      const [s] = list.splice(i, 1)
      const at = op.before != null ? list.findIndex((x) => x.id === op.before) : -1
      list.splice(at < 0 ? list.length : at, 0, s!)
      return { steps: renumbered(list) }
    }
  }
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
