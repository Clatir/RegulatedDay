/**
 * Routines (spec „Rutyna”, routines/<id>.json): a sequence of steps with the time of each, in two versions – the usual
 * one and one for worse days. The app never changes the order of steps; at most it moves the whole routine in time. A
 * block of the plan points at its routine (PlanBlock.routine); the version is chosen with one click when you tick the
 * steps off.
 */

export const ROUTINE_SCHEMA = 1

export interface RoutineStep {
  id: string
  name: string
  min: number
}

export type RoutineVersion = 'normal' | 'worse'
export const ROUTINE_VERSIONS: readonly RoutineVersion[] = ['normal', 'worse']
export const ROUTINE_VERSION_NAMES: Record<RoutineVersion, string> = { normal: 'zwykła', worse: 'na gorsze dni' }

export interface Routine {
  id: string
  name: string
  normal: RoutineStep[]
  worse: RoutineStep[]
  archived: boolean
}

/** A step's time: 1–240 min; a routine has at most 40 steps. */
export const STEP_RANGE = [1, 240] as const
export const MAX_STEPS = 40

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function stepsFrom(v: unknown): RoutineStep[] {
  const out: RoutineStep[] = []
  for (const x of Array.isArray(v) ? v : []) {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id || out.some((s) => s.id === x.id)) continue
    const min = typeof x.min === 'number' && Number.isInteger(x.min) && x.min >= STEP_RANGE[0] && x.min <= STEP_RANGE[1] ? x.min : null
    if (min == null) continue
    out.push({ id: x.id, name: typeof x.name === 'string' ? x.name.slice(0, 80) : '', min })
    if (out.length >= MAX_STEPS) break
  }
  return out
}

export function routineFrom(v: unknown): Routine | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id) return null
  return {
    id: v.id,
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 80) : 'Rutyna',
    normal: stepsFrom(v.normal),
    worse: stepsFrom(v.worse),
    archived: v.archived === true
  }
}

/** The time of a version: the sum of its steps (the worse days' version empty: the usual one). */
export function routineMinutes(r: Routine, version: RoutineVersion = 'normal'): number {
  const steps = version === 'worse' && r.worse.length ? r.worse : r.normal
  return steps.reduce((s, x) => s + x.min, 0)
}
