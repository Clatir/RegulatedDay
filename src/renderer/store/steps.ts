/**
 * Steps of blocks and tasks in the main window (SNT5, D440, T786–T792) – what the panel of a block, the page of templates,
 * the panel of a series and the page „Sprawy” call. Each change is one edit of the queue made in its turn from the files as
 * they are then (T517) by the pure functions of `engine/steps.ts`: a block's list in its day's file, a tick in the day's
 * `stepsDone`, a task's list and ticks in its record – a block of a task and the task together (T792). Every answer has
 * its „Cofnij” (`undoSteps`), the screens decide where they show it. A refusal is said by a toast and in `error`.
 *
 * A series' occurrence: „Tylko to” and a tick are the day's own edits (`changeBlockSteps`, `tickBlockStep`); „To i
 * następne” / „Cała seria” go through `changeSeriesSteps` (the series API, D401, D404 – its own „Cofnij” toast).
 */
import type { RawRecord, SeriesScope } from '@shared/api'
import { paths } from '@shared/data/paths'
import { caseDayToRead, scheduledOf } from '@shared/engine/cases'
import { blockStepsEdits, taskStepsEdits, taskTickEdits, templateStepsChanged, tickEdits } from '@shared/engine/steps'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom, templateFrom, type PlanBlock } from '@shared/model/plan'
import { requestFrom } from '@shared/model/requests'
import type { StepOp } from '@shared/model/steps'
import { logicalDayOf } from '@shared/time/day'
import { changeSeries } from '../features/series/seriesActions'
import { change, DAY_UNREADABLE, undoFiles, type CaseResult, type CaseUndoFile } from './cases'
import { rawRecord, saveAnswer, type SaveAnswer } from './data'

/** What a change of steps did: saved (written or waiting for the folder), its outcomes, its „Cofnij” (`undoSteps`). */
export type StepsResult = Omit<CaseResult, 'id'>

const taskRel = (id: string): string => paths.record('request', id)

const result = ({ id: _id, ...r }: CaseResult): StepsResult => r

/** The day's file as this computer sees it now, else the one the window saw; neither – undefined (not readable now). */
async function dayNow(date: string, seen: RawRecord | null | undefined): Promise<RawRecord | null | undefined> {
  const files = await window.rd.dayFiles([date])
  return date in files ? (files[date] ?? null) : seen
}

/** A block's change of steps on its day: the day's file, and the task's record when the task goes with the block. */
function blockChange(date: string, block: PlanBlock, seen: RawRecord | null | undefined, make: (day: RawRecord | null, task: RawRecord | null) => ReturnType<typeof tickEdits>): Promise<StepsResult> {
  return change(async (put) => {
    const day = await dayNow(date, seen)
    if (day === undefined) return DAY_UNREADABLE
    const rel = block.task ? taskRel(block.task) : null
    const task = rel ? rawRecord(rel) : null
    const out = make(day, task)
    if ('error' in out) return out.error
    put(paths.day(date), day, out.day)
    if (rel && out.task) put(rel, task, out.task)
    return null
  }).then(result)
}

/**
 * A step of a block ticked off (`done`) or not on its day (the panel's box – D440): never a change of the block itself (a
 * block of the template or the series stays theirs, T786); a block of a task – the task's tick too (T792). `seen` – the
 * day's file as the window knows it, for one not readable now.
 */
export function tickBlockStep(date: string, block: PlanBlock, stepId: string, done: boolean, seen?: RawRecord | null): Promise<StepsResult> {
  return blockChange(date, block, seen, (day, task) => tickEdits({ date, day, block, stepId, done, task }))
}

/**
 * A block's list changed on its day (D440: Enter – `addStepOp(title, after)`, a title – `rename`, a removal, a drag –
 * `moveStepOp(steps, id, to)`): the block written into the day's file as every change of a block of the day is (a block of
 * the template or of a series – for this day only, „Tylko to”); a block of a task – the same op on the task's list (T792).
 */
export function changeBlockSteps(date: string, block: PlanBlock, op: StepOp, seen?: RawRecord | null): Promise<StepsResult> {
  return blockChange(date, block, seen, (day, task) => blockStepsEdits({ date, day, block, op, task }))
}

/**
 * The day and the file of the block a task is planned in now (`scheduledOf`, a move followed), read in this turn; null –
 * not planned (the block gone); `unreadable` – a day on the way cannot be read now: the task's change would part it from
 * its block in silence, so nothing is written (T792, as T769).
 */
