/**
 * What every drawing of the energy shares (D500): the three lanes beside the axis of „Dziś” and the strip at the left edge of a
 * column of „Tydzień” and „3 dni”. The colour, the name and the letter of a pool; the smoothed shape through the samples of the
 * track – monotone between two samples, so it never goes above nor below the forecast's values (T1280); the spans below the
 * reserve; the state of the strip (the weakest pool: dobrze · uwaga · poniżej rezerwy, T1281); the words of the hover.
 */
import type { EnergyTrack } from '@shared/engine/energyTrack'
import { logicalClock } from '@shared/format'
import type { Pool } from '@shared/model/categories'

export const POOLS: readonly Pool[] = ['head', 'emotions', 'senses']
export const POOL_COLOR: Record<Pool, string> = { head: '#F2B66D', emotions: '#D49A97', senses: '#79AFAB' }
export const POOL_NAME: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce' }
/** The letter over a pool's lane and in the legend (D500: G · E · B). */
export const POOL_LETTER: Record<Pool, string> = { head: 'G', emotions: 'E', senses: 'B' }
/** The colour of the reserve's tick. */
export const RESERVE_COLOR = '#D49A97'
/** The scale every drawing of the energy names (D500). */
export const ENERGY_SCALE = 'energia 0–100'

/** A pool's curve: its samples with a value (time, value) and the slope at each one (value a minute). */
export interface Curve {
  t: number[]
  v: number[]
  m: number[]
}

/**
 * The curve of a pool through the samples of the track (a sample without a value is skipped). The slopes are Steffen's
 * (1990): at a sample between a rise and a fall the slope is 0, elsewhere at most twice the smaller of the two neighbouring
 * steps – the cubic between two samples is monotone, so it stays between their values (T1280).
 */
export function poolCurve(track: Pick<EnergyTrack, 'samples'> | null | undefined, pool: Pool): Curve {
  const t: number[] = []
  const v: number[] = []
  for (const s of track?.samples ?? []) {
    if (!Number.isFinite(s[pool]) || (t.length > 0 && s.at <= t[t.length - 1]!)) continue
    t.push(s.at)
    v.push(s[pool])
  }
  const n = t.length
  const d = Array.from({ length: Math.max(0, n - 1) }, (_, k) => (v[k + 1]! - v[k]!) / (t[k + 1]! - t[k]!))
  const m = t.map((_, k) => {
    if (n < 2) return 0
    if (k === 0) return d[0]!
    if (k === n - 1) return d[n - 2]!
    const d0 = d[k - 1]!
    const d1 = d[k]!
    if (d0 * d1 <= 0) return 0
    const h0 = t[k]! - t[k - 1]!
    const h1 = t[k + 1]! - t[k]!
    const p = (d0 * h1 + d1 * h0) / (h0 + h1)
    return Math.sign(d0) * Math.min(Math.abs(d0), Math.abs(d1), 0.5 * Math.abs(p)) * 2
  })
  return { t, v, m }
}

/** The segment of the curve that holds `at` (the last one for its last sample); -1 outside the samples. */
function segmentOf(c: Curve, at: number): number {
  const n = c.t.length
  if (n === 0 || at < c.t[0]! || at > c.t[n - 1]!) return -1
  if (n === 1) return 0
  // The last segment whose start is at or before `at` (binary search: the strip reads every minute of the day).
  let lo = 0
  let hi = n - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (c.t[mid]! <= at) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The value of the smoothed curve at the minute `at` (the cubic of its segment); null outside the samples. */
export function curveAt(c: Curve, at: number): number | null {
  const k = segmentOf(c, at)
  if (k < 0) return null
  if (c.t.length === 1) return c.v[0]!
  const h = c.t[k + 1]! - c.t[k]!
  const s = (at - c.t[k]!) / h
  const s2 = s * s
  const s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * c.v[k]! + (s3 - 2 * s2 + s) * h * c.m[k]! + (-2 * s3 + 3 * s2) * c.v[k + 1]! + (s3 - s2) * h * c.m[k + 1]!
}

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

/** The three pools at a minute, as numbers on the screen (rounded); null outside the samples. */
export type PoolValues = Record<Pool, number>

/** The three smoothed pools at the minute `at`, rounded – the numbers beside „teraz” (D500). */
export function valuesAt(curves: Record<Pool, Curve>, at: number): PoolValues | null {
  const out = {} as PoolValues
  for (const p of POOLS) {
    const v = curveAt(curves[p], at)
    if (v == null) return null
    out[p] = Math.round(v)
  }
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

/** The words of the hover (D500): „10:30 · głowa 71 · emocje 66 · bodźce 41”. */
export function hoverText(at: number, v: Record<Pool, number>): string {
  return [logicalClock(at), ...POOLS.map((p) => `${POOL_NAME[p]} ${Math.round(v[p])}`)].join(' · ')
}

/** The shades of the strip of a column (D500). */
export type StripState = 'ok' | 'watch' | 'low'
export const STRIP_STATE_NAME: Record<StripState, string> = { ok: 'dobrze', watch: 'uwaga', low: 'poniżej rezerwy' }
/** How far above the reserve the weakest pool still counts as „uwaga” (D500: less than reserve + 15). */
export const WATCH_ABOVE_RESERVE = 15

/**
 * The weakest pool at a minute and its shade (D500): below the reserve – „poniżej rezerwy”, less than 15 above it – „uwaga”,
 * else „dobrze”. Read on the rounded numbers, as the hover shows them (T1281); a tie – the first pool (głowa, emocje, bodźce).
 */
export function stripState(v: Record<Pool, number>, reserve: number): { pool: Pool; state: StripState } {
  let pool: Pool = POOLS[0]!
  for (const p of POOLS) if (Math.round(v[p]) < Math.round(v[pool])) pool = p
  const w = Math.round(v[pool])
  return { pool, state: w < reserve ? 'low' : w < reserve + WATCH_ABOVE_RESERVE ? 'watch' : 'ok' }
}

/** A run of the strip: from `from` to `to` (minutes) one pool is the weakest, in one shade. */
export interface StripRun {
  from: number
  to: number
  pool: Pool
  state: StripState
}

/**
 * The runs of the strip of a column: the smoothed pools read every minute from the first sample to the last, neighbouring
 * minutes of the same weakest pool and shade joined (T1281).
 */
export function stripRuns(track: Pick<EnergyTrack, 'samples' | 'reserve'> | null | undefined): StripRun[] {
  if (!track) return []
  const curves = poolCurves(track)
  const all = POOLS.map((p) => curves[p].t)
  const from = Math.max(...all.map((t) => t[0] ?? Infinity))
  const to = Math.min(...all.map((t) => t[t.length - 1] ?? -Infinity))
  const out: StripRun[] = []
  if (!(from <= to)) return out
  for (let at = from; at <= to; at++) {
    const v = valuesAt(curves, at)
    if (!v) continue
    const { pool, state } = stripState(v, track.reserve)
    const last = out[out.length - 1]
    if (last && last.pool === pool && last.state === state) last.to = Math.min(at + 1, to)
    else out.push({ from: at, to: Math.min(at + 1, to), pool, state })
  }
  return out.filter((r) => r.to > r.from)
}

/** The three curves of a track. */
export function poolCurves(track: Pick<EnergyTrack, 'samples'> | null | undefined): Record<Pool, Curve> {
  return { head: poolCurve(track, 'head'), emotions: poolCurve(track, 'emotions'), senses: poolCurve(track, 'senses') }
}
