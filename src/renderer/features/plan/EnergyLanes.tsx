/**
 * The energy beside the axis of „Dziś” (D500): three narrow lanes G · E · B (głowa, emocje, bodźce), each 0–100, a filled bar
 * of the smoothed forecast (`energyDraw.ts`, T1280), lighter where it stands below the reserve; the reserve is a tick in each
 * lane, the letters stay over the lanes while the axis scrolls, the three numbers of now stand at the line „teraz”, and the
 * pointer over the lanes shows the hour and the three values („10:30 · głowa 71 · emocje 66 · bodźce 41”).
 */
import { useId, useMemo, useState, type MouseEvent } from 'react'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import { ENERGY_SCALE, hoverText, laneAreaPath, nearestSample, poolCurves, POOL_COLOR, POOL_LETTER, POOL_NAME, POOLS, RESERVE_COLOR, spansAtLeast, valuesAt } from './energyDraw'

/** The width of the column of lanes (the strip of all-day events leaves the same place free over it). */
export const LANES_WIDTH = 48
/** A lane's width and the gaps around the lanes (pixels): 3 + 12 + 3 + 12 + 3 + 12 + 3 = 48. */
export const LANE_WIDTH = 12
const LANE_GAP = 3
/** The left edge of a pool's lane. */
export const laneLeft = (i: number): number => LANE_GAP + i * (LANE_WIDTH + LANE_GAP)
/** The opacity of the bar at or above the reserve, and below it (D500: lighter). */
export const BAR_OPACITY = 0.85
export const BAR_BELOW_OPACITY = 0.3
/** The height of a number at „teraz”: it stands centred on the line (half above, half below). */
export const NOW_CHIP_HEIGHT = 12

