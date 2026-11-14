/**
 * The ends of a list of steps in the main window (D474, D328, D482, T1104, T1105, T1108, T1109) – the shared sequence of
 * `engine/stepsFlow.ts` with the window's words:
 *
 * - The last step ticked off (the panel „Kroki”, the routine's card, „Sprawy”): the block's routine saved and the block of
 *   today that has begun ended now, done – „Skończono: <nazwa> · Cofnij” („Cofnij” takes the end back: the block runs on, the
 *   step stays ticked, the routine saved); a block not begun only closes its routine – „Zapisano: … · Cofnij” as the card says.
 * - A routine saved from its card („✓ Wszystkie”, „Zapisz zaznaczone”): `routine.done`, the day's ticks of its list, the end.
 *   Its „Cofnij” takes back the end first – refused, nothing more – then the save and the ticks.
 */
import type { TimerIn, TimerResult } from '@shared/api'
import { listWhole, routineSaved, undoAfterSteps, type RoutineSave, type StepsUndoOf } from '@shared/engine/stepsFlow'
import { ROUTINE_VERSION_NAMES, type RoutineVersion } from '@shared/model/routines'
import type { PlanBlock } from '@shared/model/plan'
import { saveRoutineSteps, tickTaskStep, undoSteps } from '../../store/steps'
import { toast, undoToast } from '../../store/ui'

/** A click of the timer whose IPC may throw: its answer, never an unhandled rejection. */
async function timerClick(req: TimerIn): Promise<TimerResult> {
  try {
    return await window.rd.timer(req)
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e), confirm: null }
  }
}

/** The text of the toast after the block ended by its steps. */
export const finishedText = (name: string): string => `Skończono: ${name}`
/** … and after a routine saved without an end of its block (as the card says it, D328). */
export const routineSavedText = (name: string, version: RoutineVersion, done: number, of: number): string => `Zapisano: ${name} (${ROUTINE_VERSION_NAMES[version]}) – ${done} z ${of}`

/** „Cofnij” after steps: what it takes back (the end first – refused, nothing more, D482); why not – said. */
async function undoWith(u: StepsUndoOf): Promise<void> {
  const why = await undoAfterSteps(timerClick, u)
  if (why) toast(`Nie cofnięto: ${why}`, 'info', 6000)
}

/**
 * The last step of `block` (of `date`) was just ticked off: its routine saved with the list's version (`routine` – null: a
 * block without a routine) and the block ended now, done (D474).
 */
export async function finishBySteps(date: string, block: Pick<PlanBlock, 'id' | 'routine'>, name: string, routine: RoutineSave | null): Promise<void> {
  const r = await listWhole(timerClick, date, block.id, routine && block.routine ? routine : null)
  for (const why of r.said) toast(why, 'info')
  if (r.ended) undoToast(finishedText(name), () => void undoWith({ day: date, block: block.id, end: true, routine: false }))
  else if (r.saved && routine) undoToast(routineSavedText(name, routine.version, routine.steps.length, routine.steps.length), () => void undoWith({ day: date, block: block.id, end: false, routine: true }))
}

/**
 * A routine saved from its card (T1108): `done` – the steps of its list it saves ticked off (of `total`), with the version
 * picked; the card's boxes are the day's own, so nothing is taken off (T1112). „N z M” – the list after the save. Nothing saved
 * (saved elsewhere already – quiet, another refusal – said): nothing more is written. The ticks' write failing after the
 * routine was saved: „Cofnij” of the save still comes (T1122).
 */
export async function saveRoutine(date: string, block: PlanBlock, name: string, version: RoutineVersion, done: readonly string[], total: number, seen: Parameters<typeof saveRoutineSteps>[4]): Promise<void> {
  let undo: Awaited<ReturnType<typeof saveRoutineSteps>>['undo'] = []
  let after: { done: number; of: number } = { done: done.length, of: total }
  let routineWritten = false
  let r: Awaited<ReturnType<typeof routineSaved>>
  try {
    r = await routineSaved(
      timerClick,
      date,
      block.id,
      { version, steps: done },
      async () => {
        const ticks = await saveRoutineSteps(date, block, version, done, seen)
        undo = ticks.undo
        if (ticks.steps.length) after = { done: ticks.steps.filter((s) => s.done).length, of: ticks.steps.length }
        return { ok: ticks.saved, finished: ticks.finished }
      },
      () => (routineWritten = true)
    )
  } catch (e) {
    toast(`Nie zapisano odhaczeń: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    if (routineWritten) undoToast(routineSavedText(name, version, done.length, total), () => void undoWith({ day: date, block: block.id, end: false, routine: true }))
    return
  }
  for (const why of r.said) toast(why, 'info')
  if (!r.saved) return
  const ticks = undo
  undoToast(r.ended ? finishedText(name) : routineSavedText(name, version, after.done, after.of), () =>
    void undoWith({ day: date, block: block.id, end: r.ended, routine: true, ticks: ticks.length ? () => undoSteps(ticks).then(() => undefined) : null })
  )
}

/**
 * A step of a task ticked off on the page „Sprawy” (D474, T1113): its record and its block of today or later, as ever (T792);
 * the tick that makes the list of its block of today whole ends the block, as the panel's tick does – named by the task.
 */
export async function tickCaseStep(task: string, stepId: string, done: boolean, name: string, today: string): ReturnType<typeof tickTaskStep> {
  const r = await tickTaskStep(task, stepId, done)
  const w = r.whole
  if (w && w.date === today) await finishBySteps(w.date, { id: w.block, routine: w.routine }, name, w.routine ? { version: 'normal', steps: w.steps.map((s) => s.id) } : null)
  return r
}

/** „Cofnij” of a routine saved (D328): it waits to be ticked off again (its card and line come back); why not – said. */
export async function undoRoutine(block: string, day: string): Promise<void> {
  await undoWith({ day, block, end: false, routine: true })
}
