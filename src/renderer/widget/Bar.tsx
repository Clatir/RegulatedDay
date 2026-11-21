/**
 * The bar (spec „Widget”, „Cisza”): the same content at the top of the main window, in the icon's panel and on the
 * desktop bar – the engine's view from the main process (one neutral line without a data folder, D327). „Dalej?” has its fixed
 * place at the start; Dalej, Pauza, Przedłuż, Koniec pracy and Odcinam się always stand (in a session also Skończyłem);
 * the other questions and lines at the end, and what does not fit gathers in „⋯” with a count. Everything is chosen by a
 * click inside the bar – groups, the lengths of „Przedłuż”, the steps of „Skończył się o …” unfold within the bar itself,
 * never as a separate window (D229). A first click with a cost shows it in place of its button; the second within 10 s
 * does it. The second click of a double click on a button never acts again (C8). On the desktop bar the buttons act on the
 * mouse button's release and there are no tooltips; its „↗” opens the main window with one click (D564 P12), and so does a
 * double click on a free spot of it (D560).
 */
import { createContext, Fragment, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { WidgetAction } from '@shared/api'
import { REQUEST_ESTIMATE_MAX_MIN, REQUEST_ESTIMATE_MIN } from '@shared/engine/requests'
import { TITLE_MAX } from '@shared/model/requests'
import { quickPreview } from '@shared/quickDates'
import { barBackground, TONE_SETS } from '@shared/theme'
import { ALL_STEPS_TEXT, BAR_CLOSED_TEXT, barStepText, OPEN_MAIN_TEXT, SEEN_LINE, SHOW_BAR_TEXT, type AutoItem, type BarAllDay, type BarLine, type BarRoutine, type BarSteps, type RunningRequest, type WidgetView } from '@shared/widget'
import { countdown, useNow } from '../lib/clock'
import { useMachine } from '../store/machine'
import { cx } from '../components/ui'
import { useStepPicks } from '../lib/stepPicks'
import { termHolds } from '../lib/viewTerms'
import { useEscapeLayer } from '../lib/escape'
import { useQuickToday } from './quickToday'
import { pressFromMove, releasedUnheard, type GripState } from './barGrip'
import { freeSpot, secondRelease, type BarRelease } from './barDouble'

export type BarMode = 'main' | 'panel' | 'desktop'
type Unfold = 'request' | 'signals' | 'more' | 'extend' | 'variants' | 'routine' | 'quick' | 'parallel' | null

const SIGNALS: Array<[string, string]> = [
  ['glasses', 'okulary'],
  ['earplugs', 'zatyczki'],
  ['rocking', 'więcej bujania'],
  ['questions', 'drażnią pytania']
]
const POOLS: Array<[string, string]> = [
  ['head', 'głowa'],
  ['emotions', 'emocje'],
  ['senses', 'bodźce'],
  ['body', 'ciało']
]
const EXTEND = [15, 30, 60]
/** The engine's questions (their id: rule:day:block:threshold) count as seen where they are shown – not the bar's proposals. */
const QUESTION_ID = SEEN_LINE

function act(action: WidgetAction, arg?: string): void {
  void window.rd.widgetAction(action, arg)
}

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** The bar's last click on a button – on the desktop bar its release too (where and when). */
interface LastClick {
  button: EventTarget | null
  release: BarRelease | null
}

/**
 * The bar's last click on a button (C8): the second click of a double click – Chromium's `detail` in the window and the
 * panel, two releases within `BAR_DOUBLE_MS` and `BAR_DOUBLE_PX` on the desktop bar – never acts again, also on another
 * button that came in the place of the first (the layout changed after „Dalej”, „Skończył się o…” put its −5 there). One
 * per bar; a part of the bar drawn alone (tests) has none – every click acts.
 */
const ButtonClicks = createContext<{ current: LastClick } | null>(null)

/**
 * A button of the bar: on the desktop bar it acts on the release of the mouse button (no activation, D229). The second
 * click of a double click does nothing (C8) – in the window and the panel Chromium counts it (`detail` 2 and more: the
 * clicks of one spot; a key gives 0), on the desktop bar the releases do (its window often never hears the press, T1500).
 * `repeat`: a step (±5 min) – a quick click counts too, when the click before it was on this very step.
 */
function BarButton({ mode, onAct, children, testId, pressed, accent, label, repeat }: { mode: BarMode; onAct: () => void; children: ReactNode; testId?: string; pressed?: boolean; accent?: boolean; label?: string; repeat?: boolean }) {
  const last = useContext(ButtonClicks)
  /** This click again on the button clicked just before (a step clicked quickly once more). */
  const again = (button: EventTarget) => !last || last.current.button === button
  const props =
    mode === 'desktop'
      ? {
          onPointerUp: (e: React.PointerEvent) => {
            if (e.button !== 0) return
            if (!last) return onAct()
            const now = { at: e.timeStamp, x: e.screenX, y: e.screenY }
            const second = secondRelease(last.current.release, now) && !(repeat && again(e.currentTarget))
            last.current = { button: e.currentTarget, release: now }
            if (!second) onAct()
          }
        }
      : {
          onClick: (e: React.MouseEvent) => {
            const second = e.detail > 1 && !(repeat && again(e.currentTarget))
            if (last) last.current = { ...last.current, button: e.currentTarget }
            if (!second) onAct()
          }
        }
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      aria-label={label}
      className={cx(
        'inline-flex h-[24px] shrink-0 items-center rounded border px-2 text-[12px] leading-none whitespace-nowrap',
        accent ? 'border-lamp/60 text-fg' : 'border-line-strong text-fg',
        pressed ? 'bg-raised' : 'bg-transparent hover:bg-hover'
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/**
 * Why the desktop bar is not on the screen – in the window and the panel, never on the bar itself: hidden although on
 * (`barNote`, D270 – „Pokaż pasek” lays it again) or, in the panel only, hidden by its „×” (D564 P16 – „Pasek pulpitu schowany
 * · Pokaż pasek” takes the „×” off). The two never stand together: the main process gives no note to a bar hidden by „×”.
 */
function BarNote({ view, mode }: { view: WidgetView; mode: BarMode }) {
  if (mode === 'desktop') return null
  if (view.barNote)
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-testid="bar-note">
        {view.barNote}
        <BarButton mode={mode} onAct={() => void window.rd.barAction('placeBar')}>
          {SHOW_BAR_TEXT}
        </BarButton>
      </div>
    )
  if (mode !== 'panel' || !view.barClosed) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-testid="bar-closed">
      {BAR_CLOSED_TEXT}
      <BarButton mode={mode} testId="bar-closed-show" onAct={() => void window.rd.barAction('showBar')}>
        {SHOW_BAR_TEXT}
      </BarButton>
    </div>
  )
}

/** A drag of the handle: held now (by which pointer), its frame's message waiting, and what the page last heard of the pointer. */
interface Grip extends GripState {
  held: boolean
  pointer: number
  frame: number
}

/** The grip let go – its end told to the main process (`why`, logged: the trace of a drag that never moved, E4b.12) or not. */
function endGrip(g: Grip, why: 'up' | 'cancel' | 'lost' | null): void {
  if (!g.held) return
  g.held = false
  cancelAnimationFrame(g.frame)
  g.frame = 0
  if (why) window.rd.barDrag('end', why)
}

const CORNER_BUTTON = 'flex h-5 w-5 items-center justify-center rounded text-[14px] leading-none text-muted hover:bg-hover hover:text-fg'

/**
 * The desktop bar's own strip of 24 px on the right (D559, D564 P12; the bar is wider by it – the content stays as before),
 * above the content: „↗” on top opens the main window with one click (C2), „×” under it hides the bar until „Pokaż pasek
 * pulpitu” in the icon's menu, with Shift ends the app. Like every button of the desktop bar both act on the release (the
 * window without activation often never hears the press – no `click`, T1500).
 */
function BarCorner() {
  return (
    <div className="absolute top-1 right-1 z-10 flex flex-col gap-1" data-testid="bar-corner">
      <button type="button" className={CORNER_BUTTON} aria-label={OPEN_MAIN_TEXT} onPointerUp={(e) => e.button === 0 && window.rd.showMain()} data-testid="bar-open-main">
        ↗
      </button>
      <button type="button" className={CORNER_BUTTON} aria-label="Schowaj pasek (z Shift – zakończ aplikację)" onPointerUp={(e) => e.button === 0 && window.rd.barClose(e.shiftKey ? 'quit' : 'x')} data-testid="bar-close">
        ×
      </button>
    </div>
  )
}

/**
 * The handle the desktop bar is dragged by (D303), seen on hover, over the left padding of the bar's main part: the
 * main process moves the bar after the cursor and remembers where it is let go. The drag begins at the press – or, when
 * Windows never handed the page the press (T1500), at the first move over the handle with the button held; while it is
 * held the whole page listens to the pointer that grabbed it: a move without the left button or a release anywhere ends it,
 * and the release clicks nothing.
 */
function DragHandle() {
  const ref = useRef<HTMLSpanElement>(null)
  const grip = useRef<Grip>({ held: false, pointer: -1, frame: 0, prevButtons: null, prevOnHandle: false, pressHeard: false })
  useEffect(() => {
    const g = grip.current
    // Held: only the pointer that grabbed it; else only the mouse – a pen or a touch never grabs the handle by a move.
    const other = (e: PointerEvent) => (g.held ? e.pointerId !== g.pointer : e.pointerType !== 'mouse')
    const down = (e: PointerEvent) => void (e.pointerType === 'mouse' && (g.pressHeard = true))
    const move = (e: PointerEvent) => {
      if (other(e)) return
      const before: GripState = { prevButtons: g.prevButtons, prevOnHandle: g.prevOnHandle, pressHeard: g.pressHeard }
      g.prevButtons = e.buttons
      g.prevOnHandle = e.target instanceof Node && !!ref.current?.contains(e.target)
      // No button: no press is held, heard or not (its release may have come where the page could not hear it).
      if (releasedUnheard(e.buttons)) g.pressHeard = false
      if (!g.held) {
        if (pressFromMove(e.buttons, before)) {
          Object.assign(g, { held: true, pointer: e.pointerId })
          window.rd.barDrag('start', 'move')
        }
        return
      }
      if (releasedUnheard(e.buttons)) return endGrip(g, 'up')
      if (g.frame) return
      g.frame = requestAnimationFrame(() => {
        g.frame = 0
        if (g.held) window.rd.barDrag('move')
      })
    }
    const up = (e: PointerEvent) => {
      if (other(e)) return
      g.pressHeard = false
      g.prevButtons = e.buttons
      if (!g.held) return
      // Let go anywhere in the bar (it may lag behind the cursor): the drag's end – never the click of a button there.
      e.stopPropagation()
      endGrip(g, 'up')
    }
    const cancel = (e: PointerEvent) => {
      if (other(e)) return
      g.pressHeard = false
      endGrip(g, 'cancel')
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', cancel, true)
    // The cursor left the window: its last move here says nothing of where the next one comes from (the button may be
    // pressed outside and dragged in).
    const left = () => void Object.assign(g, { prevButtons: null, prevOnHandle: false })
    document.documentElement.addEventListener('pointerleave', left)
    // The main process ended the drag by itself (the helper heard the release): the grip goes too, without a word back.
    const over = window.rd.onBarDragOver(() => endGrip(g, null))
    return () => {
      over()
      document.documentElement.removeEventListener('pointerleave', left)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', cancel, true)
      endGrip(g, 'lost')
    }
  }, [])
  return (
    <span
      ref={ref}
      aria-label="przeciągnij pasek"
      data-testid="bar-drag"
      className="absolute top-0 left-0 z-10 flex h-full w-3 cursor-grab items-center justify-center text-[12px] text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        // The cursor's capture: a heard press gives the window the moves beyond it too.
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // No capture – the main process follows the cursor by itself.
        }
        Object.assign(grip.current, { held: true, pointer: e.pointerId })
        window.rd.barDrag('start', 'press')
      }}
      // A click on the handle is never a click of the bar.
      onPointerUp={(e) => e.stopPropagation()}
      onLostPointerCapture={() => endGrip(grip.current, 'lost')}
    >
      ⠿
    </span>
  )
}

