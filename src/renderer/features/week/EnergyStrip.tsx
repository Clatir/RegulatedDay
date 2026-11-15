/**
 * The energy of a column of „Tydzień” and „3 dni” (D500): a narrow strip at the column's left edge, coloured by the weakest
 * pool at each minute in one of three shades – dobrze · uwaga (the weakest less than 15 above the reserve) · poniżej rezerwy
 * (`stripRuns`, T1281); the blocks stand right of it, nothing lies under them. A day to come is counted from the check-in
 * assumed for it (all pools 100 at 04:00, D422) – its strip is fainter, with the caption „przyjęte”. The pointer over the strip
 * shows the hour and the four values („10:30 · głowa 71 · emocje 66 · bodźce 41 · ciało 58”).
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
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
/** The room the hover takes beside the strip (its words are about 230 px); past the window's right edge it stands left. */
export const HOVER_ROOM = 260
const HOVER_GAP = 3
/** The least the hover keeps from the window's left edge. */
const HOVER_MARGIN = 4

/** Where the hover stands: `top` and `left` (right of the strip) or `right` (left of it). */
type Place = { top: number; left?: number; right?: number }

/**
 * Where the hover stands on the screen (T1287): right of the strip at the pointer's height – out of the column, which clips
 * what leaves it; when that would pass the window's right edge, left of the strip; when that would pass the left edge too
 * (a narrow window), from 4 px of it (T1292). `windowWidth` is the width of the page's content, without a scrollbar.
 */
export function hoverPlace(strip: { left: number; right: number }, y: number, windowWidth: number): Place {
  if (strip.right + HOVER_GAP + HOVER_ROOM <= windowWidth) return { top: y, left: strip.right + HOVER_GAP }
  if (strip.left - HOVER_GAP - HOVER_ROOM < HOVER_MARGIN) return { top: y, left: HOVER_MARGIN }
  return { top: y, right: windowWidth - strip.left + HOVER_GAP }
}

/** The hover's place for the sample at `at` – `strip` is the hit area on the screen now. */
const placeOf = (strip: DOMRect, at: number, lo: number, ppm: number): Place => hoverPlace(strip, strip.top + axisY(at, lo, ppm), document.documentElement.clientWidth)

export function EnergyStrip({ date, track, lo, ppm, height }: { date: string; track: EnergyTrack | null; lo: number; ppm: number; height: number }) {
  const runs = useMemo(() => stripRuns(track), [track])
  // No runs – nothing is drawn (the strip and the lanes read one span, T1286, T1290).
  const drawn = track != null && runs.length > 0
  const hitRef = useRef<HTMLDivElement>(null)
  // The state holds the sample's minute and the place; the words and the values are read from the current track at each
  // render (T1291).
  const [hover, setHover] = useState<{ at: number; place: Place } | null>(null)
  // The column loses its energy without a mouseleave (the hit area unmounts): the hover must not wait for its return (T1292).
  useEffect(() => {
    if (!drawn) setHover(null)
  }, [drawn])
  // The hover follows the strip: the place is counted again when the page scrolls (any scrolling part – the capture) or the
  // window is resized (T1292).
  const hoverAt = hover?.at
  useEffect(() => {
    if (hoverAt == null) return
    const follow = () => {
      const strip = hitRef.current
      if (strip) setHover((h) => (h ? { at: h.at, place: placeOf(strip.getBoundingClientRect(), h.at, lo, ppm) } : h))
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [hoverAt, lo, ppm])
  if (!track || runs.length === 0) return null
  const assumed = track.assumed === true
  const sample = hover ? nearestSample(track, hover.at) : null
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const s = nearestSample(track, lo + (e.clientY - r.top) / ppm)
    // A new state only when the pointer reaches another sample.
    setHover((h) => (s == null ? null : h?.at === s.at ? h : { at: s.at, place: placeOf(r, s.at, lo, ppm) }))
  }
  return (
    <>
      <div ref={hitRef} className="absolute top-0 bottom-0 left-0" style={{ width: STRIP_WIDTH + 1 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} data-testid={`week-energy-hit-${date}`}>
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
      {/* Out of the column (it clips what leaves it, T1287): on the page, at the strip's sample. */}
      {hover && sample &&
        createPortal(
          <div
            className="num pointer-events-none fixed z-50 -translate-y-1/2 rounded-sm border border-line bg-bg/95 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-fg"
            style={hover.place}
            data-testid={`week-energy-hover-${date}`}
          >
            {hoverText(sample.at, sample)}
          </div>,
          document.body
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
