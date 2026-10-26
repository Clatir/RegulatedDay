/**
 * The shared settings the engine reads (spec „Macierz ustawień”, „Domyślne ustawienia typów dni”): kept in rd.json as a
 * timeline of changes, each with the date it applies from (by default tomorrow; „od dziś” also adds a snapshot to the
 * day, spec „Model dnia”). The settings of a date are the defaults with every change from that date or earlier laid over
 * them in order. A value outside its range is dropped back to the value before it – the schema refuses only that field.
 */
import { DEFAULT_CATEGORIES, rulesOf, type CategoryRules } from './categories'
import { isIsoDate } from '../time/zone'

export type DayTypeId = 'zwykly' | 'weekend' | 'zjazd-stacjonarny' | 'zjazd-zdalny' | 'regeneracyjny' | 'wolne'
export const DAY_TYPES: readonly DayTypeId[] = ['zwykly', 'weekend', 'zjazd-stacjonarny', 'zjazd-zdalny', 'regeneracyjny', 'wolne']

export const DAY_TYPE_NAMES: Record<DayTypeId, string> = {
  zwykly: 'Zwykły',
  weekend: 'Weekend',
  'zjazd-stacjonarny': 'Zjazd stacjonarny',
  'zjazd-zdalny': 'Zjazd zdalny',
  regeneracyjny: 'Regeneracyjny',
  wolne: 'Wolne'
}

/** The session layer for a day type and weekday: yes, no or ask (spec „Sesje tradingowe”). */
export type SessionChoice = 'yes' | 'no' | 'ask'

/** Times are logical minutes of the day (minutes since 00:00 of its date; 00:00–03:59 → 1440–1679). */
export interface DayTypeParams {
  budgetMin: number
  /** The latest the boundary may be („maksimum granicy”). */
  maxMin: number
  wakeMin: number
  bedtimeMin: number
  minRegenMin: number
  projectLimitMin: number
  /** Index 0 = Monday … 6 = Sunday. */
  sessions: SessionChoice[]
}

/** A session of the session layer, in its own reference zone (ICT killzones in New York time). */
export interface SessionDef {
  id: string
  name: string
  zone: string
  /** Minutes since 00:00 in `zone`. */
  startMin: number
  endMin: number
  /** The markets whose holidays and early closes concern it (spec „kalendarz świąt”). */
  markets: Array<'NYSE' | 'CME_FX' | 'UK'>
}

export interface Reminders {
  /** The morning plan this long after waking … */
  morningAfterWakeMin: number
  /** … but at the latest this long before the first fixed work block. */
  morningBeforeFixedMin: number
  /** The ritual this long before the effective bedtime. */
  ritualBeforeBedMin: number
}

export interface RulesSettings {
  dayTypes: Record<DayTypeId, DayTypeParams>
  targetSleepMin: number
  sessions: SessionDef[]
  categories: Record<string, CategoryRules>
  reserve: number
  backgroundCostPct: number
  transitionBufferMin: number
  boundaryBufferMin: number
  accuracyTolerancePct: number
  bedtimeShiftMaxMin: number
  exceptionMaxMin: number
  exceptionWarnFrom: number
  reminders: Reminders
  idleThresholdMin: number
  absenceQuestionMin: number
  signalEffects: { glassesSenses: number; rockingAll: number; questionsEmotions: number }
}

const H = 60
const weekdays = (mf: SessionChoice, weekend: SessionChoice): SessionChoice[] => [mf, mf, mf, mf, mf, weekend, weekend]
const all = (v: SessionChoice): SessionChoice[] => weekdays(v, v)

export const DEFAULT_DAY_TYPES: Record<DayTypeId, DayTypeParams> = {
  zwykly: { budgetMin: 9 * H, maxMin: 19 * H, wakeMin: 6 * H, bedtimeMin: 22 * H, minRegenMin: 90, projectLimitMin: 4 * H, sessions: weekdays('yes', 'no') },
  weekend: { budgetMin: 3 * H, maxMin: 16 * H, wakeMin: 8 * H, bedtimeMin: 24 * H, minRegenMin: 90, projectLimitMin: 5 * H, sessions: all('no') },
  'zjazd-stacjonarny': { budgetMin: 10 * H, maxMin: 20 * H, wakeMin: 6 * H, bedtimeMin: 22 * H, minRegenMin: 90, projectLimitMin: 2 * H, sessions: all('no') },
  'zjazd-zdalny': { budgetMin: 9 * H, maxMin: 18 * H, wakeMin: 7 * H + 30, bedtimeMin: 23 * H + 30, minRegenMin: 90, projectLimitMin: 3 * H, sessions: all('ask') },
  regeneracyjny: { budgetMin: 2 * H, maxMin: 14 * H, wakeMin: 8 * H, bedtimeMin: 23 * H, minRegenMin: 150, projectLimitMin: 2 * H, sessions: all('no') },
  wolne: { budgetMin: 0, maxMin: 16 * H, wakeMin: 8 * H, bedtimeMin: 24 * H, minRegenMin: 90, projectLimitMin: 5 * H, sessions: all('no') }
}

