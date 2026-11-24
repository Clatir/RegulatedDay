/**
 * What every drawing of the energy shares (D500): the four lanes beside the axis of „Dziś” and the strip at the left edge of a
 * column of „Tydzień” and „3 dni”. The colour, the name and the letter of a pool; the smoothed shape through the samples of the
 * track – monotone between two samples, so it never goes above nor below the forecast's values (T1280); the spans below the
 * reserve; the state of the strip (the weakest pool: dobrze · uwaga · poniżej rezerwy, T1281); the words of the hover. The curve and
 * what is read from it every minute live in `@shared/engine/energyCurve` – the dot of a day of the month reads the same (N21, T2607).
 */
import { curveAt, energySpan, WATCH_ABOVE_RESERVE, type Curve, type EnergyShade } from '@shared/engine/energyCurve'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import { logicalClock } from '@shared/format'
import { COST_MAX, COST_MIN, costNumber } from '@shared/model/blockCosts'
import { POOL_LETTER, type Pool } from '@shared/model/categories'

export const POOLS: readonly Pool[] = ['head', 'emotions', 'senses', 'body']
export const POOL_COLOR: Record<Pool, string> = { head: '#F2B66D', emotions: '#D49A97', senses: '#79AFAB', body: '#B49FCC' }
export const POOL_NAME: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce', body: 'ciało' }
/** The letter over a pool's lane and in the legend (D500, D520: G · E · B · C) – shared with the texts (`@shared/model/categories`). */
export { POOL_LETTER }
/** The colour of the reserve's tick. */
export const RESERVE_COLOR = '#D49A97'
/** The scale every drawing of the energy names (D500). */
export const ENERGY_SCALE = 'energia 0–100'
/** The caption of a drawing counted from the assumed check-in (a day to come – D422; today before its own check-in – T2430). */
export const ASSUMED_CAPTION = 'przyjęte'
/** Such a drawing is fainter: its opacity × this (the lanes of „Dziś” and the strip of a column). */
export const ASSUMED_FACTOR = 0.5
/**
 * The opacity of each shade of the weakest pool (dobrze faint, poniżej rezerwy full) – the strip of a column and the dot of a day of the
 * month (N21); counted from the assumed check-in – `ASSUMED_FACTOR` of it.
 */
export const STRIP_OPACITY: Record<EnergyShade, number> = { ok: 0.3, watch: 0.65, low: 1 }
/** The numbers at „teraz” of the lanes counted from the assumed check-in (T2430). */
export const ASSUMED_NOW_OPACITY = 0.6
/**
 * What the numbers beside a tile are (D7) – one text for the legend and the tile's window: a level of cost an hour, in `RANGES.cost` (−100…100, D568); a cost k
 * takes 3·k points of the pool's 0–100 an hour (spec „Koszt na godzinę”).
 */
export const COST_SCALE_TEXT = `koszt na godzinę, od ${costNumber(COST_MIN)} do ${COST_MAX}; 1 = 3 punkty energii`

/**
 * The smoothed curve (T1280), the numbers on the screen (T1290), the weakest pool of a minute and the strip's runs (T1281) – shared
 * with the dot of a day of the month (N21, T2607).
 */
export { curveAt, energySpan, poolCurve, poolCurves, stripRuns, stripState, valuesAt, type Curve, type PoolValues, type StripRun } from '@shared/engine/energyCurve'
export { onScreen, type OnScreen } from '@shared/engine/energyCurve'

/**
 * The filled bar of a pool's lane: from its left edge `x0` to the curve and back – `x` turns the value (0–100) into the
 * horizontal place, `y` the minute into the vertical one (both linear). Each segment is the cubic Bézier of its Hermite cubic.
 */
export function laneAreaPath(c: Curve, x0: number, x: (value: number) => number, y: (at: number) => number): string {
  const n = c.t.length
  if (n === 0) return ''
  const f = (a: number) => a.toFixed(1)
  const out = [`M${f(x0)},${f(y(c.t[0]!))}`, `L${f(x(c.v[0]!))},${f(y(c.t[0]!))}`]
  for (let k = 0; k < n - 1; k++) {
    const h = (c.t[k + 1]! - c.t[k]!) / 3
    out.push(`C${f(x(c.v[k]! + c.m[k]! * h))},${f(y(c.t[k]! + h))} ${f(x(c.v[k + 1]! - c.m[k + 1]! * h))},${f(y(c.t[k + 1]! - h))} ${f(x(c.v[k + 1]!))},${f(y(c.t[k + 1]!))}`)
  }
  out.push(`L${f(x0)},${f(y(c.t[n - 1]!))}`, 'Z')
  return out.join(' ')
}

/** The minute in `[a, b]` (one segment) where its monotone cubic meets `level` – bisection, its ends lie on both sides. */
function meet(c: Curve, a: number, b: number, level: number): number {
  const below = (curveAt(c, a) ?? level) < level
  let lo = a
  let hi = b
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if ((curveAt(c, mid)! < level) === below) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The spans of minutes where the smoothed curve stands at `level` or above it (the bar drawn full there, lighter elsewhere –
 * D500). Each segment is monotone, so it crosses the level at most once.
 */
export function spansAtLeast(c: Curve, level: number): Array<[number, number]> {
  const n = c.t.length
  const out: Array<[number, number]> = []
  if (n === 0) return out
  let start: number | null = c.v[0]! >= level ? c.t[0]! : null
  for (let k = 0; k < n - 1; k++) {
    const a = c.v[k]! >= level
    const b = c.v[k + 1]! >= level
    if (a === b) continue
    const at = meet(c, c.t[k]!, c.t[k + 1]!, level)
    if (b) start = at
    else if (start != null) {
      out.push([start, at])
      start = null
    }
  }
  if (start != null) out.push([start, c.t[n - 1]!])
  return out
}

/** The sample of the track nearest to the minute `at` (the hover shows the forecast's own numbers); null – no samples. */
export function nearestSample(track: Pick<EnergyTrack, 'samples'> | null | undefined, at: number): EnergyTrack['samples'][number] | null {
  let best: EnergyTrack['samples'][number] | null = null
  for (const s of track?.samples ?? []) {
    if (!POOLS.every((p) => Number.isFinite(s[p]))) continue
    if (!best || Math.abs(s.at - at) < Math.abs(best.at - at)) best = s
  }
  return best
}

/** The words of the hover (D500): „10:30 · głowa 71 · emocje 66 · bodźce 41 · ciało 58”. */
export function hoverText(at: number, v: Record<Pool, number>): string {
  return [logicalClock(at), ...POOLS.map((p) => `${POOL_NAME[p]} ${Math.round(v[p])}`)].join(' · ')
}

/** The shades of the strip of a column (D500) – the shades of the weakest pool, shared with the dot of the month's day (N21, T2600). */
export type StripState = EnergyShade
export const STRIP_STATE_NAME: Record<StripState, string> = { ok: 'dobrze', watch: 'uwaga', low: 'poniżej rezerwy' }
/** How far above the reserve the weakest pool still counts as „uwaga” (D500: less than reserve + 15) – `@shared/engine/energyTrack`. */
export { WATCH_ABOVE_RESERVE }

/**
 * The day has energy to draw (D500): the one test for the lanes of „Dziś”, the strip, its legend and the blocks' offset.
 * A type guard, so the callers read the track as there (the false branch narrows nothing worth using – T1293).
 */
export const hasEnergy = <T extends Pick<EnergyTrack, 'samples'>>(track: T | null | undefined): track is T => energySpan(track) != null
