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
 * - A template's block: its list in the template's version (`templateStepsChanged`); a series: `seriesChange` with the op
 *   itself (`{ stepsOp }`, laid on each version in the write's turn – T790; D401, D404 – „Tylko to” is the day's own edit,
 *   `blockStepsEdits`).
 */
import { dayRaw, isRaw, putBlock, setRoutineSteps, setStepDone, stepsDoneIn, type Raw } from '../data/dayEdits'
import { dayFileFrom, withTemplateVersion, type PlanBlock, type Template } from '../model/plan'
import { requestFrom, type RequestRecord } from '../model/requests'
import { routineList, routineStepsOf, type RoutineSteps } from '../model/routineSteps'
import type { Routine, RoutineVersion } from '../model/routines'
import { applyStepOp, doneSetFrom, refusalFor, withDone, withStepsJson, type Step, type StepOp } from '../model/steps'

/** Why a tick does nothing: the step is not in the block any more (removed on another computer). */
export const STEP_GONE = 'Tego kroku już nie ma.'

/** The block of the day as the file holds it now (a change of it made before), with the day's ticks; else `b` as the window knows it. */
export function dayBlockNow(raw: Raw | null, date: string, b: PlanBlock): PlanBlock {
  const own = raw ? dayFileFrom(raw, date).blocks.find((x) => x.id === b.id) : undefined
  return own ? { ...own, steps: withDone(own.steps, new Set(stepsDoneIn(raw, b.id))) } : b
}

/**
 * The list of the routine of the block `b` (as `dayBlockNow` gives it) on its day as the day's file `raw` holds it now (D473,
 * T1100): null – the block has a list of its own (or none from a routine). The window and the bar give their routines.
 */
export function routineStepsNow(raw: Raw | null, date: string, b: PlanBlock, routines: readonly Routine[] | undefined): RoutineSteps | null {
  if (b.steps.length || !b.routine || !routines) return null
  const file = raw ? dayFileFrom(raw, date) : null
  return routineStepsOf(b, routines, file?.routineSteps, new Set(raw ? stepsDoneIn(raw, b.id) : []))
}

/** The task goes with this block (T792): a task of `block.task`, planned in this very block (`r.block`). */
export function taskOfBlock(block: Pick<PlanBlock, 'id' | 'task'>, r: Pick<RequestRecord, 'id' | 'kind' | 'block'> | null): boolean {
  return !!r && r.kind === 'task' && block.task === r.id && r.block === block.id
}

// ------------------------------------------------------------------ the record of a task

/** A task's step ticked off (`stepsDone.<step>` = true) or not (the field gone). */
export function taskStepDoneRaw(raw: Raw, stepId: string, done: boolean): Raw {
  const m = isRaw(raw.stepsDone) ? { ...raw.stepsDone } : {}
  if (done) m[stepId] = true
  else delete m[stepId]
  return { ...raw, stepsDone: m }
}

/** A task's list after `op` (its ticks stay; a removed step loses its tick); refused – why. */
export function taskStepsRaw(raw: Raw, op: StepOp): { raw: Raw; steps: Step[] } | { error: string } {
  const r = requestFrom(raw)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  const next = applyStepOp(r.steps, op)
  // The task's list full: said as the task's (its own change, or the block's change it refuses – T792).
  if ('error' in next) return { error: refusalFor(next.error, 'task') }
  let out = withStepsJson({ ...raw }, next.steps, raw.steps)
  if (op.op === 'remove' && doneSetFrom(raw.stepsDone).has(op.id)) out = taskStepDoneRaw(out, op.id, false)
  return { raw: out, steps: next.steps }
}

// ------------------------------------------------------------------ a block of a day

/**
 * The day's file with a block's list changed by `op` (a removed step loses its tick of the day). A list of the block's routine
 * (D473, `routines` given) changed becomes the block's own (T1102): the routine's list with the op, the day's entry of it gone.
 */
