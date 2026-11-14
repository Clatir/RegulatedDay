/**
 * Getting up later (spec „Późne wstanie”; D488 replaces the trigger of D199): the day's first block – the morning routine
 * as a rule – stands in the day's plan at least 20 min later than its planned hour. Blocks away from the computer begin by
 * themselves also before the day's first use (D488), so the first use no longer tells a late wake: you tell it by moving
 * that block (after „Cofnij” of its automatic start). Not on a stationary „zjazd” day (its plan confirms itself) nor on a
 * free day; while a session waits for „Zacznij” or runs at the block's new hour the proposal waits for its end. The
 * boundary stays. It starts with „Wstałeś później? · Tak · Nie”: „Nie” closes it, „Tak” shows the rest of the morning –
 * routines, care and meals before the first fixed block – moved by the same delay (one the push of the move already took
 * further stays) and the work blocks shortened or parked so the day fits the boundary again; the plan changes only when
 * you accept. Fixed blocks that passed before the block's new hour are listed for confirmation. Once shown it waits for
 * the answer: the hour the block was moved to when it was shown is kept in the log (D337).
 *
 * The planned hour is the day's snapshot (the template, the series) moved by the day's wake as the plan moves it
 * (`wakeShiftedStart`): a later wake set for the day moves the morning itself and asks nothing.
 */
import { PLAN_MAX, PLAN_MIN, type DayFile, type PlanBlock } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { dayWakeMin, firstFixedStart, morningBound, wakeShiftedStart } from './createDay'
import { isBoundaryWork } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import { atOf } from './grid'

/** How much later than planned the day's first block must stand to ask (D488: 20 min). */
export const LATE_WAKE_MIN = 20
/** The morning ends here at the latest (logical minute, 12:00 – the latest wake of a day): a later hour asks nothing. */
const MORNING_END_MIN = 12 * 60
/**
 * The proposal shown is a `question.seen` of the log (D337): its id carries the hour the day's first block was moved to
 * when it was shown and the day's wake – `lateWake:<day>:<hour>:<wake>`. The log keeps the first (`facts.seen`, the same
 * on every computer): moving the block again does not take the question away. The window reports it like any question.
 */
export const lateWakeSeenId = (date: string, lw: Pick<LateWake, 'movedMin' | 'wakeMin'>): string => `lateWakeMoved:${date}:${lw.movedMin}:${lw.wakeMin}`

/**
 * The hour the proposal was first shown with, for the wake the day has now; null: it was not shown, or only for another
 * wake (a change of the day's wake moves the morning, so it is counted from the plan again), or the value is outside the day.
 */
export function lateWakeSeenEnd(seen: ReadonlyMap<string, unknown>, date: string, wakeMin: number): number | null {
  // `lateWake:` – the end of the routine of D199 (an older version's): another meaning, not read (T1148).
  const re = new RegExp(`^lateWakeMoved:${date}:(\\d{1,4}):(\\d{1,4})$`)
  for (const id of seen.keys()) {
    const m = re.exec(id)
    if (!m || Number(m[2]) !== wakeMin) continue
    const end = Number(m[1])
    if (end >= PLAN_MIN && end <= PLAN_MAX + 24 * 60) return end
  }
  return null
}

/** A work block is never shortened below this; shorter, it is parked. */
const MIN_LEFT = 15

export interface LateWake {
  /** The day's first block (as the day's plan has it now). */
  first: PlanBlock
  /** Its planned hour (logical minute: the snapshot's, moved by the day's wake). */
  plannedMin: number
  /** Where it stands (logical minute) – kept from when the proposal was first shown (D337). */
  movedMin: number
  /** The day's wake the proposal was counted for (the kept hour holds for it only). */
  wakeMin: number
  delayMin: number
  /** The proposal waits for the end of a session (logical minute), null: it is shown now. */
  waitUntilMin: number | null
  shifts: Array<{ block: PlanBlock; toStartMin: number }>
  shortens: Array<{ block: PlanBlock; toMin: number }>
  parks: PlanBlock[]
  /** Fixed blocks that passed before the first block's new hour: to be confirmed (E4a's „do potwierdzenia”). */
  passed: PlanBlock[]
}

/**
 * The planned hours of the snapshot's blocks with a start of their own, moved by the day's wake as `dayPlan` moves them
 * (the same wake and the same bound of the morning – your fixed blocks and the answers of the day too, T1148).
 */
