/**
 * Rozsuwanie (D367, FBL2a): a block put on a taken place – a new one, one dragged to a new start, one lengthened by its
 * edge – makes room for itself. The flexible blocks after it get new planned starts: where the forecast puts them once
 * the block stands there, by the forecast's own rule (`shownForecaster` – they follow the block before them with the
 * transition buffer between categories, and one that would hit a fixed block jumps behind it), not a copy of it. Fixed
 * blocks, blocks waiting for „Zacznij”, protected ones, begun ones, those anchored to another (they follow their anchor),
 * those in the background and those without an hour of their own stay. What lands past the boundary or the bedtime stays
 * there: the marker of variants judges it by its own conditions (the push is its trigger – `widget.ts`). Pure and
 * deterministic: the window shows the result while the block is dragged and writes the same once it is let go – what is
 * written is what the day shows after it (counted again until nothing moves, then once more for what is shown).
 */
import { countLabel } from '../format'
import type { PlanBlock } from '../model/plan'
import { PLAN_MAX } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { blockInfos, ownHourBlock, type BlockInfo } from './blocks'
import { settingsAtMinute, shownForecaster, type DayContext, type DayState } from './day'
import type { DayFacts } from './facts'
import type { Placed } from './forecast'
import { atOf, idxOfLogical, logicalSpan } from './grid'

/** A block the change pushes: its planned start before, the one the change writes and where the day then shows it (logical minutes). */
export interface PushedBlock {
  id: string
  fromMin: number
  startMin: number
  /** On an axis of the forecast (today): from its new start – later only past the last start it can have (03:59). */
  shown: { startMin: number; endMin: number }
  /** On an axis of the plan (a day to come, a template): its new start and its length. */
  planned: { startMin: number; endMin: number }
}

/**
 * Where else than its hour the plan cannot hold a block (D372, a template: a morning the day's wake moves): the start
 * the plan can show it at for a place from `startMin` on (logical minutes) – the first one at or after it, and past the
 * last one it can have at the end of the day, that last one.
 */
export type PushHold = (b: BlockInfo, startMin: number) => number