/**
 * Today's all-day events at the left of the desktop bar (D405): the colour of the first one as a dot, its title cut to
 * about 20 characters with „+N” for the others. Read only – a click is the bar's own click; on hover the label shows
 * every full title in place (no tooltip: it would be a window of its own, D229). It takes its room from the block's
 * name (the flexible part): never wider than 55% of the row, truncated; on hover only that cap rises (80%) – the label
 * never shrinks (`shrink-0` in both states: a neighbour without `flex-1`, as in the request line, would leave it narrower),
 * still one line – the row never changes its height (the bar's window would be re-sized at every pass of the pointer, T748).
 */
export function AllDayLabel({ allDay, open }: { allDay: BarAllDay; open?: boolean }) {
  const [hover, setHover] = useState(false)
  const shown = open ?? hover
  return (
    <span
      className={cx('flex min-w-0 items-center gap-1.5 text-[12px] text-fg', shown ? 'max-w-[80%] shrink-0' : 'max-w-[55%] shrink-0')}
      data-testid="bar-allday"
      data-open={shown ? 'on' : 'off'}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: allDay.color }} data-testid="bar-allday-dot" />
      <span className="min-w-0 truncate" data-testid="bar-allday-text">
        {shown ? allDay.full : allDay.text}
      </span>
    </span>
  )
}

