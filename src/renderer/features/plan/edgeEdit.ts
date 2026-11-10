/**
 * What an edge dragged on the axis does to a block (D365): what the drop saves (`edgePatch`, the way the field „Długość”
 * saves it), how the hint words it (`edgeSummary`), and the answer of the main process to a running block's edge.
 */
import type { TimerResult } from '@shared/api'
import { costText } from '@shared/costText'
import { draggedBlock } from '@shared/engine/planEdit'
import type { ResizePreview } from '@shared/engine/resize'
import { durationLabel } from '@shared/format'
import { MAX_BLOCK_MIN, type PlanBlock } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from './Timeline'

/**
 * What an edge dragged on the axis changes in a block `b` of the plan, shown over `shown` when grabbed and now over `span`:
 * `durationMin`; the top edge also the start (kept in the logical day as a dragged start is, D305), so that the end stays
 * where the axis shows it (D370: the start in the plan goes to the dragged hour – always, also a block shown after its
 * start in the plan, a fixed one too: the length is the shown end minus that start).
 *
 * The bottom edge counts the length from where the block really starts: a fixed one – at its start in the plan (the axis
 * shows it later while it waits behind a regeneration), a flexible one – at the start shown (where the forecast puts it).
 */
export function edgePatch(b: PlanBlock, span: BlockSpan, edge: DragEdge, shown: BlockSpan): Partial<PlanBlock> {
  const lengthFrom = (start: number) => Math.min(Math.max(span.endMin - start, 1), MAX_BLOCK_MIN)
  if (edge === 'end') return { durationMin: lengthFrom(b.fixed ? (b.startMin ?? shown.startMin) : shown.startMin) }
  const startMin = draggedBlock(b, span.startMin).startMin!
  return { startMin, durationMin: lengthFrom(startMin) }
}

/** What the drop of an edge would save, in words for the hint (the same `edgePatch`): the length. */
export function edgeSummary(b: PlanBlock, span: BlockSpan, edge: DragEdge, shown: BlockSpan): string {
  return durationLabel(edgePatch(b, span, edge, shown).durationMin!)
}

/**
 * The instant (ms) a running block's dropped edge asks the main process for – whatever the window's own count says of it
 * (`refused`): the main process decides, it may know more (an end after the closing, a change from the other computer).
 * Null – no extension or shortening at all, or nothing counted.
 */
export const resizeToSend = (p: Pick<ResizePreview, 'minutes' | 'to'> | null): number | null => (p && p.minutes !== 0 ? p.to : null)

/**
 * What the window asks of the main process for a running block's dropped edge, as the span the axis holds the block at
 * meanwhile: the end the engine's count gives (`end`, counted again at the drop – not the end under the pointer), or false
 * – nothing to ask (no change, nothing counted): the block is not held where it was dropped.
 */
export const resizeAsked = (span: BlockSpan, p: Pick<ResizePreview, 'minutes' | 'end'> | null): BlockSpan | false =>
  p && p.minutes !== 0 ? { startMin: span.startMin, endMin: p.end } : false

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
