/**
 * Series (OPS1, D381, D382, D401): one block that comes back by a rule – every day, on workdays, every N weeks on chosen
 * weekdays, on the N-th day of a month, on the N-th or last weekday of a month – from its first day until never, a date
 * or N occurrences (series/<id>.json). A change of the whole series applies from a date like a version of a template
 * (`SeriesVersion.from`): a day counted later takes the version of its own date, so a day gone by never changes. „To i
 * następne” is a version from the occurrence's day (T715): a series is one record for good – one count, one end, one
 * place in the list. Records are read tolerantly: a broken one is left out (null), fields this version does not know
 * stay in the file (`seriesJson`).
 */
import type { RawRecord } from '../api'
import { addDays, daysBetween, isIsoDate, weekday } from '../time/zone'
import { weekStart } from '../time/day'
import { MAX_BLOCK_MIN, PLAN_MAX, PLAN_MIN, planBlockFrom, type PlanBlock } from './plan'
import { settingsOn, type DayTypeId, type SettingsChange } from './settings'
import { freshSteps, withStepsJson, type Step } from './steps'

/** The rule of a series (D381, D401). `monthWeekday.nth`: 1–4, or -1 – the last one of the month. */
export type SeriesRule =
  | { kind: 'daily' }
  /** Monday to Friday without the Polish statutory holidays of the holiday calendar (D401). */
  | { kind: 'workdays' }
  /** Every `every` weeks on `days` (1 = Monday … 7 = Sunday), the weeks counted from the week of `anchor`. */
  | { kind: 'weekly'; every: number; days: number[]; anchor: string }
  /** The `day`-th of every month; a month without that day – its last day (D401). */
  | { kind: 'monthDay'; day: number }
  | { kind: 'monthWeekday'; nth: number; weekday: number }

/**
 * The field „W dni szczególne” (D382): held – always; skip – never on a special day; ask – never on a free day („Wolne”),
 * a question of the morning plan on a „zjazd” and a day of regeneration.
 */
export type SpecialDays = 'held' | 'skip' | 'ask'
export const SPECIAL_DAYS: readonly SpecialDays[] = ['held', 'skip', 'ask']
/** A new series asks (D382: by default a free day takes the occurrence away, a „zjazd” and a day of regeneration ask). */
export const DEFAULT_SPECIAL: SpecialDays = 'ask'
/** The special days (D382). */
export const SPECIAL_DAY_TYPES: readonly DayTypeId[] = ['wolne', 'zjazd-stacjonarny', 'zjazd-zdalny', 'regeneracyjny']

/** The fields of a block an occurrence is made of (the day gives its id, origin and source; no anchor – an hour of its own). */
export interface SeriesBlock {
  categoryId: string
  variantId: string | null
  startMin: number
  durationMin: number
  /** An occurrence inherits „stały” (D401). */
  fixed: boolean
  background: boolean | null
  costs: PlanBlock['costs']
  bgCostPct: number | null
  note: string
  name: string | null
  routine: string | null
  /** Its list „Kroki” (D440): every occurrence starts with none ticked – a tick is its day's (T786). */
  steps: Step[]
}

/** The fields of `SeriesBlock`: what a change of the series writes and what tells an occurrence changed on its own day. */
export const SERIES_BLOCK_FIELDS = ['categoryId', 'variantId', 'startMin', 'durationMin', 'fixed', 'background', 'costs', 'bgCostPct', 'note', 'name', 'routine', 'steps'] as const satisfies ReadonlyArray<keyof SeriesBlock>

export interface SeriesVersion {
  /** The version applies from this date (the first one: the series' start). */
  from: string
  block: SeriesBlock
  rule: SeriesRule
  special: SpecialDays
}

export interface Series {
  id: string
  /** The series its occurrences' ids come from (`seriesBlockId`): its own id (a record of another root is read the same way). */
  root: string
  /** The first day it may have an occurrence on. */
  start: string
  /** The last day (inclusive), null – no date. */
  until: string | null
  /** The number of occurrences that end it (D401: those that stood in a plan), null – no number. */
  count: number | null
  versions: SeriesVersion[]
  /** Removed from the list („Usuń … Cała seria”); its days before its end keep their occurrences. */
  archived: boolean
}