/** The time of a request so far as „0:12” (D312). */
function elapsed(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** The request running now, in place of the block (D312): „Pilne · Mama · 0:12 z 30 min · Koniec”. */
function RequestLine({ run, mode, now, before }: { run: RunningRequest; mode: BarMode; now: number; before?: ReactNode }) {
  return (
    <span className="flex min-w-[120px] flex-1 items-center gap-1.5" data-testid="bar-request">
      {before}
      <span className="min-w-0 truncate text-fg">
        {run.mode === 'urgent' ? 'Pilne' : 'Zrobione teraz'} · {run.person} · <span className="num">{elapsed(now - run.from)}</span>
        {run.mode === 'urgent' && run.estimateMin != null ? ` z ${run.estimateMin} min` : ''}
      </span>
      <BarButton mode={mode} accent testId="bar-request-end" onAct={() => act('requestEnd')}>
        Koniec
      </BarButton>
    </span>
  )
}

/** An automatic action in „Zrobione automatycznie” with its „Cofnij” (not the information-only ones, D350). */
function AutoRow({ item, mode, indent }: { item: AutoItem; mode: BarMode; indent?: boolean }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', indent && 'pl-3')} data-testid="bar-auto">
      <span className="min-w-0 text-[12px] text-fg">{item.text}</span>
      {item.undo && (
        <BarButton mode={mode} testId="bar-auto-undo" onAct={() => act('undo', item.id)}>
          Cofnij
        </BarButton>
      )}
    </div>
  )
}

/** How many of the other rows of „Zrobione automatycznie” the bar shows (the unfolded group shows all of its actions: each has „Cofnij”, D350). */
const AUTOS_SHOWN = 8

/**
 * „Zrobione automatycznie” (D350): the row of the actions as the plan said them unfolds (`open` – its id) into the list of
 * them, each with „Cofnij”; the other actions, a flexible block's pause at a fixed start too, each in a row of its own.
 */
export function AutosList({ autos, mode, open, onToggle }: { autos: WidgetView['autos']; mode: BarMode; open: string | null; onToggle: (id: string) => void }) {
  if (autos.groups.length === 0 && autos.items.length === 0) return null
  return (
    <div className="flex flex-col gap-1" data-testid="bar-autos">
      <span className="text-[12px] text-muted">Zrobione automatycznie:</span>
      {autos.groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-1" data-testid={`bar-autos-group-${g.id}`}>
          <BarButton mode={mode} testId={`bar-autos-toggle-${g.id}`} pressed={open === g.id} onAct={() => onToggle(g.id)}>
            {g.text} {open === g.id ? '▾' : '▸'}
          </BarButton>
          {open === g.id && g.items.map((a) => <AutoRow key={a.id} item={a} mode={mode} indent />)}
        </div>
      ))}
      {autos.items.slice(0, AUTOS_SHOWN).map((a) => (
        <AutoRow key={a.id} item={a} mode={mode} />
      ))}
    </div>
  )
}

/** The estimates of „Pilne” to pick (D311), then ±5. */
const ESTIMATES = [5, 15, 30, 60]

/**
 * „Prośba ▸” unfolded (D311): „Zrobione teraz:” and „Pilne:” with the 3 people asked most often and „inna…”, and
 * „+ Prośba do kolejki”. „Pilne” asks for its estimate first. In the quiet modes (and „Odcinam się”) everything works
 * without a window: another person is „osoba: ?” and „Pilne” takes its default 15 min (spec „Przerwania”); otherwise
 * another person opens the screen of requests.
 */
