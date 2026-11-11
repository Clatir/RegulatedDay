/**
 * Domykanie luk (D368, D373, FBL2b): when a block ends before its planned end, is removed or shortened and at least 10 min
 * stand empty before the next flexible block, the bar asks quietly „Luka 20 min · Przesuń resztę wcześniej · Zostaw”.
 *
 * Where time was freed is a trigger: from the day's log (an end before the planned end – „Dalej”, „Skończyłem”, „Usuń” of
 * a begun block, an automatic end; a running block shortened by its edge, `block.shorten`; a block not begun cancelled or
 * parked by you) – the same on every computer – and from the main window of this computer (a block not begun removed or
 * shortened in the plan: `freedByEdit`, IPC `planGap`). A trigger asks about the first block of the foreground after its
 * place, when that one may be moved (`pushable`: flexible, its own hour, not protected, not begun); the gap counts from
 * now or the end of the block before it, whichever is later, and at most what the trigger freed (a break you planned
 * before it stays). It asks until a block of the foreground starts after it (the next one, or one in the gap – it is
 * filled), until it is answered or less than 10 min are left; one question at a time – the nearest. Only today.
 *
 * „Przesuń resztę wcześniej” (`closeGap`, the mirror of `pushApart`): the flexible blocks from the gap up to the nearest
 * fixed block (a session, classes) – each as much earlier as the gap, never before now nor before the block before it, a
 * fixed one never moved; protected and begun blocks stay, the rest goes around them. What is written is where the forecast
 * then shows them (counted again until nothing moves). Pure and deterministic.
 */
import { durationLabel } from '../format'
import type { PlanBlock } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { plannedSpan } from './blocks'
import { shownForecaster, type DayContext, type DayState } from './day'
import { compareOrder, type EventOrder } from './facts'
import type { Placed } from './forecast'
import { atOf, idxOfLogical, logicalSpan } from './grid'
import { pushable, type PushedBlock } from './pushApart'
import { plannedEndOf } from './timer'

/** The least gap the bar asks about (D368): 5 min is none. */
export const GAP_MIN = 10

/** Where time was freed in the day: the question looks for the next block from `place` on. */
export interface GapTrigger {
  /** Grid index. */
  place: number
  /** How long it freed (minutes): the gap asked about is never longer. */
  freedMin: number
  /** When it happened: a run of the foreground begun after it (not in its own click), at or after its place, ends its question. */
  order: EventOrder
}

/** The gap the bar asks about (its line `gap:<day>:<block>:<place>`). */
export interface Gap {
  id: string
  /** The flexible block after the gap. */
  block: string
  minutes: number
  /** Where that block stands now on the axis, and where it may start once the gap is closed (logical minutes). */
  startMin: number
  fromMin: number
}

/** The id of a gap's question: the day, the block after it and the place of its trigger (logical minute). */
export const gapId = (date: string, block: string, placeMin: number): string => `gap:${date}:${block}:${placeMin}`

/** The bar's text of a gap (D368): „Luka 20 min”, „Luka 1 h 20 min”. */
export const gapText = (minutes: number): string => `Luka ${durationLabel(minutes)}`

/** Ends that come when the plan says (a fixed block's window): never early. */
const PLANNED_ENDS = new Set(['plan', 'fixedNoReaction'])

/** A trigger of the main window (no event of the log): its instant on this computer. */
export const instantOrder = (at: number): EventOrder => ({ instant: at, at, l: at, c: '', n: -1 })

/** The triggers the day's log holds (the same on every computer). */
export function logGapTriggers(state: DayState): GapTrigger[] {
  const g = state.grid
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const out: GapTrigger[] = []
  for (const [id, f] of state.facts.blocks) {
    const info = byId.get(id)
    if (!info) continue
    // Only the foreground's time: a block that ran in the background frees none.
    const fg = !(f.runs.at(-1)?.bg ?? info.bg)
    if (fg && f.startedAt != null && f.endedAt != null && f.endOrder && !PLANNED_ENDS.has(f.endRule ?? '')) {
      const freed = plannedEndOf(state, info, f) - f.endedAt
      if (freed >= GAP_MIN) out.push({ place: f.endedAt, freedMin: freed, order: f.endOrder })
    }
    if (fg) for (const c of f.endChanges) if (c.minutes <= -GAP_MIN) out.push({ place: c.at, freedMin: -c.minutes, order: c.order })
    // Cancelled or parked by you before it began (the bar's „Odwołaj”, „Zaparkuj”): its place from then on.
    const gone = f.startedAt == null ? (f.cancelledAt ?? f.parkedAt) : null
    if (gone != null && f.goneRule === 'user' && !info.bg) {
      const span = plannedSpan(info, byId)
      const place = span ? Math.max(span.start, gone) : null
      if (span && place != null && span.end - place >= GAP_MIN) out.push({ place, freedMin: span.end - place, order: instantOrder(atOf(g, gone)) })
    }
  }
  return out
}

