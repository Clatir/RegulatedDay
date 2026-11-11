/**
 * Domykanie luk (D368, D373, D375, FBL2b): when a block ends before its planned end, is removed or shortened and at least
 * 10 min stand empty before the next flexible block, the bar asks quietly „Luka 20 min · Przesuń resztę wcześniej · Zostaw”.
 *
 * Where time was freed is a trigger, all from the day's log – the same on every computer and after a restart, each with the
 * id of its event: an end before the planned end („Dalej”, „Skończyłem”, „Usuń” of a begun block, a paused one parked, an
 * automatic end), a running block shortened by its edge (`block.shorten`), a block not begun cancelled or parked by you,
 * and time freed in the plan by the main window (a block not begun removed or shortened: `freedByEdit`, the event
 * `plan.freed`, while that freeing lasts).
 *
 * A trigger's time freed stays ahead while the day goes on as planned from it (`slackOf`): the blocks running at it or
 * begun with it („Dalej”) and the next blocks of the plan begun after it (a manual „Start” – the same as „Dalej”, D375)
 * carry it before them; minutes with none of them running (waiting, a pause, a session in the background) and minutes they
 * run past their length use it up; another block begun in it fills it (its question is over). Where it stands now
 * (`targetOf`): before the first block of the foreground from its place that stands at its own hour – the ones before it,
 * due or following others, move by themselves. That block must be one that may be moved (`pushable`), or nothing asks.
 * The triggers before one block are one question (`gap:<day>:<the earliest trigger's id>`, answered for each trigger): the
 * gap tried is the free time before the block, at most what they still hold; the line says how much earlier „Przesuń”
 * really puts it (a transition buffer stays). One question at a time – the nearest. Only today.
 *
 * „Przesuń resztę wcześniej” (`closeGap`, the mirror of `pushApart`): the flexible blocks from the gap up to the nearest
 * fixed block (a session, classes) – each as much earlier as the gap, never before now nor before the block before it, a
 * fixed one never moved; protected and begun blocks stay, the rest goes around them. What is written is where the forecast
 * then shows them (counted again until nothing moves). Pure and deterministic.
 */
import { durationLabel } from '../format'
import type { PlanBlock } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { plannedSpan, type BlockInfo } from './blocks'
import { shownForecaster, type DayContext, type DayState } from './day'
import { compareOrder, OPEN, ranMinutes, type EventOrder } from './facts'
import type { Placed } from './forecast'
import { atOf, idxOfLogical, logicalSpan } from './grid'
import { pushable, type PushedBlock } from './pushApart'
import { plannedEndOf } from './timer'

/** The least gap the bar asks about (D368): 5 min is none. */
export const GAP_MIN = 10

/** Where time was freed in the day: the question looks for the block with the gap from `place` on. */
export interface GapTrigger {
  /** The id of its event: the trigger's own (its answer is `gapId(day, key)`). */
  key: string
  /** Grid index. */
  place: number
  /** How long it freed (minutes): what it may give the gap, at most. */
  freedMin: number
  /** When it happened (`EventOrder`): what began after it is told by this. */
  order: EventOrder
}

/** The gap the bar asks about (its line `gap:<day>:<key>`). */
export interface Gap {
  id: string
  /** The triggers it stands for (their keys – „Zostaw” and „Przesuń” answer each). */
  keys: string[]
  /** The flexible block after the gap. */
  block: string
  /** How much earlier „Przesuń” puts that block (the line's „Luka N min”). */
  minutes: number
  /** How much earlier its start is tried (the free time before it, at most what the triggers still hold). */
  tryMin: number
  /** Where that block stands now on the axis, and where „Przesuń” puts it (logical minutes). */
  startMin: number
  fromMin: number
}

/** The id of a trigger's question (and of its answer): the day and the trigger's event. */
export const gapId = (date: string, key: string): string => `gap:${date}:${key}`

/** The bar's text of a gap (D368): „Luka 20 min”, „Luka 1 h 20 min”. */
export const gapText = (minutes: number): string => `Luka ${durationLabel(minutes)}`

/** Ends that come when the plan says (a fixed block's window): never early. */
const PLANNED_ENDS = new Set(['plan', 'fixedNoReaction'])

const goneOf = (state: DayState, id: string): boolean => {
  const f = state.facts.blocks.get(id)
  return !!f && (f.parkedAt != null || f.cancelledAt != null)
}