function RequestUnfold({ view, mode, close }: { view: WidgetView; mode: BarMode; close: () => void }) {
  const [urgent, setUrgent] = useState<{ id: string; name: string } | null>(null)
  const [estimate, setEstimate] = useState(REQUEST_ESTIMATE_MIN)
  const quiet = view.quiet || view.hidden
  const start = (m: 'now' | 'urgent', person: string, est = '') => {
    act('request', `${m}|${person}|${est}`)
    close()
  }
  const queue = () => {
    act('openMain', 'requests')
    close()
  }
  if (urgent)
    return (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="bar-request-estimate">
        <span className="text-[12px] text-muted">Pilne · {urgent.name} · szacunek:</span>
        {ESTIMATES.map((m) => (
          <BarButton key={m} mode={mode} testId={`bar-request-estimate-${m}`} pressed={estimate === m} onAct={() => setEstimate(m)}>
            {m}
          </BarButton>
        ))}
        <BarButton mode={mode} repeat onAct={() => setEstimate((x) => Math.max(5, x - 5))}>
          −5
        </BarButton>
        <span className="num text-[12px]" data-testid="bar-request-estimate-value">
          {estimate} min
        </span>
        <BarButton mode={mode} repeat onAct={() => setEstimate((x) => Math.min(REQUEST_ESTIMATE_MAX_MIN, x + 5))}>
          +5
        </BarButton>
        <BarButton mode={mode} accent testId="bar-request-start" onAct={() => start('urgent', urgent.id, String(estimate))}>
          Zacznij
        </BarButton>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5" data-testid="bar-request-group">
      {(['now', 'urgent'] as const).map((m) => (
        <div key={m} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted">{m === 'now' ? 'Zrobione teraz:' : 'Pilne:'}</span>
          {view.requests.people.map((p) => (
            <BarButton key={p.id} mode={mode} testId={`bar-request-${m}-${p.id}`} onAct={() => (m === 'urgent' && !quiet ? setUrgent(p) : start(m, p.id))}>
              {p.name}
            </BarButton>
          ))}
          <BarButton mode={mode} testId={`bar-request-${m}-other`} onAct={() => (quiet ? start(m, '') : queue())}>
            inna…
          </BarButton>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <BarButton mode={mode} testId="bar-request-queue" onAct={queue}>
          + Prośba do kolejki
        </BarButton>
      </div>
    </div>
  )
}

/**
 * The field of the quick capture (D385, D402): a title, Enter saves it as a task into „Skrzynka” (the main process says
 * why when it cannot), Esc folds it – in the main window's bar and in the icon's panel (the desktop bar takes no keys: its
 * „+ Skrzynka” opens the window „Do skrzynki”, D564 P15). The words of dates at the end of the title (`!jutro`, `@pt` – D409) are told in a line
 * under the field before Enter – the field is never in the desktop bar itself, so its height does not change (D229).
 */
function QuickField({ mode, close, text, setText, takeFocus, input }: { mode: BarMode; close: () => void; text: string; setText: (t: string) => void; takeFocus: () => boolean; input: React.RefObject<HTMLInputElement | null> }) {
  useEscapeLayer(true, close)
  // The keys come here when the field opens – not when the bar only changed its layout (no day now, the day back).
  useEffect(() => {
    if (takeFocus()) input.current?.focus()
  }, [])
  const save = () => {
    if (!text.trim()) return
    act('quickAdd', text.slice(0, TITLE_MAX))
    setText('')
    close()
  }
  const { today } = useQuickToday(text)
  const preview = quickPreview(text, today)
  return (
    <div className="flex flex-col gap-0.5" data-testid="bar-quick-field">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[12px] text-muted">Do skrzynki:</span>
        <input
          ref={input}
          className="input h-[24px] min-w-0 flex-1 text-[12px]"
          value={text}
          maxLength={TITLE_MAX}
          placeholder="Enter zapisuje"
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
          data-testid="bar-quick-title"
        />
        <BarButton mode={mode} accent testId="bar-quick-save" onAct={save}>
          Zapisz
        </BarButton>
      </div>
      {preview && (
        <span className="text-[12px] text-muted" data-testid="bar-quick-preview">
          {preview}
        </span>
      )}
    </div>
  )
}

/**
 * „+ Skrzynka” of the quick capture (D402: always – in the night's quiet, „Odcinam się”, a session and a class too; D564 P15):
 * in the window's bar and the panel the field unfolds in the bar; on the desktop bar (it takes no keys) the main process
 * opens the window „Do skrzynki”, as its shortcut does.
 */
function QuickButton({ mode, open, toggle }: { mode: BarMode; open: boolean; toggle: () => void }) {
  return (
    <BarButton mode={mode} testId="bar-quick" pressed={open} onAct={() => (mode === 'desktop' ? act('quickOpen') : toggle())}>
      + Skrzynka
    </BarButton>
  )
}

/**
 * „Kroki ▸” of a routine unfolded (D328): its steps ticked one by one, the version („zwykła” or „gorsze dni”) and
 * „✓ Zapisz zaznaczone” – the same save as the card in „Dziś”. It starts as the day has the block (T1108: its version and
 * ticks, one state with the panel „Kroki”); the save writes the version and the change of the ticks against that start into the
 * day (T1112). The change goes as one sign per place of the version (an action's argument is short – 40 ids would not fit,
 * A6-10 review).
 */
function RoutineUnfold({ routine, mode, close }: { routine: BarRoutine; mode: BarMode; close: () => void }) {
  const { version, steps, done, setVersion, flip, change } = useStepPicks(routine)
  const save = () => {
    // The change against the day when unfolded (T1112): a step taken off here goes off, one ticked elsewhere meanwhile stays.
    const diff = change()
    if (!done.size && !diff.includes('r')) return
    act('routine', `${routine.block}|${version}|${diff}`)
    close()
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="bar-routine-steps">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-muted">{routine.name}</span>
        {routine.worse.length > 0 &&
          (['normal', 'worse'] as const).map((v) => (
            <BarButton
              key={v}
              mode={mode}
              pressed={version === v}
              testId={`bar-routine-version-${v}`}
              // D481: the day's version of the block at once – the panel „Kroki” and the card in „Dziś” switch with it.
              onAct={() => {
                setVersion(v)
                if (v !== version) act('routineVersion', `${routine.block}|${v}`)
              }}
            >
              {v === 'normal' ? 'zwykła' : 'gorsze dni'}
            </BarButton>
          ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s, k) => (
          <BarButton key={s.id} mode={mode} pressed={done.has(s.id)} testId={`bar-routine-step-${s.id}`} onAct={() => flip(s.id)}>
            {done.has(s.id) ? '✓ ' : ''}
            {s.name || `krok ${k + 1}`}
            {s.min > 0 ? ` · ${s.min} min` : ''}
          </BarButton>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <BarButton mode={mode} accent testId="bar-routine-save" onAct={save}>
          ✓ Zapisz zaznaczone{done.size ? ` (${done.size})` : ''}
        </BarButton>
      </div>
    </div>
  )
}

/**
 * The step of the block in the foreground (D440): „☐ <krok> · krok 1/4” – the box is the tick (a click, also on the desktop
 * bar that takes no keys – D229), the next step comes with the view; after the last one „Wszystkie kroki ✓”. No sound.
 */
export function StepLine({ steps, mode }: { steps: BarSteps; mode: BarMode }) {
  const step = steps.step
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]" data-testid="bar-step">
      {step ? (
        <>
          <BarButton mode={mode} testId="bar-step-tick" label={`Odhacz: ${step.title}`} onAct={() => act('step', `${steps.block}|${step.id}`)}>
            ☐
          </BarButton>
          <span className="min-w-0 truncate text-fg" data-testid="bar-step-text">
            {barStepText(steps)}
          </span>
        </>
      ) : (
        <span className="text-muted" data-testid="bar-step-text">
          {ALL_STEPS_TEXT}
        </span>
      )}
    </div>
  )
}

/** A line with its answers; „Skończył się o …” unfolds steps of ±5 min in the line itself, „Kroki ▸” a routine's steps. */
function Line({ line, mode, onSteps }: { line: BarLine; mode: BarMode; onSteps?: (line: string) => void }) {
  const [pick, setPick] = useState<number | null>(null)
  const send = (actionId: string, value?: number) => act('line', `${line.id}|${actionId}${value != null ? `|${value}` : ''}`)
  return (
    // `data-busy`: its ±5 min stand open – a click beside them in the panel never opens the main window (D558).
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid={`bar-line-${line.id}`} data-busy={pick != null ? 'on' : undefined}>
      {line.dot && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-fg" aria-label="czeka na kliknięcie" />}
      <span className="min-w-0 text-[12px] leading-snug text-fg">{line.text}</span>
      {pick != null ? (
        <>
          <BarButton mode={mode} repeat onAct={() => setPick(pick - 5 * 60_000)}>
            −5
          </BarButton>
          <span className="num text-[12px]">{clockOf(pick)}</span>
          <BarButton mode={mode} repeat onAct={() => setPick(pick + 5 * 60_000)}>
            +5
          </BarButton>
          <BarButton mode={mode} accent onAct={() => (send('endedAt', pick), setPick(null))}>
            Zapisz
          </BarButton>
        </>
      ) : (
        line.actions.map((a) => (
          <BarButton
            key={a.id}
            mode={mode}
            testId={`bar-act-${line.id.split(':')[0]}-${a.id}`}
            onAct={() => (a.id === 'endedAt' && line.at != null ? setPick(Math.round(line.at / 60_000) * 60_000) : a.id === 'steps' && onSteps ? onSteps(line.id) : send(a.id))}
          >
            {a.label}
          </BarButton>
        ))
      )}
    </div>
  )
}

/**
 * The window of the desktop bar or the panel tells the main process its content's height (it sizes the window within
 * the work area) and whether something is unfolded (the panel's 60 s do not run then) – at every change, and at every new
 * opening of the icon's panel (`opening`: the main process takes a new opening for folded, but the panel of variants open
 * in the main window stays unfolded in it).
 */
export function useReportLayout(ref: React.RefObject<HTMLElement | null>, unfolded: boolean, opening = 0): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => window.rd.barLayout({ height: el.getBoundingClientRect().height, unfolded })
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, unfolded, opening])
}

/**
 * The main window tells which questions it shows while it is in the foreground (the main process checks presence,
 * D231): „Dalej?” and the lines on view – those folded in „⋯” only while it is unfolded.
 */
function useSeen(view: WidgetView, mode: BarMode, lines: readonly BarLine[]): void {
  const ids = [view.question?.id, ...lines.map((l) => l.id)].filter((x): x is string => !!x && QUESTION_ID.test(x))
  const key = ids.join(',')
  useEffect(() => {
    if (mode !== 'main' || !ids.length || view.day == null) return
    const report = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) window.rd.seen(ids)
    }
    report()
    window.addEventListener('focus', report)
    const timer = setInterval(report, 15_000)
    return () => {
      window.removeEventListener('focus', report)
      clearInterval(timer)
    }
    // The ids by their key.
  }, [key, mode])
}