/** A block of the foreground began after the trigger, at or after its place (not in its own click – „Dalej”): its question is over. */
function over(state: DayState, t: GapTrigger): boolean {
  for (const f of state.facts.blocks.values())
    for (const r of f.runs) if (!r.bg && r.from >= t.place && compareOrder(r.begun, t.order) > 0 && !(r.begun.c === t.order.c && r.begun.at === t.order.at)) return true
  return false
}

/** The foreground of the forecast in the order of the axis. */
const foreground = (state: DayState): Placed[] => state.forecast.filter((p) => !p.bg).sort((a, b) => a.from - b.from || (a.block.id < b.block.id ? -1 : 1))

/** The gap a trigger opens before the first block of the foreground after its place – one that may be moved. */
function gapOf(state: DayState, fg: readonly Placed[], t: GapTrigger): { b: Placed; minutes: number } | null {
  const k = fg.findIndex((p) => !p.running && p.from >= t.place)
  const b = fg[k]
  if (!b || !pushable(b.block, state.facts)) return null
  let prev = state.now
  for (const p of fg.slice(0, k)) prev = Math.max(prev, p.to)
  const minutes = Math.min(b.from - prev, t.freedMin)
  return minutes >= GAP_MIN ? { b, minutes } : null
}

/** A gap before `block` answered after the trigger happened – „Zostaw” or „Przesuń” covers the triggers that stood then. */
function answered(state: DayState, block: string, t: GapTrigger): boolean {
  const prefix = `gap:${state.grid.date}:${block}:`
  for (const [q, a] of state.facts.answers) if (q.startsWith(prefix) && /^\d+$/.test(q.slice(prefix.length)) && a.at >= t.order.at) return true
  return false
}

/**
 * The gap the bar asks about now (D368, D373), or null: of the triggers of the log and `extra` (the main window's), still
 * asking and not answered, the nearest gap whose closing moves its block; for one block the longest gap (the latest
 * trigger at equal length). The modes it waits in (a session, classes, the night) and the day (only today) are the bar's.
 */
export function gapNow(ctx: DayContext, state: DayState, extra: readonly GapTrigger[] = []): Gap | null {
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const fg = foreground(state)
  const found = new Map<string, { b: Placed; minutes: number; t: GapTrigger }>()
  for (const t of [...logGapTriggers(state), ...extra]) {
    if (over(state, t)) continue
    const x = gapOf(state, fg, t)
    if (!x || answered(state, x.b.block.id, t)) continue
    const was = found.get(x.b.block.id)
    if (!was || x.minutes > was.minutes || (x.minutes === was.minutes && compareOrder(t.order, was.t.order) > 0)) found.set(x.b.block.id, { ...x, t })
  }
  for (const c of [...found.values()].sort((a, b) => a.b.from - b.b.from)) {
    const gap: Gap = { id: gapId(g.date, c.b.block.id, lm(c.t.place)), block: c.b.block.id, minutes: c.minutes, startMin: lm(c.b.from), fromMin: lm(c.b.from - c.minutes) }
    if (closeGap(ctx, state, gap).some((p) => p.id === gap.block)) return gap
  }
  return null
}

/** The rounds of counting the day again after a gap closed (a start only falls, so a couple do – a bound for safety). */
const MAX_ROUNDS = 10

/**
 * „Przesuń resztę wcześniej” (D368, D373): the blocks whose planned starts change when the gap before `gap.block` closes –
 * the flexible blocks of the foreground from it up to the nearest fixed block (or one waiting for „Zacznij”), each tried
 * `gap.minutes` earlier than it stands, never before now nor before a block that stays before it (protected, begun,
 * anchored – kept in the forecast's order); written where the forecast then shows it, when it moved earlier, or where it
 * stands when its plan would no longer keep the order. Nothing past the fixed block changes. Empty: the block cannot move.
 */
