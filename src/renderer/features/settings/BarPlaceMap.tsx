/**
 * The place of the desktop bar (D304): the monitors drawn as Windows lays them out, in proportion; on each the four
 * corners and the middles of the top and bottom edges to click; the bar where it stands now – also a place of your own,
 * dragged by its handle (D303).
 */
import { useEffect, useState } from 'react'
import type { BarScreens } from '@shared/api'
import type { Rect } from '@shared/bounds'
import { BAR_SPOTS, type BarSpot } from '@shared/machine'
import { cx } from '../../components/ui'
import { useMachine } from '../../store/machine'

const SPOT_NAME: Record<BarSpot, string> = {
  'top-left': 'lewy górny róg',
  'top-center': 'środek u góry',
  'top-right': 'prawy górny róg',
  'bottom-left': 'lewy dolny róg',
  'bottom-center': 'środek na dole',
  'bottom-right': 'prawy dolny róg'
}

/** A spot's point on a monitor box (fractions of its width and height). */
const SPOT_AT: Record<BarSpot, [number, number]> = {
  'top-left': [0.1, 0.12],
  'top-center': [0.5, 0.12],
  'top-right': [0.9, 0.12],
  'bottom-left': [0.1, 0.88],
  'bottom-center': [0.5, 0.88],
  'bottom-right': [0.9, 0.88]
}

const pct = (v: number) => `${v * 100}%`

export function BarPlaceMap() {
  const [screens, setScreens] = useState<BarScreens | null>(null)
  // A place changed elsewhere (a drag, the wizard, another window): the mock-up follows (each change of the settings
  // reads the place anew – the key keeps the other settings from asking).
  const placement = useMachine((s) => JSON.stringify(s.prefs.barPlacement))
  const zoom = useMachine((s) => s.prefs.zoom)
  useEffect(() => {
    let live = true
    void window.rd.barScreens().then((s) => live && setScreens(s))
    return () => {
      live = false
    }
  }, [placement, zoom])
  if (!screens || !screens.displays.length) return null

  const all = screens.displays.map((d) => d.bounds)
  const x0 = Math.min(...all.map((b) => b.x))
  const y0 = Math.min(...all.map((b) => b.y))
  const w = Math.max(...all.map((b) => b.x + b.width)) - x0
  const h = Math.max(...all.map((b) => b.y + b.height)) - y0
  // In fractions of the whole layout: the mock-up narrows with the window (at most 360 px).
  const box = (r: Rect) => ({ left: pct((r.x - x0) / w), top: pct((r.y - y0) / h), width: pct(r.width / w), height: pct(r.height / h) })
  const own = screens.bar.spot == null

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-1.5">
      <div className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }} data-testid="bar-place-map">
        {screens.displays.map((d, i) => (
          <div key={d.id} className={cx('absolute rounded-[3px] border', d.primary ? 'border-line-strong' : 'border-line')} style={box(d.bounds)} data-testid={`bar-place-display-${i + 1}`}>
            <span className="num absolute top-1/2 left-1/2 -translate-1/2 text-[11px] whitespace-nowrap text-muted">
              {i + 1}
              {d.primary ? ' · główny' : ''}
            </span>
            {BAR_SPOTS.map((s) => {
              const active = screens.bar.display === d.id && screens.bar.spot === s
              const [fx, fy] = SPOT_AT[s]
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`Monitor ${i + 1}: ${SPOT_NAME[s]}`}
                  aria-pressed={active}
                  className={cx('absolute h-[14px] w-[14px] -translate-1/2 rounded-full border transition-colors', active ? 'border-lamp bg-lamp' : 'border-line-strong bg-panel hover:bg-line')}
                  style={{ left: pct(fx), top: pct(fy) }}
                  onClick={() => void window.rd.placeBar(d.id, s).then(setScreens)}
                  data-testid={`bar-place-${i + 1}-${s}`}
                />
              )
            })}
          </div>
        ))}
        {/* The bar where it stands now. */}
        <div className={cx('pointer-events-none absolute min-h-[3px] rounded-[2px]', own ? 'bg-lamp' : 'bg-lamp/60')} style={box(screens.bar.bounds)} data-testid="bar-place-bar" />
      </div>
      <span className="text-[12px] text-muted" data-testid="bar-place-note">
        {own ? 'Własne miejsce – pasek przeciągnięty za uchwyt ⠿.' : 'Kliknij miejsce na monitorze albo przeciągnij pasek za uchwyt ⠿ (pojawia się po najechaniu).'}
      </span>
    </div>
  )
}
