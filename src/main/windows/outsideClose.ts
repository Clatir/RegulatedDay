/**
 * A close from outside – a WM_CLOSE from an installer's or your taskkill – arrives as a window's close event whose default
 * the window prevents (it never closes on its own while the app runs). A quit begun inside that event (app.quit() from a
 * promise that settles in the same task) is cancelled by Electron when the event returns prevented: the windows close,
 * the app stays on without them (E4a.13, seen on CI). So what ends the app runs after the event – on the next turn of the
 * loop.
 */
export function afterOutsideClose(fn: () => void, later: (cb: () => void) => void = (cb) => void setTimeout(cb, 0)): void {
  later(fn)
}