export function dayStepsRaw(raw: Raw | null, date: string, b: PlanBlock, op: StepOp, routines?: readonly Routine[]): { raw: Raw; block: PlanBlock } | { error: string } {
  const base = dayRaw(raw, date)
  const cur = dayBlockNow(base, date, b)
  const routine = routineStepsNow(base, date, cur, routines)
  const next = applyStepOp(routine ? routine.steps : cur.steps, op)
  if ('error' in next) return next
  const block = { ...cur, steps: next.steps }
  let out = putBlock(base, block)
  if (routine) out = setRoutineSteps(out, b.id, null)
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
  /** The list the block shows after the change (its own, or its routine's – D473), with the day's ticks. */
  steps: Step[]
  /**
   * D474: this tick made the list whole – the step ticked off now was the last one not ticked (the block then ends as done,
   * `stepsFinish`); never for a tick taken back, a step ticked already, a change of the list. A routine saved
   * (`routineSaveEdits`): the list is whole after the save.
   */
  finished?: boolean
}

/**
 * A tick of a block's step on its day (D440: the panel's box, the bar's ✓): the day's `stepsDone`, and the task's own when
 * it goes with the block (T792). A step the block does not have now – `STEP_GONE`. A step of the block's routine (D473,
 * `routines` given): the day keeps the routine's list from this first tick on (`routineSteps`, T1100) – the block is never
 * written. `finished` – the tick made the list whole (D474).
 */
export function tickEdits(i: { date: string; day: Raw | null; block: PlanBlock; stepId: string; done: boolean; task: Raw | null; routines?: readonly Routine[] }): BlockStepsEdit | { error: string } {
  const base = dayRaw(i.day, i.date)
  const cur = dayBlockNow(base, i.date, i.block)
  const routine = routineStepsNow(base, i.date, cur, i.routines)
  const list = routine ? routine.steps : cur.steps
  const was = list.find((s) => s.id === i.stepId)
  if (!was) return { error: STEP_GONE }
  let day = setStepDone(base, cur.id, i.stepId, i.done)
  if (routine && !routine.kept) day = setRoutineSteps(day, cur.id, { routine: routine.routineId, version: routine.version, steps: routine.steps })
  const r = i.task ? requestFrom(i.task) : null
  const task = i.task && taskOfBlock(cur, r) && r!.steps.some((s) => s.id === i.stepId) ? taskStepDoneRaw(i.task, i.stepId, i.done) : null
  const steps = list.map((s) => (s.id === i.stepId ? { ...s, done: i.done } : s))
  const finished = i.done && !was.done && steps.every((s) => s.done)
  return { day, task, block: routine ? cur : { ...cur, steps }, steps, ...(finished ? { finished } : {}) }
}

/**
 * A routine saved with its version and the steps done (T1108 – „✓ Wszystkie”, „gorsze dni” and „Zapisz zaznaczone” of the
 * card in „Dziś” and of the bar, D328): the day's ticks of the block's list become exactly `done` (the steps of the list
 * only; ticks are the day's – `stepsDone`, one state with the panel), after the version picked for the block's routine
 * (`routineVersionEdits`; a list of the block's own has none). The block is never written. `finished` – the list is whole
 * after it (D474: the block then ends).
 */
export function routineSaveEdits(i: { date: string; day: Raw | null; block: PlanBlock; version: RoutineVersion; done: readonly string[]; task: Raw | null; routines: readonly Routine[] }): BlockStepsEdit | { error: string } {
  let day: Raw = dayRaw(i.day, i.date)
  let task = i.task
  const cur = dayBlockNow(day, i.date, i.block)
  const routine = routineStepsNow(day, i.date, cur, i.routines)
  if (routine?.routine && routine.version !== i.version && (i.version === 'normal' || routine.routine.worse.length)) {
    const v = routineVersionEdits({ date: i.date, day, block: cur, version: i.version, routines: i.routines })
    if ('error' in v) return v
    day = v.day
  }
  const want = new Set(i.done)
  const list = routineStepsNow(day, i.date, cur, i.routines)?.steps ?? cur.steps
  let taskTouched = false
  for (const s of list) {
    if (s.done === want.has(s.id)) continue
    const out = tickEdits({ date: i.date, day, block: cur, stepId: s.id, done: want.has(s.id), task, routines: i.routines })
    if ('error' in out) return out
    day = out.day
    if (out.task) {
      task = out.task
      taskTouched = true
    }
  }
  const steps = list.map((s) => (s.done === want.has(s.id) ? s : { ...s, done: want.has(s.id) }))
  const finished = steps.length > 0 && steps.every((s) => s.done)
  return { day, task: taskTouched ? task : null, block: cur, steps, ...(finished ? { finished } : {}) }
}

