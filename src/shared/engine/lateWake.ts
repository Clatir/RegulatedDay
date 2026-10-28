/**
 * Getting up later (spec „Późne wstanie”, D199): the first use of a computer more than 30 min after the planned end of
 * the morning routine, while the morning plan is not done. Not on a stationary „zjazd” day (its plan confirms itself)
 * nor on a free day; while a session waits for „Zacznij” or runs the proposal waits for its end. The boundary stays. It
 * starts with „Wstałeś później? · Tak · Nie”: „Nie” closes it, „Tak” shows the routines, care and meals moved by the
 * delay and the work blocks shortened or parked so the day fits the boundary again; the plan changes only when you
 * accept. Blocks that passed before the first use are listed for confirmation.
 *
 * The first use is the day's first use of a computer as the helper recorded it (spec „Użycie komputera”: from an hour
 * before the wake, so night coding after 04:00 is not it); a day without records of observation falls back to the first
 * presence (T454).
 */
import { isKnown, type AnyEvent } from '../model/events'
import type { DayFile, PlanBlock } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { activityOf } from './activity'
import { dayFirstUse } from './auto'
import { isBoundaryWork } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import { atOf, idxOf } from './grid'

/** How long after the routine's planned end the first use counts as getting up later (spec: 30 min). */
export const LATE_WAKE_MIN = 30
/** A work block is never shortened below this; shorter, it is parked. */
const MIN_LEFT = 15

export interface LateWake {
  /** The day's first use of a computer (instant). */
  firstUse: number
  /** The planned end of the morning routine (logical minute; the wake time without one). */
  routineEndMin: number
  delayMin: number
  /** The proposal waits for the end of a session (logical minute), null: it is shown now. */
  waitUntilMin: number | null
  shifts: Array<{ block: PlanBlock; toStartMin: number }>
  shortens: Array<{ block: PlanBlock; toMin: number }>
  parks: PlanBlock[]
  /** Fixed blocks that passed before the first use: to be confirmed (E4a's „do potwierdzenia”). */
  passed: PlanBlock[]
}

/** The first presence of the day on any computer (instant), null before it. */
export function firstUseOf(events: readonly AnyEvent[]): number | null {
  let first: number | null = null
  for (const e of events) if (isKnown(e) && e.k === 'presence.first') first = first == null ? e.at : Math.min(first, e.at)
  return first
}

/** The morning routine: the earliest routine block planned before the first fixed block (spec „Poranna rutyna”). */
function morningRoutine(ctx: DayContext, state: DayState): PlanBlock | null {
  const fixedStarts = ctx.plan.filter((b) => b.fixed && b.startMin != null).map((b) => b.startMin!)
  const firstFixed = fixedStarts.length ? Math.min(...fixedStarts) : Number.POSITIVE_INFINITY
  let best: PlanBlock | null = null
  for (const b of ctx.plan) {
    const rules = state.settings.categories[b.categoryId]
    if (rules?.kind !== 'routine' || b.startMin == null || b.startMin >= firstFixed) continue
    if (!best || b.startMin < best.startMin!) best = b
  }
  return best
}

export function detectLateWake(ctx: DayContext, state: DayState, dayFile: DayFile | null): LateWake | null {
  const dayType = state.facts.snapshots.at(-1)?.dayType ?? ctx.snapshot.dayType
  if (dayType === 'zjazd-stacjonarny' || dayType === 'wolne') return null
  if (dayFile?.asked.lateWake) return null
  const activity = activityOf(ctx.events, state.grid.start, ctx.now)
  const observed = activity.computers.some((x) => x.observed.length > 0)
  const firstUse = observed ? dayFirstUse(state, activity) : firstUseOf(ctx.events)
  if (firstUse == null) return null
  // The morning plan done before the first use (its approval of the boundary, not the automatic one): no proposal.
  const g = state.grid
  if (state.facts.approvals.some((a) => !a.auto && a.at <= idxOf(g, firstUse))) return null
  const routine = morningRoutine(ctx, state)
  const routineEndMin = routine ? routine.startMin! + routine.durationMin : ctx.wakeMin
  const useMin = logicalMinuteOf(ctx.date, firstUse)
  if (useMin <= routineEndMin + LATE_WAKE_MIN) return null
  const delayMin = useMin - routineEndMin
  const useIdx = idxOf(g, firstUse)

  // A session waiting for „Zacznij” or running at the first use: the proposal waits for its end.
  let waitUntilMin: number | null = null
  for (const b of state.blocks) {
    if (b.rules.kind !== 'session' || b.start == null) continue
    const end = b.start + b.durationMin
    if (b.start <= useIdx && useIdx < end) waitUntilMin = Math.max(waitUntilMin ?? 0, logicalMinuteOf(ctx.date, atOf(g, end)))
  }

  // Routines, care and meals planned before the first use (not begun) move by the delay, in their order.
  const shifts: LateWake['shifts'] = []
  for (const b of ctx.plan) {
    const rules = state.settings.categories[b.categoryId]
    if (!rules || rules.cls !== 'life' || b.fixed || b.anchor || b.startMin == null) continue
    if (b.startMin >= useMin) continue
    if (state.facts.blocks.get(b.id)?.startedAt != null) continue
    shifts.push({ block: b, toStartMin: b.startMin + delayMin })
  }
  const passed = ctx.plan.filter((b) => b.fixed && b.startMin != null && b.startMin + b.durationMin <= useMin && state.facts.blocks.get(b.id)?.startedAt == null)

  // Work that no longer fits before the boundary (it stays: the approved one, else the plan's own proposal – the day
  // counted from its start, before the late start pushed anything): the latest flexible work blocks are shortened,
  // never below 15 min – shorter, parked.
  const boundary = state.boundary.approved ?? computeDay({ ...ctx, now: g.start }).boundary.proposal
  const shortens: LateWake['shortens'] = []
  const parks: PlanBlock[] = []
  if (boundary != null) {
    // Moved by the delay they end by the first use: done before it (they count by the plan, spec), not in the forecast.
    const done = new Set(shifts.filter((s) => s.toStartMin + s.block.durationMin <= useMin).map((s) => s.block.id))
    const moved = new Map(shifts.map((s) => [s.block.id, { ...s.block, startMin: s.toStartMin }]))
    let plan = ctx.plan.filter((b) => !done.has(b.id)).map((b) => moved.get(b.id) ?? b)
    const fcEnd = (p: readonly PlanBlock[]) => computeDay({ ...ctx, plan: p, now: Math.max(ctx.now, firstUse) }).forecastWorkEnd
    let over = (fcEnd(plan) ?? 0) - boundary
    const flexible = state.forecast
      .filter((p) => p.block.inPlan && isBoundaryWork(p.block) && !p.block.fixed && !p.block.waits && !p.running && state.facts.blocks.get(p.block.id)?.startedAt == null)
      .sort((a, b) => b.from - a.from)
    for (const p of flexible) {
      if (over <= 0) break
      const b = plan.find((x) => x.id === p.block.id)
      if (!b) continue
      const left = b.durationMin - over
      if (left >= MIN_LEFT) {
        shortens.push({ block: b, toMin: left })
        plan = plan.map((x) => (x.id === b.id ? { ...x, durationMin: left } : x))
      } else {
        parks.push(b)
        plan = plan.filter((x) => x.id !== b.id)
      }
      over = (fcEnd(plan) ?? 0) - boundary
    }
  }
  return { firstUse, routineEndMin, delayMin, waitUntilMin, shifts, shortens, parks, passed }
}
