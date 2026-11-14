/**
 * The steps of a block's routine (D473, T1100–T1103): a block of a day with a routine and no list of its own – a block of a
 * template or a series too, never the block of a task (its list is the task's, T792, T1034) – shows the routine's steps in
 * „Kroki”. They are not copied when the block is made: until its day ticks one of them (or picks the version) the list is
 * the routine as it is now (a change of the routine changes the steps of every block not begun so); the first tick or the
 * choice of the version writes the list into the day's file (`routineSteps.<block>` = `{ routine, version, steps }`, T1100),
 * and from then on that day's block keeps it, whatever the routine becomes. A tick is the day's (`stepsDone`, T786) – the
 * block itself is never written by it. The list's ids are the routine's steps' own, so a tick follows its step through a
 * rename of the routine and the version picked „na gorsze dni” is the routine's other list (D93, D139: one click).
 */
import type { PlanBlock } from './plan'
import type { Routine, RoutineVersion } from './routines'
import { stepMinOf, stepsFrom, stepTitleOf, withDone, type Step } from './steps'

/** The field of a day's file with the lists of its blocks' routines, written at the first tick or the version picked. */
export const ROUTINE_STEPS = 'routineSteps'

/** A block's routine list as its day keeps it (T1100): the routine it is of, its version, its steps (never ticked). */
export interface RoutineStepsEntry {
  routine: string
  version: RoutineVersion
  steps: Step[]
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The entries of a day's file (`routineSteps`), read tolerantly: one without a routine or a step is left out. */
export function routineStepsEntries(v: unknown): Record<string, RoutineStepsEntry> {
  const out: Record<string, RoutineStepsEntry> = {}
  if (!isPlain(v)) return out
  for (const [block, x] of Object.entries(v)) {
    if (!isPlain(x) || typeof x.routine !== 'string' || !x.routine) continue
    const steps = stepsFrom(x.steps)
    if (steps.length) out[block] = { routine: x.routine, version: x.version === 'worse' ? 'worse' : 'normal', steps }
  }
  return out
}

/** The version in force: the worse days' one only while the routine has it (as the card and the bar – `versionOf`). */
export const routineVersionIn = (r: Pick<Routine, 'worse'>, v: RoutineVersion): RoutineVersion => (v === 'worse' && r.worse.length ? 'worse' : 'normal')

/**
 * A version of a routine as a block's list: the routine's own ids (a tick follows its step), each name as the title (none –
 * „krok N”, as the card names it), its time, in the routine's order; nothing ticked.
 */
export function routineList(r: Pick<Routine, 'normal' | 'worse'>, version: RoutineVersion): Step[] {
  const steps = r[routineVersionIn(r, version)]
  return steps.map((x, k) => {
    const s: Step = { id: x.id, title: stepTitleOf(x.name) || `krok ${k + 1}`, order: k, done: false }
    const min = stepMinOf(x.min)
    return min === undefined ? s : { ...s, min }
  })
}

/** What a block's list of its routine is now (D473): the steps with the day's ticks, the version, whether the day keeps it. */
export interface RoutineSteps {
  /** The routine's id (the block's). */
  routineId: string
  /** The routine's record (null: gone – a list the day keeps shows still, without the choice of the version). */
  routine: Routine | null
  version: RoutineVersion
  steps: Step[]
  /** The day's file keeps the list (`routineSteps.<block>`): a change of the routine no longer changes it. */
  kept: boolean
}

/**
 * The list of `b`'s routine on its day (D473), or null when its list is not the routine's: a block with steps of its own, of
 * a task, without a routine, or whose routine is not there (any more) or has no steps – and its day does not keep a list of
 * that routine. `done` – the day's ticks of the block.
 */
export function routineStepsOf(
  b: Pick<PlanBlock, 'id' | 'routine' | 'task' | 'steps'>,
  routines: readonly Routine[],
  entries: Readonly<Record<string, RoutineStepsEntry>> | undefined,
  done: ReadonlySet<string> = new Set()
): RoutineSteps | null {
  if (!b.routine || b.task || b.steps.length) return null
  const routine = routines.find((r) => r.id === b.routine) ?? null
  const kept = entries?.[b.id]
  if (kept && kept.routine === b.routine) return { routineId: b.routine, routine, version: kept.version, steps: withDone(kept.steps, done), kept: true }
  if (!routine || !routine.normal.length) return null
  return { routineId: b.routine, routine, version: 'normal', steps: withDone(routineList(routine, 'normal'), done), kept: false }
}

/**
 * The refusals of the timer the end of a list says by no word (D474, T1104 – the app never guesses when a block ran): not begun,
 * over, not running nor paused, its routine saved already or none (the window and the bar).
 */
export const STEPS_QUIET: ReadonlySet<string> = new Set(['ten blok się nie zaczął', 'ten blok już się skończył', 'ten blok nie biegnie', 'ta rutyna jest już zapisana', 'ten blok nie ma rutyny'])

/** The steps `b` shows on its day (D440, D473): its own list (with the day's ticks, `dayPlan`), else its routine's. */
export function shownSteps(
  b: Pick<PlanBlock, 'id' | 'routine' | 'task' | 'steps'>,
  routines: readonly Routine[] | undefined,
  day: { routineSteps?: Readonly<Record<string, RoutineStepsEntry>>; stepsDone?: Readonly<Record<string, readonly string[]>> } | null | undefined
): Step[] {
  if (b.steps.length || !b.routine) return b.steps
  return routineStepsOf(b, routines ?? [], day?.routineSteps, new Set(day?.stepsDone?.[b.id] ?? []))?.steps ?? b.steps
}