async function taskDay(id: string): Promise<{ date: string; raw: RawRecord | null } | null | 'unreadable'> {
  const r = requestFrom(rawRecord(taskRel(id)))
  if (!r?.day || !r.block) return null
  const files: Record<string, RawRecord | null> = {}
  for (let more: string | null = r.day; more && !(more in files); more = caseDayToRead(r, files)) {
    const read = await window.rd.dayFiles([more])
    if (!(more in read)) return 'unreadable'
    files[more] = read[more] ?? null
  }
  const s = scheduledOf(r, (d) => (d in files ? (files[d] ? dayFileFrom(files[d], d) : null) : undefined))
  if (!s) return null
  return s.known ? { date: s.day, raw: files[s.day] ?? null } : 'unreadable'
}

/** A task's change of steps: its record, and its block's day when the block goes with it (today or later – T769). */
function taskChange(id: string, make: (record: RawRecord, date: string | null, day: RawRecord | null, today: string) => ReturnType<typeof taskStepsEdits>): Promise<StepsResult> {
  return change(async (put) => {
    const rel = taskRel(id)
    const record = rawRecord(rel)
    if (!record) return 'Tej sprawy już nie ma.'
    const where = await taskDay(id)
    if (where === 'unreadable') return DAY_UNREADABLE
    const out = make(record, where?.date ?? null, where?.raw ?? null, logicalDayOf(Date.now()))
    if ('error' in out) return out.error
    put(rel, record, out.record)
    if (where && out.day) put(paths.day(where.date), where.raw, out.day)
    return null
  }).then(result)
}

/** A task's list changed (the page „Sprawy”, D440): its block planned today or later gets the same change (T792). */
export function changeTaskSteps(id: string, op: StepOp): Promise<StepsResult> {
  return taskChange(id, (record, date, day, today) => taskStepsEdits({ record, op, date, day, today }))
}

/** A task's step ticked off or not (the page „Sprawy”): its block planned today or later too (T792). */
export function tickTaskStep(id: string, stepId: string, done: boolean): Promise<StepsResult> {
  return taskChange(id, (record, date, day, today) => taskTickEdits({ record, stepId, done, date, day, today }))
}

/**
 * A template block's list changed (the page „Szablony”, D440): in the template's version from `from` (made when it is not
 * there yet, as every change of the page). The days made from it start with none ticked.
 */
export function changeTemplateSteps(templateId: string, from: string, blockId: string, op: StepOp): Promise<StepsResult> {
  return change((put) => {
    const rel = paths.record('template', templateId)
    const raw = rawRecord(rel)
    const t = raw ? templateFrom(raw) : null
    if (!raw || !t) return 'Tego szablonu już nie ma.'
    const out = templateStepsChanged(t, from, blockId, op)
    if ('error' in out) return out.error
    put(rel, raw, templateJson(out.template, raw))
    return null
  }).then(result)
}

/**
 * A series' list changed from an occurrence by its scope (D401, D404 – the panel asks „Tylko to · To i następne · Cała
 * seria”): „Tylko to” – the day's own edit (`changeBlockSteps`); the others – the series API with the op itself
 * (`stepsOp`), laid on each version's own list in the write's turn (T790, T517) – never a list copied from `block` (an
 * occurrence begun today does not follow the series, its list may be old); its „Cofnij” toast says `text` (empty – none).
 * The ticks stay the day's (T786). Not saved: a refusal, a broken file or a failed send – `false`; a question – `'asked'`.
 */
export async function changeSeriesSteps(target: { date: string; blockId: string }, block: PlanBlock, scope: SeriesScope, op: StepOp, text: string, seen?: RawRecord | null): Promise<SaveAnswer> {
  if (scope === 'only') {
    const r = await changeBlockSteps(target.date, block, op, seen)
    return r.saved ? true : r.error ? false : saveAnswer(r.outcomes)
  }
  return changeSeries(target, scope, { stepsOp: op }, text)
}

/**
 * A series' list changed from its list in „Szablony” (D443: the whole series from today, no boxes): the op on each
 * version's own list in the write's turn (T790); its „Cofnij” toast says `text` (empty – none).
 */
export function changeSeriesListSteps(seriesId: string, op: StepOp, text: string): Promise<SaveAnswer> {
  return changeSeries({ seriesId }, 'all', { stepsOp: op }, text)
}

/** „Cofnij” of one change of steps: each file back as it was before it – only while it stands as the change left it. */
export function undoSteps(undo: readonly CaseUndoFile[]): Promise<StepsResult> {
  return undoFiles(undo, ['day', 'request', 'template']).then(result)
}