/**
 * A series as days are made from it: the record and the last day of its occurrences – its date, or the day its count is
 * reached, whichever comes first (null: no end). The count reads the types of days, so it is resolved once from the files
 * (`seriesPlans`) and every day of the same files gets the same answer.
 */
export interface SeriesPlan {
  series: Series
  last: string | null
}

export const SERIES_COUNT_MAX = 999
/** How far a count looks for its last occurrence (days from the start): a series skipped on every day ends nowhere. */
export const SERIES_SCAN_DAYS = 20 * 366

/** What the holiday calendar answers for a date (the Polish calendar is the only one a rule reads). */
export type PlHolidays = (market: 'PL', date: string) => { closed: boolean }

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const intIn = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null)

/** A rule from a file (or from the window); null – not one. `start` anchors a weekly rule without its own week. */
export function seriesRuleFrom(v: unknown, start: string): SeriesRule | null {
  if (!isPlain(v)) return null
  switch (v.kind) {
    case 'daily':
    case 'workdays':
      return { kind: v.kind }
    case 'weekly': {
      const every = intIn(v.every, 1, 52)
      const days = Array.isArray(v.days) ? [...new Set(v.days.filter((d): d is number => intIn(d, 1, 7) != null))].sort((a, b) => a - b) : []
      if (every == null || !days.length) return null
      return { kind: 'weekly', every, days, anchor: isIsoDate(v.anchor) ? v.anchor : start }
    }
    case 'monthDay': {
      const day = intIn(v.day, 1, 31)
      return day == null ? null : { kind: 'monthDay', day }
    }
    case 'monthWeekday': {
      const nth = v.nth === -1 ? -1 : intIn(v.nth, 1, 4)
      const wd = intIn(v.weekday, 1, 7)
      return nth == null || wd == null ? null : { kind: 'monthWeekday', nth, weekday: wd }
    }
    default:
      return null
  }
}

/** The fields of a block a series keeps (a block of a day or of a file); null – no category, start or length. */
export function seriesBlockFrom(v: unknown): SeriesBlock | null {
  if (!isPlain(v)) return null
  const b = planBlockFrom({ ...v, id: 'series', anchor: null })
  if (!b || b.startMin == null) return null
  return seriesBlockOf(b)
}

/** The fields of a plan block a series keeps (its start must be its own). */
export function seriesBlockOf(b: Pick<PlanBlock, keyof SeriesBlock> & { startMin: number | null }): SeriesBlock {
  return {
    categoryId: b.categoryId,
    variantId: b.variantId,
    startMin: Math.max(PLAN_MIN, Math.min(PLAN_MAX, b.startMin ?? PLAN_MIN)),
    durationMin: Math.max(1, Math.min(MAX_BLOCK_MIN, b.durationMin)),
    fixed: b.fixed,
    background: b.background,
    costs: b.costs,
    bgCostPct: b.bgCostPct,
    note: b.note,
    name: b.name,
    routine: b.routine,
    steps: freshSteps(b.steps)
  }
}

const isSpecial = (v: unknown): v is SpecialDays => typeof v === 'string' && (SPECIAL_DAYS as readonly string[]).includes(v)

/** A series from its file; null – not one (no id, no valid version, a rule this version cannot read). */
export function seriesFrom(v: unknown): Series | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id) return null
  // The versions as a map by the date each applies from (as the app writes them), or a list.
  const raw = Array.isArray(v.versions) ? v.versions : isPlain(v.versions) ? Object.entries(v.versions).map(([from, x]) => (isPlain(x) ? { ...x, from } : x)) : []
  const start0 = isIsoDate(v.start) ? v.start : null
  const versions: SeriesVersion[] = []
  for (const x of raw) {
    if (!isPlain(x) || !isIsoDate(x.from) || versions.some((y) => y.from === x.from)) return null
    const block = seriesBlockFrom(x.block)
    const rule = seriesRuleFrom(x.rule, start0 ?? x.from)
    // A version this version cannot read makes no series: its days would get occurrences the other computers do not.
    if (!block || !rule) return null
    versions.push({ from: x.from, block, rule, special: isSpecial(x.special) ? x.special : DEFAULT_SPECIAL })
  }
  if (!versions.length) return null
  versions.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  const start = start0 ?? versions[0]!.from
  return {
    id: v.id,
    root: typeof v.root === 'string' && v.root ? v.root : v.id,
    start,
    until: isIsoDate(v.until) ? v.until : null,
    count: intIn(v.count, 1, SERIES_COUNT_MAX),
    versions,
    archived: v.archived === true
  }
}

