/**
 * The bar (spec „Widget”, „Cisza”): the same content at the top of the main window, in the icon's panel and on the
 * desktop bar – the engine's view from the main process (one neutral line without a data folder, D327). „Dalej?” has its fixed
 * place at the start; Dalej, Pauza, Przedłuż, Koniec pracy and Odcinam się always stand (in a session also Skończyłem);
 * the other questions and lines at the end, and what does not fit gathers in „⋯” with a count. Everything is chosen by a
 * click inside the bar – groups, the lengths of „Przedłuż”, the steps of „Skończył się o …” unfold within the bar itself,
 * never as a separate window (D229). A first click with a cost shows it in place of its button; the second within 10 s
 * does it. On the desktop bar the buttons act on the mouse button's release and there are no tooltips.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { WidgetAction } from '@shared/api'
import { REQUEST_ESTIMATE_MAX_MIN, REQUEST_ESTIMATE_MIN } from '@shared/engine/requests'
import { barBackground, TONE_SETS } from '@shared/theme'
import { SEEN_LINE, type BarLine, type BarRoutine, type RunningRequest, type WidgetView } from '@shared/widget'
import { countdown, useNow } from '../lib/clock'
import { useMachine } from '../store/machine'
import { cx } from '../components/ui'

export type BarMode = 'main' | 'panel' | 'desktop'
type Unfold = 'request' | 'signals' | 'more' | 'extend' | 'variants' | 'routine' | null

const SIGNALS: Array<[string, string]> = [
  ['glasses', 'okulary'],
  ['earplugs', 'zatyczki'],
  ['rocking', 'więcej bujania'],
  ['questions', 'drażnią pytania']
]
const POOLS: Array<[string, string]> = [
  ['head', 'głowa'],
  ['emotions', 'emocje'],
  ['senses', 'bodźce']
]
const EXTEND = [15, 30, 60]
/** The engine's questions (their id: rule:day:block:threshold) count as seen where they are shown – not the bar's proposals. */
const QUESTION_ID = SEEN_LINE

function act(action: WidgetAction, arg?: string): void {
  void window.rd.widgetAction(action, arg)
}

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** A button of the bar: on the desktop bar it acts on the release of the mouse button (no activation, D229). */
function BarButton({ mode, onAct, children, testId, pressed, accent }: { mode: BarMode; onAct: () => void; children: ReactNode; testId?: string; pressed?: boolean; accent?: boolean }) {
  const props =
    mode === 'desktop'
      ? {
          onPointerUp: (e: React.PointerEvent) => {
            if (e.button === 0) onAct()
          }
        }
      : { onClick: onAct }
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
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
 * The handle the desktop bar is dragged by (D303), seen on hover, over the left padding of the bar's main part: the
 * main process moves the bar after the cursor – one message a frame – and remembers where it is let go.
 */
function DragHandle() {
  const held = useRef(false)
  const frame = useRef(0)
  // Why it ended goes with it (the main process logs it: the trace of a drag that never moved, E4b.12).
  const end = (why: 'up' | 'cancel' | 'lost') => {
    if (!held.current) return
    held.current = false
    cancelAnimationFrame(frame.current)
    frame.current = 0
    window.rd.barDrag('end', why)
  }
  return (
    <span
      aria-label="przeciągnij pasek"
      data-testid="bar-drag"
      className="absolute top-0 left-0 z-10 flex h-full w-3 cursor-grab items-center justify-center text-[12px] text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = true
        window.rd.barDrag('start')
      }}
      onPointerMove={() => {
        if (!held.current || frame.current) return
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          if (held.current) window.rd.barDrag('move')
        })
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        end('up')
      }}
      onPointerCancel={() => end('cancel')}
      onLostPointerCapture={() => end('lost')}
    >
      ⠿
    </span>
  )
}

