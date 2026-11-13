/**
 * The pure side of the list „Kroki” in the window (SNT5, D440): what a store's answer of a change of steps is for the screen
 * (`stepsAnswer`: a saved removal offers „Cofnij”), the keys that move a step (Alt+↑ / Alt+↓ – the keyboard's way to the
 * drag), the place a drop gives a step, the message of a refused op said before anything is sent.
 */
import { saveAnswer, type SaveAnswer } from '../../store/data'
import { undoSteps, type StepsResult } from '../../store/steps'
import { undoToast } from '../../store/ui'
import { applyStepOp, moveStepOp, type Step, type StepOp } from '@shared/model/steps'

/** What a change of steps became for a field: saved, refused (the text stays in the field – also a failed send), or asked (a question waits). */
export function stepsAnswer(op: StepOp, r: StepsResult): SaveAnswer {
  // A removal is the one change that loses something (the step and its tick on the day): „Cofnij” for 10 s, as every removal.
  if (r.saved && op.op === 'remove' && r.undo.length) undoToast('Krok usunięty', () => void undoSteps(r.undo))
  // Not saved without a reason of ours: what the queue answered says it (a failed send or a broken file is a refusal – the field gets its text back).
  // Sent and no answer (a failure after the queue took it): not known – a question, never a refusal (a second Enter would add it twice).
  return r.saved ? true : r.error ? false : saveAnswer(r.outcomes, r.sent)
}

/** The op an Alt+arrow makes of the step `id` (the list shown): one place up or down; null – it is at the end already. */
export function keyMove(steps: readonly Pick<Step, 'id'>[], id: string, key: string): StepOp | null {
  const i = steps.findIndex((s) => s.id === id)
  if (i < 0) return null
  const to = key === 'ArrowUp' ? i - 1 : key === 'ArrowDown' ? i + 1 : -1
  return to < 0 || to > steps.length - 1 ? null : moveStepOp(steps, id, to)
}

/** The op a drop makes: `dragged` put before the step `over` (or after it – `after`); null – it stays where it is. */
export function dropMove(steps: readonly Pick<Step, 'id'>[], dragged: string, over: string, after: boolean): StepOp | null {
  if (dragged === over) return null
  const rest = steps.filter((s) => s.id !== dragged)
  const k = rest.findIndex((s) => s.id === over)
  if (k < 0 || !steps.some((s) => s.id === dragged)) return null
  const op = moveStepOp(steps, dragged, k + (after ? 1 : 0))
  const next = applyStepOp(steps as Step[], op)
  // The same order after the drop: nothing to save.
  return 'steps' in next && next.steps.every((s, n) => s.id === steps[n]!.id) ? null : op
}

/** Why an op is refused before it is sent (an empty title, a full list) – the message of the model, null – it can be sent. */
export function refusedOp(steps: readonly Step[], op: StepOp): string | null {
  const next = applyStepOp([...steps], op)
  return 'error' in next ? next.error : null
}
