/**
 * The terms the bar's view carries („Potwierdź” 10 s, the note of a refused click): the view says how long (`left`, ms) a
 * term still holds when it was made, and the window counts it from the moment the view reached it on its own monotonic
 * clock – a wall clock set meanwhile (time sync) neither hides „Potwierdź” that the main process still takes, nor keeps a
 * dead one (D229, raport 751).
 */
export function termHolds(receivedAt: number, left: number, mono: number): boolean {
  return mono - receivedAt < left
}
