/**
 * Statystyki (D358, spec „Etap 2”): four looks at the frozen days of a period – the patterns of energy (the mean of the
 * check-ins by the time of day and by the day of the week, the categories whose felt cost in the ritual comes out
 * „ciężej” most often), the accuracy of the estimates (plan against real time), the time of requests by person, the
 * boundaries kept. Only frozen days (confirmed data), each counted as its grade counts it; no judgement, no comparison
 * with anyone, no change of any cost (that is E9). A day that cannot be read is left out and counted.
 *
 * „Energia” of a check-in = the mean of the three pools it sets (head, emotions, senses: 100, 85, 65, 45 or 25 each by
 * the two answers of the pool, `checkinStates`), so 25–100. Pure: `dayStats` counts a day (the helper process runs it),
 * `statsOf` puts the days together.
 */
import { compareEvents, isKnown, type FeltCost } from '../model/events'
import { dayEnd, logicalMinuteOf } from '../time/day'
import { addDays, weekday } from '../time/zone'
import { POOLS } from '../model/categories'
import { computeDay, type DayContext } from './day'
import { checkinStates } from './energy'
import { OPEN } from './facts'
import { estimatedBlocks, weekOf } from './game'
import { countedEvents, isFreeDay } from './freeze'
import { dayOutcome, type BoundaryOutcome } from './outcome'
import type { MeasureModules } from './sideB'

export type StatsPeriod = '4w' | '3m' | 'all'
export const STATS_PERIODS: readonly StatsPeriod[] = ['4w', '3m', 'all']

/** Fewer frozen days than this: the screen says there is too little data (the numbers would only be noise). */
export const MIN_STATS_DAYS = 3
/** A category's felt cost counts in the ranking from this many answers. */
export const MIN_FELT_ANSWERS = 3
/** The check-ins by the time of day: buckets of two hours from 04:00 (the day's start). */
export const HOUR_BUCKET_MIN = 120
export const HOUR_BUCKETS = 12

/** The first day of the period (the days from it up to yesterday count); null: from the beginning. */
export function periodFrom(period: StatsPeriod, today: string): string | null {
  return period === '4w' ? addDays(today, -28) : period === '3m' ? addDays(today, -91) : null
}

export type DayBoundary = BoundaryOutcome | 'free'

/** What one frozen day gives the statistics. Plain data (it travels from the helper process). */
export interface DayStats {
  date: string
  /** The check-ins of the day: minute of the logical day (240 = 04:00) and the energy (25–100). */
  checkins: Array<{ minute: number; energy: number }>
  /** The felt cost of the ritual: the day's last answer for each category. */
  felt: Record<string, FeltCost>
  /** The blocks the estimate was judged on. */
  estimates: Array<{ category: string; plannedMin: number; realMin: number; accurate: boolean }>
  /** Requests by person ('?' – nobody named); null – the requests module was off that day („brak pomiaru”). */
  requests: Record<string, { count: number; minutes: number }> | null
  boundary: DayBoundary
}

const BOUNDARIES: readonly BoundaryOutcome[] = ['kept', 'broken', 'noData']

/** The boundary a frozen day's grade keeps (null: a grade without it – the day is counted again). */
export function storedBoundary(grade: Readonly<Record<string, unknown>> | null | undefined): DayBoundary | null {
  if (!grade) return null
  if (grade.free === true) return 'free'
  return (BOUNDARIES as readonly unknown[]).includes(grade.boundary) ? (grade.boundary as BoundaryOutcome) : null
}

/**
 * A frozen day for the statistics: its events up to the ones the freeze names (`know`), as written (the grade's count);
 * `modules` – the modules of the day (a measure of a module that was off is none); `grade` – the grade stored (the
 * boundary comes from it, else from the day).
 */
export function dayStats(ctx: DayContext, know: Readonly<Record<string, number>>, modules: MeasureModules, grade: Readonly<Record<string, unknown>> | null = null): DayStats {
  const counted: DayContext = { ...ctx, events: countedEvents(ctx.events, know), now: Math.max(ctx.now, dayEnd(ctx.date)), asWritten: true }
  const state = computeDay(counted)
  const checkins: DayStats['checkins'] = []
  const felt: Record<string, FeltCost> = {}
  for (const e of counted.events.filter(isKnown).sort(compareEvents)) {
    if (e.k === 'energy.checkin' && modules.energy && !state.facts.undone.has(e.id)) {
      const v = checkinStates(e.answers)
      checkins.push({ minute: logicalMinuteOf(state.grid.date, e.at), energy: POOLS.reduce((s, p) => s + v[p], 0) / POOLS.length })
    } else if (e.k === 'cost.felt') felt[e.category] = e.feel
  }
  const now = Math.min(state.now, state.grid.length)
  let requests: DayStats['requests'] = null
  if (modules.requests) {
    requests = {}
    for (const r of state.facts.requests) {
      const who = r.person ?? '?'
      const min = Math.max(0, Math.min(r.to === OPEN ? now : r.to, now) - r.from)
      const row = (requests[who] ??= { count: 0, minutes: 0 })
      row.count += 1
      row.minutes += min
    }
  }
  const boundary = storedBoundary(grade) ?? (isFreeDay(state, counted.events) ? 'free' : dayOutcome(state).boundary)
  return { date: state.grid.date, checkins, felt, estimates: estimatedBlocks(counted, state).map(({ category, plannedMin, realMin, accurate }) => ({ category, plannedMin, realMin, accurate })), requests, boundary }
}

export interface MeanRow {
  /** The bucket: 0–11 (two hours from 04:00) or the day of the week 1–7 (Monday…Sunday). */
  key: number
  checkins: number
  /** The mean energy 25–100, one decimal; null – no check-in. */
  mean: number | null
}

