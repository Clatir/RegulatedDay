/**
 * The bar (spec „Widget”, „Cisza”): the same content at the top of the main window, in the icon's panel and on the
 * desktop bar. „Dalej?” has its fixed place at the start; the other questions and silent icons stand at the end and,
 * when they do not fit, gather in „⋯” with a count. Everything is chosen by a click inside the bar – groups, the
 * lengths of „Przedłuż” and the variants unfold within the bar itself, never as a separate window (D229). On the desktop
 * bar the buttons act on the mouse button's release and there are no tooltips (each would be a window on top).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { WidgetAction } from '@shared/api'
import { barBackground } from '@shared/theme'
import { LONGEST, type BarLine, type WidgetView } from '@shared/widget'
import { countdown, useNow } from '../lib/clock'
import { useMachine } from '../store/machine'
import { cx } from '../components/ui'

export type BarMode = 'main' | 'panel' | 'desktop'
type Unfold = 'request' | 'signals' | 'more' | 'extend' | 'variants' | null

const PEOPLE = ['Mama', 'Ola', 'Kuba']
const SIGNALS = ['okulary', 'zatyczki', 'więcej bujania', 'drażnią pytania']

function act(action: WidgetAction, arg?: string): void {
  void window.rd.widgetAction(action, arg)
}

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

function Line({ line, mode }: { line: BarLine; mode: BarMode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid={`bar-line-${line.id}`}>
      {line.dot && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-fg" aria-label="czeka na kliknięcie" />}
      <span className="min-w-0 text-[12px] leading-snug text-fg">{line.text}</span>
      {line.actions.map((a) => (
        <BarButton key={a} mode={mode} onAct={() => act('barClick', `${line.id}:${a}`)}>
          {a}
        </BarButton>
      ))}
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

export function Bar({ view, mode, grows = 'up', onUnfold }: { view: WidgetView; mode: BarMode; grows?: 'up' | 'down'; onUnfold?: (unfolded: boolean) => void }) {
  const now = useNow()
  const brightness = useMachine((s) => s.prefs.brightness)
  const [unfold, setUnfold] = useState<Unfold>(null)
  const root = useRef<HTMLDivElement>(null)
  const toggle = (u: Exclude<Unfold, null>) => setUnfold((x) => (x === u ? null : u))
  const quiet = view.quiet
  // In the quiet modes one line fits, otherwise two; the rest gather in „⋯”.
  const fit = quiet ? 1 : 2
  const shownLines = view.lines.slice(0, fit)
  const extra = view.lines.slice(fit)

  useEffect(() => {
    onUnfold?.(unfold != null)
    if (mode === 'panel') window.rd.panelTouch()
  }, [mode, unfold, onUnfold])

  const unfolded = unfold && (
    <div className="flex flex-col gap-1.5 border-line px-2 py-2" data-testid={`bar-unfold-${unfold}`}>
      {unfold === 'request' && (
        <div className="flex flex-wrap gap-1.5">
          {PEOPLE.map((p) => (
            <BarButton key={p} mode={mode} onAct={() => act('request', p)}>
              + {p}
            </BarButton>
          ))}
          <BarButton mode={mode} onAct={() => act('doneNow')}>
            Zrobione teraz
          </BarButton>
          <BarButton mode={mode} onAct={() => act('urgent')}>
            Pilne
          </BarButton>
        </div>
      )}
      {unfold === 'signals' && (
        <div className="flex flex-wrap gap-1.5">
          {SIGNALS.map((s) => (
            <BarButton key={s} mode={mode} onAct={() => act('barClick', `sygnał:${s}`)}>
              {s}
            </BarButton>
          ))}
          <BarButton mode={mode} onAct={() => act('barClick', 'ocena:lepiej')}>
            lepiej niż rano
          </BarButton>
          <BarButton mode={mode} onAct={() => act('barClick', 'ocena:gorzej')}>
            gorzej
          </BarButton>
        </div>
      )}
      {unfold === 'more' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-muted">W tle: NY do 17:00</span>
            <BarButton mode={mode} onAct={() => act('barClick', 'tło:zakończ')}>
              Zakończ teraz
            </BarButton>
            <BarButton mode={mode} onAct={() => act('barClick', 'tło:przedłuż')}>
              Przedłuż
            </BarButton>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <BarButton mode={mode} onAct={() => act('water')}>
              Wypite
            </BarButton>
            <BarButton mode={mode} onAct={() => act('barClick', 'mniej-pytań')}>
              Mniej pytań
            </BarButton>
          </div>
          <span className="text-[12px] text-muted">Zrobione automatycznie: bloki stałe według planu: 6</span>
          {extra.map((l) => (
            <Line key={l.id} line={l} mode={mode} />
          ))}
        </div>
      )}
      {unfold === 'extend' && (
        <div className="flex flex-wrap gap-1.5">
          {['+15', '+30', '+45', '+60'].map((s) => (
            <BarButton key={s} mode={mode} onAct={() => act('extend', s)}>
              {s} min
            </BarButton>
          ))}
          <span className="self-center text-[12px] text-muted">{LONGEST.extend}</span>
        </div>
      )}
      {unfold === 'variants' && (
        <div className="flex flex-col gap-1">
          {['Skróć spacer o 20 min · granica 17:40', 'Przesuń studia na jutro · regeneracja +45 min', 'Zostaw · przedłużenie 35 min'].map((v, i) => (
            <BarButton key={v} mode={mode} onAct={() => act('variants', String(i))}>
              {v}
            </BarButton>
          ))}
        </div>
      )}
    </div>
  )

  const left = view.block ? Math.max(0, (view.block.endsAt ?? now) - now) : 0
  return (
    <div
      ref={root}
      className={cx('flex flex-col overflow-hidden', mode === 'main' ? 'rounded-md border border-line' : '', quiet && 'opacity-95')}
      style={{ background: barBackground(view.tone, view.warn, quiet, brightness), boxShadow: `inset 4px 0 0 ${view.color}` }}
      data-testid={`bar-${mode}`}
      data-tone={view.tone}
      data-warn={view.warn}
      data-quiet={quiet ? 'on' : 'off'}
      onPointerMove={mode === 'panel' ? () => window.rd.panelTouch() : undefined}
    >
      {grows === 'up' && unfolded}
      <div className={cx('flex flex-col gap-1.5 py-1.5 pr-2 pl-3', quiet && 'gap-1 py-1')}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {view.question && (
            <div className="flex shrink-0 items-center gap-1.5" data-testid="bar-question">
              <span className="h-[7px] w-[7px] rounded-full bg-fg" />
              <span className="font-medium text-fg">{view.question.text}</span>
              {view.question.actions.map((a) => (
                <BarButton key={a} mode={mode} accent onAct={() => act('barClick', `${view.question!.id}:${a}`)}>
                  {a}
                </BarButton>
              ))}
            </div>
          )}
          <span className="min-w-[120px] flex-1 truncate text-fg" data-testid="bar-block">
            {view.block ? view.block.name : 'Bez bloku'}
            {view.block && !quiet && <span className="ml-1.5 text-[12px] text-muted">{view.block.className}</span>}
          </span>
          {view.block && (
            <span className="num shrink-0 text-[14px] text-fg" data-testid="bar-countdown">
              {countdown(left)}
            </span>
          )}
          {view.drop && (
            <span className="shrink-0 text-[13px] text-sea" aria-label="woda">
              💧
            </span>
          )}
          {view.muted && (
            <span className="shrink-0 text-[12px] text-muted" aria-label="dźwięk wyciszony">
              🔇
            </span>
          )}
          <BarButton mode={mode} testId="bar-variants" pressed={unfold === 'variants'} onAct={() => toggle('variants')}>
            ◆ warianty
          </BarButton>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <BarButton mode={mode} testId="bar-next" onAct={() => act('next')}>
            Dalej
          </BarButton>
          <BarButton mode={mode} testId="bar-pause" onAct={() => act('pause')}>
            Pauza
          </BarButton>
          <BarButton mode={mode} testId="bar-extend" pressed={unfold === 'extend'} onAct={() => toggle('extend')}>
            Przedłuż
          </BarButton>
          <BarButton mode={mode} testId="bar-end-work" onAct={() => act('endWork')}>
            Koniec pracy
          </BarButton>
          {view.session && (
            <BarButton mode={mode} testId="bar-finished" onAct={() => act('finished')}>
              Skończyłem
            </BarButton>
          )}
          <BarButton mode={mode} testId="bar-cut-off" onAct={() => act('cutOff')}>
            Odcinam się
          </BarButton>
          <BarButton mode={mode} testId="bar-group-request" pressed={unfold === 'request'} onAct={() => toggle('request')}>
            Prośba ▸
          </BarButton>
          <BarButton mode={mode} testId="bar-group-signals" pressed={unfold === 'signals'} onAct={() => toggle('signals')}>
            Sygnały ▸
          </BarButton>
          <BarButton mode={mode} testId="bar-group-more" pressed={unfold === 'more'} onAct={() => toggle('more')}>
            ⋯{extra.length ? ` ${extra.length}` : ''}
          </BarButton>
        </div>
        {shownLines.map((l) => (
          <Line key={l.id} line={l} mode={mode} />
        ))}
        {view.barNote && mode !== 'desktop' && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted" data-testid="bar-note">
            {view.barNote}
            <BarButton mode={mode} onAct={() => void window.rd.trialAction('placeBar')}>
              Pokaż pasek
            </BarButton>
          </div>
        )}
      </div>
      {grows === 'down' && unfolded}
    </div>
  )
}