/**
 * Time freed by the window lasts while the plan keeps it so (D368: a move never asks): a removed block not in the plan
 * again (its „Cofnij”), a shortened one ending at the place or before (not lengthened back nor moved later).
 */
function freeingLasts(state: DayState, byId: Map<string, BlockInfo>, x: DayState['facts']['freed'][number]): boolean {
  const info = byId.get(x.block)
  const inPlan = !!info && info.inPlan && !goneOf(state, x.block)
  if (x.how === 'remove') return !inPlan
  if (!inPlan) return true
  const p = state.forecast.find((q) => q.block.id === x.block)
  const end = p ? p.to : (state.facts.blocks.get(x.block)?.endedAt ?? plannedSpan(info, byId)?.end ?? Number.POSITIVE_INFINITY)
  return end <= x.place
}

/** The triggers the day's log holds (the same on every computer). */
export function logGapTriggers(state: DayState): GapTrigger[] {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const out: GapTrigger[] = []
  for (const [id, f] of state.facts.blocks) {
    const info = byId.get(id)
    if (!info) continue
    // Only the foreground's time: a block that ran in the background frees none.
    const fg = !(f.runs.at(-1)?.bg ?? info.bg)
    if (fg && f.startedAt != null && f.endedAt != null && f.endOrder && f.endId && !PLANNED_ENDS.has(f.endRule ?? '')) {
      const freed = plannedEndOf(state, info, f) - f.endedAt
      if (freed >= GAP_MIN) out.push({ key: f.endId, place: f.endedAt, freedMin: freed, order: f.endOrder })
    }
    if (fg) for (const c of f.endChanges) if (c.minutes <= -GAP_MIN) out.push({ key: c.id, place: c.at, freedMin: -c.minutes, order: c.order })
    // Cancelled or parked by you before it began (the bar's „Odwołaj”, „Zaparkuj”): its place from then on.
    const gone = f.startedAt == null ? (f.cancelledAt ?? f.parkedAt) : null
    if (gone != null && f.goneRule === 'user' && !info.bg && f.goneId && f.goneOrder) {
      const span = plannedSpan(info, byId)
      const place = span ? Math.max(span.start, gone) : null
      if (span && place != null && span.end - place >= GAP_MIN) out.push({ key: f.goneId, place, freedMin: span.end - place, order: f.goneOrder })
    }
  }
  // The main window's removals and shortenings (D375), while they last.
  for (const x of state.facts.freed) if (x.minutes >= GAP_MIN && freeingLasts(state, byId, x)) out.push({ key: x.id, place: x.place, freedMin: x.minutes, order: x.order })
  return out
}

/**
 * What of a trigger's time freed is still ahead (minutes; 0 – used up, or the gap filled). The blocks that carry it: the
 * foreground's ones running across its place or begun with it (its own click – „Dalej”), and each block begun after it
 * from its place that is the next of the plan then (of the foreground, not gone, nothing of the plan with its own hour
 * left out between the place and it; anchored – after a block begun; D375: a manual „Start” goes as „Dalej”, also when its
 * hour has passed and in a chain). Any other block begun there fills it. From the place to now, the minutes none of them
 * runs in the foreground and the minutes they run past their length (planned at their start, or at the trigger) use it up.
 */
