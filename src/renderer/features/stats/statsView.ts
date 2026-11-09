/**
 * „Statystyki” (D358) as the screen shows them: the scales of the charts, the bars' places and the words of the tables
 * and notes. Pure – the window's tests check it without a DOM. No judgement in the words (no „dobrze”, „źle”), no
 * comparison with anyone.
 */
import type { AccuracyRow, FeltRow, MeanRow, PersonRow, StatsPeriod, StatsResult, WeekBoundaries } from '@shared/engine/stats'
import { countLabel, durationLabel, formatNumber, plDate, plDayMonth } from '@shared/format'
import { addDays } from '@shared/time/zone'

export const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: '4w', label: '4 tygodnie' },
  { value: '3m', label: '3 miesiące' },
  { value: 'all', label: 'Od początku' }
]

/** A step of an axis: 1, 2 or 5 times a power of ten. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

export interface Axis {
  max: number
  ticks: number[]
}

/** The axis of a chart of counts or minutes: from 0 to a round maximum above the largest value, about four steps. */
export function axisOf(values: ReadonlyArray<number | null>, steps = 4): Axis {
  const top = Math.max(0, ...values.map((v) => v ?? 0))
  const step = niceStep(top / steps)
  const max = Math.max(step, step * Math.ceil(top / step))
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) }
}

/** The energy axis: always 0–100 (the check-in's scale is 25–100), a tick every 25. */
export const ENERGY_AXIS: Axis = { max: 100, ticks: [0, 25, 50, 75, 100] }

/** The axis of a share (0–1) shown in percent. */
export const SHARE_AXIS: Axis = { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }

export interface BarPlace {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The places of the bars in a plot of `width` × `height` (its own coordinates, 0 at the top): equal slots, the bar
 * `gap` narrower than its slot; a value above the axis is cut at it, none (null) has no bar, a zero a hairline high.
 */
export function barPlaces(values: ReadonlyArray<number | null>, max: number, width: number, height: number, gap = 0.3): Array<BarPlace | null> {
  const slot = width / Math.max(1, values.length)
  const w = slot * (1 - gap)
  return values.map((v, i) => {
    if (v == null) return null
    const h = max > 0 ? Math.min(1, Math.max(0, v / max)) * height : 0
    return { x: i * slot + (slot - w) / 2, y: height - Math.max(h, v > 0 ? 1 : 0), w, h: Math.max(h, v > 0 ? 1 : 0) }
  })
}

/** Heights of the stacked segments of one bar, from the bottom (the same plot); a bar of nothing has none. */
export function stackPlaces(parts: readonly number[], max: number, height: number): Array<{ y: number; h: number }> {
  let used = 0
  return parts.map((p) => {
    const h = max > 0 ? (p / max) * height : 0
    used += h
    return { y: height - used, h }
  })
}

const WEEKDAY_SHORT = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.']
const WEEKDAY_LONG = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

export const weekdayShort = (day: number): string => WEEKDAY_SHORT[day - 1] ?? ''
export const weekdayLong = (day: number): string => WEEKDAY_LONG[day - 1] ?? ''

const pad = (n: number) => String(n).padStart(2, '0')

/** The bucket of two hours from 04:00: 0 → „04–06”, 11 → „02–04”. */
export function hourLabel(bucket: number): string {
  const from = (4 + bucket * 2) % 24
  return `${pad(from)}–${pad((from + 2) % 24)}`
}

/** A mean energy: „67,5”, or a dash without a check-in. */
export const energyText = (mean: number | null): string => (mean == null ? '–' : formatNumber(mean, Number.isInteger(mean) ? 0 : 1))

export const percentText = (share: number): string => `${formatNumber(Math.round(share * 100))}%`

/**
 * The median of real ÷ planned time in words: „jak w planie” within 5 %, else „o 29% dłużej” / „o 20% krócej” – a
 * description of the time, not of you.
 */
export function ratioText(ratio: number): string {
  const delta = Math.round(Math.abs(ratio - 1) * 100)
  if (delta < 5) return 'jak w planie'
  return `o ${delta}% ${ratio > 1 ? 'dłużej' : 'krócej'}`
}

export const checkinsText = (n: number): string => countLabel(n, 'check-in', 'check-iny', 'check-inów')

export const minutesText = (min: number): string => (min > 0 ? durationLabel(min) : '0 min')

/** The line under the period: how many frozen days were counted and over what, and the ones left out. */
export function daysNote(r: Pick<StatsResult, 'days' | 'first' | 'last' | 'unreadable'>): string {
  const parts = [`dni zamrożone: ${r.days}`]
  if (r.first && r.last) parts.push(r.first === r.last ? plDate(r.first) : `${plDate(r.first)}–${plDate(r.last)}`)
  if (r.unreadable) parts.push(`nieczytelne: ${r.unreadable}`)
  return parts.join(' · ')
}

/** Why the screen shows no numbers (too few frozen days), or null. */
export function tooLittle(r: Pick<StatsResult, 'enough' | 'days'>, min: number): string | null {
  if (r.enough) return null
  return r.days === 0
    ? 'Za mało danych: w tym okresie nie ma jeszcze zamrożonego dnia. Statystyki liczą tylko dni potwierdzone – zamraża je aplikacja po oknie korekty.'
    : `Za mało danych: ${countLabel(r.days, 'dzień zamrożony', 'dni zamrożone', 'dni zamrożonych')} w tym okresie. Statystyki pokazuję od ${min} dni zamrożonych – mniej to tylko przypadek.`
}

export interface ChartBar {
  label: string
  value: number | null
  /** The text over the bar. */
  text: string
}

export function meanBars(rows: readonly MeanRow[], label: (key: number) => string): ChartBar[] {
  return rows.map((r) => ({ label: label(r.key), value: r.mean, text: energyText(r.mean) }))
}

/** The categories whose felt cost came out „ciężej”: the ones with enough answers, most often first; at most `limit`. */
export function feltBars(rows: readonly FeltRow[], name: (id: string) => string, limit = 8): ChartBar[] {
  return rows
    .filter((r) => r.reliable)
    .slice(0, limit)
    .map((r) => ({ label: name(r.category), value: r.share, text: percentText(r.share) }))
}

export function accuracyBars(rows: readonly AccuracyRow[], name: (id: string) => string, limit = 8): ChartBar[] {
  return rows.slice(0, limit).map((r) => ({ label: name(r.category), value: r.share, text: percentText(r.share) }))
}

export function personBars(rows: readonly PersonRow[], name: (id: string) => string, limit = 8): ChartBar[] {
  return rows.slice(0, limit).map((r) => ({ label: name(r.person), value: r.minutes, text: minutesText(r.minutes) }))
}

/** A week of boundaries by its Monday: „12.10–18.10”. */
export const weekLabel = (week: string): string => `${plDayMonth(week)}–${plDayMonth(addDays(week, 6))}`

/** The parts of a week's bar, in the order of the legend. */
export const BOUNDARY_PARTS = [
  { key: 'kept', label: 'dotrzymane' },
  { key: 'broken', label: 'niedotrzymane' },
  { key: 'noData', label: 'bez danych' },
  { key: 'free', label: 'wolne' }
] as const

export const weekParts = (w: WeekBoundaries): number[] => BOUNDARY_PARTS.map((p) => w[p.key])
export const weekTotal = (w: WeekBoundaries): number => w.kept + w.broken + w.noData + w.free