export const NY_ZONE = 'America/New_York'

/** London 02:00–05:00 and NY 08:00–11:00 New York time – usually 08:00–11:00 and 14:00–17:00 in Poland. */
export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'londyn', name: 'Londyn', zone: NY_ZONE, startMin: 2 * H, endMin: 5 * H, markets: ['UK'] },
  { id: 'ny', name: 'NY', zone: NY_ZONE, startMin: 8 * H, endMin: 11 * H, markets: ['NYSE', 'CME_FX'] }
]

export const DEFAULT_SETTINGS: RulesSettings = {
  dayTypes: DEFAULT_DAY_TYPES,
  targetSleepMin: 8 * H,
  sessions: DEFAULT_SESSIONS,
  categories: Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, rulesOf(c)])),
  reserve: 15,
  backgroundCostPct: 50,
  transitionBufferMin: 5,
  boundaryBufferMin: 15,
  accuracyTolerancePct: 15,
  bedtimeShiftMaxMin: 2 * H,
  exceptionMaxMin: 3 * H,
  exceptionWarnFrom: 3,
  reminders: { morningAfterWakeMin: 30, morningBeforeFixedMin: 20, ritualBeforeBedMin: 30 },
  idleThresholdMin: 10,
  absenceQuestionMin: 30,
  signalEffects: { glassesSenses: 10, rockingAll: 5, questionsEmotions: 10 }
}

/** The ranges of the schema (spec „Macierz ustawień”); the fields of editing use the same limits. */
export const RANGES = {
  budgetMin: [0, 16 * H],
  maxMin: [12 * H, 23 * H + 59],
  wakeMin: [4 * H, 12 * H],
  bedtimeMin: [20 * H, 27 * H + 59],
  minRegenMin: [0, 240],
  projectLimitMin: [0, 8 * H],
  targetSleepMin: [6 * H, 10 * H],
  reserve: [0, 20],
  backgroundCostPct: [0, 100],
  transitionBufferMin: [0, 30],
  boundaryBufferMin: [0, 60],
  accuracyTolerancePct: [5, 50],
  bedtimeShiftMaxMin: [0, 2 * H],
  exceptionMaxMin: [0, 3 * H],
  exceptionWarnFrom: [1, 10],
  reminder: [0, 120],
  idleThresholdMin: [5, 60],
  absenceQuestionMin: [10, 120],
  signalEffect: [0, 30],
  cost: [-5, 5]
} as const

/** One change of the shared settings (rd.json „settings”), applying from `from` (and, for „od dziś”, from `at`). */
export interface SettingsChange {
  id: string
  from: string
  /** The instant of an „od dziś” change (ms UTC); null for a change from the start of a day. */
  at: number | null
  /** Only the fields changed, nested like RulesSettings; lists replaced whole. */
  patch: Record<string, unknown>
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** `patch` laid over `base`, object by object; a list or a value replaces the one before. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(patch) || !isPlain(base)) return (patch === undefined ? base : patch) as T
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge((base as Record<string, unknown>)[k], v)
  return out as T
}

const inRange = (v: unknown, [min, max]: readonly [number, number]): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

const int = (v: unknown, range: readonly [number, number], fallback: number): number => (inRange(v, range) ? v : fallback)

function sessionChoices(v: unknown, fallback: SessionChoice[]): SessionChoice[] {
  if (!Array.isArray(v) || v.length !== 7) return fallback
  return v.map((x, i) => (x === 'yes' || x === 'no' || x === 'ask' ? x : fallback[i]!))
}

