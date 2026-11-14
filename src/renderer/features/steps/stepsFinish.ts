/**
 * The ends of a list of steps in the main window (D474, D328, T1104, T1105, T1108).
 *
 * - The last step ticked off (the panel „Kroki”, the routine's card): a block of a routine is saved as ticked off
 *   (`routine.done` – its card and the bar's line close) and a block of today that has begun and not ended ends now, done –
 *   „Skończono: <nazwa> · Cofnij” („Cofnij” takes the end back: the block runs on, the step stays ticked, the routine saved);
 *   a block not begun only closes its routine – „Zapisano: … · Cofnij” as the card says. The timer refuses anything else
 *   quietly: the app never guesses when a block ran, and it never blocks anything (D72).
 * - A routine saved from its card („✓ Wszystkie”, „Zapisz zaznaczone”): first `routine.done` (a card saved elsewhere already –
 *   refused, nothing written), then the day's ticks of its list become the ones saved (`saveRoutineSteps` – one state with the
 *   panel), then – the list whole – the end of the block. Its „Cofnij” takes back all three.
 */
import type { TimerIn, TimerResult } from '@shared/api'
import { STEPS_QUIET } from '@shared/model/routineSteps'
import type { PlanBlock } from '@shared/model/plan'
import { ROUTINE_VERSION_NAMES, type RoutineVersion } from '@shared/model/routines'
import { saveRoutineSteps, undoSteps } from '../../store/steps'
import { toast, undoToast } from '../../store/ui'

/** A click of the timer whose IPC may throw: its answer, never an unhandled rejection. */
async function timerClick(req: TimerIn): Promise<TimerResult> {
  try {
    return await window.rd.timer(req)
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e), confirm: null }
  }
}

/**
 * The refusals said by no word: the block not begun, over, not running nor paused, the routine saved already (a card, the bar)
 * or none – shared with the bar (`STEPS_QUIET`).
 */
const QUIET = STEPS_QUIET
const quiet = (r: TimerResult) => r.code === 'notBegun' || r.code === 'alreadyOver' || QUIET.has(r.why ?? '')

/** The text of the toast after the block ended by its steps. */
export const finishedText = (name: string): string => `Skończono: ${name}`
/** … and after a routine saved without an end of its block (as the card says it, D328). */
export const routineSavedText = (name: string, version: RoutineVersion, done: number, of: number): string => `Zapisano: ${name} (${ROUTINE_VERSION_NAMES[version]}) – ${done} z ${of}`

/** The routine of a block saved (`routine.done`): whether it was; a refusal other than „saved already” is said. */
async function closeRoutine(date: string, block: string, version: RoutineVersion, steps: readonly string[]): Promise<boolean> {
  const r = await timerClick({ a: 'routineDone', block, version, steps: [...steps], day: date })
  if (!r.ok && !quiet(r)) toast(r.why ?? 'Rutyna nie zapisała się', 'info')
  return r.ok
}

/** The block ended now, done (D474): whether it did; a refusal other than „not begun / over / not running” is said. */
async function endBlock(date: string, block: string): Promise<boolean> {
  const r = await timerClick({ a: 'stepsFinish', block, day: date })
  if (!r.ok && !quiet(r)) toast(`Blok się nie skończył: ${r.why ?? 'spróbuj „Skończyłem”'}`, 'info')
  return r.ok
}

/**
 * The last step of `block` (of `date`) was just ticked off: its routine saved with the list's version (`routine` – null: a
 * block without a routine) and the block ended now, done (D474).
 */
export async function finishBySteps(date: string, block: PlanBlock, name: string, routine: { version: RoutineVersion; steps: readonly string[] } | null): Promise<void> {
  const saved = routine && block.routine ? await closeRoutine(date, block.id, routine.version, routine.steps) : false
  const ended = await endBlock(date, block.id)
  if (ended) undoToast(finishedText(name), () => void undoFinish(date, block.id))
  else if (saved && routine) undoToast(routineSavedText(name, routine.version, routine.steps.length, routine.steps.length), () => void undoRoutine(block.id, date))
}

/**
 * A routine saved from its card (T1108): `done` – the steps of its list it saves ticked off (of `total`), with the version
 * picked. Nothing saved (saved elsewhere already, a refusal) – nothing more is written.
 */
export async function saveRoutine(date: string, block: PlanBlock, name: string, version: RoutineVersion, done: readonly string[], total: number, seen: Parameters<typeof saveRoutineSteps>[4]): Promise<void> {
  if (!(await closeRoutine(date, block.id, version, done))) return
  const ticks = await saveRoutineSteps(date, block, version, done, seen)
  const ended = ticks.finished && (await endBlock(date, block.id))
  undoToast(ended ? finishedText(name) : routineSavedText(name, version, done.length, total), () =>
    void (async () => {
      if (ended) await undoFinish(date, block.id)
      await undoRoutine(block.id, date)
      if (ticks.undo.length) await undoSteps(ticks.undo)
    })()
  )
}

/** „Cofnij” of a block ended by its steps (T1105): it runs on as before; why not – said. */
export async function undoFinish(date: string, block: string): Promise<void> {
  const r = await timerClick({ a: 'undoStepsFinish', block, day: date })
  if (!r.ok) toast(`Nie cofnięto: ${r.why ?? 'blok się nie otworzył'}`, 'info', 6000)
}

/** „Cofnij” of a routine saved (D328): it waits to be ticked off again (its card and line come back); why not – said. */
export async function undoRoutine(block: string, day: string): Promise<void> {
  const r = await timerClick({ a: 'routineUndo', block, day })
  if (!r.ok) toast(`Nie cofnięto: ${r.why ?? 'rutyna nie jest zapisana'}`, 'info')
}