/**
 * A series as written: its versions as a map by date (two computers changing the series merge field by field). Over the
 * file as it was (`before`) unknown fields stay – of the series, of a version, of its block and rule.
 */
export function seriesJson(s: Series, before?: RawRecord | null): RawRecord {
  const rawVersions = isPlain(before?.versions) ? before.versions : {}
  const versions: Record<string, unknown> = {}
  for (const v of s.versions) {
    // A new version (`changedFrom`) is a copy of the one in force at its date: what that one keeps (its block's list with
    // the items this version does not read, fields it does not know) goes on in it too – as `templateJson` copies them.
    const source = isPlain(rawVersions[v.from]) ? v.from : Object.keys(rawVersions).filter((from) => from < v.from && isPlain(rawVersions[from])).sort().at(-1)
    const was = source != null ? (rawVersions[source] as Record<string, unknown>) : {}
    const keep = (k: string) => (isPlain(was[k]) ? (was[k] as Record<string, unknown>) : {})
    versions[v.from] = { ...was, block: withStepsJson({ ...keep('block'), ...v.block } as Record<string, unknown>, v.block.steps, keep('block').steps), rule: { ...(keep('rule').kind === v.rule.kind ? keep('rule') : {}), ...v.rule }, special: v.special }
  }
  const { versions: _v, ...rest } = isPlain(before) ? before : {}
  return { ...rest, schema: 1, id: s.id, root: s.root, start: s.start, until: s.until, count: s.count, archived: s.archived, versions }
}

/** The version of a series in force on `date` (null before its first one). */
export function seriesVersionOn(s: Series, date: string): SeriesVersion | null {
  let found: SeriesVersion | null = null
  for (const v of s.versions) if (v.from <= date) found = v
  return found
}

const daysInMonth = (date: string): number => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate()

/** Whether a rule falls on `date` (the holidays only for „w dni robocze”). */
export function ruleFallsOn(rule: SeriesRule, date: string, holidays: PlHolidays): boolean {
  const wd = weekday(date)
  const day = Number(date.slice(8, 10))
  switch (rule.kind) {
    case 'daily':
      return true
    case 'workdays':
      return wd <= 5 && !holidays('PL', date).closed
    case 'weekly': {
      if (!rule.days.includes(wd)) return false
      const weeks = Math.round(daysBetween(weekStart(rule.anchor), weekStart(date)) / 7)
      return ((weeks % rule.every) + rule.every) % rule.every === 0
    }
    case 'monthDay':
      return day === Math.min(rule.day, daysInMonth(date))
    case 'monthWeekday':
      if (wd !== rule.weekday) return false
      return rule.nth === -1 ? addDays(date, 7).slice(0, 7) !== date.slice(0, 7) : Math.ceil(day / 7) === rule.nth
  }
}

/** What the field „W dni szczególne” does on a day of `type` (D382): the occurrence is held, skipped, or held and asked. */
export function specialOutcome(special: SpecialDays, type: DayTypeId): 'held' | 'skip' | 'ask' {
  if (!SPECIAL_DAY_TYPES.includes(type) || special === 'held') return 'held'
  if (special === 'skip') return 'skip'
  return type === 'wolne' ? 'skip' : 'ask'
}

/** The day's type for the count: its own (a file) or its weekday's by the settings in force on it. */
export type TypeOf = (date: string) => DayTypeId

/**
 * The type of every date as the days are made: the type a day's file gives it (`own`; null – none), else its weekday's
 * by the settings in force on the date (`createDay` – `defaultDayType`). The settings differ only where a change begins.
 */
export function typeOfDays(changes: readonly SettingsChange[], own: (date: string) => DayTypeId | null): TypeOf {
  const sorted = [...changes].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  const byCount = new Map<number, DayTypeId[]>()
  return (date) => {
    const mine = own(date)
    if (mine) return mine
    // As `settingsOn` without an instant: a change „od dziś” of the date itself is not laid on.
    const n = sorted.filter((c) => c.from < date || (c.from === date && c.at == null)).length
    let week = byCount.get(n)
    if (!week) byCount.set(n, (week = settingsOn(changes, date).weekTypes))
    return week[weekday(date) - 1] ?? (weekday(date) >= 6 ? 'weekend' : 'zwykly')
  }
}

