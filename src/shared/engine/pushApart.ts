/**
 * Rozsuwanie (D367, FBL2a): a block put on a taken place – a new one, one dragged to a new start, one lengthened by its
 * edge – makes room for itself. The flexible blocks after it get new planned starts: where the forecast puts them once
 * the block stands there, by the forecast's own rule (`shownForecast` – they follow the block before them with the
 * transition buffer between categories, and one that would hit a fixed block jumps behind it), not a copy of it. Fixed
 * blocks, blocks waiting for „Zacznij”, protected ones, begun ones, those anchored to another (they follow their anchor),
 * those in the background and those without an hour of their own stay. What lands past the boundary or the bedtime stays
 * there: the marker of variants judges it by its own conditions (the push is its trigger – `widget.ts`). Pure and
 * deterministic: the window shows the result while the block is dragged and writes the same once it is let go – what is
 * written is what the forecast shows after it (counted again until nothing moves).
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

/** A block the change pushes: its planned start before, the one the change writes and where the day then shows it (logical minutes). */
export interface PushedBlock {
  id: string
  fromMin: number
  startMin: number
  /** Its place on the axis after the change: from its new start – later only past the day's last minute (`PLAN_MAX`). */
  shown: { startMin: number; endMin: number }
}

/**
 * Where else than its hour the plan cannot hold a block (D372, a template: a morning the day's wake moves) – the first
 * start from `startMin` on (logical minute) the plan can show it at; never earlier.
 */
export type PushHold = (b: BlockInfo, startMin: number) => number

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

/** The rounds of counting the changed day again: a start only grows each round, so a few do (a bound for safety). */
const MAX_ROUNDS = 40

/**
 * The blocks pushed when the block `id` stands as `plan` (the day's plan after the change: the block moved, lengthened
 * or added) holds it, in the order of the day. `atMin` – where the block stands on the axis after the change when that
 * is not its planned start (its bottom edge dragged while it is shown later than its plan); by default its planned start.
 *
 * The blocks after it are those shown at or after that place before the change (`state.forecast`). Each one planned no
 * later than the block goes behind it, in the order the axis showed them (else the forecast, which keeps the planned
 * order, would put the block behind it). Then the changed day is counted until nothing moves: a block is written where
 * the forecast now shows it when it moved later, when it had to go behind the block, once written, or when its planned
 * start would come before a block written before it – so the blocks that stay (protected, begun) keep their places in
 * the forecast's order, and what is written is what the day shows after it. A start the plan can hold: a minute with a
 * number of its own on the Polish clock (in the doubled hour of a 25-hour day the next one after it), never past the
 * day's last minute (a block pushed further is written at 03:59 and shown where the forecast puts it), and where `hold`
 * allows. A block in the background pushes nothing.
 */
export function pushApart(ctx: DayContext, state: DayState, plan: readonly PlanBlock[], id: string, atMin?: number, hold?: PushHold): PushedBlock[] {
  const g = state.grid
  const before = byId(state.forecast)
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const after = blockInfos(g, plan, state.facts, ctx.snapshot.settings, typeAt)
  const x = after.find((b) => b.id === id)
  // A block in the background takes no place of the foreground: it pushes nothing.
  if (!x || x.start == null || x.bg) return []
  const at = atMin != null ? idxOfLogical(g, atMin) : x.start
  const following = after.filter((b) => b.id !== id && pushable(b, state.facts) && before.has(b.id) && before.get(b.id)!.from >= at)
  if (!following.length) return []
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const lastIdx = idxOfLogical(g, PLAN_MAX)
  /** The first start from `idx` on the plan can hold for `b` (see above). */
  const place = (b: BlockInfo, idx: number): number => {
    let k = Math.min(Math.ceil(idx), lastIdx)
    while (k < lastIdx && idxOfLogical(g, lm(k)) !== k) k++
    if (hold) k = Math.min(Math.max(k, idxOfLogical(g, hold(b, lm(k)))), lastIdx)
    return k
  }
  // The starts tried: those behind the block just after its start, in the order the axis showed them.
  const behind = following.filter((b) => b.start! <= x.start!).sort((p, q) => before.get(p.id)!.from - before.get(q.id)!.from || p.start! - q.start! || (p.id < q.id ? -1 : 1))
  const start = new Map(following.map((b) => [b.id, b.start!]))
  behind.forEach((b, k) => start.set(b.id, x.start! + (k + 1) / (behind.length + 1)))
  const lifted = new Set(behind.map((b) => b.id))
  const written = new Set<string>()
  let placed = before
  for (let round = 0; round < MAX_ROUNDS; round++) {
    placed = byId(shownForecast(ctx, state, after.map((b) => (start.has(b.id) ? { ...b, start: start.get(b.id)! } : b))))
    let changed = false
    let last = Number.NEGATIVE_INFINITY
    const order = following.filter((b) => placed.has(b.id)).sort((p, q) => placed.get(p.id)!.from - placed.get(q.id)!.from || start.get(p.id)! - start.get(q.id)! || (p.id < q.id ? -1 : 1))
    for (const b of order) {
      const p = placed.get(b.id)!
      const now = start.get(b.id)!
      if (!(written.has(b.id) || lifted.has(b.id) || p.from > before.get(b.id)!.from || now <= last)) continue
      const to = place(b, p.from)
      written.add(b.id)
      if (to !== now) {
        start.set(b.id, to)
        changed = true
      }
      last = to
    }
    if (!changed) break
  }
  const planned = new Map(plan.map((b) => [b.id, b.startMin]))
  return following
    .filter((b) => written.has(b.id) && start.get(b.id) !== b.start && placed.has(b.id))
    .sort((p, q) => placed.get(p.id)!.from - placed.get(q.id)!.from || (p.id < q.id ? -1 : 1))
    .map((b) => {
      const p = placed.get(b.id)!
      return { id: b.id, fromMin: planned.get(b.id) ?? lm(b.start!), startMin: lm(start.get(b.id)!), shown: { startMin: lm(p.from), endMin: lm(p.to) } }
    })
}

/** The plan with `b` in place of its block of the same id, or added (the plan after a change of one block). */
export const planWith = (plan: readonly PlanBlock[], b: PlanBlock): PlanBlock[] => (plan.some((x) => x.id === b.id) ? plan.map((x) => (x.id === b.id ? b : x)) : [...plan, b])

/** The plan with the pushed blocks at their new starts. */
export function pushedPlan(plan: readonly PlanBlock[], pushed: readonly PushedBlock[]): PlanBlock[] {
  const to = new Map(pushed.map((p) => [p.id, p.startMin]))
  return plan.map((b) => (to.has(b.id) ? { ...b, startMin: to.get(b.id)! } : b))
}

/** The bar's line after a push (D367): „Przesunięto 3 bloki”. */
export const pushedText = (n: number): string => `Przesunięto ${countLabel(n, 'blok', 'bloki', 'bloków')}`
