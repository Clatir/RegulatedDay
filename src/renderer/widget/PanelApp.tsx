/**
 * The icon's panel: the bar and, while the widget is hidden, only its state line and the question waiting (spec
 * „Widget”). Esc closes it (after whatever Esc closes first); a line a notification's click opened it for is marked.
 */
import { useEffect, useRef, useState } from 'react'
import { setWindowEscape } from '../lib/escape'
import { useWidget } from '../store/widget'
import { Bar, useReportLayout } from './Bar'

export function PanelApp() {
  const view = useWidget((s) => s.view)
  const [target, setTarget] = useState<{ line: string | null; day: string | null } | null>(null)
  const [unfolded, setUnfolded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReportLayout(ref, unfolded)
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
  return (
    <div ref={ref} className="flex flex-col gap-2 border border-line-strong bg-panel p-2" data-testid="panel">
      {view &&
        (view.hidden ? (
          // The widget hidden („Odcinam się”): the state line with „Wracam” (the bar's own hidden state); the trial's
          // request buttons only in the trial (the requests of the bar come with E5).
          <div className="flex flex-col gap-1.5 px-1 py-1" data-testid="panel-hidden">
            <Bar view={view} mode="panel" grows="down" onUnfold={setUnfolded} />
            {view.day == null && (
              <div className="flex gap-1.5">
                <button type="button" className="btn" onClick={() => void window.rd.widgetAction('request')}>
                  Prośba ▸
                </button>
                <button type="button" className="btn" onClick={() => void window.rd.widgetAction('doneNow')}>
                  Zrobione teraz
                </button>
              </div>
            )}
          </div>
        ) : (
          <Bar view={view} mode="panel" grows="down" onUnfold={setUnfolded} />
        ))}
      {target?.line && (
        <div className="rounded border border-lamp/50 bg-lamp-soft px-2 py-1 text-[12px] text-lamp" data-testid="panel-target">
          Otwarte z powiadomienia: {target.line === 'trial' ? 'linia próby' : target.line}
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
