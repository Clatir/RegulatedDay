/**
 * The desktop bar's handle (D303) on a window that never takes activation (D229, T1500): Windows hands the bar's page
 * the press of the mouse button only now and then – on your computer it heard the cursor's moves and the release, never
 * the press (E4b.12, 15.11). These rules read the drag from the moves themselves.
 */

/**
 * What the page last heard of the pointer: the buttons of its last move in the window (null – none since the cursor came
 * in), whether that move was over the handle (where an unheard press would have come), and a press heard and not yet let go.
 */
export interface GripState {
  prevButtons: number | null
  prevOnHandle: boolean
  pressHeard: boolean
}

/**
 * A move with the left button held is the press the page never got – when the move before it had no button and was over
 * the handle (the press came there; the move with the button may already be past it – moves come once a frame) and no
 * press was heard.
 */
export const pressFromMove = (buttons: number, s: GripState): boolean => (buttons & 1) === 1 && s.prevButtons === 0 && s.prevOnHandle && !s.pressHeard

/** A drag held now ends at a move without the left button: it was let go where the page could not hear the release. */
export const releasedUnheard = (buttons: number): boolean => (buttons & 1) === 0