/** Why the version of a block's routine cannot be picked (D473): its list is not the routine's, or the routine has no such version. */
export const ROUTINE_VERSION_NONE = 'Ten blok nie ma kroków rutyny do wyboru wersji.'

/**
 * The version of the block's routine picked on its day (D473 „w gorszy dzień wersja na gorsze dni”, T1101 – one click, as the
 * card's): the day keeps that version's list of the routine as it is now (`routineSteps`); the day's ticks stay as they are
 * (a step of the other version keeps its tick – picked back, it shows again). The block is never written. Refused – why.
 */
export function routineVersionEdits(i: { date: string; day: Raw | null; block: PlanBlock; version: RoutineVersion; routines: readonly Routine[] }): BlockStepsEdit | { error: string } {
  const base = dayRaw(i.day, i.date)
  const cur = dayBlockNow(base, i.date, i.block)
  const routine = routineStepsNow(base, i.date, cur, i.routines)
  if (!routine?.routine || (i.version === 'worse' && !routine.routine.worse.length)) return { error: ROUTINE_VERSION_NONE }
  // The version the day keeps already: nothing to write.
  if (routine.kept && routine.version === i.version) return { day: base, task: null, block: cur, steps: routine.steps }
  const list = routineList(routine.routine, i.version)
  return { day: setRoutineSteps(base, cur.id, { routine: routine.routineId, version: i.version, steps: list }), task: null, block: cur, steps: withDone(list, new Set(stepsDoneIn(base, cur.id))) }
}

/**
 * A change of a block's list on its day (D440: Enter, a title, a removal, a drag): the block in the day's file, and the
 * same op on the task's list when the task goes with the block (T792) – refused there (its list full), nothing changes:
 * the two lists never part in silence.
 */
export function blockStepsEdits(i: { date: string; day: Raw | null; block: PlanBlock; op: StepOp; task: Raw | null; routines?: readonly Routine[] }): BlockStepsEdit | { error: string } {
  const d = dayStepsRaw(i.day, i.date, i.block, i.op, i.routines)
  if ('error' in d) return d
  const r = i.task ? requestFrom(i.task) : null
  const t = i.task && taskOfBlock(d.block, r) ? taskStepsRaw(i.task, i.op) : null
  if (t && 'error' in t) return t
  return { day: d.raw, task: t ? t.raw : null, block: d.block, steps: d.block.steps }
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

/**
 * A change of a task's list (the page „Sprawy”): its record, and the same op on its block's list when the block goes with
 * it – refused there (the block's list full), nothing changes (T792).
 */
export function taskStepsEdits(i: { record: Raw; op: StepOp; date: string | null; day: Raw | null; today: string }): TaskStepsEdit | { error: string } {
  const r = requestFrom(i.record)
  if (!r) return { error: 'Tej sprawy już nie ma.' }
  if (r.kind !== 'task') return { error: 'Kroki ma tylko zadanie.' }
  const t = taskStepsRaw(i.record, i.op)
  if ('error' in t) return t
  const b = followedBlock(r, i.date, i.day, i.today)
  const d = b ? dayStepsRaw(i.day, i.date!, b, i.op) : null
  if (d && 'error' in d) return d
  return { record: t.raw, day: d ? d.raw : null }
}

// ------------------------------------------------------------------ a template's block

/**
 * A template with the list of a block of its version from `from` changed by `op` – the version made when it is not there
 * yet (a copy of the one in force then, as every change of the template's page). A block the version does not have –
 * refused.
 */
export function templateStepsChanged(t: Template, from: string, blockId: string, op: StepOp): { template: Template } | { error: string } {
  let error: string | null = null
  const template = withTemplateVersion(t, from, (v) => {
    const b = v.blocks.find((x) => x.id === blockId)
    const next = b ? applyStepOp(b.steps, op) : { error: 'Tego bloku już nie ma w szablonie.' }
    if ('error' in next) {
      error = next.error
      return {}
    }
    return { blocks: v.blocks.map((x) => (x.id === blockId ? { ...x, steps: next.steps } : x)) }
  })
  return error != null ? { error } : { template }
}