/** `nowColor` – the colour of the axis' line „teraz” (`TONE.fg` in `Timeline`), the lanes draw it on. */
export function EnergyLanes({ track, lo, ppm, height, nowAt, nowColor }: { track: EnergyTrack; lo: number; ppm: number; height: number; nowAt: number | null; nowColor: string }) {
  const clip = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const curves = useMemo(() => poolCurves(track), [track])
  const y = (min: number) => (min - lo) * ppm
  // The bars and their spans at or above the reserve: counted once a track and a scale, not at every move of the pointer.
  const drawn = useMemo(() => {
    const yOf = (min: number) => (min - lo) * ppm
    return POOLS.map((p, i) => {
      const x0 = laneLeft(i)
      return { pool: p, x0, d: laneAreaPath(curves[p], x0, (v) => x0 + (v / 100) * LANE_WIDTH, yOf), spans: spansAtLeast(curves[p], track.reserve) }
    })
  }, [curves, lo, ppm, track.reserve])
  const now = nowAt == null ? null : valuesAt(curves, nowAt)
  const [hover, setHover] = useState<{ at: number; text: string } | null>(null)
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const s = nearestSample(track, lo + (e.clientY - e.currentTarget.getBoundingClientRect().top) / ppm)
    // A new state only when the pointer reaches another sample.
    setHover((h) => (s == null ? null : h?.at === s.at ? h : { at: s.at, text: hoverText(s.at, s) }))
  }
  const reserveX = (i: number) => laneLeft(i) + (track.reserve / 100) * LANE_WIDTH
  return (
    <div className="relative shrink-0 border-l border-line" style={{ width: LANES_WIDTH, height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} data-testid="energy-track">
      <svg width={LANES_WIDTH} height={height} className="absolute top-0 left-0" role="img" aria-label={`${ENERGY_SCALE}: ${POOLS.map((p) => POOL_NAME[p]).join(', ')}; rezerwa ${track.reserve}`}>
        <defs>
          {drawn.map(({ pool: p, spans }) => (
            <clipPath key={p} id={`${clip}-${p}`}>
              {spans.map(([a, b]) => (
                <rect key={a} x={0} width={LANES_WIDTH} y={y(a)} height={Math.max(0, y(b) - y(a))} data-from={a.toFixed(1)} data-to={b.toFixed(1)} />
              ))}
            </clipPath>
          ))}
        </defs>
        {drawn.map(({ pool: p, x0, d }, i) => {
          return (
            <g key={p} data-testid={`energy-lane-${p}`}>
              <rect x={x0} width={LANE_WIDTH} y={0} height={height} fill={POOL_COLOR[p]} opacity={0.08} />
              <path d={d} fill={POOL_COLOR[p]} opacity={BAR_BELOW_OPACITY} data-testid={`energy-bar-${p}`} />
              <path d={d} fill={POOL_COLOR[p]} opacity={BAR_OPACITY} clipPath={`url(#${clip}-${p})`} data-testid={`energy-bar-full-${p}`} />
              <line x1={reserveX(i)} x2={reserveX(i)} y1={0} y2={height} stroke={RESERVE_COLOR} strokeDasharray="2 3" strokeWidth={1} data-testid={`energy-reserve-${p}`} />
            </g>
          )
        })}
        {nowAt != null && <line x1={0} x2={LANES_WIDTH} y1={y(nowAt)} y2={y(nowAt)} stroke={nowColor} strokeWidth={1} data-testid="energy-now-line" />}
        {hover && <line x1={0} x2={LANES_WIDTH} y1={y(hover.at)} y2={y(hover.at)} stroke={nowColor} strokeOpacity={0.5} strokeWidth={1} />}
      </svg>
      {/* The letters over the lanes – they stay at the top while the axis scrolls. */}
      <div className="pointer-events-none sticky top-0 z-10 h-3 bg-bg/85" data-testid="energy-letters">
        {POOLS.map((p, i) => (
          <span key={p} className="absolute top-0 text-center text-[9px] leading-3 font-medium" style={{ left: laneLeft(i), width: LANE_WIDTH, color: POOL_COLOR[p] }} title={POOL_NAME[p]}>
            {POOL_LETTER[p]}
          </span>
        ))}
      </div>
      {nowAt != null && now && (
        // Each number centred on the line „teraz”: its top half its height above the line.
        <div className="pointer-events-none absolute inset-0 z-10" data-testid="energy-now">
          {POOLS.map((p, i) => (
            <span
              key={p}
              className="num absolute rounded-[2px] bg-bg/90 text-center text-[9px]"
              style={{ top: y(nowAt) - NOW_CHIP_HEIGHT / 2, height: NOW_CHIP_HEIGHT, lineHeight: `${NOW_CHIP_HEIGHT}px`, left: laneLeft(i) - 1, width: LANE_WIDTH + 2, color: POOL_COLOR[p] }}
              aria-label={`${POOL_NAME[p]} ${now[p]}`}
              data-testid={`energy-now-${p}`}
            >
              {now[p]}
            </span>
          ))}
        </div>
      )}
      {hover && (
        <div className="num pointer-events-none absolute right-full z-30 mr-1 -translate-y-1/2 rounded-sm border border-line bg-bg/95 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-fg" style={{ top: y(hover.at) }} data-testid="energy-hover">
          {hover.text}
        </div>
      )}
    </div>
  )
}

/** The legend of the lanes (D500): the scale, the three letters with their pools, the reserve, the lighter bar below it. */
export function EnergyLegend({ reserve }: { reserve: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" data-testid="energy-legend">
      <span>{ENERGY_SCALE}</span>
      {POOLS.map((p) => (
        <span key={p} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: POOL_COLOR[p], opacity: BAR_OPACITY }} />
          {POOL_LETTER[p]} {POOL_NAME[p]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-0 border-l border-dashed" style={{ borderColor: RESERVE_COLOR }} />
        rezerwa {reserve}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: POOL_COLOR.head, opacity: BAR_BELOW_OPACITY }} />
        jaśniej – poniżej rezerwy
      </span>
    </div>
  )
}
