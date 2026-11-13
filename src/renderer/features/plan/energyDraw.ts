/**
 * What every drawing of the energy's curve shares (the track beside the axis of „Dziś”, the lines behind the columns of „Tydzień”
 * and „3 dni”, D417): the colour and the name of a pool and the path of its line – only the scale of the two axes is the
 * drawing's own.
 */
import type { EnergyTrack } from '@shared/engine/energyTrack'
import type { Pool } from '@shared/model/categories'

export const POOLS: readonly Pool[] = ['head', 'emotions', 'senses']
export const POOL_COLOR: Record<Pool, string> = { head: '#F2B66D', emotions: '#D49A97', senses: '#79AFAB' }
export const POOL_NAME: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce' }

/**
 * The line of a pool through the samples of the track: `x` turns the pool's value (0–100) into the horizontal place, `y` the
 * sample's minute into the vertical one (both in the drawing's own units); a sample without a value is skipped.
 */
export function poolPath(track: Pick<EnergyTrack, 'samples'> | null | undefined, pool: Pool, x: (value: number) => number, y: (at: number) => number): string {
  return (
    track?.samples
      .filter((s) => Number.isFinite(s[pool]))
      .map((s, k) => `${k ? 'L' : 'M'}${x(s[pool]).toFixed(1)},${y(s.at).toFixed(1)}`)
      .join(' ') ?? ''
  )
}
