/**
 * Rozsuwanie in „Dziś” (D367): what a block dragged by its body or an edge, or a new one added, changes in the plan and
 * which blocks it pushes apart – one count for the preview while dragging and for the edit of the drop (`pushApart`).
 * Only a day still to come (today and later): a day gone is history. Without a DOM (tests in `tests/web`).
 */
import type { DayContext, DayState } from '@shared/engine/day'
import { draggedBlock } from '@shared/engine/planEdit'
import { pushApart, type PushedBlock } from '@shared/engine/pushApart'
import type { PlanBlock } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from '../plan/Timeline'
import { edgePatch } from '../plan/edgeEdit'
import type { PushedStart } from './dayActions'

export interface DayChange {
  /** The block as it was in the plan (null: a new one). */
  was: PlanBlock | null
  /** The block after the change. */
  block: PlanBlock
  /** The fields the change sets (a new block: all of it). */
  patch: Partial<PlanBlock>
  pushed: PushedBlock[]
}

/** The plan with `b` in place of its block of the same id, or added. */
const planWith = (plan: readonly PlanBlock[], b: PlanBlock): PlanBlock[] => (plan.some((x) => x.id === b.id) ? plan.map((x) => (x.id === b.id ? b : x)) : [...plan, b])

/**
 * The block `id` of the plan dragged to `span` – by its body (`edge` null: its start, D305) or an edge (D365, as the field
 * „Długość” saves it), grabbed at `shown` – and what it pushes apart on a day to come (`pushes`). The bottom edge pushes
 * from where the block stands on the axis, the rest from its new start. Null: no block of the plan.
 */
export function dragChange(day: { ctx: DayContext; state: DayState }, id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan, pushes: boolean): DayChange | null {
  const plan = day.ctx.plan
  const was = plan.find((b) => b.id === id)
  if (!was) return null
  const patch: Partial<PlanBlock> = edge ? edgePatch(was, span, edge, shown) : { startMin: draggedBlock(was, span.startMin).startMin }
  const block = { ...was, ...patch }
  return { was, block, patch, pushed: pushes ? pushApart(day.ctx, day.state, planWith(plan, block), id, edge === 'end' ? shown.startMin : undefined) : [] }
}

/** A new block added to a day to come (`pushes`) and what it pushes apart (D367: „Dodaj” in the panel of „Dziś”). */
export function addChange(day: { ctx: DayContext; state: DayState }, block: PlanBlock, pushes: boolean): DayChange {
  return { was: null, block, patch: block, pushed: pushes ? pushApart(day.ctx, day.state, planWith(day.ctx.plan, block), block.id) : [] }
}

/** Where the pushed blocks stand (the preview on the axis, by id). */
export const pushedSpans = (c: DayChange | null): ReadonlyMap<string, BlockSpan> | null => (c?.pushed.length ? new Map(c.pushed.map((p) => [p.id, { startMin: p.startMin, endMin: p.endMin }])) : null)

/** The pushed blocks as the edit of the day writes them: each block of the plan with its new start. */
export function pushedStarts(plan: readonly PlanBlock[], c: DayChange): PushedStart[] {
  return c.pushed.flatMap((p) => {
    const block = plan.find((b) => b.id === p.id)
    return block ? [{ block, startMin: p.startMin }] : []
  })
}