/**
 * The desktop bar's pulse (D225, on in this computer's settings): at 5 and at 0 min, each step its own class (the next
 * step beats again); never in a quiet mode, in the window or the panel. Without animations the CSS keeps the colour alone.
 */
export function pulseClass(warn: WidgetView['warn'], on: boolean, mode: BarMode, quiet: boolean): string | null {
  if (!on || mode !== 'desktop' || quiet) return null
  return warn === 'five' ? 'rd-bar-pulse-five' : warn === 'zero' ? 'rd-bar-pulse-zero' : null
}

/** The three beats of the pulse (`index.css`: 3 × 1.2 s). */
const PULSE_MS = 3_600

/**
 * The pulse's class while its step beats – once for each step of each block: a bar drawn anew in the same step (a day not
 * counted for a while, „Odcinam się” and „Wracam”) does not beat it again.
 */
function usePulse(step: string | null, key: string): string | null {
  const beaten = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [beat, setBeat] = useState<string | null>(null)
  const id = step ? `${key}|${step}` : null
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  useEffect(() => {
    if (!beatsNow(beaten.current, id)) return
    beaten.current = id
    setBeat(id)
    // The beats end by their own time – a view that flips meanwhile never keeps the class on for good.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setBeat(null), PULSE_MS)
  }, [id])
  return id && beat === id ? step : null
}

/** A step beats when it comes: a step of a block (`<block>|<step>`) once – never again when the bar is drawn anew in it. */
export const beatsNow = (beaten: string | null, id: string | null): boolean => id != null && id !== beaten

/**
 * The lines on view and those gathered in „⋯”: in a quiet mode one fits, otherwise two; a routine's line (D328) and
 * „Zadanie zrobione?” (D384) in a quiet mode always wait in „⋯” – never in the only row beside the session's countdown. The lines of a change with its
 * „Cofnij” (`moved:`, after the day's own – its questions and warnings come first) take one row at most: the newest; the
 * other waits in „⋯”, its „Cofnij” working there. Only the lines on view count as seen (`useSeen`).
 */
export function barLines(lines: readonly BarLine[], quiet: boolean): { shown: BarLine[]; extra: BarLine[] } {
  const fit = quiet ? 1 : 2
  const folds = (l: BarLine) => quiet && (l.id.startsWith('routine:') || l.id.startsWith('task:'))
  const moved = lines.filter((l) => l.id.startsWith('moved:'))
  const later = new Set([...lines.filter(folds), ...moved.slice(1)])
  const front = lines.filter((l) => !later.has(l))
  return { shown: front.slice(0, fit), extra: [...front.slice(fit), ...lines.filter((l) => later.has(l))] }
}

interface BarProps {
  view: WidgetView
  mode: BarMode
  grows?: 'up' | 'down'
  onUnfold?: (unfolded: boolean) => void
  /** The icon's panel's count of its openings: each new one folds what stayed unfolded when it hid (C8). */
  opening?: number
}

/** The bar with its own memory of the last click on a button (the second click of a double click on a button, C8). */
export function Bar(props: BarProps) {
  const clicks = useRef<LastClick>({ button: null, release: null })
  return (
    <ButtonClicks.Provider value={clicks}>
      <BarView {...props} />
    </ButtonClicks.Provider>
  )
}

