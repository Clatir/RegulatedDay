/**
 * Rozsuwanie in „Dziś” (D367): what a block dragged by its body or an edge, or a new one added, changes in the plan and
 * which blocks it pushes apart – one count for the preview while dragging and for the edit of the drop (`pushApart`).
 * Only a day still to come (today and later): a day gone is history. Without a DOM (tests in `tests/web`).
 */
import type { DayContext, DayState } from '@shared/engine/day'
import { plannedSpan } from '@shared/engine/blocks'
import { atOf } from '@shared/engine/grid'
import { draggedBlock } from '@shared/engine/planEdit'
import { plannedEndOf } from '@shared/engine/timer'
import { logicalMinuteOf } from '@shared/time/day'
import { groupEndMin, PARALLEL_SAME_TEXT, parallelDrop, parallelFullText, parallelJoinText, placePatch, type BlockPatch } from '@shared/engine/parallel'
import { axisMoves, pushApart, withBlock, type PushedBlock } from '@shared/engine/pushApart'
import type { PlanBlock } from '@shared/model/plan'
import type { BlockSpan, DragEdge, ParallelHint } from '../plan/Timeline'
import { edgePatch } from '../plan/edgeEdit'
import type { PushedStart } from './dayActions'

export interface DayChange {
  /** The block as it was in the plan (null: a new one). */
  was: PlanBlock | null
  /** The block after the change. */
  block: PlanBlock
  /** The fields the change sets (a new block: all of it). */
  patch: Partial<PlanBlock>
  /** The other blocks of its group the change writes (D492, T1166: it left the group as its first block). */
  others: BlockPatch[]
  pushed: PushedBlock[]
}

/** The plan after a change: its block, and the others of its group it writes (`others`). */
export function changedPlan(plan: readonly PlanBlock[], c: Pick<DayChange, 'block' | 'others'>): PlanBlock[] {
  const others = new Map(c.others.map((o) => [o.id, o.patch]))
  return withBlock(
    plan.map((b) => (others.has(b.id) ? { ...b, ...others.get(b.id)! } : b)),
    c.block
  )
}

/**
 * The block `id` of the plan dragged to `span` – by its body (`edge` null: its start, D305) or an edge (D365, as the field
 * „Długość” saves it), grabbed at `shown` – and what it pushes apart on a day to come (`pushes`). The bottom edge pushes
 * from where the block stands on the axis, the rest from its new start. Null: no block of the plan.
 */
export function dragChange(day: { ctx: DayContext; state: DayState }, id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan, pushes: boolean): DayChange | null {
  const plan = day.ctx.plan
  const was = plan.find((b) => b.id === id)
  if (!was) return null
  // D492 (T1166): a block of a group dragged to another place, or its start moved by its top edge, leaves the group.
  const placed = placePatch(plan, id, edge ? edgePatch(was, span, edge, shown) : { startMin: draggedBlock(was, span.startMin).startMin })
  const patch = placed.patch
  const block = { ...was, ...patch }
  const c = { was, block, patch, others: placed.others }
  return { ...c, pushed: pushes ? pushApart(day.ctx, day.state, changedPlan(plan, c), id, { atMin: edge === 'end' ? shown.startMin : undefined, onUnsettled }) : [] }
}

/**
 * Where a day's axis shows the end of each block (by id, logical minutes): today a begun one where it ran or runs to, one still
 * to come where the forecast puts it; another day – its plan. Null – not on the axis.
 */
export function axisEndOf(day: { ctx: DayContext; state: DayState }, isToday: boolean): (id: string) => number | null {
  const st = day.state
  const lm = (idx: number) => logicalMinuteOf(st.grid.date, atOf(st.grid, idx))
  const byId = new Map(st.blocks.map((b) => [b.id, b]))
  return (id) => {
    const info = byId.get(id)
    if (!info) return null
    if (isToday) {
      const f = st.facts.blocks.get(id)
      if (f?.startedAt != null) return lm(f.endedAt ?? Math.max(st.now, plannedEndOf(st, info, f)))
      const p = st.forecast.find((x) => x.block.id === id)
      if (p) return lm(p.to)
    }
    const s = plannedSpan(info, byId)
    return s ? lm(s.end) : null
  }
}

/** A drop onto another block counted (D492): the change of the plan, the group it joined (or is full), and its words. */
export interface ParallelChange extends DayChange {
  kind: 'join' | 'full'
  root: string
  text: string
}

