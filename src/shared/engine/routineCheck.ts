/**
 * Routines to tick off (D328, spec „Rutyna”: „Kroki odhaczasz po powrocie do komputera, wszystkie naraz albo
 * pojedynczo”; the version with one click as you tick them). One rule for the bar and „Dziś”, one state: the day's
 * `routine.done` closes both.
 */
import type { Routine, RoutineStep } from '../model/routines'
import { plannedSpan } from './blocks'
import type { DayContext, DayState } from './day'

/** The bar keeps a routine's line this long after the routine's end; „Dziś” keeps its card to the end of the day (T520). */
export const ROUTINE_LINE_MIN = 180

export interface RoutineDue {
  block: string
  routine: Routine
  /** Its steps in each version (the worse days' version empty: none to pick). */
  normal: RoutineStep[]
  worse: RoutineStep[]
  /** Indices: when it began (its start, or the plan's – before the first use it counts by the plan, D139) and ended. */
  from: number
  to: number
}

/**
 * The routines of the day not ticked off yet: a block of the plan with a routine of steps, begun (by its start, or by
 * its planned start – a routine before the first use of the computer counts by the plan), neither parked nor cancelled
 * before it began. In the order of their start.
 */
export function routinesDue(ctx: DayContext, state: DayState, routines: readonly Routine[]): RoutineDue[] {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const out: RoutineDue[] = []
  for (const p of ctx.plan) {
    if (!p.routine || state.facts.routines.has(p.id)) continue
    const r = routines.find((x) => x.id === p.routine)
    const b = byId.get(p.id)
    if (!r || !r.normal.length || !b) continue
    const f = state.facts.blocks.get(p.id)
    if (f?.startedAt == null && (f?.parkedAt != null || f?.cancelledAt != null)) continue
    const span = plannedSpan(b, byId)
    const from = f?.startedAt ?? span?.start ?? null
    if (from == null || from > state.now) continue
    const to = f?.endedAt ?? (f?.startedAt != null ? Math.max(state.now, from + b.durationMin) : span!.end)
    out.push({ block: p.id, routine: r, normal: r.normal, worse: r.worse, from, to })
  }
  return out.sort((a, b) => a.from - b.from)
}
