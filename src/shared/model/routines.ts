/**
 * Routines (spec „Rutyna”, routines/<id>.json): a sequence of steps with the time of each, in two versions – the usual
 * one and one for worse days. The app never changes the order of steps; at most it moves the whole routine in time. A
 * block of the plan points at its routine (PlanBlock.routine); the version is chosen with one click when you tick the
 * steps off. D512: a routine may have its own cost per hour (`costs`) – a block of it without its own costs that, before
 * its variant's and category's; none (null, no field in the file) – „jak podkategoria”.
 */
import { poolCostsFrom } from './blockCosts'
import type { Costs } from './categories'

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
  /**
   * The routine's own cost per hour (D512: three pools of −5…5), null – none („jak podkategoria”: a block of it costs its variant's or
   * category's). Additive: a file without the field (an older version's) has none; an older version keeps the field when it changes the
   * routine (the editor writes over the raw record) and counts without it. Absent (a routine made in code) – none.
   */
  costs?: Costs | null
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
    archived: v.archived === true,
    costs: poolCostsFrom(v.costs)
  }
}

/**
 * The costs of the routines that have their own (D512), by id – what a block of a routine costs without its own (`DayContext.routineCosts`,
 * `BlockInfo.routineCosts`); 'unknown' – a routine whose file cannot be read now and was not read before in this run (T1372). An archived
 * routine counts too: its blocks still point at it.
 */
export type RoutineCosts = Readonly<Record<string, Costs | 'unknown'>>
export const NO_ROUTINE_COSTS: RoutineCosts = Object.freeze({})

/**
 * The map of the routines with a cost of their own and of the routines not known now (`unknown` – their ids). `Object.fromEntries`: an id
 * such as „__proto__” is a key, never the prototype.
 */
export function routineCostsOf(routines: readonly Routine[], unknown: readonly string[] = []): RoutineCosts {
  return Object.fromEntries([...unknown.map((id) => [id, 'unknown'] as const), ...routines.flatMap((r) => (r.costs ? [[r.id, r.costs] as const] : []))])
}

/**
 * The cost of the routine `id`: null – no routine, or one without a cost of its own; undefined – not known now (its file cannot be read).
 * Only the map's own keys („constructor” is none).
 */
export function routineCostOf(map: RoutineCosts | undefined, id: string | null): Costs | null | undefined {
  if (id == null || map == null || !Object.hasOwn(map, id)) return null
  const c = map[id]
  return c === 'unknown' ? undefined : (c ?? null)
}

/** The time of a version: the sum of its steps (the worse days' version empty: the usual one). */
export function routineMinutes(r: Routine, version: RoutineVersion = 'normal'): number {
  const steps = version === 'worse' && r.worse.length ? r.worse : r.normal
  return steps.reduce((s, x) => s + x.min, 0)
}