export interface FeltRow {
  category: string
  answers: number
  heavier: number
  /** heavier / answers, 0–1. */
  share: number
  /** Enough answers (`MIN_FELT_ANSWERS`) to rank it. */
  reliable: boolean
}

export interface AccuracyRow {
  category: string
  blocks: number
  /** The median of real time / planned time, two decimals (1 – exactly as planned). */
  medianRatio: number
  accurate: number
  /** accurate / blocks, 0–1. */
  share: number
}

export interface PersonRow {
  /** The person's id; '?' – nobody named. */
  person: string
  count: number
  minutes: number
}

export interface WeekBoundaries {
  /** The Monday of the week. */
  week: string
  kept: number
  broken: number
  noData: number
  free: number
}

export interface StatsResult {
  period: StatsPeriod
  /** The frozen days counted, the first and the last of them. */
  days: number
  first: string | null
  last: string | null
  /** Frozen days of the period whose records cannot be read now (left out). */
  unreadable: number
  /** At least `MIN_STATS_DAYS` frozen days. */
  enough: boolean
  energy: { checkins: number; byHour: MeanRow[]; byWeekday: MeanRow[]; felt: FeltRow[] }
  accuracy: { blocks: number; accurate: number; rows: AccuracyRow[] }
  requests: { count: number; minutes: number; people: PersonRow[]; /** Days without the measure (the module was off). */ missing: number }
  boundaries: { weeks: WeekBoundaries[]; totals: Omit<WeekBoundaries, 'week'> }
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

function means(keys: readonly number[], samples: ReadonlyArray<{ key: number; energy: number }>): MeanRow[] {
  return keys.map((key) => {
    const own = samples.filter((s) => s.key === key)
    return { key, checkins: own.length, mean: own.length ? round(own.reduce((s, x) => s + x.energy, 0) / own.length, 1) : null }
  })
}

/** The statistics of the frozen days given (any order); `unreadable` – the days of the period left out. */
export function statsOf(period: StatsPeriod, days: readonly DayStats[], unreadable: number): StatsResult {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const samples = sorted.flatMap((d) => d.checkins.map((c) => ({ day: d.date, minute: c.minute, energy: c.energy })))
  const byHour = means(
    Array.from({ length: HOUR_BUCKETS }, (_, i) => i),
    samples.map((s) => ({ key: Math.min(HOUR_BUCKETS - 1, Math.max(0, Math.floor((s.minute - 240) / HOUR_BUCKET_MIN))), energy: s.energy }))
  )
  const byWeekday = means([1, 2, 3, 4, 5, 6, 7], samples.map((s) => ({ key: weekday(s.day), energy: s.energy })))

  const feltBy = new Map<string, { answers: number; heavier: number }>()
  for (const d of sorted)
    for (const [category, feel] of Object.entries(d.felt)) {
      const row = feltBy.get(category) ?? { answers: 0, heavier: 0 }
      row.answers += 1
      if (feel === 'heavier') row.heavier += 1
      feltBy.set(category, row)
    }
  const felt: FeltRow[] = [...feltBy].map(([category, r]) => ({ category, answers: r.answers, heavier: r.heavier, share: r.heavier / r.answers, reliable: r.answers >= MIN_FELT_ANSWERS }))
  felt.sort((a, b) => Number(b.reliable) - Number(a.reliable) || b.share - a.share || b.answers - a.answers || (a.category < b.category ? -1 : 1))

  const estBy = new Map<string, DayStats['estimates']>()
  for (const d of sorted) for (const e of d.estimates) estBy.set(e.category, [...(estBy.get(e.category) ?? []), e])
  const rows: AccuracyRow[] = [...estBy].map(([category, list]) => {
    const accurate = list.filter((e) => e.accurate).length
    return { category, blocks: list.length, medianRatio: round(median(list.map((e) => e.realMin / e.plannedMin)), 2), accurate, share: accurate / list.length }
  })
  rows.sort((a, b) => b.blocks - a.blocks || (a.category < b.category ? -1 : 1))

  const peopleBy = new Map<string, { count: number; minutes: number }>()
  let missing = 0
  for (const d of sorted) {
    if (!d.requests) {
      missing++
      continue
    }
    for (const [person, r] of Object.entries(d.requests)) {
      const row = peopleBy.get(person) ?? { count: 0, minutes: 0 }
      row.count += r.count
      row.minutes += r.minutes
      peopleBy.set(person, row)
    }
  }
  const people: PersonRow[] = [...peopleBy].map(([person, r]) => ({ person, ...r }))
  people.sort((a, b) => b.minutes - a.minutes || b.count - a.count || (a.person < b.person ? -1 : 1))

  const weeks = new Map<string, WeekBoundaries>()
  const totals = { kept: 0, broken: 0, noData: 0, free: 0 }
  for (const d of sorted) {
    const week = weekOf(d.date)
    const w = weeks.get(week) ?? { week, kept: 0, broken: 0, noData: 0, free: 0 }
    w[d.boundary] += 1
    totals[d.boundary] += 1
    weeks.set(week, w)
  }

  return {
    period,
    days: sorted.length,
    first: sorted[0]?.date ?? null,
    last: sorted.at(-1)?.date ?? null,
    unreadable,
    enough: sorted.length >= MIN_STATS_DAYS,
    energy: { checkins: samples.length, byHour, byWeekday, felt },
    accuracy: { blocks: rows.reduce((s, r) => s + r.blocks, 0), accurate: rows.reduce((s, r) => s + r.accurate, 0), rows },
    requests: { count: people.reduce((s, p) => s + p.count, 0), minutes: people.reduce((s, p) => s + p.minutes, 0), people, missing },
    boundaries: { weeks: [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1)), totals }
  }
}