/** The days a series falls on by its rules from `from` (inclusive) up to `to` (inclusive, its own end too) – in order. */
export function* ruleDates(s: Series, from: string, to: string | null, holidays: PlHolidays): Generator<string> {
  const end = [to, s.until, addDays(s.start, SERIES_SCAN_DAYS)].filter((x): x is string => x != null).sort()[0]!
  for (let d = from < s.start ? s.start : from; d <= end; d = addDays(d, 1)) {
    const v = seriesVersionOn(s, d)
    if (v && ruleFallsOn(v.rule, d, holidays)) yield d
  }
}

/**
 * The occurrences a series had before `date` that count toward its end (D401): every day its rules fell on that a special
 * day did not skip – also those cancelled or moved away „Tylko to” (they stood in the plan). `typeOf` gives the days' types.
 */
export function countedBefore(s: Series, date: string, typeOf: TypeOf, holidays: PlHolidays): number {
  let n = 0
  for (const d of ruleDates(s, s.start, addDays(date, -1), holidays)) if (specialOutcome(seriesVersionOn(s, d)!.special, typeOf(d)) !== 'skip') n++
  return n
}

/** The last day of a series: its date, or the day its count is reached (D401), whichever is first; null – no end. */
export function seriesLast(s: Series, typeOf: TypeOf, holidays: PlHolidays): string | null {
  if (s.count == null) return s.until
  let n = 0
  for (const d of ruleDates(s, s.start, s.until, holidays)) {
    if (specialOutcome(seriesVersionOn(s, d)!.special, typeOf(d)) === 'skip') continue
    if (++n >= s.count) return d
  }
  return s.until
}

/** The series as days are made from them (their last days by the same types of days on every computer). */
export function seriesPlans(list: readonly Series[], typeOf: TypeOf, holidays: PlHolidays): SeriesPlan[] {
  return [...list].sort((a, b) => (a.id < b.id ? -1 : 1)).map((series) => ({ series, last: seriesLast(series, typeOf, holidays) }))
}

/**
 * The days whose own type the counts of `list` read (to read their files before `seriesPlans`): the rule dates up to the
 * count's end, where `known` does not know the day yet (undefined). The end is counted with the types known so far (an
 * unknown day by its weekday): a day read later may skip an occurrence and move the end – call again until none is left.
 */
export function countDatesToRead(list: readonly Series[], changes: readonly SettingsChange[], known: (date: string) => DayTypeId | null | undefined, holidays: PlHolidays): string[] {
  const typeOf = typeOfDays(changes, (d) => known(d) ?? null)
  const out = new Set<string>()
  for (const s of list) {
    if (s.count == null) continue
    let n = 0
    for (const d of ruleDates(s, s.start, s.until, holidays)) {
      if (known(d) === undefined) out.add(d)
      if (specialOutcome(seriesVersionOn(s, d)!.special, typeOf(d)) !== 'skip' && ++n >= s.count) break
    }
  }
  return [...out].sort()
}

/** The series a block of a day belongs to: its root (`sourceId`) and the part of it that holds the day it came from. */
export function seriesOfBlock(list: readonly Series[], b: Pick<PlanBlock, 'origin' | 'sourceId' | 'movedFrom'>, date: string): Series | null {
  if (b.origin !== 'series' || !b.sourceId) return null
  const parts = list.filter((s) => s.root === b.sourceId).sort((x, y) => (x.start < y.start ? -1 : 1))
  if (!parts.length) return null
  const day = b.movedFrom ?? date
  return [...parts].reverse().find((s) => s.start <= day) ?? parts[0]!
}

/**
 * The series as the list in „Szablony” and the search show them (D381, D401): one per root – the part that holds `today`,
 * else the next one to start, else the last one – without the removed ones (`archived`), by their first day.
 */
export function currentSeries(list: readonly Series[], today: string): Series[] {
  const roots = new Map<string, Series>()
  for (const s of [...list].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))) {
    if (s.archived) continue
    const had = roots.get(s.root)
    // A later part replaces an earlier one unless the earlier one holds today (a part that starts later never does).
    if (!had || s.start <= today || had.start > today || (had.until != null && had.until < today)) roots.set(s.root, s)
  }
  return [...roots.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1))
}
