/**
 * The energy's curve behind the blocks of a column of „Tydzień” and „3 dni” (D417, D422): the three pools, one thin line each,
 * the same sampling and colours as beside the axis of „Dziś” (`EnergyTrack`, `POOL_COLOR`). A day to come is counted from the
 * check-in assumed for it (100 / 100 / 100 at 04:00) – its lines are fainter and dashed, with the caption „przyjęte”.
 */
import type { EnergyTrack } from '@shared/engine/energyTrack'
import type { Pool } from '@shared/model/categories'
import { poolPath as path, POOLS, POOL_COLOR, POOL_NAME } from '../plan/energyDraw'
import { axisY } from './weekLayout'

/** The caption of a curve counted from the assumed check-in. */
export const ASSUMED_CAPTION = 'przyjęte'

/** A pool's line in the column's own box: x as the percent of the width (a pool at 100 leaves a hair of the edge), y in pixels. */
export const poolPath = (track: EnergyTrack, pool: Pool, lo: number, ppm: number): string => path(track, pool, (v) => 2 + v * 0.96, (at) => axisY(at, lo, ppm))

export function EnergyBackdrop({ date, track, lo, ppm, height }: { date: string; track: EnergyTrack | null; lo: number; ppm: number; height: number }) {
  if (!track || track.samples.length === 0) return null
  const assumed = track.assumed === true
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0"
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Energia: ${POOLS.map((p) => POOL_NAME[p]).join(', ')}${assumed ? ` – ${ASSUMED_CAPTION}` : ''}`}
        data-testid={`week-energy-${date}`}
        data-assumed={assumed ? 'true' : undefined}
      >
        {POOLS.map((p) => (
          <path key={p} d={poolPath(track, p, lo, ppm)} fill="none" stroke={POOL_COLOR[p]} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={assumed ? '3 3' : undefined} opacity={assumed ? 0.4 : 0.7} />
        ))}
      </svg>
      {assumed && (
        <span className="pointer-events-none absolute top-0.5 right-1 text-[10px] leading-none text-muted" data-testid={`week-energy-assumed-${date}`}>
          {ASSUMED_CAPTION}
        </span>
      )}
    </>
  )
}