export interface PushOptions {
  /** Where the block stands on the axis after the change when that is not its planned start (its bottom edge). */
  atMin?: number
  hold?: PushHold
  /** The rounds ran out before nothing moved (the result is still what the day shows with the starts written). */
  onUnsettled?: () => void
  /** The bound of rounds (`MAX_ROUNDS`; tests). */
  maxRounds?: number
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

/** The rounds of counting the changed day again: a start only grows each round, so a few do (a bound for safety). */
const MAX_ROUNDS = 40

/**
 * The blocks pushed when the block `id` stands as `plan` (the day's plan after the change: the block moved, lengthened
 * or added) holds it, in the order of the day.
 *
 * The blocks after it are those shown at or after its place before the change (`state.forecast`; the bottom edge –
 * `atMin`). Each one planned no later than the block goes behind it, in the order the axis showed them (fractional starts
 * just after the block's: the forecast keeps the planned order). Then the changed day is counted until nothing moves: a
 * block is written where the forecast now shows it when it moved later, when it had to go behind the block, once written,
 * or when its planned start would come before a block written before it – the blocks that stay (protected, begun) keep
 * their places in the forecast's order. Starts written one after another always differ (an equal start would leave the
 * order to the ids): a later one moves on a minute, and at the day's end an earlier one goes back a minute. A start the
 * plan can hold: a minute with a number of its own on the Polish clock (in the doubled hour of a 25-hour day the next
 * one after it), not past 03:59 (`PLAN_MAX`; a block pushed further is shown where the forecast puts it), and as `hold`
 * says. Last, the day is counted once more with the starts written: what it shows is the result. A block in the
 * background pushes nothing.
 */
export function pushApart(ctx: DayContext, state: DayState, plan: readonly PlanBlock[], id: string, opts: PushOptions = {}): PushedBlock[] {
  const g = state.grid
  const before = byId(state.forecast)
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const after = blockInfos(g, plan, state.facts, ctx.snapshot.settings, typeAt)
  const x = after.find((b) => b.id === id)
  // A block in the background takes no place of the foreground: it pushes nothing.
  if (!x || x.start == null || x.bg) return []
  const at = opts.atMin != null ? idxOfLogical(g, opts.atMin) : x.start
  const following = after.filter((b) => b.id !== id && pushable(b, state.facts) && before.has(b.id) && before.get(b.id)!.from >= at)
  if (!following.length) return []
  const forecastOf = shownForecaster(ctx, state)
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const lastIdx = idxOfLogical(g, PLAN_MAX)
  const own = (k: number) => idxOfLogical(g, lm(k)) === k
  /** The start the plan can hold for `b` at `idx` or after it (see above). */
  const place = (b: BlockInfo, idx: number): number => {
    let k = Math.min(Math.ceil(idx), lastIdx)
    while (k < lastIdx && !own(k)) k++
    return opts.hold ? Math.min(idxOfLogical(g, opts.hold(b, lm(k))), lastIdx) : k
  }
  // The starts tried: those behind the block just after its start, in the order the axis showed them.
  const behind = following.filter((b) => b.start! <= x.start!).sort((p, q) => before.get(p.id)!.from - before.get(q.id)!.from || p.start! - q.start! || (p.id < q.id ? -1 : 1))
  const start = new Map(following.map((b) => [b.id, b.start!]))
  behind.forEach((b, k) => start.set(b.id, x.start! + (k + 1) / (behind.length + 1)))
  const lifted = new Set(behind.map((b) => b.id))
  const written = new Set<string>()
  const count = () => byId(forecastOf(after.map((b) => (start.has(b.id) ? { ...b, start: start.get(b.id)! } : b))))
  // The order of the blocks after the change, as the first count places them (the lifted ones just behind the block): every
  // round writes them in it, one after another – a later count that met equal starts (ordered by the ids) changes nothing.
  const first = count()
  const order = following.filter((b) => first.has(b.id)).sort((p, q) => first.get(p.id)!.from - first.get(q.id)!.from || start.get(p.id)! - start.get(q.id)! || (p.id < q.id ? -1 : 1))
  let settled = false
  for (let round = 0; round < (opts.maxRounds ?? MAX_ROUNDS) && !settled; round++) {
    const placed = round === 0 ? first : count()
    settled = true
    let last = Number.NEGATIVE_INFINITY
    for (const b of order) {
      if (!placed.has(b.id)) continue
      const p = placed.get(b.id)!
      const now = start.get(b.id)!
      if (!(written.has(b.id) || lifted.has(b.id) || p.from > before.get(b.id)!.from || now <= last)) continue
      let to = place(b, p.from)
      if (to <= last) to = place(b, last + 1)
      written.add(b.id)
      if (to !== now) {
        start.set(b.id, to)
        settled = false
      }
      last = to
    }
  }
  if (!settled) opts.onUnsettled?.()
  // At the day's end the starts may meet at 03:59: from the last one back, each a minute before the next.
  const ends = order.filter((b) => written.has(b.id))
  for (let k = ends.length - 2; k >= 0; k--) {
    const next = start.get(ends[k + 1]!.id)!
    if (start.get(ends[k]!.id)! < next) continue
    let back = next - 1
    while (back > 0 && !own(back)) back--
    start.set(ends[k]!.id, back)
  }
  const placed = count()
  const planned = new Map(plan.map((b) => [b.id, b.startMin]))
  return order
    .filter((b) => written.has(b.id) && start.get(b.id) !== b.start && placed.has(b.id))
    .sort((p, q) => order.indexOf(p) - order.indexOf(q))
    .map((b) => {
      const p = placed.get(b.id)!
      const s = start.get(b.id)!
      return { id: b.id, fromMin: planned.get(b.id) ?? lm(b.start!), startMin: lm(s), shown: logicalSpan(g, p.from, p.to), planned: logicalSpan(g, s, s + b.durationMin) }
    })
}

/** The plan with `b` in place of its block of the same id, or added (the plan after a change of one block). */
export const withBlock = (plan: readonly PlanBlock[], b: PlanBlock): PlanBlock[] => (plan.some((x) => x.id === b.id) ? plan.map((x) => (x.id === b.id ? b : x)) : [...plan, b])

/** The bar's line after a push (D367): „Przesunięto 3 bloki”. */
export const pushedText = (n: number): string => `Przesunięto ${countLabel(n, 'blok', 'bloki', 'bloków')}`
