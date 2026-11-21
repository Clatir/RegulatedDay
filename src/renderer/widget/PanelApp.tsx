/**
 * The icon's panel – the remote of the app (D564 P13, variant A): a header „Regulated Day” with „×”, the bar as on the desktop
 * and in the window, and a footer „↗ Otwórz okno główne · ▣ Pasek pulpitu: pokaż / schowaj · ⏻ Zakończ aplikację” (C1, C7).
 * While the widget is hidden the bar is only its state line and the question waiting (spec „Widget”). Esc closes it (after
 * whatever Esc closes first); a line a notification's click opened it for is marked. „×” closes it (the app goes on in the
 * tray), „×” with Shift ends the app; a click on a free spot opens the main window (D558): pressed and released on a free
 * spot, nothing unfolded or waiting (`data-busy`); a double click opens it always (D559) – anywhere but on a control, also
 * with something unfolded or waiting. Opened again, it shows nothing unfolded from before it hid (C8).
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { OPEN_MAIN_TEXT, QUIT_APP_TEXT } from '@shared/widget'
import { setWindowEscape } from '../lib/escape'
import { useWidget } from '../store/widget'
import { Bar, useReportLayout } from './Bar'
import { OWN } from './barDouble'

/** What a click acts on by itself – never a click of the free panel (the same list as the desktop bar's free spot). */
const OWN_CLICK = OWN

/** The panel's own header and footer (`data-panel-chrome`): a click missing a button of theirs opens nothing (UX10). */
const CHROME = '[data-panel-chrome]'

/** A spot of the panel that is free: not a control, nor inside one, nor in the header or the footer. */
const free = (el: EventTarget | null): boolean => el instanceof Element && !el.closest(OWN_CLICK) && !el.closest(CHROME)

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

/** A button of the header and the footer: the second click of a double click does nothing (C8 – „schowaj” would „pokaż” again). */
function PanelButton({ testId, label, onAct, children, className, disabled }: { testId: string; label?: string; onAct: (e: MouseEvent) => void; children: ReactNode; className: string; disabled?: boolean }) {
  return (
    <button type="button" className={className} aria-label={label} disabled={disabled} onClick={(e) => e.detail <= 1 && onAct(e)} data-testid={testId}>
      {children}
    </button>
  )
}

const FOOT_BUTTON = 'rounded px-1 py-0.5 text-[12px] whitespace-nowrap text-muted enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default'

/** „Odcinam się” hides the bar by its rule: nothing to show or hide now – it comes back with „Wracam” (D564 P13). */
const BAR_BACK_TEXT = 'Pasek wróci po „Wracam”'

export function PanelApp() {
  const view = useWidget((s) => s.view)
  const [target, setTarget] = useState<{ line: string | null; day: string | null } | null>(null)
  // Each new opening of a hidden panel (the main process says it with its target, also none): the bar folds what stayed
  // unfolded (C8); asked again while open, only the target changes.
  const [opening, setOpening] = useState(0)
  const [unfolded, setUnfolded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReportLayout(ref, unfolded)
  useEffect(() => {
    setWindowEscape(() => window.rd.panelClose())
    const off = window.rd.onPanelTarget((o) => {
      setTarget(o.target)
      if (o.reopened) setOpening((n) => n + 1)
    })
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
    // The second click of a double click whose first was on a control – one that went away after it („Tak”, „Potwierdź”):
    // no click of the free panel (C8).
    if (e.detail > 1 && !free(firstPress.current)) return
    if (opensMain(down, up, unfolded, e.currentTarget)) window.rd.showMain()
  }
  // „schowaj” only for the bar on the screen now (the main process says it – `barShown`); hidden for any reason, „pokaż” –
  // but not while „Odcinam się” hides it by its rule: then the button is inactive and says when the bar comes back.
  const barShown = view?.barShown === true
  const barByRule = view?.hidden === true
  return (
    <div ref={ref} className="flex flex-col gap-2 border border-line-strong bg-panel p-2" data-testid="panel" onPointerDown={onPress} onPointerUp={onRelease} onClick={freeClick} onMouseDown={onMouseDown} onDoubleClick={(e) => doubleOpensMain(firstPress.current, e.target) && window.rd.showMain()}>
      <div className="flex items-center justify-between gap-2 pl-1" data-testid="panel-head" data-panel-chrome="">
        <span className="text-[12px] font-medium text-muted">Regulated Day</span>
        <PanelButton
          testId="panel-close"
          className="flex h-5 w-5 items-center justify-center rounded text-[14px] leading-none text-muted hover:bg-hover hover:text-fg"
          label="Zamknij panel (z Shift – zakończ aplikację)"
          onAct={(e) => window.rd.panelClose(e.shiftKey ? 'quit' : 'x')}
        >
          ×
        </PanelButton>
      </div>
      {view && (
        // One structure whether the widget is hidden („Odcinam się”: the state line with „Wracam”) or not – the bar stays
        // the same one (what is typed in its field stays, T771).
        <div className={view.hidden ? 'flex flex-col gap-1.5 px-1 py-1' : 'contents'} data-testid={view.hidden ? 'panel-hidden' : 'panel-bar'}>
          <Bar view={view} mode="panel" grows="down" onUnfold={setUnfolded} opening={opening} />
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
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-t border-line pt-1.5 text-[12px] text-muted" data-testid="panel-foot" data-panel-chrome="">
        <PanelButton testId="panel-open-main" className={FOOT_BUTTON} onAct={() => window.rd.showMain()}>
          ↗ {OPEN_MAIN_TEXT}
        </PanelButton>
        <span aria-hidden="true">·</span>
        <PanelButton testId="panel-bar-toggle" className={FOOT_BUTTON} disabled={barByRule} label={barByRule ? BAR_BACK_TEXT : undefined} onAct={() => void window.rd.barAction(barShown ? 'hideBar' : 'showBar')}>
          {barByRule ? `▣ ${BAR_BACK_TEXT}` : `▣ Pasek pulpitu: ${barShown ? 'schowaj' : 'pokaż'}`}
        </PanelButton>
        <span aria-hidden="true">·</span>
        <PanelButton testId="panel-quit" className={FOOT_BUTTON} onAct={() => window.rd.panelClose('quit')}>
          ⏻ {QUIT_APP_TEXT}
        </PanelButton>
      </div>
    </div>
  )
}