function slackOf(state: DayState, byId: ReadonlyMap<string, BlockInfo>, t: GapTrigger): number {
  const facts = state.facts
  const after = (o: EventOrder) => compareOrder(o, t.order) > 0 && !(o.c === t.order.c && o.at === t.order.at)
  const lasts = (to: number) => to === OPEN || to > t.place
  const carriers = new Set<string>()
  const begun: Array<{ id: string; order: EventOrder }> = []
  for (const [id, f] of facts.blocks) {
    if (f.runs.some((r) => !r.bg && lasts(r.to) && (!after(r.begun) || r.from < t.place))) {
      carriers.add(id)
      continue
    }
    const r = f.runs.find((x) => !x.bg && x.from >= t.place && after(x.begun))
    if (r) begun.push({ id, order: r.begun })
  }
  begun.sort((a, b) => compareOrder(a.order, b.order))
  const begunBefore = (id: string, o: EventOrder) => facts.blocks.get(id)?.runs.some((r) => compareOrder(r.begun, o) < 0) ?? false
  for (const x of begun) {
    const info = byId.get(x.id)
    if (!info || !info.inPlan || info.bg || goneOf(state, x.id)) return 0
    if (info.start == null) {
      if (!info.anchor || !(carriers.has(info.anchor) || begunBefore(info.anchor, x.order))) return 0
    } else if (info.start > t.place) {
      const start = info.start
      const left = state.blocks.some((y) => y.id !== x.id && y.inPlan && !y.bg && !y.fixed && !y.waits && y.start != null && y.start >= t.place && y.start < start && !goneOf(state, y.id) && !begunBefore(y.id, x.order))
      if (left) return 0
    }
    carriers.add(x.id)
  }
  const now = state.now
  if (now <= t.place) return t.freedMin
  // Minutes of the foreground the carriers ran from the place to now.
  const spans = [...carriers]
    .flatMap((id) => facts.blocks.get(id)!.runs.filter((r) => !r.bg).map((r) => [Math.max(r.from, t.place), Math.min(r.to === OPEN ? now : r.to, now)] as const))
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  let covered = 0
  let reach = t.place
  for (const [a, b] of spans) {
    if (b <= reach) continue
    covered += b - Math.max(a, reach)
    reach = b
  }
  let past = 0
  for (const id of carriers) {
    const f = facts.blocks.get(id)!
    const length = (f.planned?.durationMin ?? byId.get(id)?.durationMin ?? 0) + f.endChanges.filter((c) => compareOrder(c.order, t.order) <= 0).reduce((s, c) => s + c.minutes, 0)
    past += Math.max(0, ranMinutes(f, now) - length) - Math.max(0, ranMinutes(f, t.place) - length)
  }
  return Math.max(0, t.freedMin - (now - t.place - covered) - past)
}

/** The foreground of the forecast in the order of the axis. */
const foreground = (state: DayState): Placed[] => state.forecast.filter((p) => !p.bg).sort((a, b) => a.from - b.from || (a.block.id < b.block.id ? -1 : 1))

/**
 * The block a trigger's time freed stands before now: of the foreground from its place, the first not running that stands
 * at its own hour (the ones before it – due, behind others, anchored – move by themselves), with the end of what comes
 * before it (or now). Null: none, or that one may not be moved (fixed, protected, begun – D368: no question then).
 */
function targetOf(state: DayState, fg: readonly Placed[], t: GapTrigger): { b: Placed; prev: number } | null {
  for (let k = 0; k < fg.length; k++) {
    const p = fg[k]!
    if (p.running || p.from < t.place) continue
    if (p.block.start == null || p.from > p.block.start) continue
    if (!pushable(p.block, state.facts)) return null
    let prev = state.now
    for (const q of fg.slice(0, k)) prev = Math.max(prev, q.to)
    return { b: p, prev }
  }
  return null
}

/** Is a trigger answered („Zostaw” or „Przesuń” – each trigger of a question gets its answer). */
const answered = (state: DayState, key: string): boolean => state.facts.answers.has(gapId(state.grid.date, key))

/**
 * The gap the bar asks about now (D368, D373, D375), or null: the triggers still holding time freed and not answered, by
 * the block they stand before; the nearest such block whose gap „Przesuń” closes by at least 10 min. The modes it waits in
 * (a session, classes, the night) and the day (only today) are the bar's.
 */
export function gapNow(ctx: DayContext, state: DayState): Gap | null {
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const fg = foreground(state)
  const groups = new Map<string, { b: Placed; prev: number; slack: number; triggers: GapTrigger[] }>()
  for (const t of logGapTriggers(state)) {
    if (answered(state, t.key)) continue
    const slack = slackOf(state, byId, t)
    if (slack <= 0) continue
    const x = targetOf(state, fg, t)
    if (!x) continue
    const was = groups.get(x.b.block.id)
    if (was) {
      was.slack += slack
      was.triggers.push(t)
    } else groups.set(x.b.block.id, { ...x, slack, triggers: [t] })
  }
  for (const c of [...groups.values()].sort((a, b) => a.b.from - b.b.from)) {
    const tryMin = Math.min(c.b.from - c.prev, c.slack)
    if (tryMin < GAP_MIN) continue
    const { from } = closing(ctx, state, c.b.block.id, tryMin)
    const minutes = from == null ? 0 : c.b.from - from
    if (minutes < GAP_MIN) continue
    const triggers = [...c.triggers].sort((a, b) => compareOrder(a.order, b.order))
    return { id: gapId(g.date, triggers[0]!.key), keys: triggers.map((t) => t.key), block: c.b.block.id, minutes, tryMin, startMin: lm(c.b.from), fromMin: lm(from!) }
  }
  return null
}

