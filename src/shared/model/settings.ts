/**
 * The shared settings the engine reads (spec „Macierz ustawień”, „Domyślne ustawienia typów dni”): kept in rd.json as a
 * timeline of changes, each with the date it applies from (by default tomorrow; „od dziś” also adds a snapshot to the
 * day, spec „Model dnia”). The settings of a date are the defaults with every change from that date or earlier laid over
 * them in order. A value outside its range is dropped back to the value before it – the schema refuses only that field.
 */
import { DEFAULT_CATEGORIES, isStartingVariant, rulesOf, type CategoryRules } from './categories'
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

/** A market whose holidays and early closes concern a session (spec „kalendarz świąt”). */
export type SessionMarket = 'NYSE' | 'CME_FX' | 'UK'

/**
 * A session of the day, in its own reference zone (ICT killzones in New York time): of the layer of sessions of the settings
 * (before D511), or an entry of the day's template (D511, `model/templateSessions.ts`) – then with its own „pytaj rano” (`ask`)
 * and the template's block it makes the day's block of (`block`, read again by `planBlockFrom`). A day's snapshot keeps the
 * sessions of its day in `settings.sessions` (a version before D511 reads them there too).
 */
export interface SessionDef {
  id: string
  name: string
  zone: string
  /** Minutes since 00:00 in `zone`. */
  startMin: number
  endMin: number
  /** The markets whose holidays and early closes concern it (spec „kalendarz świąt”). */
  markets: SessionMarket[]
  /** A template's session (D511, D515): its weekday's answer is „pytaj” – asked about in the morning; none – the layer's choice of the day decides. */
  ask?: boolean
  /** A template's session (D511): the template's block it is (its category, name, note, steps, costs …). */
  block?: unknown
}

/** The layer of sessions a move took (`RulesSettings.movedLayer`, T1405, T1412). */
export interface MovedLayer {
  /** The first date of the move. */
  from: string
  sessions: SessionDef[]
  /** The answers „tak / nie / pytaj” of every type (Monday first). */
  grid: Record<DayTypeId, SessionChoice[]>
  /** The templates the move gave entries (ids, also archived ones): a day of one whose file has not come yet – this layer. */
  templates: string[]
  /** The templates the move made (`sesje-<type>`, id → type): a day of a type with none of its templates here yet – this layer. */
  made: Record<string, DayTypeId>
  /** Made templates you removed since (id → true, `templateActions.removeTemplate`): gone, never „not come yet”. */
  gone: Record<string, true>
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
  /** The type each weekday has unless the calendar says otherwise (index 0 = Monday … 6 = Sunday). */
  weekTypes: DayTypeId[]
  targetSleepMin: number
  sessions: SessionDef[]
  /**
   * The sessions the move into templates (D511) took from the layer up to that date, every date of the move together (T1408)
   * – they name a day's block of the layer made before it (`blockName`); never a session of a day.
   */
  movedSessions: SessionDef[]
  /**
   * The layer of sessions as the move into templates (D511) found it on that date (T1405): a day of a template it wrote whose
   * file has not come yet (OneDrive brought rd.json first) is made with it, as before the move (`daySettingsOf`); null – no
   * move in force on that date.
   */
  movedLayer: MovedLayer | null
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
  /**
   * „Bloki poza komputerem jednym ciągiem” (D553): a block away from the computer ends at the return, at the latest at its
   * planned end – done, without a question – and the next one begins by itself at once (`auto.ts`). Off by default.
   */
  awayChain: boolean
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

/** Monday to Friday ordinary days, Saturday and Sunday weekend days. */
export const DEFAULT_WEEK_TYPES: DayTypeId[] = ['zwykly', 'zwykly', 'zwykly', 'zwykly', 'zwykly', 'weekend', 'weekend']

export const DEFAULT_SETTINGS: RulesSettings = {
  dayTypes: DEFAULT_DAY_TYPES,
  weekTypes: DEFAULT_WEEK_TYPES,
  targetSleepMin: 8 * H,
  sessions: DEFAULT_SESSIONS,
  movedSessions: [],
  movedLayer: null,
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
  awayChain: false,
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
  cost: [-100, 100]
} as const

/** One change of the shared settings (rd.json „settings”), applying from `from` (and, for „od dziś”, from `at`). */
export interface SettingsChange {
  id: string
  from: string
  /** The instant of an „od dziś” change (ms UTC); null for a change from the start of a day. */
  at: number | null
  /** When it was made (ms UTC): changes from the same date and instant apply in the order you made them. */
  made?: number | null
  /** Only the fields changed, nested like RulesSettings; lists replaced whole. */
  patch: Record<string, unknown>
}

/** An object of a file (not a list). */
export const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

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

export const isDayTypeId = (v: unknown): v is DayTypeId => typeof v === 'string' && (DAY_TYPES as readonly string[]).includes(v)

function weekTypesFrom(v: unknown, fallback: DayTypeId[]): DayTypeId[] {
  if (!Array.isArray(v) || v.length !== 7) return fallback
  return v.map((x, i) => (isDayTypeId(x) ? x : fallback[i]!))
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

/**
 * Costs field by field: a pool missing or wrong – `fallback`'s; the body (D520) its own `body` when given – a cost written before the body
 * (≤ 1.26) of a subcategory or variant of yours has none (D523: 0), not its subcategory's (T1521).
 */
function costsFrom(v: unknown, fallback: CategoryRules['costs'], body = fallback.body): CategoryRules['costs'] {
  const r = isPlain(v) ? v : {}
  return {
    head: int(r.head, RANGES.cost, fallback.head),
    emotions: int(r.emotions, RANGES.cost, fallback.emotions),
    senses: int(r.senses, RANGES.cost, fallback.senses),
    body: int(r.body, RANGES.cost, body)
  }
}

const CLASSES = new Set(['work', 'life', 'free'])
const KINDS = new Set(['session', 'lecture', 'remoteClass', 'commute', 'meal', 'routine', 'request', 'regen', 'project', 'other'])
const PLACES = new Set(['computer', 'passive', 'away'])

/**
 * A category of the settings. `bodies` – the category whose body a cost written before the body (≤ 1.26) takes, when the caller knows the
 * settings in force then (a day's snapshot of an older version – your dated settings of its day, T1532); none – the rules of T1521.
 * `whole` – `v` is the whole category as settings in force hold it (a day's snapshot, T1538): a variant without a place or a cost is „jak
 * podkategoria”, never the one of `fallback`.
 */
function categoryFrom(id: string, v: unknown, fallback: CategoryRules | undefined, bodies?: CategoryRules, whole = false): CategoryRules | null {
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
    costs: { head: 0, emotions: 0, senses: 0, body: 0 },
    variants: []
  }
  const bool = (k: keyof CategoryRules) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (f[k] as boolean))
  const costs = costsFrom(v.costs, f.costs, bodies?.costs.body ?? f.costs.body)
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
    costs,
    variants: Array.isArray(v.variants)
      ? v.variants.filter(isPlain).flatMap((x) => {
          if (typeof x.id !== 'string' || typeof x.name !== 'string') return []
          const fv = f.variants.find((y) => y.id === x.id)
          return [
            {
              id: x.id,
              name: x.name.slice(0, 80),
              // null – „jak podkategoria” (D510, T1314): a place or a cost given up; left out – the one before stays (a list written
              // before D510 never left one out on purpose); in whole settings (a day's snapshot) – „jak podkategoria” too (T1538).
              ...(x.place === null ? {} : PLACES.has(x.place as string) ? { place: x.place as CategoryRules['place'] } : !whole && fv?.place ? { place: fv.place } : {}),
              // The body of a variant's cost written before it (D520, T1521): the one before (its cost of the settings before); a starting
              // variant without its own – its subcategory's (D523, as `costsOf`); a variant of yours – 0, never its subcategory's.
              ...(x.costs === null
                ? {}
                : x.costs !== undefined
                  ? { costs: costsFrom(x.costs, fv?.costs ?? f.costs, variantBody(bodies, x.id) ?? (fv?.costs ? fv.costs.body : isStartingVariant(id, x.id) ? costs.body : 0)) }
                  : !whole && fv?.costs
                    ? { costs: fv.costs }
                    : {}),
              ...(x.archived === true ? { archived: true } : {})
            }
          ]
        })
      : f.variants
  }
}