function BarView({ view, mode, grows = 'up', onUnfold, opening }: BarProps) {
  const now = useNow()
  const brightness = useMachine((s) => s.prefs.brightness)
  const pulse = useMachine((s) => s.prefs.barPulse)
  const [unfold, setUnfold] = useState<Unfold>(null)
  const parallel = view.background.filter((b) => b.group)
  /** The field of the quick capture was just opened: its mount takes the focus (a mount after a change of layout does not). */
  const quickFocus = useRef(false)
  // The flag of an opening lives one commit: set by a click (after this effect – declared first), spent by
  // the field's mount in the next commit (children's effects run first) – never kept for a later one.
  useEffect(() => {
    quickFocus.current = false
  })
  // The row of the actions as the plan said them, unfolded into the list of them (D350).
  const [groupOpen, setGroupOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  // The desktop bar's double click on a free spot opens the main window (D560): the first release waits for the second.
  const firstRelease = useRef<BarRelease | null>(null)
  // A press heard on a control (and slid off it): its release is the control's cancel, never a half of the double click.
  const pressOnControl = useRef(false)
  const freePress = (e: React.PointerEvent) => void (pressOnControl.current = !freeSpot(e.target))
  // A move without a button: no press is held, whatever was heard of it (its release came where the page could not hear it).
  const freeMove = (e: React.PointerEvent) => void (e.buttons === 0 && (pressOnControl.current = false))
  // A cancelled press (touch, pen) never comes back as a release: nothing of it waits.
  const freeCancel = () => {
    pressOnControl.current = false
    firstRelease.current = null
  }
  const freeRelease = (e: React.PointerEvent) => {
    const onControl = pressOnControl.current
    pressOnControl.current = false
    if (e.button !== 0 || onControl || !freeSpot(e.target)) return void (firstRelease.current = null)
    const now = { at: e.timeStamp, x: e.screenX, y: e.screenY }
    if (!secondRelease(firstRelease.current, now)) return void (firstRelease.current = now)
    firstRelease.current = null
    window.rd.showMain()
  }
  const quiet = view.quiet
  const beat = usePulse(pulseClass(view.warn, pulse, mode, quiet), `${view.block?.name ?? ''}|${view.block?.endsAt ?? ''}`)
  // The panel of variants belongs to the main process (D313): one for every window, open while the view has it.
  const variantsOpen = view.variants.open != null
  const toggle = (u: Exclude<Unfold, null>) => {
    // The field of the quick capture opened (not closed): it takes the keys at its mount.
    if (u === 'quick') quickFocus.current = unfold !== 'quick'
    if (u === 'variants') {
      act('variants', variantsOpen ? 'close' : 'open')
      setUnfold(null)
      return
    }
    setUnfold((x) => (x === u ? null : u))
  }
  // „Kroki ▸” of a routine's line (D328): its steps unfold – a second click of the same line folds them.
  const [routineLine, setRoutineLine] = useState<string | null>(null)
  const openRoutine = (line: string) => {
    setUnfold((x) => (x === 'routine' && routineLine === line ? null : 'routine'))
    setRoutineLine(line)
  }
  const routineOpen = unfold === 'routine' ? (view.routines.find((r) => r.line === routineLine) ?? null) : null
  const running = view.requests.running
  const { shown: shownLines, extra } = barLines(view.lines, quiet)
  // The terms of the view (the cost waiting, the note) count from the moment this view reached the window, on its own monotonic clock.
  const received = useRef<{ view: WidgetView; at: number }>({ view, at: performance.now() })
  if (received.current.view !== view) received.current = { view, at: performance.now() }
  const holds = (left: number) => termHolds(received.current.at, left, performance.now())
  const pending = view.pending && holds(view.pending.left) ? view.pending : null
  useSeen(view, mode, unfold === 'more' ? view.lines : shownLines)
  // The cost stands in place of its button when that button is on view; otherwise in the row under the buttons.
  const inPlace =
    !!pending &&
    ((pending.button === 'next' && view.buttons.next) ||
      (pending.button === 'extend' && view.buttons.extend) ||
      (pending.button === 'start' && !!view.buttons.start) ||
      (pending.button.startsWith('bgExtend:') && unfold === 'more' && view.background.some((b) => `bgExtend:${b.id}` === pending.button)))

  useEffect(() => {
    onUnfold?.(unfold != null || variantsOpen)
    if (mode === 'panel') window.rd.panelTouch()
  }, [mode, unfold, variantsOpen, onUnfold])
  // The icon's panel opened again (C8): nothing unfolded before it hid comes back – the field of the quick capture with its
  // text neither; the ±5 min of a line fold by its key (`opening` in it) and the group of „Zrobione automatycznie” with „⋯”.
  const foldedFor = useRef(opening)
  useEffect(() => {
    if (foldedFor.current === opening) return
    foldedFor.current = opening
    setUnfold(null)
    // The panel of variants is the main process's, one for every window: closed when the icon's panel opened it (the main
    // process says who – also while „Odcinam się” hides it), never one the main window's bar has open now.
    if (mode === 'panel' && view.variants.by === 'panel') act('variants', 'close')
  }, [opening])
  // The title typed into the field of the quick capture: the bar's own, so it stays when the layout changes (T763) – and
  // only then: the field closed (Esc, „+”, saved), it is gone (T767).
  const [quickText, setQuickText] = useState('')
  useEffect(() => {
    if (unfold !== 'quick') setQuickText('')
  }, [unfold])
  const takeQuickFocus = () => {
    const now = quickFocus.current
    quickFocus.current = false
    return now
  }
  const quickInput = useRef<HTMLInputElement>(null)
  const quickField = <QuickField mode={mode} close={() => setUnfold(null)} text={quickText} setText={setQuickText} takeFocus={takeQuickFocus} input={quickInput} />
  // A day gone from the view (no folder, a day not counted now): nothing of the day stays unfolded – the panel's 60 s run
  // again and the day's return shows no old unfold; the field of the quick capture stays, with its text (D402: „+” always).
  useEffect(() => {
    if (view.day == null) setUnfold((u) => (u === 'quick' ? u : null))
  }, [view.day])
  // „Odcinam się” (the same bar in the panel, T771): what was unfolded folds – the panel is not kept „unfolded”, „⋯” never
  // comes back after „Wracam”; only the field of the quick capture stays, with its text (T772).
  useEffect(() => {
    if (view.hidden) setUnfold((u) => (u === 'quick' ? u : null))
  }, [view.hidden])
  // The group of „Zrobione automatycznie” folds with its „⋯”, with the day gone from the view and with the group itself.
  const groupGone = !view.autos.groups.some((g) => g.id === groupOpen)
  useEffect(() => {
    if (groupOpen != null && (unfold !== 'more' || view.day == null || groupGone)) setGroupOpen(null)
  }, [groupOpen, unfold, view.day, groupGone])
  // A routine saved elsewhere (the card in „Dziś”, another computer): its line went – its steps fold.
  useEffect(() => {
    if (unfold === 'routine' && !routineOpen) setUnfold(null)
  }, [unfold, routineOpen])

  /** A button of the bar's own, or its cost waiting for the second click in its place. */
  const own = (id: string, label: string, action: WidgetAction, testId: string, arg?: string) =>
    pending?.button === id ? (
      <BarButton key={id} mode={mode} testId={`${testId}-confirm`} accent onAct={() => act('confirm')}>
        {pending.text} · Potwierdź
      </BarButton>
    ) : (
      <BarButton key={id} mode={mode} testId={testId} onAct={() => act(action, arg)}>
        {label}
      </BarButton>
    )

  const unfolded = (unfold || variantsOpen) && (
    <div className="flex flex-col gap-1.5 border-line px-2 py-2" data-testid={`bar-unfold-${unfold ?? 'variants'}`}>
      {variantsOpen && (
        <div className="flex flex-col gap-1" data-testid="bar-variants-panel">
          {view.variants.open!.map((v) => (
            // The buttons stay children of the panel as before (its full width); the changes of order of „Ułóż pod energię”
            // (D374) stand under the button, one under another (T615).
            <Fragment key={v.id}>
              <BarButton mode={mode} testId={`bar-variant-${v.id}`} onAct={() => act('variants', `pick|${v.id}`)}>
                {v.label}
              </BarButton>
              {v.details?.length ? (
                <div className="flex flex-col pl-2 text-[11.5px] text-muted" data-testid={`bar-variant-${v.id}-details`}>
                  {v.details.map((d, i) => (
                    <span key={`${i}:${d}`}>{d}</span>
                  ))}
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      )}
      {unfold === 'request' && <RequestUnfold view={view} mode={mode} close={() => setUnfold(null)} />}
      {unfold === 'quick' && quickField}
      {routineOpen && <RoutineUnfold key={routineOpen.line} routine={routineOpen} mode={mode} close={() => setUnfold(null)} />}
      {unfold === 'signals' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {SIGNALS.map(([id, label]) => (
              <BarButton key={id} mode={mode} testId={`bar-signal-${id}`} onAct={() => (act('signal', id), setUnfold(null))}>
                {label}
              </BarButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {POOLS.map(([pool, label]) => (
              <span key={pool} className="inline-flex items-center gap-1">
                <span className="text-[12px] text-muted">{label}</span>
                {([-10, 0, 10] as const).map((d) => (
                  <BarButton key={d} mode={mode} onAct={() => (act('relative', `${pool}|${d}`), setUnfold(null))}>
                    {d < 0 ? 'gorzej' : d > 0 ? 'lepiej' : 'tak samo'}
                  </BarButton>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}
      {unfold === 'parallel' && (
        <div className="flex flex-col gap-1.5" data-testid="bar-parallel-list">
          {parallel.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-1.5" data-testid={`bar-parallel-${b.id}`}>
              <span className="text-[12px] text-muted">
                {b.name} do {clockOf(b.endsAt)}
              </span>
              <BarButton mode={mode} testId={`bar-front-${b.id}`} onAct={() => (act('front', b.id), setUnfold(null))}>
                Na pierwszy plan
              </BarButton>
            </div>
          ))}
        </div>
      )}
      {unfold === 'more' && (
        <div className="flex flex-col gap-1.5">
          {view.background.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-1.5" data-testid={`bar-bg-${b.id}`}>
              <span className="text-[12px] text-muted">
                W tle: {b.name} do {clockOf(b.endsAt)}
              </span>
              <BarButton mode={mode} onAct={() => act('bgEnd', b.id)}>
                Zakończ teraz
              </BarButton>
              {own(`bgExtend:${b.id}`, 'Przedłuż +15', 'bgExtend', `bar-bg-extend-${b.id}`, `${b.id}|15`)}
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <BarButton mode={mode} testId="bar-water" onAct={() => act('water')}>
              Wypite
            </BarButton>
            <BarButton mode={mode} testId="bar-fewer" onAct={() => act(view.fewer ? 'better' : 'fewer')}>
              {view.fewer ? 'Jest lepiej' : 'Mniej pytań'}
            </BarButton>
            <BarButton mode={mode} testId="bar-replan" onAct={() => toggle('variants')}>
              Przestaw plan
            </BarButton>
          </div>
          <AutosList autos={view.autos} mode={mode} open={groupOpen} onToggle={(id) => setGroupOpen((x) => (x === id ? null : id))} />
          {extra.map((l) => (
            <Line key={`${l.id}|${opening ?? 0}`} line={l} mode={mode} onSteps={openRoutine} />
          ))}
        </div>
      )}
      {unfold === 'extend' && (
        <div className="flex flex-wrap gap-1.5">
          {EXTEND.map((m) => (
            <BarButton key={m} mode={mode} testId={`bar-extend-${m}`} onAct={() => (act('extend', String(m)), setUnfold(null))}>
              +{m} min
            </BarButton>
          ))}
        </div>
      )}
    </div>
  )

  if (view.hidden)
    return (
      <div className={cx('flex flex-wrap items-center gap-2 px-3 py-1.5', mode === 'main' ? 'rounded-md border border-line' : '')} data-testid={`bar-${mode}`} data-tone={view.tone} data-warn={view.warn} data-quiet="off" data-hidden="on">
        <span className="text-[12.5px] text-fg" data-testid="bar-state">
          {view.stateLine}
        </span>
        <BarButton mode={mode} testId="bar-back" accent onAct={() => act('back')}>
          Wracam
        </BarButton>
        {/* „Odcinam się”: a request starts and ends without a window, „Koniec prośby” in the icon's panel (D245). */}
        {running && <RequestLine run={running} mode={mode} now={now} />}
        <BarButton mode={mode} testId="bar-group-request" pressed={unfold === 'request'} onAct={() => toggle('request')}>
          Prośba ▸
        </BarButton>
        <QuickButton mode={mode} open={unfold === 'quick'} toggle={() => toggle('quick')} />
        {view.ritual && (
          <BarButton mode={mode} testId="bar-ritual" onAct={() => act('openMain', 'ritual')}>
            Rytuał
          </BarButton>
        )}
        {unfold === 'request' && (
          <div className="w-full">
            <RequestUnfold view={view} mode={mode} close={() => setUnfold(null)} />
          </div>
        )}
        {unfold === 'quick' && (
          <div className="w-full">
            {quickField}
          </div>
        )}
      </div>
    )

  // Without a day (no data folder, a day that cannot be counted now): its line and the way to the window, nothing else –
  // no countdown, no actions of the day (D327).
  if (view.day == null)
    return (
      <div
        ref={root}
        className={cx('flex flex-col', mode === 'main' ? 'rounded-md border border-line' : '')}
        style={{ background: barBackground(view.tone, view.warn, false, brightness, TONE_SETS[view.toneSet].tones), boxShadow: `inset 4px 0 0 ${view.color}` }}
        data-testid={`bar-${mode}`}
        data-tone={view.tone}
        data-warn={view.warn}
        data-quiet="off"
        data-day="none"
        onPointerDown={mode === 'desktop' ? freePress : undefined}
        onPointerMove={mode === 'desktop' ? freeMove : undefined}
        onPointerUp={mode === 'desktop' ? freeRelease : undefined}
        onPointerCancel={mode === 'desktop' ? freeCancel : undefined}
      >
        <div className={cx('relative flex flex-col gap-1.5 py-1.5 pl-3', mode === 'desktop' ? 'pr-8' : 'pr-2')}>
          {mode === 'desktop' && <DragHandle />}
          {mode === 'desktop' && <BarCorner />}
          {view.lines.map((l) => (
            <div key={l.id} className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid={`bar-line-${l.id}`}>
              <span className="min-w-0 text-[12.5px] leading-snug text-fg">{l.text}</span>
              {/* The window itself needs no way to the window. */}
              {mode !== 'main' &&
                l.actions.map((a) => (
                  <BarButton key={a.id} mode={mode} testId={`bar-act-${l.id}-${a.id}`} onAct={() => window.rd.showMain()}>
                    {a.label}
                  </BarButton>
                ))}
            </div>
          ))}
          <BarNote view={view} mode={mode} />
          {/* D402: „+” always – also without a day (the main process says why when nothing could be saved). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <QuickButton mode={mode} open={unfold === 'quick'} toggle={() => toggle('quick')} />
          </div>
          {unfold === 'quick' && quickField}
        </div>
      </div>
    )

  const left = view.block ? (view.block.endsAt ?? now) - now : 0
  // Today's all-day events (D405): only on the desktop bar, only when there is one – nothing else moves.
  const allDayLabel = mode === 'desktop' && view.allDay ? <AllDayLabel allDay={view.allDay} /> : null
  return (
    <div
      ref={root}
      className={cx('group flex flex-col overflow-hidden', mode === 'main' ? 'rounded-md border border-line' : '', quiet && 'opacity-95', beat)}
      style={{ background: barBackground(view.tone, view.warn, quiet, brightness, TONE_SETS[view.toneSet].tones), boxShadow: `inset 4px 0 0 ${view.color}` }}
      data-testid={`bar-${mode}`}
      data-tone={view.tone}
      data-warn={view.warn}
      data-quiet={quiet ? 'on' : 'off'}
      // A cost waiting for „Potwierdź”: a click beside it in the panel never opens the main window (D558).
      data-busy={pending ? 'on' : undefined}
      onPointerMove={mode === 'panel' ? () => window.rd.panelTouch() : mode === 'desktop' ? freeMove : undefined}
      // A button's own click is its action – only a click beside the buttons is a click of the bar (A7-01).
      onPointerDown={mode === 'desktop' ? freePress : undefined}
      onPointerCancel={mode === 'desktop' ? freeCancel : undefined}
      onPointerUp={
        mode === 'desktop'
          ? (e) => {
              if (!(e.target as Element).closest('button')) act('barClick')
              freeRelease(e)
            }
          : undefined
      }
    >
      {grows === 'up' && unfolded}
      <div className={cx('relative flex flex-col gap-1.5 py-1.5 pl-3', mode === 'desktop' ? 'pr-8' : 'pr-2', quiet && 'gap-1 py-1')}>
        {mode === 'desktop' && <DragHandle />}
        {mode === 'desktop' && <BarCorner />}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {view.question && (
            <div className="flex shrink-0 items-center gap-1.5" data-testid="bar-question">
              <span className="h-[7px] w-[7px] rounded-full bg-fg" />
              <span className="font-medium text-fg">{view.question.text}</span>
              {view.question.actions.map((a) =>
                a.id === 'extend' ? (
                  <BarButton key={a.id} mode={mode} accent pressed={unfold === 'extend'} onAct={() => toggle('extend')}>
                    {a.label}
                  </BarButton>
                ) : (
                  <BarButton key={a.id} mode={mode} accent testId={`bar-q-${a.id}`} onAct={() => act('line', `${view.question!.id}|${a.id}${a.id === 'endedAt' && view.question!.at != null ? `|${view.question!.at}` : ''}`)}>
                    {a.label}
                  </BarButton>
                )
              )}
            </div>
          )}
          {running && !view.block ? (
            // Today's all-day events (D405) stand here too: a request without a block is still today.
            <RequestLine run={running} mode={mode} now={now} before={allDayLabel} />
          ) : (
            <span className="flex min-w-[120px] flex-1 items-center gap-2">
              {allDayLabel}
              <span className="min-w-0 flex-1 truncate text-fg" data-testid="bar-block">
                {view.block ? view.block.name : view.night ? clockOf(now) : 'Bez bloku'}
                {view.block && !quiet && <span className="ml-1.5 text-[12px] text-muted">{view.block.className}</span>}
              </span>
            </span>
          )}
          {view.block && parallel.length > 0 && (
            // D494: the blocks of the parallel group behind – the list unfolds, and any of them comes to the foreground.
            <BarButton mode={mode} testId="bar-parallel" pressed={unfold === 'parallel'} onAct={() => toggle('parallel')}>
              +{parallel.length} w tle
            </BarButton>
          )}
          {view.block && (
            <span className={cx('num shrink-0 text-[14px]', left < 0 ? 'text-rose' : 'text-fg')} data-testid="bar-countdown">
              {left < 0 ? `+${Math.floor(-left / 60_000)} min` : countdown(left)}
            </span>
          )}
          {view.drop && (
            <BarButton mode={mode} testId="bar-drop" onAct={() => act('water')}>
              <span className="text-sea" aria-label="woda – wypite">
                💧 wypite
              </span>
            </BarButton>
          )}
          {view.variants.marker && (
            <BarButton mode={mode} testId="bar-variants" pressed={variantsOpen} onAct={() => toggle('variants')}>
              ◆ warianty
            </BarButton>
          )}
        </div>
        {/* A request while a block stays in the foreground (a block of requests, a fixed block started by the plan). */}
        {running && view.block && (
          <div className="flex min-w-0">
            <RequestLine run={running} mode={mode} now={now} />
          </div>
        )}
        {view.steps && view.block && <StepLine steps={view.steps} mode={mode} />}
        {view.requests.interrupted && (
          <div className="text-[12px] text-muted" data-testid="bar-interrupted">
            {view.requests.interrupted}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {view.buttons.next && own('next', 'Dalej', 'next', 'bar-next')}
          {view.buttons.pause && (
            <BarButton mode={mode} testId="bar-pause" onAct={() => act('pause')}>
              Pauza
            </BarButton>
          )}
          {view.buttons.extend &&
            (pending?.button === 'extend' ? (
              // Before the second click the length goes by 15 min, each step with its own cost (T289).
              <span key="extend" className="inline-flex items-center gap-1">
                <BarButton mode={mode} testId="bar-extend-less" onAct={() => act('extendStep', '-15')}>
                  −15
                </BarButton>
                {own('extend', '', 'extend', 'bar-extend')}
                <BarButton mode={mode} testId="bar-extend-more" onAct={() => act('extendStep', '15')}>
                  +15
                </BarButton>
              </span>
            ) : (
              <BarButton mode={mode} testId="bar-extend" pressed={unfold === 'extend'} onAct={() => toggle('extend')}>
                Przedłuż
              </BarButton>
            ))}
          {view.buttons.workEnd && (
            <BarButton mode={mode} testId="bar-end-work" onAct={() => act('endWork')}>
              Koniec pracy
            </BarButton>
          )}
          {view.buttons.finished && (
            <BarButton mode={mode} testId="bar-finished" onAct={() => act('finished')}>
              Skończyłem
            </BarButton>
          )}
          {view.buttons.start && own('start', view.buttons.start, 'start', 'bar-start')}
          {view.buttons.cutOff && (
            <BarButton mode={mode} testId="bar-cut-off" onAct={() => act('cutOff')}>
              Odcinam się
            </BarButton>
          )}
          {view.ritual && (
            <BarButton mode={mode} testId="bar-ritual" onAct={() => act('openMain', 'ritual')}>
              Rytuał
            </BarButton>
          )}
          {/* Also in the night's quiet: a request can start before 04:00 (D346). */}
          <BarButton mode={mode} testId="bar-group-request" pressed={unfold === 'request'} onAct={() => toggle('request')}>
            Prośba ▸
          </BarButton>
          <QuickButton mode={mode} open={unfold === 'quick'} toggle={() => toggle('quick')} />
          {view.signals && !view.night && (
            <BarButton mode={mode} testId="bar-group-signals" pressed={unfold === 'signals'} onAct={() => toggle('signals')}>
              Sygnały ▸
            </BarButton>
          )}
          {!view.night && (
            <BarButton mode={mode} testId="bar-group-more" pressed={unfold === 'more'} onAct={() => toggle('more')}>
              ⋯{extra.length ? ` ${extra.length}` : ''}
            </BarButton>
          )}
        </div>
        {pending && !inPlace && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="bar-pending">
            <span className="text-[12px] text-fg">{pending.text}</span>
            {pending.steps && (
              <BarButton mode={mode} testId="bar-pending-less" onAct={() => act('extendStep', '-15')}>
                −15
              </BarButton>
            )}
            <BarButton mode={mode} accent testId="bar-confirm" onAct={() => act('confirm')}>
              Potwierdź
            </BarButton>
            {pending.steps && (
              <BarButton mode={mode} testId="bar-pending-more" onAct={() => act('extendStep', '15')}>
                +15
              </BarButton>
            )}
          </div>
        )}
        {view.note && holds(view.note.left) && (
          <div className={cx('text-[12px]', view.note.ok ? 'text-fg' : 'text-rose')} data-testid="bar-note-click">
            {view.note.text}
          </div>
        )}
        {shownLines.map((l) => (
          <Line key={`${l.id}|${opening ?? 0}`} line={l} mode={mode} onSteps={openRoutine} />
        ))}
        <BarNote view={view} mode={mode} />
      </div>
      {grows === 'down' && unfolded}
    </div>
  )
}
