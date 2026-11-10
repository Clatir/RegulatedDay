/**
 * Rozsuwanie (D367, FBL2a): a block put on a taken place – a new one, one dragged to a new start, one lengthened by its
 * edge – makes room for itself. The flexible blocks after it get new planned starts: where the forecast puts them once
 * the block stands there, by the forecast's own rule (`shownForecast` – they follow the block before them with the
 * transition buffer between categories, and one that would hit a fixed block jumps behind it), not a copy of it. Fixed
 * blocks, blocks waiting for „Zacznij”, protected ones, begun ones, those anchored to another (they follow their anchor),
 * those in the background and those without an hour of their own stay. What lands past the boundary or the bedtime stays
 * there: the marker of variants judges it by its own conditions (the push is its trigger – `widget.ts`). Pure and
 * deterministic: the window shows the result while the block is dragged and writes the same once it is let go.
 */
import { countLabel } from '../format'
import type { PlanBlock } from '../model/plan'
import { PLAN_MAX } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { blockInfos, ownHourBlock, type BlockInfo } from './blocks'
import { settingsAtMinute, shownForecast, type DayContext, type DayState } from './day'
import type { DayFacts } from './facts'
import type { Placed } from './forecast'
import { atOf, idxOfLogical } from './grid'

/** A block the change pushes: its planned start before (logical minute) and its new place on the axis. */
export interface PushedBlock {
  id: string
  fromMin: number
  startMin: number
  endMin: number
}

/**
 * A block that may be pushed: flexible, of the plan, with its own hour (`ownHourBlock` – not a session, a lecture, a class
 * of a „zjazd”, the second shift, nor anchored), in the foreground, not waiting for „Zacznij”, not protected (a protected
 * life block or a protected category – as the variants never touch them), not begun, parked or cancelled.
 */
function pushable(b: BlockInfo, facts: DayFacts): boolean {
  if (b.fixed || b.waits || b.bg || b.protectedLife || b.rules.protected || !ownHourBlock(b)) return false
  const f = facts.blocks.get(b.id)
  return !f || (f.startedAt == null && f.parkedAt == null && f.cancelledAt == null)
}

const byId = (placed: readonly Placed[]): Map<string, Placed> => new Map(placed.map((p) => [p.block.id, p]))

/**
 * The blocks pushed when the block `id` stands as `plan` (the day's plan after the change: the block moved, lengthened
 * or added) holds it, in the order of the day. `atMin` – where the block stands on the axis after the change when that
 * is not its planned start (its bottom edge dragged while it is shown later than its plan); by default its planned start.
 *
 * The blocks after it are those shown at or after that place before the change. Each one planned no later than the
 * block goes behind it (else the forecast, which keeps the planned order, would put the block behind it); then the
 * forecast places the day as changed, and a block is written where it now stands when it moved later, when it had to go
 * behind the block, or when its planned start would put it before a block written earlier (the order stays the
 * forecast's). Nothing past the logical day: such a block keeps its plan. A block in the background pushes nothing.
 */
export function pushApart(ctx: DayContext, state: DayState, plan: readonly PlanBlock[], id: string, atMin?: number): PushedBlock[] {
  const g = state.grid
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const infos = (p: readonly PlanBlock[]) => blockInfos(g, p, state.facts, ctx.snapshot.settings, typeAt)
  const before = byId(shownForecast(ctx, state, infos(ctx.plan)))
  const after = infos(plan)
  const x = after.find((b) => b.id === id)
  // A block in the background takes no place of the foreground: it pushes nothing.
  if (!x || x.start == null || x.bg) return []
  const at = atMin != null ? idxOfLogical(g, atMin) : x.start
  const following = after.filter((b) => b.id !== id && pushable(b, state.facts) && before.has(b.id) && before.get(b.id)!.from >= at)
  if (!following.length) return []
  const behind = new Set(following.filter((b) => b.start! <= x.start!).map((b) => b.id))
  const tried = byId(shownForecast(ctx, state, after.map((b) => (behind.has(b.id) ? { ...b, start: x.start! + 1 } : b))))
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const out: PushedBlock[] = []
  let last = Number.NEGATIVE_INFINITY
  for (const b of following.filter((f) => tried.has(f.id)).sort((p, q) => tried.get(p.id)!.from - tried.get(q.id)!.from || (p.id < q.id ? -1 : 1))) {
    const p = tried.get(b.id)!
    const moves = behind.has(b.id) || p.from > before.get(b.id)!.from || b.start! <= last
    if (!moves || p.from === b.start) continue
    const startMin = lm(p.from)
    if (startMin > PLAN_MAX) continue
    out.push({ id: b.id, fromMin: lm(b.start!), startMin, endMin: lm(p.to) })
    last = p.from
  }
  return out
}

/** The plan with the pushed blocks at their new starts. */
export function pushedPlan(plan: readonly PlanBlock[], pushed: readonly PushedBlock[]): PlanBlock[] {
  const to = new Map(pushed.map((p) => [p.id, p.startMin]))
  return plan.map((b) => (to.has(b.id) ? { ...b, startMin: to.get(b.id)! } : b))
}

/** The bar's line after a push (D367): „Przesunięto 3 bloki”. */
export const pushedText = (n: number): string => `Przesunięto ${countLabel(n, 'blok', 'bloki', 'bloków')}`
