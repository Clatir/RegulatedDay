/**
 * The smoothed shape of the energy's curve (D500, T1280) and what is read from it every minute – one shape for the four lanes of
 * „Dziś”, the strip of a column of „Tydzień” and „3 dni” (T1281) and the dot of a day of the month (N21, D595, T2607): monotone
 * between two samples of the track (Steffen's slopes), so it never goes above nor below the forecast's values; each pool's curve
 * from its own samples with a value (`poolCurve`); the span all four have; the weakest pool of a minute and its shade.
 */
import { POOLS, type Pool } from '../model/categories'
// Only a type from the track: this module stays free of the day's engine – the window imports it (the strip, the dot, T2607).
import type { EnergyTrack } from './energyTrack'

/** A value of a pool as the screen shows it – an integer made by `onScreen` only (T1290: the one rounding of the strip's numbers). */
export type OnScreen = number & { readonly __onScreen: true }
/** Rounds a value of a pool to the number the screen shows. */
export const onScreen = (v: number): OnScreen => Math.round(v) as OnScreen

/**
 * The shades of the weakest pool (D500): dobrze · uwaga · poniżej rezerwy – the strip of a column of „Tydzień” and „3 dni” and the
 * dot of a day of the month (N21, D595) – one rule for both (T2600).
 */
export type EnergyShade = 'ok' | 'watch' | 'low'
/** How far above the reserve the weakest pool still counts as „uwaga” (D500: less than reserve + 15). */
export const WATCH_ABOVE_RESERVE = 15

/** The shade of the weakest pool's value (a number on the screen, T1281): below the reserve – low, less than 15 above it – watch, else ok. */
export const shadeOf = (weakest: OnScreen, reserve: number): EnergyShade => (weakest < reserve ? 'low' : weakest < reserve + WATCH_ABOVE_RESERVE ? 'watch' : 'ok')

/**
 * The energy of a day of the month (N21, D595): the weakest pool of the day – the weakest at the strip's darkest minute (T2607) – its
 * number on the screen there and its shade, the reserve and whether the curve is the assumed one (a day to come, today before its own
 * check-in – T903, T2430). Only this goes to the month, never the curve (T2601); counted by `dayEnergy` (`energyCurve.ts`).
 */
export interface DayEnergy {
  pool: Pool
  /** The weakest pool's number on the screen (`onScreen`) at the strip's darkest minute – the lowest the strip shades that day. */
  value: number
  state: EnergyShade
  reserve: number
  assumed: boolean
}

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

/** The four pools at a minute, as numbers on the screen (rounded); null outside the samples. */
export type PoolValues = Record<Pool, OnScreen>

/** The four smoothed pools at the minute `at`, rounded – the numbers beside „teraz” (D500). */
export function valuesAt(curves: Record<Pool, Curve>, at: number): PoolValues | null {
  const out = {} as PoolValues
  for (const p of POOLS) {
    const v = curveAt(curves[p], at)
    if (v == null) return null
    out[p] = onScreen(v)
  }
  return out
}

/**
 * The weakest pool at a minute and its shade (D500): below the reserve – „poniżej rezerwy”, less than 15 above it – „uwaga”,
 * else „dobrze”. The values are the numbers on the screen – rounded once, by `valuesAt` (T1281); the type `OnScreen`
 * lets nothing else in (T1290). A tie – the first pool (głowa, emocje, bodźce, ciało).
 */
export function stripState(v: PoolValues, reserve: number): { pool: Pool; state: EnergyShade } {
  let pool: Pool = POOLS[0]!
  for (const p of POOLS) if (v[p] < v[pool]) pool = p
  const w = v[pool]
  return { pool, state: shadeOf(w, reserve) }
}

/** A run of the strip: from `from` to `to` (minutes) one pool is the weakest, in one shade. */
export interface StripRun {
  from: number
  to: number
  pool: Pool
  state: EnergyShade
}

/** The weakest pool of a minute: which, its number on the screen and its shade. */
export interface Weakest {
  pool: Pool
  value: OnScreen
  state: EnergyShade
}