function dayTypeFrom(v: unknown, fallback: DayTypeParams): DayTypeParams {
  const r = isPlain(v) ? v : {}
  return {
    budgetMin: int(r.budgetMin, RANGES.budgetMin, fallback.budgetMin),
    maxMin: int(r.maxMin, RANGES.maxMin, fallback.maxMin),
    wakeMin: int(r.wakeMin, RANGES.wakeMin, fallback.wakeMin),
    bedtimeMin: int(r.bedtimeMin, RANGES.bedtimeMin, fallback.bedtimeMin),
    minRegenMin: int(r.minRegenMin, RANGES.minRegenMin, fallback.minRegenMin),
    projectLimitMin: int(r.projectLimitMin, RANGES.projectLimitMin, fallback.projectLimitMin),
    sessions: sessionChoices(r.sessions, fallback.sessions)
  }
}

function costsFrom(v: unknown, fallback: CategoryRules['costs']): CategoryRules['costs'] {
  const r = isPlain(v) ? v : {}
  return { head: int(r.head, RANGES.cost, fallback.head), emotions: int(r.emotions, RANGES.cost, fallback.emotions), senses: int(r.senses, RANGES.cost, fallback.senses) }
}

const CLASSES = new Set(['work', 'life', 'free'])
const KINDS = new Set(['session', 'lecture', 'remoteClass', 'commute', 'meal', 'routine', 'request', 'regen', 'project', 'other'])
const PLACES = new Set(['computer', 'passive', 'away'])

function categoryFrom(v: unknown, fallback: CategoryRules | undefined): CategoryRules | null {
  if (!isPlain(v)) return fallback ?? null
  const f: CategoryRules = fallback ?? {
    cls: 'work',
    kind: 'other',
    place: 'computer',
    background: false,
    startsInBackground: false,
    protected: false,
    noMoveTomorrow: false,
    noSleep: false,
    contact: false,
    classMode: false,
    keepsRegen: false,
    afterWorkAsProject: false,
    costs: { head: 0, emotions: 0, senses: 0 },
    variants: []
  }
  const bool = (k: keyof CategoryRules) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (f[k] as boolean))
  return {
    cls: CLASSES.has(v.cls as string) ? (v.cls as CategoryRules['cls']) : f.cls,
    kind: KINDS.has(v.kind as string) ? (v.kind as CategoryRules['kind']) : f.kind,
    place: PLACES.has(v.place as string) ? (v.place as CategoryRules['place']) : f.place,
    background: bool('background'),
    startsInBackground: bool('startsInBackground'),
    protected: bool('protected'),
    noMoveTomorrow: bool('noMoveTomorrow'),
    noSleep: bool('noSleep'),
    contact: bool('contact'),
    classMode: bool('classMode'),
    keepsRegen: bool('keepsRegen'),
    afterWorkAsProject: bool('afterWorkAsProject'),
    costs: costsFrom(v.costs, f.costs),
    variants: Array.isArray(v.variants)
      ? v.variants.filter(isPlain).flatMap((x) => {
          if (typeof x.id !== 'string' || typeof x.name !== 'string') return []
          const fv = f.variants.find((y) => y.id === x.id)
          return [
            {
              id: x.id,
              name: x.name.slice(0, 80),
              ...(PLACES.has(x.place as string) ? { place: x.place as CategoryRules['place'] } : fv?.place ? { place: fv.place } : {}),
              ...(x.costs !== undefined ? { costs: costsFrom(x.costs, fv?.costs ?? f.costs) } : fv?.costs ? { costs: fv.costs } : {})
            }
          ]
        })
      : f.variants
  }
}

function sessionsFrom(v: unknown, fallback: SessionDef[]): SessionDef[] {
  if (!Array.isArray(v)) return fallback
  const out: SessionDef[] = []
  for (const s of v) {
    if (!isPlain(s) || typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.zone !== 'string') continue
    if (!inRange(s.startMin, [0, 1439]) || !inRange(s.endMin, [1, 1440 * 2]) || s.endMin <= s.startMin) continue
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: s.zone })
    } catch {
      continue
    }
    const markets = Array.isArray(s.markets) ? s.markets.filter((m): m is SessionDef['markets'][number] => m === 'NYSE' || m === 'CME_FX' || m === 'UK') : []
    out.push({ id: s.id, name: s.name.slice(0, 40), zone: s.zone, startMin: s.startMin, endMin: s.endMin, markets })
  }
  return out
}

