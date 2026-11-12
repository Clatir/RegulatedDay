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
  const [target, setTarget] = useState<{ line: string | null; day: string | null; quick?: boolean } | null>(null)
  const [unfolded, setUnfolded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReportLayout(ref, unfolded)
  // An opening by the desktop bar's „+” unfolds the field once: a bar drawn anew never opens it again from the same one.
  const usedQuick = useRef<object | null>(null)
  const quickAt = target?.quick && usedQuick.current !== target ? target : null
  useEffect(() => {
    if (quickAt) usedQuick.current = quickAt
  }, [quickAt])
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