function plannedStarts(ctx: DayContext, dayFile: DayFile | null): Map<string, number> {
  const delta = dayWakeMin(ctx.snapshot, dayFile) - ctx.snapshot.templateWakeMin
  const firstFixed = morningBound(ctx.snapshot, dayFile)
  const out = new Map<string, number>()
  for (const b of ctx.snapshot.blocks) if (b.startMin != null) out.set(b.id, wakeShiftedStart(b, delta, firstFixed) ?? b.startMin)
  return out
}

/** The day's first block: the earliest flexible block of the snapshot with a start of its own (the morning routine as a rule). */
function firstBlockOf(ctx: DayContext, planned: ReadonlyMap<string, number>): PlanBlock | null {
  let best: PlanBlock | null = null
  for (const b of ctx.snapshot.blocks) {
    if (b.fixed || b.anchor || b.startMin == null) continue
    if (!best || planned.get(b.id)! < planned.get(best.id)!) best = b
  }
  return best
}

export function detectLateWake(ctx: DayContext, state: DayState, dayFile: DayFile | null): LateWake | null {
  const dayType = state.facts.snapshots.at(-1)?.dayType ?? ctx.snapshot.dayType
  if (dayType === 'zjazd-stacjonarny' || dayType === 'wolne') return null
  if (dayFile?.asked.lateWake) return null
  const planned = plannedStarts(ctx, dayFile)
  const firstOfPlan = firstBlockOf(ctx, planned)
  const first = firstOfPlan ? ctx.plan.find((b) => b.id === firstOfPlan.id) : undefined
  if (!first || first.startMin == null || first.anchor) return null
  const plannedMin = planned.get(first.id)!
  // Once shown, from the hour it was first shown with (D337) – the block may have moved since.
  const movedMin = lateWakeSeenEnd(state.facts.seen, ctx.date, ctx.wakeMin) ?? first.startMin
  const delayMin = movedMin - plannedMin
  if (delayMin < LATE_WAKE_MIN) return null
  // Only a morning (T1148): the new hour before the day's first fixed block and before 12:00 – moving the routine in the
  // afternoon to the evening is no late wake.
  const firstFixed = firstFixedStart(ctx.plan)
  if (movedMin >= Math.min(firstFixed, MORNING_END_MIN)) return null
  const g = state.grid

  // A session waiting for „Zacznij” or running now: the proposal waits for its end.
  let waitUntilMin: number | null = null
  for (const b of state.blocks) {
    if (b.rules.kind !== 'session' || b.start == null) continue
    const end = b.start + b.durationMin
    if (b.start <= state.now && state.now < end) waitUntilMin = Math.max(waitUntilMin ?? 0, logicalMinuteOf(ctx.date, atOf(g, end)))
  }

  // The rest of the morning – routines, care and meals before the first fixed block, not begun – moves by the delay from
  // its planned hour (one the push of the move took further keeps its place), in their order (D488).
  const shifts: LateWake['shifts'] = []
  for (const b of [...ctx.plan].sort((x, y) => (x.startMin ?? 0) - (y.startMin ?? 0))) {
    const rules = state.settings.categories[b.categoryId]
    if (b.id === first.id || !rules || rules.cls !== 'life' || b.fixed || b.anchor || b.startMin == null) continue
    const from = planned.get(b.id) ?? b.startMin
    if (from >= firstFixed) continue
    if (state.facts.blocks.get(b.id)?.startedAt != null) continue
    const to = Math.min(PLAN_MAX - b.durationMin, from + delayMin)
    if (to > b.startMin) shifts.push({ block: b, toStartMin: to })
  }
  const passed = ctx.plan.filter((b) => b.fixed && b.startMin != null && b.startMin + b.durationMin <= movedMin && state.facts.blocks.get(b.id)?.startedAt == null)

  // Work that no longer fits before the boundary (it stays: the approved one, else the plan's own proposal – the day
  // counted from its start, before the late start pushed anything): the latest flexible work blocks are shortened,
  // never below 15 min – shorter, parked.
  const boundary = state.boundary.approved ?? computeDay({ ...ctx, now: g.start }).boundary.proposal
  const shortens: LateWake['shortens'] = []
  const parks: PlanBlock[] = []
  if (boundary != null) {
    const moved = new Map(shifts.map((s) => [s.block.id, { ...s.block, startMin: s.toStartMin }]))
    let plan = ctx.plan.map((b) => moved.get(b.id) ?? b)
    const fcEnd = (p: readonly PlanBlock[]) => computeDay({ ...ctx, plan: p }).forecastWorkEnd
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
  return { first, plannedMin, movedMin, wakeMin: ctx.wakeMin, delayMin, waitUntilMin, shifts, shortens, parks, passed }
}
