/**
 * The energy of a column of „Tydzień” and „3 dni” (D500): a narrow strip at the column's left edge, coloured by the weakest
 * pool at each minute in one of three shades – dobrze · uwaga (the weakest less than 15 above the reserve) · poniżej rezerwy
 * (`stripRuns`, T1281); the blocks stand right of it, nothing lies under them. A day to come is counted from the check-in
 * assumed for it (100 / 100 / 100 at 04:00, D422) – its strip is fainter, with the caption „przyjęte”. The pointer over the strip
 * shows the hour and the three values („10:30 · głowa 71 · emocje 66 · bodźce 41”).
 */
import { useMemo, useState, type MouseEvent } from 'react'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import { ENERGY_SCALE, hoverText, nearestSample, POOL_COLOR, POOL_LETTER, POOL_NAME, POOLS, STRIP_STATE_NAME, stripRuns, WATCH_ABOVE_RESERVE, type StripState } from '../plan/energyDraw'
import { axisY } from './weekLayout'

/** The caption of a strip counted from the assumed check-in. */
export const ASSUMED_CAPTION = 'przyjęte'
/** The strip's width; the blocks of the column start one pixel right of it (D500: nothing under them). */
export const STRIP_WIDTH = 5
/** The opacity of each shade (dobrze faint, poniżej rezerwy full); a day to come – half of it. */
export const STRIP_OPACITY: Record<StripState, number> = { ok: 0.3, watch: 0.65, low: 1 }
export const ASSUMED_FACTOR = 0.5
const STATES: readonly StripState[] = ['ok', 'watch', 'low']

export function EnergyStrip({ date, track, lo, ppm, height }: { date: string; track: EnergyTrack | null; lo: number; ppm: number; height: number }) {
  const runs = useMemo(() => stripRuns(track), [track])
  const [hover, setHover] = useState<{ at: number; text: string } | null>(null)
  if (!track || track.samples.length === 0) return null
  const assumed = track.assumed === true
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const s = nearestSample(track, lo + (e.clientY - e.currentTarget.getBoundingClientRect().top) / ppm)
    setHover(s ? { at: s.at, text: hoverText(s.at, s) } : null)
  }
  return (
    <>
      <div className="absolute top-0 bottom-0 left-0" style={{ width: STRIP_WIDTH + 1 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} data-testid={`week-energy-hit-${date}`}>
        <svg
          className="pointer-events-none absolute top-0 left-0"
          width={STRIP_WIDTH}
          height={height}
          role="img"
          aria-label={`Energia (${ENERGY_SCALE}) – najsłabsza pula${assumed ? ` – ${ASSUMED_CAPTION}` : ''}`}
          data-testid={`week-energy-${date}`}
          data-assumed={assumed ? 'true' : undefined}
        >
          {runs.map((r) => (
            <rect
              key={r.from}
              x={0}
              width={STRIP_WIDTH}
              y={axisY(r.from, lo, ppm)}
              height={Math.max(0, (r.to - r.from) * ppm)}
              fill={POOL_COLOR[r.pool]}
              opacity={STRIP_OPACITY[r.state] * (assumed ? ASSUMED_FACTOR : 1)}
              data-pool={r.pool}
              data-state={r.state}
              data-from={r.from}
              data-to={r.to}
            />
          ))}
        </svg>
      </div>
      {hover && (
        <div
          className="num pointer-events-none absolute z-30 -translate-y-1/2 rounded-sm border border-line bg-bg/95 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-fg"
          style={{ top: axisY(hover.at, lo, ppm), left: STRIP_WIDTH + 3 }}
          data-testid={`week-energy-hover-${date}`}
        >
          {hover.text}
        </div>
      )}
      {assumed && (
        <span className="pointer-events-none absolute top-0.5 right-1 text-[10px] leading-none text-muted" data-testid={`week-energy-assumed-${date}`}>
          {ASSUMED_CAPTION}
        </span>
      )}
    </>
  )
}

/** The legend of the strip (D500): the scale, the colour of each pool, the three shades with what they mean. */
export function EnergyStripLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" data-testid="week-energy-legend">
      <span>{ENERGY_SCALE} · pasek: najsłabsza pula</span>
      {POOLS.map((p) => (
        <span key={p} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-1.5 rounded-[1px]" style={{ background: POOL_COLOR[p] }} />
          {POOL_LETTER[p]} {POOL_NAME[p]}
        </span>
      ))}
      {STATES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1" data-testid={`week-energy-legend-${s}`}>
          <span className="inline-block h-2.5 w-1.5 rounded-[1px]" style={{ background: POOL_COLOR.head, opacity: STRIP_OPACITY[s] }} />
          {s === 'watch' ? `${STRIP_STATE_NAME[s]} (mniej niż ${WATCH_ABOVE_RESERVE} nad rezerwą)` : STRIP_STATE_NAME[s]}
        </span>
      ))}
    </div>
  )
}
