/**
 * The icon's panel: the bar and, while the widget is hidden, only its state line and the question waiting (spec
 * „Widget”). Esc closes it (after whatever Esc closes first); a line a notification's click opened it for is marked.
 * „×” in the upper right corner closes it (the app goes on in the tray), „×” with Shift ends the app; a click on a free
 * spot opens the main window (D558): pressed and released on a free spot, nothing unfolded or waiting (`data-busy`); a double
 * click opens it always (D559) – anywhere but on a control, also with something unfolded or waiting.
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { setWindowEscape } from '../lib/escape'
import { useWidget } from '../store/widget'
import { Bar, useReportLayout } from './Bar'
import { OWN } from './barDouble'

/** What a click acts on by itself – never a click of the free panel (the same list as the desktop bar's free spot). */
const OWN_CLICK = OWN

/** A spot of the panel that is free: not a control, nor inside one. */
const free = (el: EventTarget | null): boolean => el instanceof Element && !el.closest(OWN_CLICK)

/**
 * A click on a free spot opens the main window (D558): pressed and released on a free spot (a press slid onto a button or
 * off it is no click of the panel – Chromium gives such a click to the common parent, so `down` and `up` are the targets of
 * the press and of the release), nothing unfolded, nothing waiting in the bar (`data-busy`: „Skończył się o…” with its
 * ±5 min, a cost to confirm).
 */
export const opensMain = (down: EventTarget | null, up: EventTarget | null, unfolded: boolean, root: Element): boolean =>
  !unfolded && free(down) && free(up) && !root.querySelector('[data-busy]')

/** What a double click never opens the main window from (D559): a control acts by itself – a label passes its click to its own. */
const OWN_DOUBLE = 'button, a, input, textarea, select, [role="button"], [contenteditable]:not([contenteditable="false"])'

/**
 * A double click in the panel opens the main window always (D559): both its presses anywhere but on a control – a double
 * click of a button that went away after its first click (an answer, „Potwierdź”) lands its second on free text.
 */
export const doubleOpensMain = (first: EventTarget | null, second: EventTarget | null): boolean => [first, second].every((el) => el instanceof Element && !el.closest(OWN_DOUBLE))

export function PanelApp() {
  const view = useWidget((s) => s.view)
  const [target, setTarget] = useState<{ line: string | null; day: string | null; quick?: boolean } | null>(null)
  const [unfolded, setUnfolded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReportLayout(ref, unfolded)
  // An opening by the desktop bar's „+” unfolds the field once: a bar drawn anew never opens it again from the same one –
  // and it is spent only once a bar was there to take it (before the first view it waits, T772).
  const usedQuick = useRef<object | null>(null)
  const quickAt = target?.quick && usedQuick.current !== target ? target : null
  useEffect(() => {
    if (quickAt && view) usedQuick.current = quickAt
  }, [quickAt, view])
  useEffect(() => {
    setWindowEscape(() => window.rd.panelClose())
    const off = window.rd.onPanelTarget(setTarget)
    const touch = () => window.rd.panelTouch()
    window.addEventListener('keydown', touch)
    return () => {
      setWindowEscape(null)
      off()
      window.removeEventListener('keydown', touch)
    }
  }, [])
  // The targets of the press and of the release: a click's own target is only their common parent.
  const pressed = useRef<{ down: EventTarget | null; up: EventTarget | null }>({ down: null, up: null })
  const onPress = (e: PointerEvent<HTMLDivElement>) => {
    pressed.current = { down: e.target, up: null }
  }
  const onRelease = (e: PointerEvent<HTMLDivElement>) => {
    pressed.current.up = e.target
  }
  // The first press of a pair of clicks: a double click counts only when it, too, was on no control.
  const firstPress = useRef<EventTarget | null>(null)
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.detail <= 1) firstPress.current = e.target
  }
  const freeClick = (e: MouseEvent<HTMLDivElement>) => {
    const { down, up } = pressed.current
    pressed.current = { down: null, up: null }
    if (opensMain(down, up, unfolded, e.currentTarget)) window.rd.showMain()
  }
  return (
    <div ref={ref} className="relative flex flex-col gap-2 border border-line-strong bg-panel p-2 pr-7" data-testid="panel" onPointerDown={onPress} onPointerUp={onRelease} onClick={freeClick} onMouseDown={onMouseDown} onDoubleClick={(e) => doubleOpensMain(firstPress.current, e.target) && window.rd.showMain()}>
      <button
        type="button"
        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded text-[14px] leading-none text-muted hover:bg-hover hover:text-fg"
        aria-label="Zamknij panel (z Shift – zakończ aplikację)"
        onClick={(e) => window.rd.panelClose(e.shiftKey ? 'quit' : 'x')}
        data-testid="panel-close"
      >
        ×
      </button>
      {view && (
        // One structure whether the widget is hidden („Odcinam się”: the state line with „Wracam”) or not – the bar stays
        // the same one (what is typed in its field stays, T771).
        <div className={view.hidden ? 'flex flex-col gap-1.5 px-1 py-1' : 'contents'} data-testid={view.hidden ? 'panel-hidden' : 'panel-bar'}>
          <Bar view={view} mode="panel" grows="down" onUnfold={setUnfolded} quickAt={quickAt} />
        </div>
      )}
      {target?.line && (
        <div className="rounded border border-lamp/50 bg-lamp-soft px-2 py-1 text-[12px] text-lamp" data-testid="panel-target">
          {/* The line's own words – never its id; gone meanwhile (answered, started): only where it came from. */}
          Otwarte z powiadomienia{(() => {
            const line = view?.lines.find((l) => l.id === target.line)
            return line ? `: ${line.text}` : ''
          })()}
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => window.rd.showMain()} data-testid="panel-open-main">
          Otwórz okno główne
        </button>
      </div>
    </div>
  )
}
