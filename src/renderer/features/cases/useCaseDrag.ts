/**
 * A sprawa dragged from the panel beside the axis of „Dziś” onto the axis (D384). The gesture is the pointer's (`usePointerDrag`,
 * as every other drag of the plan, D305): press on a row, a move past 4 px starts it, the axis shows where the block would stand,
 * and letting go over the axis drops it. A short move is a click. The panel says what is dragged (`CaseDragState`), the page what a
 * drop does.
 */
import { axisPoint, dropMinute } from '../plan/axisDrop'
import { usePointerDrag, type GrabEvent, type PointerDragState } from './usePointerDrag'

/** What is held: the sprawa, where the pointer is, and the minute of the axis under it (`target`; null – not over the axis). */
export type CaseDragState = PointerDragState<number>

/** The minute of the axis under a point of the window; null – not over the axis. */
function minuteAt(x: number, y: number): number | null {
  const p = axisPoint()
  return p ? dropMinute(p, x, y) : null
}

export function useCaseDrag(onDrop: (id: string, minute: number) => void): { drag: CaseDragState | null; grab: (id: string, e: GrabEvent) => void } {
  return usePointerDrag(minuteAt, onDrop)
}
