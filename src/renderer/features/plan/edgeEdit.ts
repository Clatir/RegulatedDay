/**
 * What an edge dragged on the axis changes in a block `b` of the plan (D365), shown over `shown` before the drag and now
 * over `span`: the way the field „Długość” saves – `durationMin`; the top edge also the start (kept in the logical day as
 * a dragged start is, D305), so that the end stays.
 *
 * The length is counted from where the block really starts: a fixed one – at its start in the plan (the axis shows it
 * later while it waits behind a regeneration), a flexible one – at the start shown (where the forecast puts it). The top
 * edge of a flexible block the forecast holds back (shown after its start in the plan) does not start it earlier by
 * going above its shown start: the plan will place it there anyway, so only the part below counts and the end stays.
 */
import { draggedBlock } from '@shared/engine/planEdit'
import type { TimerResult } from '@shared/api'
import { costText } from '@shared/costText'
import { MAX_BLOCK_MIN, type PlanBlock } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from './Timeline'

export function edgePatch(b: PlanBlock, span: BlockSpan, edge: DragEdge, shown: BlockSpan): Partial<PlanBlock> {
  const lengthFrom = (start: number) => Math.min(Math.max(span.endMin - start, 1), MAX_BLOCK_MIN)
  if (edge === 'end') return { durationMin: lengthFrom(b.fixed ? (b.startMin ?? shown.startMin) : shown.startMin) }
  const startMin = draggedBlock(b, span.startMin).startMin!
  const heldBack = !b.fixed && b.startMin != null && shown.startMin > b.startMin
  return { startMin, durationMin: lengthFrom(heldBack ? Math.max(startMin, shown.startMin) : startMin) }
}

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
