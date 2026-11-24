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
import { blockInfos, ownHourBlock, plannedSpan, type BlockInfo } from './blocks'
import { routineCostsIn, settingsAtMinute, shownForecaster, type DayContext, type DayState } from './day'
import type { DayFacts } from './facts'
import type { Placed } from './forecast'
import { atOf, idxOfLogical, logicalSpan, type Grid } from './grid'

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
  /**
   * The blocks after the block put, when the change says which (N17, T2465 – the rest of the day, `restOf`: its own rule of „after”, also a
   * 25-hour day's doubled hour and a day to come by its plan) instead of those shown from its place; still only the ones that may be pushed.
   */
  only?: ReadonlySet<string>
  hold?: PushHold
  /** The rounds ran out before nothing moved (the result is still what the day shows with the starts written). */
  onUnsettled?: () => void
  /** The bound of rounds (`MAX_ROUNDS`; tests). */
  maxRounds?: number
  /**
   * The other blocks the change put at new places with the block `id` (a group shifted or moved to another day, D528): they keep the
   * starts the change gave them – never pushed nor written; a block of the push the count shows right before one of them, which then
   * stands later than its start, goes behind it (as a block planned no later than the block put goes behind it). Left out – one block.
   */
  placed?: ReadonlySet<string>
}

/**
 * A block that may be pushed: flexible, of the plan, with its own hour (`ownHourBlock` – not a session, a lecture, a class
 * of a „zjazd”, nor anchored), in the foreground, not waiting for „Zacznij”, not protected (a protected
 * life block or a protected category – as the variants never touch them), not begun, parked or cancelled. The same blocks
 * close a gap (D368, `gaps.ts`).
 */
export function pushable(b: BlockInfo, facts: DayFacts): boolean {
  // A block beside another one (D492, T1163) goes with its group's first block, never by itself.
  if (b.fixed || b.waits || b.bg || b.alongside != null || b.protectedLife || b.rules.protected || !ownHourBlock(b)) return false
  const f = facts.blocks.get(b.id)
  return !f || (f.startedAt == null && f.parkedAt == null && f.cancelledAt == null)
}

const byId = (placed: readonly Placed[]): Map<string, Placed> => new Map(placed.map((p) => [p.block.id, p]))

/** The index's minute has a number of its own on the Polish clock (a 25-hour day: the second 02:xx has none). */
const hasOwnMinute = (g: Grid, k: number): boolean => idxOfLogical(g, logicalMinuteOf(g.date, atOf(g, k))) === k

/**
 * The first index from `idx` on (rounded up) whose minute has a number of its own on the Polish clock – where the plan can hold a start
 * (in the doubled hour of a 25-hour day: 03:00) – at most the last start of the day (03:59, `PLAN_MAX`).
 */
export function ownMinuteIdx(g: Grid, idx: number): number {
  const lastIdx = idxOfLogical(g, PLAN_MAX)
  let k = Math.min(Math.ceil(idx), lastIdx)
  while (k < lastIdx && !hasOwnMinute(g, k)) k++
  return k
}

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
 * order to the ids): a later one moves on a minute; at the day's end (03:59, the last start `hold` allows) a pass from the
 * last one back lays each before the next without overlap where the plan can hold it, never before the blocks before it,
 * else as near as it can – then the push is unsettled (`onUnsettled`). A start the plan can hold: a minute with a number
 * of its own on the Polish clock (in the doubled hour of a 25-hour day the next one after it), not past 03:59
 * (`PLAN_MAX`; a block pushed further is shown where the forecast puts it), and as `hold` says. What the day shows with
 * the starts written is the result (counted again only when the last round or the pass changed a start). A block in the
 * background pushes nothing.
 */
