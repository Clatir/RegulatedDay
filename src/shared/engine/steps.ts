/**
 * The steps of blocks and tasks (SNT5, D440, T786–T792) as edits of the raw files – the same pure functions for the main
 * window, the bar and the tests. Nothing here counts: a step changes no energy, no points, no rule of the day (D440), and
 * a block that ends with steps not ticked asks nothing (D72).
 *
 * - A block of a day: its list in the day's file (a block of the template, of a series or yours written whole, as every
 *   change of a block of the day is – `putBlock`), its ticks in the day's `stepsDone` (a tick never writes the block: a
 *   block of a template or a series stays as its template or series makes it – T786).
 * - A task of „Sprawy”: its list and ticks in its record. Its block (`casePlan` copies the list with the same ids) and the
 *   task go together (T792): a tick or a change of the list in the block lays the same change onto the task while the task
 *   is planned in that very block; one made in the task lays it onto that block while its day is today or later (a day gone
 *   by is never rewritten – T769).
 * - A template's block: its list in the template's version (`templateStepsChanged`); a series: `seriesChange` with
 *   `{ block: { steps } }` (D401, D404 – „Tylko to” is the day's own edit, `blockStepsEdits`).
 */
import { dayRaw, putBlock, setStepDone, stepsDoneIn, type Raw } from '../data/dayEdits'
import { dayFileFrom, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import { requestFrom, type RequestRecord } from '../model/requests'
import { applyStepOp, doneSetFrom, withDone, withStepsJson, type Step, type StepOp } from '../model/steps'

/** Why a tick does nothing: the step is not in the block any more (removed on another computer). */
export const STEP_GONE = 'Tego kroku już nie ma.'

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The block of the day as the file holds it now (a change of it made before), with the day's ticks; else `b` as the window knows it. */
export function dayBlockNow(raw: Raw | null, date: string, b: PlanBlock): PlanBlock {
  const own = raw ? dayFileFrom(raw, date).blocks.find((x) => x.id === b.id) : undefined
  return own ? { ...own, steps: withDone(own.steps, new Set(stepsDoneIn(raw, b.id))) } : b
}

/** The task goes with this block (T792): a task of `block.task`, planned in this very block (`r.block`). */
export function taskOfBlock(block: Pick<PlanBlock, 'id' | 'task'>, r: Pick<RequestRecord, 'id' | 'kind' | 'block'> | null): boolean {
  return !!r && r.kind === 'task' && block.task === r.id && r.block === block.id
}

// ------------------------------------------------------------------ the record of a task

/** A task's step ticked off (`stepsDone.<step>` = true) or not (the field gone). */
export function taskStepDoneRaw(raw: Raw, stepId: string, done: boolean): Raw {
  const m = isPlain(raw.stepsDone) ? { ...raw.stepsDone } : {}
  if (done) m[stepId] = true
  else delete m[stepId]
  return { ...raw, stepsDone: m }
}

/** A task's list after `op` (its ticks stay; a removed step loses its tick); refused – why. */
export function taskStepsRaw(raw: Raw, op: StepOp): { raw: Raw; steps: Step[] } | { error: string } {
  const r = requestFrom(raw)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  const next = applyStepOp(r.steps, op)
  if ('error' in next) return next
  let out = withStepsJson({ ...raw }, next.steps, raw.steps)
  if (op.op === 'remove' && doneSetFrom(raw.stepsDone).has(op.id)) out = taskStepDoneRaw(out, op.id, false)
  return { raw: out, steps: next.steps }
}

// ------------------------------------------------------------------ a block of a day

/** The day's file with a block's list changed by `op` (a removed step loses its tick of the day). */
export function dayStepsRaw(raw: Raw | null, date: string, b: PlanBlock, op: StepOp): { raw: Raw; block: PlanBlock } | { error: string } {
  const base = dayRaw(raw, date)
  const cur = dayBlockNow(base, date, b)
  const next = applyStepOp(cur.steps, op)
  if ('error' in next) return next
  const block = { ...cur, steps: next.steps }
  let out = putBlock(base, block)
  if (op.op === 'remove' && stepsDoneIn(base, b.id).includes(op.id)) out = setStepDone(out, b.id, op.id, false)
  return { raw: out, block }
}

/** What a change of a block's steps writes: the day's file, and the task's record when the task goes with the block. */
export interface BlockStepsEdit {
  day: Raw
  /** The task's record after (null: no task with the block, or it does not go with it now). */
  task: Raw | null
  /** The block as the change leaves it (with the day's ticks). */
  block: PlanBlock
}

/**
 * A tick of a block's step on its day (D440: the panel's box, the bar's ✓): the day's `stepsDone`, and the task's own when
 * it goes with the block (T792). A step the block does not have now – `STEP_GONE`.
 */
export function tickEdits(i: { date: string; day: Raw | null; block: PlanBlock; stepId: string; done: boolean; task: Raw | null }): BlockStepsEdit | { error: string } {
  const base = dayRaw(i.day, i.date)
  const cur = dayBlockNow(base, i.date, i.block)
  if (!cur.steps.some((s) => s.id === i.stepId)) return { error: STEP_GONE }
  const day = setStepDone(base, cur.id, i.stepId, i.done)
  const r = i.task ? requestFrom(i.task) : null
  const task = i.task && taskOfBlock(cur, r) && r!.steps.some((s) => s.id === i.stepId) ? taskStepDoneRaw(i.task, i.stepId, i.done) : null
  return { day, task, block: { ...cur, steps: cur.steps.map((s) => (s.id === i.stepId ? { ...s, done: i.done } : s)) } }
}

/**
 * A change of a block's list on its day (D440: Enter, a title, a removal, a drag): the block in the day's file, and the
 * same op on the task's list when the task goes with the block (T792; the task's list full – the block's change alone).
 */
export function blockStepsEdits(i: { date: string; day: Raw | null; block: PlanBlock; op: StepOp; task: Raw | null }): BlockStepsEdit | { error: string } {
  const d = dayStepsRaw(i.day, i.date, i.block, i.op)
  if ('error' in d) return d
  const r = i.task ? requestFrom(i.task) : null
  const t = i.task && taskOfBlock(d.block, r) ? taskStepsRaw(i.task, i.op) : null
  return { day: d.raw, task: t && 'raw' in t ? t.raw : null, block: d.block }
}

// ------------------------------------------------------------------ a task from „Sprawy”

/** What a change of a task's steps writes: its record, and the day of its block when the block goes with it. */
export interface TaskStepsEdit {
  record: Raw
  /** The day's file after (null: no block to follow – none, another's, a day gone by). */
  day: Raw | null
}

/**
 * The task's block the task's own change follows (T792): the block `r.block` in the file of `date` (the day it stands on
 * now – `scheduledOf` follows a move), a block of this task, on a day today or later. Null – none to follow.
 */
function followedBlock(r: RequestRecord, date: string | null, day: Raw | null, today: string): PlanBlock | null {
  if (!date || !day || !r.block || date < today) return null
  const b = dayFileFrom(day, date).blocks.find((x) => x.id === r.block)
  return b && b.task === r.id ? b : null
}

/** A tick of a task's step (the page „Sprawy”): its record, and its block's day when the block goes with it. */
export function taskTickEdits(i: { record: Raw; stepId: string; done: boolean; date: string | null; day: Raw | null; today: string }): TaskStepsEdit | { error: string } {
  const r = requestFrom(i.record)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  if (!r.steps.some((s) => s.id === i.stepId)) return { error: STEP_GONE }
  const record = taskStepDoneRaw(i.record, i.stepId, i.done)
  const b = followedBlock(r, i.date, i.day, i.today)
  const day = b && b.steps.some((s) => s.id === i.stepId) ? setStepDone(dayRaw(i.day, i.date!), b.id, i.stepId, i.done) : null
  return { record, day }
}

/** A change of a task's list (the page „Sprawy”): its record, and the same op on its block's list when the block goes with it. */
export function taskStepsEdits(i: { record: Raw; op: StepOp; date: string | null; day: Raw | null; today: string }): TaskStepsEdit | { error: string } {
  const r = requestFrom(i.record)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  if (r.kind !== 'task') return { error: 'Kroki ma tylko zadanie.' }
  const t = taskStepsRaw(i.record, i.op)
  if ('error' in t) return t
  const b = followedBlock(r, i.date, i.day, i.today)
  const d = b ? dayStepsRaw(i.day, i.date!, b, i.op) : null
  return { record: t.raw, day: d && 'raw' in d ? d.raw : null }
}

// ------------------------------------------------------------------ a template's block

/**
 * A template with the list of a block of its version from `from` changed by `op` – the version made when it is not there
 * yet (a copy of the one in force then, as every change of the template's page). A block the version does not have –
 * refused.
 */
export function templateStepsChanged(t: Template, from: string, blockId: string, op: StepOp): { template: Template } | { error: string } {
  const inForce = templateVersionOn(t, from)
  const v: TemplateVersion = t.versions.find((x) => x.from === from) ?? (inForce ? { ...inForce, from } : { from, blocks: [], budgetMin: null, maxMin: null })
  const b = v.blocks.find((x) => x.id === blockId)
  if (!b) return { error: 'Tego bloku już nie ma w szablonie.' }
  const next = applyStepOp(b.steps, op)
  if ('error' in next) return next
  const version = { ...v, blocks: v.blocks.map((x) => (x.id === blockId ? { ...x, steps: next.steps } : x)) }
  return { template: { ...t, versions: [...t.versions.filter((x) => x.from !== from), version].sort((a, b2) => (a.from < b2.from ? -1 : 1)) } }
}

/** The patch of `seriesChange` for a list of an occurrence changed by `op` (D401: „To i następne”, „Cała seria”). */
export function seriesStepsPatch(b: PlanBlock, op: StepOp): { block: { steps: Step[] } } | { error: string } {
  const next = applyStepOp(b.steps, op)
  return 'error' in next ? next : { block: { steps: next.steps.map((s) => ({ ...s, done: false })) } }
}