/**
 * Every minute the strip of a column shades (T1281, T2607): from the first minute of the curves' span to the one before its end,
 * the four smoothed pools as numbers on the screen (`valuesAt`) and the weakest of them with its shade (`stripState`) – the one walk
 * both the strip's runs (`stripRuns`) and the dot of a day of the month (`dayEnergy`) read, so the dot never says what the strip
 * does not. Nothing to shade (no track, no span) – `visit` is never called.
 */
export function eachStripMinute(track: Pick<EnergyTrack, 'samples' | 'reserve'> | null | undefined, visit: (at: number, weakest: Weakest) => void): void {
  if (!track) return
  const curves = poolCurves(track)
  const span = spanOf(curves)
  if (!span) return
  const [from, to] = span
  for (let at = from; at < to; at++) {
    const v = valuesAt(curves, at)
    if (!v) continue
    const { pool, state } = stripState(v, track.reserve)
    visit(at, { pool, value: v[pool], state })
  }
}

/**
 * The runs of the strip of a column: the smoothed pools read every minute from the first sample to the last, neighbouring
 * minutes of the same weakest pool and shade joined (T1281).
 */
export function stripRuns(track: Pick<EnergyTrack, 'samples' | 'reserve'> | null | undefined): StripRun[] {
  const out: StripRun[] = []
  eachStripMinute(track, (at, { pool, state }) => {
    const last = out[out.length - 1]
    if (last && last.pool === pool && last.state === state) last.to = at + 1
    else out.push({ from: at, to: at + 1, pool, state })
  })
  return out
}

/** The dot of each track counted once: a day remembered with its curve gives the month the same object (`folder.horizonMemo`). */
const dotMemo = new WeakMap<object, DayEnergy | null>()

/**
 * The energy of the day of `track` (N21, D595, T2600, T2607): the strip's darkest minute – of the minutes the strip shades
 * (`eachStripMinute`), the one whose weakest pool is the lowest on the screen; a tie – the pool first of głowa, emocje, bodźce,
 * ciało (as `stripState` within a minute), then the earlier minute. Its value, its shade, the reserve and whether the curve is the
 * assumed one (a day to come, today before its own check-in – T903, T2430). Null – nothing the strip would shade (T1286).
 */
export function dayEnergy(track: Pick<EnergyTrack, 'samples' | 'reserve' | 'assumed'> | null | undefined): DayEnergy | null {
  if (!track) return null
  const known = dotMemo.get(track)
  if (known !== undefined) return known
  let best: Weakest | null = null
  eachStripMinute(track, (_at, w) => {
    if (!best || w.value < best.value || (w.value === best.value && POOLS.indexOf(w.pool) < POOLS.indexOf(best.pool))) best = w
  })
  const found = best as Weakest | null
  const dot: DayEnergy | null = found && { pool: found.pool, value: found.value, state: found.state, reserve: track.reserve, assumed: track.assumed === true }
  dotMemo.set(track, dot)
  return dot
}

/** The span of the curves: from the latest first point to the earliest last one; null when it is not a span (T1290). */
function spanOf(curves: Record<Pool, Curve>): [number, number] | null {
  let from = -Infinity
  let to = Infinity
  for (const p of POOLS) {
    const { t } = curves[p]
    if (t.length === 0) return null
    from = Math.max(from, t[0]!)
    to = Math.min(to, t.at(-1)!)
  }
  return from < to ? [from, to] : null
}

/**
 * The minutes every pool has a value for – from the latest first point of the curves to the earliest last one; null when that
 * is not a span (no track, one sample, pools that never overlap): nothing to draw, neither the lanes nor the strip (T1286).
 * Read from the curves, not the raw samples (T1290): `poolCurve` keeps only rising times, so a track in the wrong order or
 * with two samples of one time has no span here, as it has no curve – the lanes and the strip never disagree.
 */
export function energySpan(track: Pick<EnergyTrack, 'samples'> | null | undefined): [number, number] | null {
  return spanOf(poolCurves(track))
}

/** The four curves of a track. */
export function poolCurves(track: Pick<EnergyTrack, 'samples'> | null | undefined): Record<Pool, Curve> {
  return { head: poolCurve(track, 'head'), emotions: poolCurve(track, 'emotions'), senses: poolCurve(track, 'senses'), body: poolCurve(track, 'body') }
}