/**
 * Block `id` dragged onto block `target` (D492, T1164, T1165): it stands beside the target's group – at its start, with its own
 * length – or, the group holding `max` blocks already, right after it (where the axis shows its end – `endOf`, by id); with the
 * blocks after it pushed apart (`pushes`, a day to come). `same`: a block of its own group – nothing changes. Null: not a drop
 * (either block is not in the plan, the group's start is not known).
 */
export function parallelChange(
  day: { ctx: DayContext; state: DayState },
  id: string,
  target: string,
  max: number,
  endOf: (id: string) => number | null,
  nameOf: (b: PlanBlock) => string,
  pushes: boolean
): ParallelChange | 'same' | null {
  const plan = day.ctx.plan
  const was = plan.find((b) => b.id === id)
  const end = (root: string) => groupEndMin(plan, root, endOf)
  const drop = was ? parallelDrop(plan, id, target, max, end) : null
  if (!was || !drop) return null
  if (drop.kind === 'same') return 'same'
  if (drop.kind === 'full' && !Number.isFinite(drop.patch.startMin ?? Number.NaN)) return null
  const block = { ...was, ...drop.patch }
  const c = { was, block, patch: drop.patch, others: drop.others }
  const rootBlock = plan.find((b) => b.id === drop.root)!
  const text = drop.kind === 'join' ? parallelJoinText(nameOf(rootBlock)) : parallelFullText(max)
  return { ...c, kind: drop.kind, root: drop.root, text, pushed: pushes ? pushApart(day.ctx, day.state, changedPlan(plan, c), id, { onUnsettled }) : [] }
}

/**
 * What the axis says and draws while a block is held over another one (D492): the words, where the dragged block will stand
 * (the day after the drop – today's axis its forecast, another day's its plan) and the blocks it pushes apart.
 */
export function parallelHint(day: { ctx: DayContext; state: DayState }, c: ParallelChange | 'same' | null, shown: BlockSpan | null, axis: 'forecast' | 'plan'): ParallelHint | null {
  if (c === 'same') return shown ? { text: PARALLEL_SAME_TEXT, span: shown, pushed: null, same: true } : null
  if (!c) return null
  const starts = new Map(c.pushed.map((p) => [p.id, p.startMin]))
  const plan = changedPlan(day.ctx.plan, c).map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
  const moves = new Map(axisMoves(day.ctx, day.state, plan, axis))
  const start = c.block.startMin ?? shown?.startMin ?? 0
  const span = moves.get(c.block.id) ?? { startMin: start, endMin: start + c.block.durationMin }
  moves.delete(c.block.id)
  return { text: c.text, span, pushed: moves.size ? moves : null }
}

/** A new block added to a day to come (`pushes`) and what it pushes apart (D367: „Dodaj” in the panel of „Dziś”). */
export function addChange(day: { ctx: DayContext; state: DayState }, block: PlanBlock, pushes: boolean): DayChange {
  return { was: null, block, patch: block, others: [], pushed: pushes ? pushApart(day.ctx, day.state, withBlock(day.ctx.plan, block), block.id, { onUnsettled }) : [] }
}

/**
 * Where the blocks a push moves stand (the preview on the axis, by id; the dragged one stays under the pointer): the
 * pushed ones and every other block whose place changes with them – one anchored to a pushed one, a protected one the
 * forecast lets through. Today's axis shows the forecast, another day's its plan (`dayAxis`) – the places the axis shows
 * after the save. Nothing pushed – no preview.
 */
export function pushedSpans(day: { ctx: DayContext; state: DayState }, c: DayChange | null, axis: 'forecast' | 'plan'): ReadonlyMap<string, BlockSpan> | null {
  if (!c?.pushed.length) return null
  const starts = new Map(c.pushed.map((p) => [p.id, p.startMin]))
  const plan = changedPlan(day.ctx.plan, c).map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
  const moves = axisMoves(day.ctx, day.state, plan, axis)
  moves.delete(c.block.id)
  return moves.size ? moves : null
}

/** The counting of a push did not settle (a bound for safety): said in the console of a development build only. */
export function onUnsettled(): void {
  if (import.meta.env?.DEV) console.warn('rozsuwanie: przeliczenie dnia nie ustaliło się w limicie rund – wynik z ostatniego przeliczenia')
}

/** The pushed blocks as the edit of the day writes them: each block of the plan with its new start. */
export function pushedStarts(plan: readonly PlanBlock[], c: Pick<DayChange, 'pushed'>): PushedStart[] {
  return c.pushed.flatMap((p) => {
    const block = plan.find((b) => b.id === p.id)
    return block ? [{ block, startMin: p.startMin }] : []
  })
}
