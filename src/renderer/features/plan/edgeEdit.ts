/**
 * What an edge dragged on the axis changes in a block (D365): the way the field „Długość” saves – `durationMin`; the top
 * edge also the start (kept in the logical day as a dragged start is, D305), so that the end stays.
 */
import { draggedBlock } from '@shared/engine/planEdit'
import type { TimerResult } from '@shared/api'
import { costText } from '@shared/costText'
import type { PlanBlock } from '@shared/model/plan'
import { MAX_BLOCK_MIN, type BlockSpan, type DragEdge } from './Timeline'

export function edgePatch(b: PlanBlock, span: BlockSpan, edge: DragEdge): Partial<PlanBlock> {
  const startMin = edge === 'top' ? (draggedBlock(b, span.startMin).startMin ?? span.startMin) : span.startMin
  const durationMin = Math.min(Math.max(span.endMin - startMin, 1), MAX_BLOCK_MIN)
  return edge === 'top' ? { startMin, durationMin } : { durationMin }
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
