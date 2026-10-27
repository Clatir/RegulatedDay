/**
 * „Strona B tygodnia” (spec „Plan poranny”, D49, D68): the Monday's look at the week before with the measure „czy to
 * pomaga” – „Odcinam się” used, overload signals, boundaries kept (x of y), hours of projects (and, apart, study and
 * journaling counted as a project, D195), shifts of the bedtime – each against the week before it; without a judgement
 * also the use of the computer outside blocks after the end of work (without the time you said was rest), projects
 * after the bedtime and the last use of the computer after it, the regeneration and the requests by person. A measure
 * of a day its module was off on (at any moment) is „brak pomiaru”, never a zero. Preliminary until the Sunday is
 * frozen. Pure: the days come counted as their grade counts them.
 */
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import { addDays } from '../time/zone'
import { type Activity } from './activity'
import { REST_FREE, type DayState } from './day'
import { OPEN, ranMinutes } from './facts'
import { atOf } from './grid'
import { dayOutcome, type BoundaryOutcome } from './outcome'

/** The modules a measure needs (spec „Moduły”): off at any moment of the day – no measure that day. */
export interface MeasureModules {
  energy: boolean
  projects: boolean
  requests: boolean
}

/**
 * The modules of a measure on all day (spec „Moduły”): off at its start (`start`, before the day's first change of it –
 * the change says what it was) or switched off during it – false.
 */
export function modulesOfDay(events: readonly AnyEvent[], start: MeasureModules): MeasureModules {
  const out = { ...start }
  const changed = new Set<keyof MeasureModules>()
  for (const e of [...events].filter(isKnown).sort(compareEvents)) {
    const m: keyof MeasureModules | null = e.k === 'energy.module' ? 'energy' : e.k === 'module.set' && (e.module === 'projects' || e.module === 'requests') ? e.module : null
    if (!m) continue
    const t = e as { on: boolean; was?: boolean }
    if (!changed.has(m)) out[m] = t.was ?? !t.on
    changed.add(m)
    if (!t.on) out[m] = false
  }
  return out
}

export interface DayMeasure {
  date: string
  disconnects: number
  /** Overload signals clicked („Okulary”, „Zatyczki”, „Więcej bujania”, „Drażnią pytania”); null – no measure. */
  signals: number | null
  /** The boundary; null on a free day (not counted in „x z y”). */
  boundary: BoundaryOutcome | null
  projectsMin: number | null
  /** Work blocks counted as a project (study, journaling, watching after the end of work). */
  asProjectMin: number | null
  bedtimeShiftMin: number
  /** Minutes a computer was used outside blocks after the end of work, up to the bedtime (not the time you said was rest). */
  afterWorkUseMin: number
  projectsAfterBedMin: number | null
  /** Minutes after the effective bedtime of the last use of a computer that day; null – none after it. */
  lastUseAfterBedMin: number | null
  regenMin: number
  /** Minutes of requests by person ('?' – nobody named); null – no measure. */
  requestsByPerson: Record<string, number> | null
}

/** Minutes of the day [from, to) a computer was used (indices), from the activity. */
function usedMinutes(state: DayState, activity: Activity, from: number, to: number): boolean[] {
  const out: boolean[] = new Array(Math.max(0, to - from)).fill(false)
  for (let k = from; k < to; k++) {
    const t = atOf(state.grid, k)
    out[k - from] = t >= activity.from && t < activity.now && !activity.unused.some((x) => t >= x.from && t < x.to)
  }
  return out
}

/** Minutes of a block's runs within [from, to) (indices). */
const runsWithin = (runs: ReadonlyArray<{ from: number; to: number }>, from: number, to: number, now: number) =>
  runs.reduce((s, r) => s + Math.max(0, Math.min(r.to === OPEN ? now : r.to, to, now) - Math.max(r.from, from)), 0)