/** The rounds of counting the day again after a gap closed (a start only falls, so a couple do – a bound for safety). */
const MAX_ROUNDS = 10

/**
 * „Przesuń resztę wcześniej” (D368, D373): the blocks whose planned starts change when the gap before `gap.block` closes –
 * the flexible blocks of the foreground from it up to the nearest fixed block (or one waiting for „Zacznij”), each tried
 * `gap.tryMin` earlier than it stands, never before now nor before a block that stays before it (protected, begun,
 * anchored – kept in the forecast's order); written where the forecast then shows it, when it moved earlier, or where it
 * stands when its plan would no longer keep the order. Nothing past the fixed block changes. Empty: the block cannot move.
 */
export const closeGap = (ctx: DayContext, state: DayState, gap: Pick<Gap, 'block' | 'tryMin'>): PushedBlock[] => closing(ctx, state, gap.block, gap.tryMin).out

/** `closeGap` with where the gap's block then stands on the axis (index; null: it cannot move). */
function closing(ctx: DayContext, state: DayState, block: string, tryMin: number): { out: PushedBlock[]; from: number | null } {
  const g = state.grid
  const fg = foreground(state)
  const k = fg.findIndex((p) => p.block.id === block)
  if (k < 0) return { out: [], from: null }
  const chain: Placed[] = []
  for (const p of fg.slice(k)) {
    if (p.block.fixed || p.block.waits) break
    chain.push(p)
  }
  const movable = new Set(chain.filter((p) => !p.running && pushable(p.block, state.facts)).map((p) => p.block.id))
  if (!movable.has(block)) return { out: [], from: null }
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
      const s = Math.max(p.from - tryMin, state.now, last + 0.5)
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
  const out = chain
    .filter((p) => written.has(p.block.id) && placed.has(p.block.id))
    .map((p) => {
      const s = written.get(p.block.id)!
      const q = placed.get(p.block.id)!
      return { id: p.block.id, fromMin: planned.get(p.block.id) ?? lm(p.block.start!), startMin: lm(s), shown: logicalSpan(g, q.from, q.to), planned: logicalSpan(g, s, s + p.block.durationMin) }
    })
  return { out, from: out.some((p) => p.id === block) ? (placed.get(block)?.from ?? null) : null }
}

/**
 * The fields of the event `plan.freed` (D375): the block changed and how (removed, shortened), the place on the axis from
 * which the next block is looked for (an instant, ms) and the minutes freed.
 */
export interface Freed {
  block: string
  how: 'remove' | 'shorten'
  place: number
  minutes: number
}

/**
 * What a change of today's plan in the main window frees (D368: a block not begun removed – `after` null, with the blocks
 * not begun anchored to it, which leave the plan with it – or shortened – its end earlier with a shorter length, the field
 * „Długość” or the bottom edge; never a move nor the top edge), counted on the day before the change – the window writes
 * it to the day's log as `plan.freed` (D375). Null: nothing to ask about (a begun block – the log tells; less than 10 min;
 * in the past).
 */
export function freedByEdit(state: DayState, was: PlanBlock, after: PlanBlock | null): Freed | null {
  const f = state.facts.blocks.get(was.id)
  if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) return null
  const p = state.forecast.find((x) => x.block.id === was.id)
  if (!p || p.bg || p.to <= state.now) return null
  let place: number
  let freed: number
  if (!after) {
    // The blocks anchored to it (in a chain) leave the plan with it (`dayPlan`); begun ones stay where they ran.
    const gone = new Set([was.id])
    for (let grew = true; grew; ) {
      grew = false
      for (const b of state.blocks)
        if (b.anchor && gone.has(b.anchor) && !gone.has(b.id) && state.facts.blocks.get(b.id)?.startedAt == null) {
          gone.add(b.id)
          grew = true
        }
    }
    place = Math.max(p.from, state.now)
    freed = Math.max(...state.forecast.filter((x) => gone.has(x.block.id) && !x.bg).map((x) => x.to)) - place
  } else {
    if (was.startMin == null || after.startMin == null) return null
    const cut = Math.min(was.durationMin - after.durationMin, was.startMin + was.durationMin - (after.startMin + after.durationMin))
    if (cut <= 0) return null
    place = p.to - cut
    freed = cut
  }
  if (freed < GAP_MIN) return null
  return { block: was.id, how: after ? 'shorten' : 'remove', place: atOf(state.grid, place), minutes: freed }
}
