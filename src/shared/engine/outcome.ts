/**
 * What a day came to, without the game (spec „Nagrody”, „Statusy dni i passa”, „Ocena dnia”): the boundary – kept,
 * broken (minutes of extension, also taken at the freeze) or without data (no confirmed end of work, or time to explain
 * after a work block after the approved boundary left without an answer, D243, D265); the regeneration toward the
 * required minimum; the projects against their limit; the pool. The ritual compares two of them to say what a ✓ changes
 * (spec „skutek ✓ dla dnia liczy ta sama funkcja oceny co zamrożenie”); the game (E7) turns them into notes and statuses.
 */
import type { DayState } from './day'
import { explainMinutes } from './explain'

export type BoundaryOutcome = 'kept' | 'broken' | 'noData'

export interface DayOutcome {
  boundary: BoundaryOutcome
  extensionMin: number
  /** The end of work confirmed (a day without work and a stationary „zjazd” confirm themselves, spec). */
  endConfirmed: boolean
  /** Time to explain after a work block (not one counted as a project, T377) after the approved boundary, without an answer. */
  explainAfterBoundaryMin: number
  /** Toward the minimum (with the forecast to the bedtime when asked), the minimum, reached; `counts` – a minimum of the day's type from 30 min (spec). */
  regen: { towardMin: number; requiredMin: number; reached: boolean; counts: boolean }
  projects: { min: number; limitMin: number }
  poolMin: number
}

/** The day's outcome; `forecast` – the regeneration with the plan's forecast to the bedtime (the ritual in the evening). */
export function dayOutcome(state: DayState, opts: { forecast?: boolean } = {}): DayOutcome {
  const last = state.ends.at(-1)
  const endConfirmed = state.noWorkDay || state.dayType === 'zjazd-stacjonarny' || (state.workEnd != null && last?.confirmed === true)
  const approved = state.boundary.approved
  let explainAfterBoundaryMin = 0
  if (approved != null) for (const x of state.explains) if (x.kind === 'work' && !x.asProject && !x.answer) explainAfterBoundaryMin += explainMinutes(x, state.now, approved)
  const boundary: BoundaryOutcome = state.extensionMin > 0 ? 'broken' : !endConfirmed || explainAfterBoundaryMin > 0 ? 'noData' : 'kept'
  const towardMin = opts.forecast ? state.regen.forecastMin : state.regen.towardMinMin
  const counts = state.params.minRegenMin >= 30
  return {
    boundary,
    extensionMin: state.extensionMin,
    endConfirmed,
    explainAfterBoundaryMin,
    regen: { towardMin, requiredMin: state.regen.requiredMin, reached: counts && towardMin >= state.regen.requiredMin, counts },
    projects: { min: state.projectsMin, limitMin: state.params.projectLimitMin },
    poolMin: state.pool.min
  }
}

export type OutcomeChange =
  | { kind: 'boundary'; before: BoundaryOutcome; after: BoundaryOutcome }
  | { kind: 'regen'; before: boolean; after: boolean; towardMin: number; requiredMin: number }
  | { kind: 'projects'; deltaMin: number; limitMin: number }
  | { kind: 'pool'; deltaMin: number }

/** What changes from `a` to `b` (spec: „wymienia każdą nagrodę albo pulę, którą zmienia”); empty – „bez zmian”. */
export function outcomeChanges(a: DayOutcome, b: DayOutcome): OutcomeChange[] {
  const out: OutcomeChange[] = []
  if (a.boundary !== b.boundary) out.push({ kind: 'boundary', before: a.boundary, after: b.boundary })
  if (a.regen.reached !== b.regen.reached) out.push({ kind: 'regen', before: a.regen.reached, after: b.regen.reached, towardMin: b.regen.towardMin, requiredMin: b.regen.requiredMin })
  if (a.projects.min !== b.projects.min) out.push({ kind: 'projects', deltaMin: b.projects.min - a.projects.min, limitMin: b.projects.limitMin })
  if (a.poolMin !== b.poolMin) out.push({ kind: 'pool', deltaMin: b.poolMin - a.poolMin })
  return out
}