export function pushApart(ctx: DayContext, state: DayState, plan: readonly PlanBlock[], id: string, opts: PushOptions = {}): PushedBlock[] {
  const g = state.grid
  const before = byId(state.forecast)
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const after = blockInfos(g, plan, state.facts, ctx.snapshot.settings, routineCostsIn(ctx), typeAt)
  const x = after.find((b) => b.id === id)
  // A block in the background takes no place of the foreground: it pushes nothing. One beside another block (D492) pushes
  // what comes after its group when it is not „w tle” by its kind (the forecast lets the group hold the foreground to its end).
  if (!x || x.start == null || x.bg) return []
  const at = opts.atMin != null ? idxOfLogical(g, opts.atMin) : x.start
  const isAfter = (b: BlockInfo) => (opts.only ? opts.only.has(b.id) : before.get(b.id)!.from >= at)
  // The block's own group stays where the block joined it (D492): only what comes after the group makes room.
  const following = after.filter((b) => b.id !== id && b.id !== x.alongside && !opts.placed?.has(b.id) && pushable(b, state.facts) && before.has(b.id) && isAfter(b))
  if (!following.length) return []
  const forecastOf = shownForecaster(ctx, state)
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const lastIdx = idxOfLogical(g, PLAN_MAX)
  /** The start the plan can hold for `b` at `idx` or after it (see above). */
  const place = (b: BlockInfo, idx: number): number => {
    const k = ownMinuteIdx(g, idx)
    return opts.hold ? Math.min(idxOfLogical(g, opts.hold(b, lm(k))), lastIdx) : k
  }
  // The starts tried: those behind the block just after its start, in the order the axis showed them.
  const behind = following.filter((b) => b.start! <= x.start!).sort((p, q) => before.get(p.id)!.from - before.get(q.id)!.from || p.start! - q.start! || (p.id < q.id ? -1 : 1))
  const start = new Map(following.map((b) => [b.id, b.start!]))
  behind.forEach((b, k) => start.set(b.id, x.start! + (k + 1) / (behind.length + 1)))
  const lifted = new Set(behind.map((b) => b.id))
  const written = new Set<string>()
  const count = () => byId(forecastOf(after.map((b) => (start.has(b.id) ? { ...b, start: start.get(b.id)! } : b))))
  // The other blocks the change put (`placed`): each holds its start – a block of the push (one lifted or written already, or shown
  // later than before the change: the change moved it there) shown right before it while it stands later than its start goes behind it
  // (fractional starts just after its start: the latest lifted nearest behind it, so the order the axis showed them stays). A block the
  // change did not touch stays when it starts before the placed one – a placed block after it may stand a transition buffer later, as any
  // block after it; one planned at the placed one's very start is on the place taken and goes behind it (T1750). Starts only grow.
  const others = opts.placed ? after.filter((b) => b.id !== id && opts.placed!.has(b.id) && b.start != null && b.alongside == null && !b.bg) : []
  const liftsOf = new Map<string, number>()
  /** The blocks to go behind a placed one in this count (pure): [the block, the placed one]. */
  const liftsIn = (shown: Map<string, Placed>): Array<[string, BlockInfo]> => {
    if (!others.length) return []
    const fg = [...shown.values()].filter((p) => !p.bg).sort((p, q) => p.from - q.from)
    const out: Array<[string, BlockInfo]> = []
    for (const q of others) {
      const i = fg.findIndex((p) => p.block.id === q.id)
      const prev = i > 0 ? fg[i - 1]!.block.id : null
      if (prev == null || fg[i]!.from <= q.start! || !start.has(prev) || start.get(prev)! > q.start!) continue
      if (!lifted.has(prev) && !written.has(prev) && fg[i - 1]!.from <= before.get(prev)!.from && start.get(prev)! < q.start!) continue
      out.push([prev, q])
    }
    return out
  }
  const holdPlaced = (shown: Map<string, Placed>): boolean => {
    const lifts = liftsIn(shown)
    for (const [prev, q] of lifts) {
      const n = (liftsOf.get(q.id) ?? 0) + 1
      liftsOf.set(q.id, n)
      start.set(prev, q.start! + 1 / 2 ** n)
      lifted.add(prev)
    }
    return lifts.length > 0
  }
  const ordered = (shown: Map<string, Placed>) => following.filter((b) => shown.has(b.id)).sort((p, q) => shown.get(p.id)!.from - shown.get(q.id)!.from || start.get(p.id)! - start.get(q.id)! || (p.id < q.id ? -1 : 1))
  // The order of the blocks after the change, as the first count places them (the lifted ones just behind the block): every
  // round writes them in it, one after another – a later count that met equal starts (ordered by the ids) changes nothing.
  let first = count()
  let k = 0
  for (; k < (opts.maxRounds ?? MAX_ROUNDS) && holdPlaced(first); k++) first = count()
  // The bound reached while a block still has to go behind a placed one: said as rounds that ran out (`onUnsettled`).
  const holding = k === (opts.maxRounds ?? MAX_ROUNDS) && liftsIn(first).length > 0
  let order = ordered(first)
  let settled = false
  let placed = first
  for (let round = 0; round < (opts.maxRounds ?? MAX_ROUNDS) && !settled; round++) {
    if (round > 0) placed = count()
    settled = true
    // A block written later may now stand right before a block the change put: it goes behind it, the order counted again.
    if (round > 0 && holdPlaced(placed)) {
      placed = count()
      order = ordered(placed)
      settled = false
    }
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
  // `placed` is the day with the starts written, unless the rounds ran out (then counted once more below).
  let fresh = settled
  // At the day's end (03:59, or the last start `hold` allows) the written starts may meet or overlap: from the last one
  // back, each where the plan holds it at or before the next one less its length – never before the blocks before it
  // (after their ends, when it stands after them already; after their starts at least). What cannot be laid so stays
  // as near as it can, and the push is said unsettled.
  const ends = order.filter((b) => written.has(b.id))
  const held = (b: BlockInfo, k: number) => hasOwnMinute(g, k) && (!opts.hold || idxOfLogical(g, opts.hold(b, lm(k))) === k)
  const atOrBefore = (b: BlockInfo, idx: number, floor: number): number | null => {
    for (let k = Math.floor(idx); k >= floor; k--) if (held(b, k)) return k
    return null
  }
  let overflow = false
  for (let k = ends.length - 2; k >= 0; k--) {
    const b = ends[k]!
    const now = start.get(b.id)!
    const next = start.get(ends[k + 1]!.id)!
    if (now + b.durationMin <= next) continue
    // The blocks before it in the day: the block put, those of the order before it, the others shown earlier – their
    // starts keep the chain's order (flexible ones), their ends (any in the foreground) the plan without overlap.
    const shownAt = placed.get(b.id)?.from ?? Number.POSITIVE_INFINITY
    const rank = order.indexOf(b)
    const ahead = after.filter((o) => o.id !== b.id && !o.bg && o.start != null && (o.id === x.id || (order.includes(o) ? order.indexOf(o) < rank : (placed.get(o.id)?.from ?? Number.POSITIVE_INFINITY) < shownAt)))
    const startOf = (o: BlockInfo) => start.get(o.id) ?? o.start!
    const afterStarts = Math.max(...ahead.filter((o) => o.id === x.id || (!o.fixed && !o.waits)).map(startOf)) + 1
    const afterEnds = Math.max(...ahead.map((o) => startOf(o) + o.durationMin))
    const to = atOrBefore(b, Math.min(now, next - b.durationMin), afterEnds) ?? atOrBefore(b, Math.min(now, next - 1), now >= afterEnds ? afterEnds : afterStarts) ?? now
    if (to + b.durationMin > next) overflow = true
    if (to !== now) {
      start.set(b.id, to)
      fresh = false
    }
  }
  if (!settled || overflow || holding) opts.onUnsettled?.()
  if (!fresh) placed = count()
  const planned = new Map(plan.map((b) => [b.id, b.startMin]))
  return order
    .filter((b) => written.has(b.id) && start.get(b.id) !== b.start && placed.has(b.id))
    .map((b) => {
      const p = placed.get(b.id)!
      const s = start.get(b.id)!
      return { id: b.id, fromMin: planned.get(b.id) ?? lm(b.start!), startMin: lm(s), shown: logicalSpan(g, p.from, p.to), planned: logicalSpan(g, s, s + b.durationMin) }
    })
}

/**
 * Where the blocks of the day stand on its axis after a change, when that is not where they stand now (by id): today's
 * axis shows the forecast (`state.forecast` → the forecast of `plan`), another day's and a template's its plan – every block
 * that moves, the pushed ones, those anchored to them, those a protected or fixed one lets through.
 */
export function axisMoves(ctx: DayContext, state: DayState, plan: readonly PlanBlock[], axis: 'forecast' | 'plan'): Map<string, { startMin: number; endMin: number }> {
  const g = state.grid
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const out = new Map<string, { startMin: number; endMin: number }>()
  if (axis === 'forecast') {
    const now = byId(state.forecast)
    for (const p of shownForecaster(ctx, state)(blockInfos(g, plan, state.facts, ctx.snapshot.settings, routineCostsIn(ctx), typeAt))) {
      const was = now.get(p.block.id)
      if (!was || was.from !== p.from || was.to !== p.to) out.set(p.block.id, logicalSpan(g, p.from, p.to))
    }
    return out
  }
  const spans = (p: readonly PlanBlock[]) => {
    const infos = blockInfos(g, p, state.facts, ctx.snapshot.settings, routineCostsIn(ctx), typeAt)
    const ids = new Map(infos.map((b) => [b.id, b]))
    return new Map(infos.flatMap((b) => {
      const s = b.inPlan ? plannedSpan(b, ids) : null
      return s ? [[b.id, s] as const] : []
    }))
  }
  const now = spans(ctx.plan)
  for (const [id, s] of spans(plan)) {
    const was = now.get(id)
    if (!was || was.start !== s.start || was.end !== s.end) out.set(id, logicalSpan(g, s.start, s.end))
  }
  return out
}

/** The plan with `b` in place of its block of the same id, or added (the plan after a change of one block). */
export const withBlock = (plan: readonly PlanBlock[], b: PlanBlock): PlanBlock[] => (plan.some((x) => x.id === b.id) ? plan.map((x) => (x.id === b.id ? b : x)) : [...plan, b])

/**
 * The bar's line after a push (D367): „Przesunięto 3 bloki”; `hidden` – how many of them the window hides (an unchecked
 * calendar, D419, T1003): „Przesunięto 3 bloki (w tym 1 ukryty)”.
 */
export const pushedText = (n: number, hidden = 0): string => `Przesunięto ${countLabel(n, 'blok', 'bloki', 'bloków')}${hidden > 0 ? ` (w tym ${countLabel(Math.min(hidden, n), 'ukryty', 'ukryte', 'ukrytych')})` : ''}`
