/**
 * A sprawa dragged from one field of the matrix to another (HKU3, D450) – the gesture of `useCaseDrag` (`usePointerDrag`: the
 * pointer's, D305), the target a field under the pointer instead of the axis: its `data-matrix-field` („p1” … „p4”, „none”).
 * Without a new dependency. The matrix shows what is dragged (`MatrixDragState`), the page what a drop does.
 */
import type { MatrixField } from '@shared/engine/casePriority'
import { isPriority } from '@shared/model/requests'
import { usePointerDrag, type GrabEvent, type PointerDragState } from './usePointerDrag'

/** What is held: the sprawa, where the pointer is, and the field under it (`target`; null – none). */
export type MatrixDragState = PointerDragState<MatrixField>

/** The field of the matrix under a point of the window; null – none (outside the matrix). */
export function fieldAt(x: number, y: number): MatrixField | null {
  const f = document.elementFromPoint(x, y)?.closest('[data-matrix-field]')?.getAttribute('data-matrix-field')
  return f === 'none' || isPriority(f) ? f : null
}

export function useMatrixDrag(onDrop: (id: string, field: MatrixField) => void): { drag: MatrixDragState | null; grab: (id: string, e: GrabEvent) => void } {
  return usePointerDrag(fieldAt, onDrop)
}