export function closeGap(ctx: DayContext, state: DayState, gap: Pick<Gap, 'block' | 'minutes'>): PushedBlock[] {
  const g = state.grid
  const fg = foreground(state)
  const k = fg.findIndex((p) => p.block.id === gap.block)
  if (k < 0) return []
  const chain: Placed[] = []
  for (const p of fg.slice(k)) {
    if (p.block.fixed || p.block.waits) break
    chain.push(p)
  }
  const movable = new Set(chain.filter((p) => !p.running && pushable(p.block, state.facts)).map((p) => p.block.id))
  if (!movable.has(gap.block)) return []
  const before = new Map(state.forecast.map((p) => [p.block.id, p]))
  const forecastOf = shownForecaster(ctx, state)
  const count = (starts: ReadonlyMap<string, number>) => new Map(forecastOf(state.blocks.map((b) => (starts.has(b.id) ? { ...b, start: starts.get(b.id)! } : b))).map((p) => [p.block.id, p]))
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  // A start the plan can hold: a minute with a number of its own (a 25-hour day's doubled hour – the next one after it).
  const lastIdx = g.length - 1
  const place = (idx: number): number => {
    let x = Math.ceil(idx)
    while (x < lastIdx && idxOfLogical(g, lm(x)) !== x) x++
    return x
  }
  // The starts tried: as much earlier as the gap, after the block that stays before (its planned start keeps the order).
  const tried = new Map<string, number>()
  let last = Number.NEGATIVE_INFINITY
  for (const p of chain) {
    if (movable.has(p.block.id)) {
      const s = Math.max(p.from - gap.minutes, state.now, last + 0.5)
      tried.set(p.block.id, s)
      last = s
    } else if (p.block.start != null) last = Math.max(last, p.block.start)
  }
  let placed = count(tried)
  let written = new Map<string, number>()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const next = new Map<string, number>()
    let lastStart = Number.NEGATIVE_INFINITY
    for (const p of chain) {
      const b = p.block
      if (!movable.has(b.id)) {
        if (b.start != null) lastStart = Math.max(lastStart, b.start)
        continue
      }
      const q = placed.get(b.id)
      const was = before.get(b.id)!
      const earlier = !!q && q.from < was.from
      // Not moved, its plan still in order: it keeps it.
      if (!earlier && b.start! > lastStart) {
        lastStart = b.start!
        continue
      }
      let to = place(earlier ? q!.from : was.from)
      if (to <= lastStart) to = place(lastStart + 1)
      if (to !== b.start) next.set(b.id, to)
      lastStart = to
    }
    const same = next.size === written.size && [...next].every(([id, s]) => written.get(id) === s)
    written = next
    placed = count(written)
    if (same) break
  }
  const planned = new Map(ctx.plan.map((b) => [b.id, b.startMin]))
  return chain
    .filter((p) => written.has(p.block.id) && placed.has(p.block.id))
    .map((p) => {
      const s = written.get(p.block.id)!
      const q = placed.get(p.block.id)!
      return { id: p.block.id, fromMin: planned.get(p.block.id) ?? lm(p.block.start!), startMin: lm(s), shown: logicalSpan(g, q.from, q.to), planned: logicalSpan(g, s, s + p.block.durationMin) }
    })
}

/**
 * What a change of today's plan in the main window frees (D368: a block not begun removed – `after` null – or shortened –
 * its end earlier with a shorter length, the field „Długość” or the bottom edge; never a move nor the top edge): the place
 * on the axis from which the next block is looked for and the minutes freed, counted on the day before the change. Null:
 * nothing to ask about (a begun block – the log tells; less than 10 min; in the past).
 */
export function freedByEdit(state: DayState, was: PlanBlock, after: PlanBlock | null): { placeMin: number; freedMin: number } | null {
  const f = state.facts.blocks.get(was.id)
  if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) return null
  const p = state.forecast.find((x) => x.block.id === was.id)
  if (!p || p.bg || p.to <= state.now) return null
  let place: number
  let freed: number
  if (!after) {
    place = Math.max(p.from, state.now)
    freed = p.to - place
  } else {
    if (was.startMin == null || after.startMin == null) return null
    const cut = Math.min(was.durationMin - after.durationMin, was.startMin + was.durationMin - (after.startMin + after.durationMin))
    if (cut <= 0) return null
    place = p.to - cut
    freed = cut
  }
  if (freed < GAP_MIN) return null
  return { placeMin: logicalMinuteOf(state.grid.date, atOf(state.grid, place)), freedMin: freed }
}
