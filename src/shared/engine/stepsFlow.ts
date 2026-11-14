/**
 * The ends of a list of steps (D474, D328, D482, T1104, T1105, T1108, T1109) – one sequence for every place that ticks steps:
 * the panel „Kroki” and the routine's card in „Dziś”, the page „Sprawy” and the bar. Each gives its click of the timer
 * (`Timer` – the window's IPC, the bar's main process) and, for a save, its write of the day's ticks; the words and the
 * „Cofnij” are the place's own.
 *
 * - The list made whole by a tick (`listWhole`): a block of a routine is saved as ticked off (`routine.done` – its card and the
 *   bar's line close; quiet when saved already), then the block ends now, done, when it has begun and not ended (D474).
 * - A routine saved from its card or the bar (`routineSaved`): first `routine.done` (saved elsewhere already – refused, nothing
 *   more written), then the day's ticks of its list (`routineSaveEdits` – only added), then – the list whole and the ticks
 *   written – the end of the block.
 * - „Cofnij” (`undoAfterSteps`): the end of the block first – refused, nothing else is taken back (D482: the block's end is
 *   what „Cofnij” is about) – then the routine's save, then the ticks the save wrote.
 */
import type { TimerIn, TimerResult } from '../api'
import { MAX_STEPS, type RoutineVersion } from '../model/routines'

export type Timer = (click: TimerIn) => Promise<TimerResult>

/** The refusals said by no word (by their code): not begun, over, not running nor paused, its routine saved already or none. */
const QUIET: ReadonlySet<string> = new Set(['notBegun', 'alreadyOver', 'notRunning', 'routineSaved', 'noRoutine'])
export const quietRefusal = (r: TimerResult): boolean => !r.ok && r.code != null && QUIET.has(r.code)

/** What an end of a list did: the routine saved, the block ended, and the refusals to say (none quiet). */
export interface StepsEnd {
  saved: boolean
  ended: boolean
  said: string[]
}

/** The routine of a block as its save writes it: its version and the steps done (at most a routine's `MAX_STEPS`). */
export interface RoutineSave {
  version: RoutineVersion
  steps: readonly string[]
}

const said = (...rs: Array<TimerResult | null>): string[] => rs.flatMap((r) => (r && !r.ok && !quietRefusal(r) && r.why ? [r.why] : []))

const routineDone = (timer: Timer, day: string, block: string, r: RoutineSave): Promise<TimerResult> =>
  timer({ a: 'routineDone', block, day, version: r.version, steps: r.steps.slice(0, MAX_STEPS) })

/** The list of `block` (of `day`) made whole by a tick: its routine saved (`routine` – null: none), the block ended (D474). */
export async function listWhole(timer: Timer, day: string, block: string, routine: RoutineSave | null): Promise<StepsEnd> {
  const saved = routine ? await routineDone(timer, day, block, routine) : null
  const ended = await timer({ a: 'stepsFinish', block, day })
  return { saved: saved?.ok === true, ended: ended.ok, said: said(saved, ended) }
}

/**
 * A routine saved (T1108): `routine.done`, then `write` (the day's ticks – whether they were written and the list is whole
 * after them), then the end of the block when both hold. Refused at once – `saved` false and why (nothing written).
 */
export async function routineSaved(timer: Timer, day: string, block: string, routine: RoutineSave, write: () => Promise<{ ok: boolean; finished: boolean }>): Promise<StepsEnd & { ticks: boolean }> {
  const done = await routineDone(timer, day, block, routine)
  if (!done.ok) return { saved: false, ended: false, ticks: false, said: [done.why ?? 'rutyna nie zapisała się'] }
  const w = await write()
  const ended = w.ok && w.finished ? await timer({ a: 'stepsFinish', block, day }) : null
  return { saved: true, ended: ended?.ok === true, ticks: w.ok, said: said(ended) }
}

/** What a „Cofnij” after steps takes back: the end of the block, the routine's save, the ticks (the place's own undo). */
export interface StepsUndoOf {
  day: string
  block: string
  end: boolean
  routine: boolean
  ticks?: (() => Promise<void>) | null
}

/**
 * „Cofnij” after steps (T1105, T1109, D482): the end first – refused, why, and nothing else is taken back; then the routine's
 * save (refused – why, the ticks stay); then the ticks. Null – all of it taken back.
 */
export async function undoAfterSteps(timer: Timer, u: StepsUndoOf): Promise<string | null> {
  if (u.end) {
    const r = await timer({ a: 'undoStepsFinish', block: u.block, day: u.day })
    if (!r.ok) return r.why ?? 'blok się nie otworzył'
  }
  if (u.routine) {
    const r = await timer({ a: 'routineUndo', block: u.block, day: u.day })
    if (!r.ok) return r.why ?? 'rutyna nie jest zapisana'
  }
  if (u.ticks) await u.ticks()
  return null
}