/**
 * A session with a new start: a start at or after its end moves the end too, keeping the length – a session whose end
 * is not after its start would leave every day without a word, and the blocks anchored to it with it (A7-02).
 */
export function sessionWithStart(s: SessionDef, startMin: number): SessionDef {
  // The end stays when it is still within a day after the new start; otherwise the length stays (at most a day).
  const keep = s.endMin > startMin && s.endMin - startMin <= 1440
  return { ...s, startMin, endMin: keep ? s.endMin : startMin + Math.min(1440, s.endMin - s.startMin) }
}

/** A session with a new end on the clock (an end not after the start is the next day's). */
export function sessionWithEnd(s: SessionDef, clockMin: number): SessionDef {
  return { ...s, endMin: clockMin > s.startMin ? clockMin : clockMin + 1440 }
}

export const isSessionMarket = (m: unknown): m is SessionMarket => m === 'NYSE' || m === 'CME_FX' || m === 'UK'

const zones = new Map<string, boolean>()

/** A time zone the calendar knows (`Intl`), remembered per name – every block and session read asks. */
export function isZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone) return false
  let known = zones.get(zone)
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone })
      known = true
    } catch {
      known = false
    }
    zones.set(zone, known)
  }
  return known
}

function sessionsFrom(v: unknown, fallback: SessionDef[]): SessionDef[] {
  if (!Array.isArray(v)) return fallback
  const out: SessionDef[] = []
  for (const s of v) {
    if (!isPlain(s) || typeof s.id !== 'string' || typeof s.name !== 'string' || !isZone(s.zone)) continue
    if (!inRange(s.startMin, [0, 1439]) || !inRange(s.endMin, [1, 1440 * 2]) || s.endMin <= s.startMin) continue
    const markets = Array.isArray(s.markets) ? s.markets.filter(isSessionMarket) : []
    out.push({
      id: s.id,
      name: s.name.slice(0, 40),
      zone: s.zone,
      startMin: s.startMin,
      endMin: s.endMin,
      markets,
      ...(typeof s.ask === 'boolean' ? { ask: s.ask } : {}),
      ...(isPlain(s.block) ? { block: s.block } : {})
    })
  }
  return out
}