/** The time of a request so far as „0:12” (D312). */
function elapsed(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** The request running now, in place of the block (D312): „Pilne · Mama · 0:12 z 30 min · Koniec”. */
function RequestLine({ run, mode, now }: { run: RunningRequest; mode: BarMode; now: number }) {
  return (
    <span className="flex min-w-[120px] flex-1 items-center gap-1.5" data-testid="bar-request">
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
        <BarButton mode={mode} onAct={() => setEstimate((x) => Math.max(5, x - 5))}>
          −5
        </BarButton>
        <span className="num text-[12px]" data-testid="bar-request-estimate-value">
          {estimate} min
        </span>
        <BarButton mode={mode} onAct={() => setEstimate((x) => Math.min(REQUEST_ESTIMATE_MAX_MIN, x + 5))}>
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
 * „Kroki ▸” of a routine unfolded (D328): its steps ticked one by one, the version („zwykła” or „gorsze dni”) and
 * „✓ Zapisz zaznaczone” – the same save as the card in „Dziś”. Another version starts with nothing ticked.
 */
function RoutineUnfold({ routine, mode, close }: { routine: BarRoutine; mode: BarMode; close: () => void }) {
  const [version, setVersion] = useState<'normal' | 'worse'>('normal')
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const steps = routine[version]
  const flip = (id: string) =>
    setDone((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const save = () => {
    const ids = steps.filter((s) => done.has(s.id)).map((s) => s.id)
    if (!ids.length) return
    act('routine', `${routine.block}|${version}|${ids.join(',')}`)
    close()
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="bar-routine-steps">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-muted">{routine.name}</span>
        {routine.worse.length > 0 &&
          (['normal', 'worse'] as const).map((v) => (
            <BarButton key={v} mode={mode} pressed={version === v} testId={`bar-routine-version-${v}`} onAct={() => (setVersion(v), setDone(new Set()))}>
              {v === 'normal' ? 'zwykła' : 'gorsze dni'}
            </BarButton>
          ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s, k) => (
          <BarButton key={s.id} mode={mode} pressed={done.has(s.id)} testId={`bar-routine-step-${s.id}`} onAct={() => flip(s.id)}>
            {done.has(s.id) ? '✓ ' : ''}
            {s.name || `krok ${k + 1}`} · {s.min} min
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

/** A line with its answers; „Skończył się o …” unfolds steps of ±5 min in the line itself, „Kroki ▸” a routine's steps. */
function Line({ line, mode, onSteps }: { line: BarLine; mode: BarMode; onSteps?: (line: string) => void }) {
  const [pick, setPick] = useState<number | null>(null)
  const send = (actionId: string, value?: number) => act('line', `${line.id}|${actionId}${value != null ? `|${value}` : ''}`)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid={`bar-line-${line.id}`}>
      {line.dot && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-fg" aria-label="czeka na kliknięcie" />}
      <span className="min-w-0 text-[12px] leading-snug text-fg">{line.text}</span>
      {pick != null ? (
        <>
          <BarButton mode={mode} onAct={() => setPick(pick - 5 * 60_000)}>
            −5
          </BarButton>
          <span className="num text-[12px]">{clockOf(pick)}</span>
          <BarButton mode={mode} onAct={() => setPick(pick + 5 * 60_000)}>
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
 * the work area) and whether something is unfolded (the panel's 60 s do not run then).
 */
export function useReportLayout(ref: React.RefObject<HTMLElement | null>, unfolded: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => window.rd.barLayout({ height: el.getBoundingClientRect().height, unfolded })
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, unfolded])
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

export function Bar({ view, mode, grows = 'up', onUnfold }: { view: WidgetView; mode: BarMode; grows?: 'up' | 'down'; onUnfold?: (unfolded: boolean) => void }) {
  const now = useNow()
  const brightness = useMachine((s) => s.prefs.brightness)
  const pulse = useMachine((s) => s.prefs.barPulse)
  const [unfold, setUnfold] = useState<Unfold>(null)
  const root = useRef<HTMLDivElement>(null)
  const quiet = view.quiet
  // The panel of variants belongs to the main process (D313): one for every window, open while the view has it.
  const variantsOpen = view.variants.open != null
  const toggle = (u: Exclude<Unfold, null>) => {
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
  // In the quiet modes one line fits, otherwise two; the rest gather in „⋯”.
  const fit = quiet ? 1 : 2
  const shownLines = view.lines.slice(0, fit)
  const extra = view.lines.slice(fit)
  const pending = view.pending && view.pending.until > now ? view.pending : null
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
  // A day gone from the view (no folder, a day not counted now): nothing stays unfolded – the panel's 60 s run again and
  // the day's return shows no old unfold.
  useEffect(() => {
    if (view.day == null) setUnfold(null)
  }, [view.day])
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
            <BarButton key={v.id} mode={mode} testId={`bar-variant-${v.id}`} onAct={() => act('variants', `pick|${v.id}`)}>
              {v.label}
            </BarButton>
          ))}
        </div>
      )}
      {unfold === 'request' && <RequestUnfold view={view} mode={mode} close={() => setUnfold(null)} />}
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
          {(view.autos.groups.length > 0 || view.autos.items.length > 0) && (
            <div className="flex flex-col gap-1" data-testid="bar-autos">
              <span className="text-[12px] text-muted">Zrobione automatycznie:</span>
              {view.autos.groups.map((g) => (
                <span key={g} className="text-[12px] text-fg">
                  {g}
                </span>
              ))}
              {view.autos.items.slice(0, 8).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 text-[12px] text-fg">{a.text}</span>
                  {a.undo && (
                    <BarButton mode={mode} onAct={() => act('undo', a.id)}>
                      Cofnij
                    </BarButton>
                  )}
                </div>
              ))}
            </div>
          )}
          {extra.map((l) => (
            <Line key={l.id} line={l} mode={mode} onSteps={openRoutine} />
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
      >
        <div className="relative flex flex-col gap-1.5 py-1.5 pr-2 pl-3">
          {mode === 'desktop' && <DragHandle />}
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
          {view.barNote && mode !== 'desktop' && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-testid="bar-note">
              {view.barNote}
              <BarButton mode={mode} onAct={() => void window.rd.barAction('placeBar')}>
                Pokaż pasek
              </BarButton>
            </div>
          )}
        </div>
      </div>
    )

  const left = view.block ? (view.block.endsAt ?? now) - now : 0
  return (
    <div
      ref={root}
      className={cx('group flex flex-col overflow-hidden', mode === 'main' ? 'rounded-md border border-line' : '', quiet && 'opacity-95', pulseClass(view.warn, pulse, mode, quiet))}
      style={{ background: barBackground(view.tone, view.warn, quiet, brightness, TONE_SETS[view.toneSet].tones), boxShadow: `inset 4px 0 0 ${view.color}` }}
      data-testid={`bar-${mode}`}
      data-tone={view.tone}
      data-warn={view.warn}
      data-quiet={quiet ? 'on' : 'off'}
      onPointerMove={mode === 'panel' ? () => window.rd.panelTouch() : undefined}
      // A button's own click is its action – only a click beside the buttons is a click of the bar (A7-01).
      onPointerUp={mode === 'desktop' ? (e) => !(e.target as Element).closest('button') && act('barClick') : undefined}
    >
      {grows === 'up' && unfolded}
      <div className={cx('relative flex flex-col gap-1.5 py-1.5 pr-2 pl-3', quiet && 'gap-1 py-1')}>
        {mode === 'desktop' && <DragHandle />}
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
            <RequestLine run={running} mode={mode} now={now} />
          ) : (
            <span className="min-w-[120px] flex-1 truncate text-fg" data-testid="bar-block">
              {view.block ? view.block.name : view.night ? clockOf(now) : 'Bez bloku'}
              {view.block && !quiet && <span className="ml-1.5 text-[12px] text-muted">{view.block.className}</span>}
            </span>
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
          {view.muted && (
            <span className="shrink-0 text-[12px] text-muted" aria-label="dźwięk wyciszony">
              🔇
            </span>
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
          {!view.night && (
            <BarButton mode={mode} testId="bar-group-request" pressed={unfold === 'request'} onAct={() => toggle('request')}>
              Prośba ▸
            </BarButton>
          )}
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
        {view.note && view.note.until > now && (
          <div className="text-[12px] text-rose" data-testid="bar-note-click">
            {view.note.text}
          </div>
        )}
        {shownLines.map((l) => (
          <Line key={l.id} line={l} mode={mode} onSteps={openRoutine} />
        ))}
        {view.barNote && mode !== 'desktop' && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-testid="bar-note">
            {view.barNote}
            <BarButton mode={mode} onAct={() => void window.rd.barAction('placeBar')}>
              Pokaż pasek
            </BarButton>
          </div>
        )}
      </div>
      {grows === 'down' && unfolded}
    </div>
  )
}