/** A day's measure (the state counted as the grade counts it, `activity` from its log). */
export function dayMeasure(state: DayState, events: readonly AnyEvent[], activity: Activity, modules: MeasureModules, free: boolean): DayMeasure {
  const end = state.grid.length
  const now = Math.min(state.now, end)
  const bed = state.bedtime.effective
  const asProject = new Set(state.asProject)
  let projects = 0
  let counted = 0
  let projectsAfterBed = 0
  for (const b of state.blocks) {
    const f = state.facts.blocks.get(b.id)
    if (!f || f.startedAt == null) continue
    const own = b.isProject
    if (!own && !asProject.has(b.id)) continue
    const min = ranMinutes(f, now)
    if (own) projects += min
    else counted += min
    projectsAfterBed += runsWithin(f.runs, bed, end, now)
  }
  // After the end of work: time without a block that counts as regeneration, a computer in use, not answered „odpoczynek”.
  const workEnd = state.workEnd ?? state.firstEnd ?? end
  const rested = state.explains.filter((x) => x.answer?.cls === 'rest')
  const used = usedMinutes(state, activity, 0, now)
  let afterWork = 0
  for (let k = workEnd; k < Math.min(bed, now); k++) {
    if (state.rest[k] !== REST_FREE || !used[k]) continue
    if (rested.some((x) => k >= x.from && k < (x.to === OPEN ? now : x.to))) continue
    afterWork++
  }
  let lastAfterBed: number | null = null
  for (let k = now - 1; k >= bed; k--) {
    if (used[k]) {
      lastAfterBed = k - bed + 1
      break
    }
  }
  const byPerson: Record<string, number> = {}
  for (const r of state.facts.requests) {
    const min = Math.max(0, Math.min(r.to === OPEN ? now : r.to, now) - r.from)
    if (min > 0) byPerson[r.person ?? '?'] = (byPerson[r.person ?? '?'] ?? 0) + min
  }
  const signals = events.filter((e) => isKnown(e) && e.k === 'energy.signal').length
  return {
    date: state.grid.date,
    disconnects: state.facts.disconnect.length,
    signals: modules.energy ? signals : null,
    boundary: free ? null : dayOutcome(state).boundary,
    projectsMin: modules.projects ? projects : null,
    asProjectMin: modules.projects ? counted : null,
    bedtimeShiftMin: state.bedtime.shiftMin,
    afterWorkUseMin: afterWork,
    projectsAfterBedMin: modules.projects ? projectsAfterBed : null,
    lastUseAfterBedMin: lastAfterBed,
    regenMin: state.regen.totalMin,
    requestsByPerson: modules.requests ? byPerson : null
  }
}

/** A sum over the week, with the days that had no measure. */
export interface Sum {
  value: number
  missing: number
}

export interface WeekTotals {
  /** Days of the week with a measure. */
  days: number
  disconnects: number
  signals: Sum
  /** Boundaries kept of the days that are not free. */
  boundaries: { kept: number; of: number }
  projectsMin: Sum
  asProjectMin: Sum
  bedtimeShiftMin: number
  afterWorkUseMin: number
  projectsAfterBedMin: Sum
  /** Days with a use after the bedtime, and the latest one (minutes after it). */
  usedAfterBed: { days: number; latestMin: number | null }
  regenMin: number
  requestsByPerson: Record<string, number>
  requestsMissing: number
}

export function weekTotals(days: readonly DayMeasure[]): WeekTotals {
  const sum = (pick: (d: DayMeasure) => number | null): Sum =>
    days.reduce<Sum>((s, d) => {
      const v = pick(d)
      return v == null ? { ...s, missing: s.missing + 1 } : { ...s, value: s.value + v }
    }, { value: 0, missing: 0 })
  const byPerson: Record<string, number> = {}
  for (const d of days) for (const [p, m] of Object.entries(d.requestsByPerson ?? {})) byPerson[p] = (byPerson[p] ?? 0) + m
  const after = days.map((d) => d.lastUseAfterBedMin).filter((x): x is number => x != null)
  return {
    days: days.length,
    disconnects: days.reduce((s, d) => s + d.disconnects, 0),
    signals: sum((d) => d.signals),
    boundaries: { kept: days.filter((d) => d.boundary === 'kept').length, of: days.filter((d) => d.boundary != null).length },
    projectsMin: sum((d) => d.projectsMin),
    asProjectMin: sum((d) => d.asProjectMin),
    bedtimeShiftMin: days.reduce((s, d) => s + d.bedtimeShiftMin, 0),
    afterWorkUseMin: days.reduce((s, d) => s + d.afterWorkUseMin, 0),
    projectsAfterBedMin: sum((d) => d.projectsAfterBedMin),
    usedAfterBed: { days: after.length, latestMin: after.length ? Math.max(...after) : null },
    regenMin: days.reduce((s, d) => s + d.regenMin, 0),
    requestsByPerson: byPerson,
    requestsMissing: days.filter((d) => d.requestsByPerson == null).length
  }
}

export interface SideB {
  /** The week's Monday. */
  week: string
  /** Its Sunday is not frozen yet: what it shows may still change. */
  preliminary: boolean
  days: DayMeasure[]
  totals: WeekTotals
  /** The week before it (the comparison); null – no day of it measured. */
  previous: WeekTotals | null
}

/** The „Strona B” of the week from Monday `week`, from the measured days of it and of the week before (any order). */
export function sideBOf(week: string, days: readonly DayMeasure[], sundayFrozen: boolean): SideB {
  const inWeek = (d: DayMeasure, monday: string) => d.date >= monday && d.date <= addDays(monday, 6)
  const mine = days.filter((d) => inWeek(d, week)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const before = days.filter((d) => inWeek(d, addDays(week, -7)))
  return { week, preliminary: !sundayFrozen, days: mine, totals: weekTotals(mine), previous: before.length ? weekTotals(before) : null }
}

/** The modules a frozen day's grade keeps for the whole day (null: a grade from before them). */
export function storedModules(grade: Readonly<Record<string, unknown>> | null | undefined): MeasureModules | null {
  const m = grade?.modules
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  const r = m as Record<string, unknown>
  if (typeof r.energy !== 'boolean' || typeof r.projects !== 'boolean' || typeof r.requests !== 'boolean') return null
  return { energy: r.energy, projects: r.projects, requests: r.requests }
}