/** Settings checked field by field: a wrong value falls back to `fallback`'s (never breaks the day). */
export function settingsFrom(raw: unknown, fallback: RulesSettings = DEFAULT_SETTINGS): RulesSettings {
  const r = isPlain(raw) ? raw : {}
  const dt = isPlain(r.dayTypes) ? r.dayTypes : {}
  const cats = isPlain(r.categories) ? r.categories : {}
  const categories: Record<string, CategoryRules> = {}
  for (const id of new Set([...Object.keys(fallback.categories), ...Object.keys(cats)])) {
    const c = categoryFrom(cats[id], fallback.categories[id])
    if (c) categories[id] = c
  }
  const rem = isPlain(r.reminders) ? r.reminders : {}
  const sig = isPlain(r.signalEffects) ? r.signalEffects : {}
  return {
    dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, dayTypeFrom(dt[t], fallback.dayTypes[t])])) as Record<DayTypeId, DayTypeParams>,
    targetSleepMin: int(r.targetSleepMin, RANGES.targetSleepMin, fallback.targetSleepMin),
    sessions: sessionsFrom(r.sessions, fallback.sessions),
    categories,
    reserve: int(r.reserve, RANGES.reserve, fallback.reserve),
    backgroundCostPct: int(r.backgroundCostPct, RANGES.backgroundCostPct, fallback.backgroundCostPct),
    transitionBufferMin: int(r.transitionBufferMin, RANGES.transitionBufferMin, fallback.transitionBufferMin),
    boundaryBufferMin: int(r.boundaryBufferMin, RANGES.boundaryBufferMin, fallback.boundaryBufferMin),
    accuracyTolerancePct: int(r.accuracyTolerancePct, RANGES.accuracyTolerancePct, fallback.accuracyTolerancePct),
    bedtimeShiftMaxMin: int(r.bedtimeShiftMaxMin, RANGES.bedtimeShiftMaxMin, fallback.bedtimeShiftMaxMin),
    exceptionMaxMin: int(r.exceptionMaxMin, RANGES.exceptionMaxMin, fallback.exceptionMaxMin),
    exceptionWarnFrom: int(r.exceptionWarnFrom, RANGES.exceptionWarnFrom, fallback.exceptionWarnFrom),
    reminders: {
      morningAfterWakeMin: int(rem.morningAfterWakeMin, RANGES.reminder, fallback.reminders.morningAfterWakeMin),
      morningBeforeFixedMin: int(rem.morningBeforeFixedMin, RANGES.reminder, fallback.reminders.morningBeforeFixedMin),
      ritualBeforeBedMin: int(rem.ritualBeforeBedMin, RANGES.reminder, fallback.reminders.ritualBeforeBedMin)
    },
    idleThresholdMin: int(r.idleThresholdMin, RANGES.idleThresholdMin, fallback.idleThresholdMin),
    absenceQuestionMin: int(r.absenceQuestionMin, RANGES.absenceQuestionMin, fallback.absenceQuestionMin),
    signalEffects: {
      glassesSenses: int(sig.glassesSenses, RANGES.signalEffect, fallback.signalEffects.glassesSenses),
      rockingAll: int(sig.rockingAll, RANGES.signalEffect, fallback.signalEffects.rockingAll),
      questionsEmotions: int(sig.questionsEmotions, RANGES.signalEffect, fallback.signalEffects.questionsEmotions)
    }
  }
}

export function changeFrom(v: unknown): SettingsChange | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !isIsoDate(v.from) || !isPlain(v.patch)) return null
  const at = typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : null
  return { id: v.id, from: v.from, at, patch: v.patch }
}

const order = (a: SettingsChange, b: SettingsChange) => (a.from < b.from ? -1 : a.from > b.from ? 1 : (a.at ?? 0) - (b.at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/**
 * The settings in force on `date` – at its start, or at `at` within it (the „od dziś” changes of that day up to `at`
 * included). Each change is checked as it is laid on: a wrong value keeps the one before it.
 */
export function settingsOn(changes: readonly SettingsChange[], date: string, at: number | null = null): RulesSettings {
  let s = DEFAULT_SETTINGS
  for (const ch of [...changes].sort(order)) {
    if (ch.from > date) break
    if (ch.from === date && ch.at != null && (at == null || ch.at > at)) continue
    s = settingsFrom(deepMerge<unknown>(s, ch.patch), s)
  }
  return s
}