/** „Nie” every weekday. */
export const NO_SESSION_DAYS: readonly SessionChoice[] = ['no', 'no', 'no', 'no', 'no', 'no', 'no']

/** The layer a move took, as read: anything else than an object with the move's date – the one before (none, T1458). */
function movedLayerFrom(v: unknown, fallback: MovedLayer | null): MovedLayer | null {
  if (!isPlain(v) || !isIsoDate(v.from)) return fallback
  const grid = isPlain(v.grid) ? v.grid : {}
  const made: Record<string, DayTypeId> = {}
  if (isPlain(v.made)) for (const [id, t] of Object.entries(v.made)) if (isDayTypeId(t)) made[id] = t
  const gone: Record<string, true> = {}
  if (isPlain(v.gone)) for (const [id, x] of Object.entries(v.gone)) if (x === true) gone[id] = true
  return {
    from: v.from,
    sessions: sessionsFrom(v.sessions, []),
    grid: Object.fromEntries(DAY_TYPES.map((t) => [t, sessionChoices(grid[t], [...NO_SESSION_DAYS])])) as Record<DayTypeId, SessionChoice[]>,
    templates: Array.isArray(v.templates) ? [...new Set(v.templates.filter((x): x is string => typeof x === 'string' && !!x))] : [],
    made,
    gone
  }
}

/** The body of a variant's own cost in `bodies` (T1532); none there (no such variant, or one „jak podkategoria”) – the rules of T1521. */
const variantBody = (bodies: CategoryRules | undefined, variantId: string): number | undefined => bodies?.variants.find((x) => x.id === variantId)?.costs?.body

/** Whether settings as a file or an event holds them have a cost without the body (D520: written by a version before it, ≤ 1.26). */
export function settingsLackBody(raw: unknown): boolean {
  const cats = isPlain(raw) && isPlain(raw.categories) ? raw.categories : {}
  const lacks = (c: unknown) => isPlain(c) && c.body === undefined
  return Object.values(cats).some((c) => isPlain(c) && (lacks(c.costs) || (Array.isArray(c.variants) && c.variants.some((x) => isPlain(x) && lacks(x.costs)))))
}

/**
 * Settings checked field by field: a wrong value falls back to `fallback`'s (never breaks the day). `bodies` – the settings whose bodies a
 * cost without the body takes (`categoryFrom`, T1532); `whole` – `raw` are the whole settings in force (a day's snapshot – `day.create`,
 * `day.reissue`, `day.snapshot`), not a layer laid over `fallback` (T1538).
 */
export function settingsFrom(raw: unknown, fallback: RulesSettings = DEFAULT_SETTINGS, o: { bodies?: RulesSettings; whole?: boolean } = {}): RulesSettings {
  const { bodies, whole = false } = o
  const r = isPlain(raw) ? raw : {}
  const dt = isPlain(r.dayTypes) ? r.dayTypes : {}
  const cats = isPlain(r.categories) ? r.categories : {}
  const categories: Record<string, CategoryRules> = {}
  for (const id of new Set([...Object.keys(fallback.categories), ...Object.keys(cats)])) {
    const c = categoryFrom(id, cats[id], fallback.categories[id], bodies && Object.hasOwn(bodies.categories, id) ? bodies.categories[id] : undefined, whole)
    if (c) categories[id] = c
  }
  const rem = isPlain(r.reminders) ? r.reminders : {}
  const sig = isPlain(r.signalEffects) ? r.signalEffects : {}
  return {
    dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, dayTypeFrom(dt[t], fallback.dayTypes[t])])) as Record<DayTypeId, DayTypeParams>,
    weekTypes: weekTypesFrom(r.weekTypes, fallback.weekTypes),
    targetSleepMin: int(r.targetSleepMin, RANGES.targetSleepMin, fallback.targetSleepMin),
    sessions: sessionsFrom(r.sessions, fallback.sessions),
    movedSessions: sessionsFrom(r.movedSessions, fallback.movedSessions),
    movedLayer: movedLayerFrom(r.movedLayer, fallback.movedLayer),
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
    awayChain: typeof r.awayChain === 'boolean' ? r.awayChain : fallback.awayChain,
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
  const made = typeof v.made === 'number' && Number.isFinite(v.made) ? v.made : null
  return { id: v.id, from: v.from, at, made, patch: v.patch }
}

/** The order changes are laid on: by date, then instant („od dziś”), then when they were made, then id. */
export const changeOrder = (a: SettingsChange, b: SettingsChange): number =>
  a.from < b.from ? -1 : a.from > b.from ? 1 : (a.at ?? 0) - (b.at ?? 0) || (a.made ?? 0) - (b.made ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const order = changeOrder

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
