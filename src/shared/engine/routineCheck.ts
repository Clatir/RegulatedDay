/**
 * Routines to tick off (D328, spec „Rutyna”: „Kroki odhaczasz po powrocie do komputera, wszystkie naraz albo
 * pojedynczo”; the version with one click as you tick them). One rule for the bar and „Dziś”, one state: the day's
 * `routine.done` closes both.
 *
 * D473, D479 (T1108): the card and the bar show the block's own „Kroki” as its day has them – the routine's list of the
 * version picked for that block on that day (or the block's own list), with the day's ticks (`stepsDone`): one state of the
 * ticks for the panel, the card and the bar. `routine.done` only closes the card and the bar's line (its steps – the ids ticked
 * when it was saved).
 */
import type { DayFile } from '../model/plan'
import { routineList, routineStepsOf } from '../model/routineSteps'
import type { Routine, RoutineStep, RoutineVersion } from '../model/routines'
import type { Step } from '../model/steps'
import { plannedSpan } from './blocks'
import type { DayContext, DayState } from './day'

/** The bar keeps a routine's line this long after the routine's end; „Dziś” keeps its card to the end of the day (T520). */
export const ROUTINE_LINE_MIN = 180

export interface RoutineDue {
  block: string
  routine: Routine
  /** Its steps in each version as the day shows them (the worse days' version empty: none to pick, T1108). */
  normal: RoutineStep[]
  worse: RoutineStep[]
  /** The version the day picked for the block (D479; „zwykła” until one is picked, and for a list of the block's own). */
  version: RoutineVersion
  /** The block's list as its day shows it, with the day's ticks (D473: its own, else the routine's of `version`). */
  steps: Step[]
  /** Indices: when it began (its start, or the plan's – before the first use it counts by the plan, D139) and ended. */
  from: number
  to: number
}

/** A list as the card's and the bar's steps (`RoutineStep`: a name, a time – none: 0). */
const asRoutineSteps = (steps: readonly Step[]): RoutineStep[] => steps.map((s) => ({ id: s.id, name: s.title, min: s.min ?? 0 }))

/**
 * The routines of the day not ticked off yet: a block of the plan with a routine of steps, begun (by its start, or by
 * its planned start – a routine before the first use of the computer counts by the plan), neither parked nor cancelled
 * before it began. In the order of their start. `day` – the day's file (its ticks and the routine's lists it keeps).
 */
export function routinesDue(ctx: DayContext, state: DayState, routines: readonly Routine[], day?: DayFile | null): RoutineDue[] {
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
    const lists = dayLists(p, routines, day)
    // A block of a task without steps (its list is the task's, T792): nothing of its own to tick off – no card, no line.
    if (lists.steps.length) out.push({ block: p.id, routine: r, ...lists, from, to })
  }
  return out.sort((a, b) => a.from - b.from)
}

/**
 * The lists of a block of a routine on its day (T1108): the version the day picked and its list with the day's ticks; the
 * other version as the routine has it now. A block with steps of its own (D460: a copy) – its list, no version to pick.
 */
function dayLists(p: DayContext['plan'][number], routines: readonly Routine[], day: DayFile | null | undefined): Pick<RoutineDue, 'normal' | 'worse' | 'version' | 'steps'> {
  const done = new Set(day?.stepsDone?.[p.id] ?? [])
  const list = routineStepsOf(p, routines, day?.routineSteps, done)
  // Its own list (with the day's ticks – `dayPlan`): no version to pick.
  if (!list) return { normal: asRoutineSteps(p.steps), worse: [], version: 'normal', steps: p.steps }
  const shown = asRoutineSteps(list.steps)
  const other = (v: RoutineVersion) => (list.routine ? asRoutineSteps(routineList(list.routine, v)) : [])
  const hasWorse = !!list.routine?.worse.length
  return {
    version: list.version,
    steps: list.steps,
    normal: list.version === 'normal' ? shown : other('normal'),
    worse: !hasWorse ? [] : list.version === 'worse' ? shown : other('worse')
  }
}
