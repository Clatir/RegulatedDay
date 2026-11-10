/**
 * What an edge dragged on the axis does to a block (D365): what the drop saves (`edgePatch`, the way the field „Długość”
 * saves it), how the hint words it (`edgeSummary`), and the answer of the main process to a running block's edge.
 */
import type { TimerResult } from '@shared/api'
import { costText } from '@shared/costText'
import { draggedBlock } from '@shared/engine/planEdit'
import type { ResizePreview } from '@shared/engine/resize'
import { durationLabel, logicalClock } from '@shared/format'
import { MAX_BLOCK_MIN, type PlanBlock } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from './Timeline'

/**
 * What an edge dragged on the axis changes in a block `b` of the plan, shown over `shown` when grabbed and now over `span`:
 * `durationMin`; the top edge also the start (kept in the logical day as a dragged start is, D305), so that the end stays.
 * Empty – nothing to save.
 *
 * The length is counted from where the block really starts: a fixed one – at its start in the plan (the axis shows it
 * later while it waits behind a regeneration), a flexible one – at the start shown (where the forecast puts it).
 * The top edge dragged up never moves the start in the plan later nor shortens the block: on a block shown after its start
 * in the plan (a fixed one waiting, a flexible one the forecast holds back) it changes nothing while it stays at or after
 * that start; above it the start goes there – a fixed block ends where it did, a flexible one the forecast still holds
 * back keeps its length (the end stays where the plan puts it).
 */
export function edgePatch(b: PlanBlock, span: BlockSpan, edge: DragEdge, shown: BlockSpan): Partial<PlanBlock> {
  const lengthFrom = (start: number) => Math.min(Math.max(span.endMin - start, 1), MAX_BLOCK_MIN)
  const planStart = b.startMin ?? shown.startMin
  if (edge === 'end') return { durationMin: lengthFrom(b.fixed ? planStart : shown.startMin) }
  const startMin = draggedBlock(b, span.startMin).startMin!
  if (span.startMin < shown.startMin && planStart < shown.startMin) {
    if (span.startMin >= planStart) return {}
    return { startMin, durationMin: lengthFrom(b.fixed ? startMin : shown.startMin) }
  }
  return { startMin, durationMin: lengthFrom(startMin) }
}

/** What the drop of an edge would save, in words for the hint (the same `edgePatch`): the length, a fixed block's own start. */
export function edgeSummary(b: PlanBlock, span: BlockSpan, edge: DragEdge, shown: BlockSpan): string {
  const patch = edgePatch(b, span, edge, shown)
  if (patch.durationMin == null) return 'bez zmian'
  const start = patch.startMin ?? b.startMin ?? shown.startMin
  return b.fixed && start !== span.startMin ? `${durationLabel(patch.durationMin)} od ${logicalClock(start)}` : durationLabel(patch.durationMin)
}

/**
 * The instant (ms) a running block's dropped edge asks the main process for – whatever the window's own count says of it
 * (`refused`): the main process decides, it may know more (an end after the closing, a change from the other computer).
 * Null – no extension or shortening at all, or nothing counted.
 */
export const resizeToSend = (p: Pick<ResizePreview, 'minutes' | 'to'> | null): number | null => (p && p.minutes !== 0 ? p.to : null)

/** What the main process said to the bottom edge of a running block dropped on the axis (D365). */
export type ResizeAnswer = { kind: 'done' } | { kind: 'confirm'; text: string } | { kind: 'refused'; why: string }

/**
 * The answer of the click `resize` in the window's terms: written; a cost waiting for „Potwierdź · Anuluj” for 10 s (nothing
 * written – `minutes` is the extension it asks for, worded as „Przedłuż” words it); or refused with its reason.
 */
export function resizeAnswer(r: Pick<TimerResult, 'ok' | 'why' | 'confirm'>, minutes: number): ResizeAnswer {
  if (r.ok) return { kind: 'done' }
  if (r.confirm) return { kind: 'confirm', text: costText(`Przedłuż +${minutes}`, r.confirm) }
  return { kind: 'refused', why: r.why ?? 'Nie zmieniono długości bloku.' }
}
