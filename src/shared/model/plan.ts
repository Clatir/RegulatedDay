/**
 * Plans (spec „Bloki”, „Typy dni i szablony”): templates of a day type and weekday, the plan of lectures as recurring
 * fixed blocks, and a day's own edits (days/RRRR/RRRR-MM-DD.json – only your changes; facts like starts and the approved
 * boundary live only in the log). Times are logical minutes of the day. Records are read tolerantly: a broken field
 * falls back, a broken block is left out (and reported), unknown fields stay in the file – also the marks of a block an
 * older version wrote (`tag` – „druga zmiana”, „analiza tygodniowa” – and `waitUntilMin`, D467): never read, kept as written.
 */
import { isIsoDate } from '../time/zone'
import { NOTE_MAX } from './note'
import { poolCostsFrom } from './blockCosts'
import { startingBody, type Costs } from './categories'
import { DAY_TYPES, isSessionMarket, isZone, type DayTypeId, type SessionChoice, type SessionMarket } from './settings'
import { routineStepsEntries, type RoutineStepsEntry } from './routineSteps'
import { doneSetFrom, stepsFrom, type Step } from './steps'

/**
 * A block of a template that is a session (D511, D515, `model/templateSessions.ts`): its hour is Polish time as usual (as the
 * axis of „Szablony” shows it), kept „według czasu” of `zone` – New York, London or Poland – so it moves with that zone's
 * clock; `markets` – whose holidays and early closes concern it; `days` – the answer of each weekday (Monday first): „tak” –
 * the day has it, „pytaj” – the morning asks („pytaj rano”), „nie” – none (a weekday the template does not make – no
 * meaning). `id` – the session's own id when the entry's block has another one (an ordinary block of the template has the
 * session's, T1406); none – the block's. Only in templates: a day's block of it is a session of origin „session”
 * (`sessionBlock`), without the field.
 */
export interface BlockSession {
  zone: string
  markets: SessionMarket[]
  days: SessionChoice[]
  id?: string
}

/** Every weekday „tak” – a session new in a template (T1404). */
export const ALL_DAYS_YES: readonly SessionChoice[] = ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes']

const isChoice = (v: unknown): v is SessionChoice => v === 'yes' || v === 'no' || v === 'ask'

/**
 * The field „według czasu” of a block as read from a file: a zone the calendar knows, else none (an ordinary block). Its
 * days: seven answers, a broken one „tak”; none at all – „tak” every day, or „pytaj” where the file has the „pytaj rano” of
 * a working build before D515 (`ask`, T1400).
 */
export function blockSessionFrom(v: unknown): BlockSession | null {
  if (!isPlain(v) || !isZone(v.zone)) return null
  const fill: SessionChoice = v.ask === true ? 'ask' : 'yes'
  const days = Array.isArray(v.days) && v.days.length === 7 ? v.days.map((x) => (isChoice(x) ? x : 'yes')) : ALL_DAYS_YES.map(() => fill)
  const id = typeof v.id === 'string' && v.id ? { id: v.id } : {}
  return { zone: v.zone, markets: Array.isArray(v.markets) ? [...new Set(v.markets.filter(isSessionMarket))] : [], days, ...id }
}

/** The session a template's block is (D511): its own id (`BlockSession.id`), else the block's. */
export const sessionIdOf = (b: Pick<PlanBlock, 'id' | 'session'>): string => b.session?.id ?? b.id

/** A template's block that is a session (`isSessionEntry`). */
export type SessionEntry = PlanBlock & { session: BlockSession; startMin: number }

/**
 * The one rule of what a session of a template is (D511, T1416): a block with the field „według czasu” and its own hour –
 * whatever its category (the field goes with a category of sessions in „Szablony”, `templateBlockPatch`; a category whose
 * kind changed later keeps its sessions). The day, the move, the attachments, the markets and the axis of „Szablony” ask it.
 */
export const isSessionEntry = (b: PlanBlock): b is SessionEntry => !!b.session && b.startMin != null

/**
 * What a template's session gives its day's block (T1419): the fields `sessionBlock` reads – a session of a day's snapshot
 * (`SessionDef.block`) carries nothing else of the entry (its hour, field, anchor …).
 */
export interface SessionBlockFields {
  categoryId: string
  variantId: string | null
  background: boolean | null
  costs: PlanBlock['costs']
  bgCostPct: number | null
  note: string
  name: string | null
  routine: string | null
  steps: Step[]
}

export const sessionBlockFields = (b: PlanBlock): SessionBlockFields => ({ categoryId: b.categoryId, variantId: b.variantId, background: b.background, costs: b.costs, bgCostPct: b.bgCostPct, note: b.note, name: b.name, routine: b.routine, steps: b.steps })

/** The fields of a session's block as read from a snapshot (a whole block an earlier build wrote reads the same), null – none. */
export function sessionBlockFieldsFrom(v: unknown): SessionBlockFields | null {
  if (!isPlain(v) || typeof v.categoryId !== 'string' || !v.categoryId) return null
  const variantId = typeof v.variantId === 'string' && v.variantId ? v.variantId : null
  return {
    categoryId: v.categoryId,
    variantId,
    background: typeof v.background === 'boolean' ? v.background : null,
    costs: ownCostsFrom(v.costs, v.categoryId, variantId),
    bgCostPct: intIn(v.bgCostPct, 0, 100),
    note: str(v.note).slice(0, NOTE_MAX),
    name: blockNameFrom(v.name),
    routine: typeof v.routine === 'string' && v.routine ? v.routine : null,
    steps: stepsFrom(v.steps)
  }
}

export interface PlanBlock {
  id: string
  categoryId: string
  variantId: string | null
  /** Planned start, a logical minute; null with an anchor. */
  startMin: number | null
  /** Starts at the real end of this block (e.g. journaling „po sesji NY”), without a transition buffer. */
  anchor: string | null
  durationMin: number
  /** Fixed blocks keep their start; flexible ones keep their order and follow the real end of the one before. */
  fixed: boolean
  /** Planned in the background (null: from the category). */
  background: boolean | null
  /** Its own costs instead of the category's (four pools – D520; a file of an older version without the body: T1520). */
  costs: Costs | null
  /** Its own share of the cost in the background, 0–100 % (null: the setting, 50 % at the start). */
  bgCostPct: number | null
  note: string
  /**
   * Its own name instead of its variant's or category's (a class imported from the PDF of „zjazdy”: „<przedmiot> ·
   * <forma>”, D357); null – named as before. A version that does not know the field names it by its category.
   */
  name: string | null
  /**
   * Where it comes from: the template, the plan of lectures, the session layer, you, the import of „zjazdy” from a PDF
   * (D357: a fixed class of a „zjazd”) or a series (D381: an occurrence); a version that does not know one reads it as yours.
   */
  origin: 'template' | 'lecture' | 'session' | 'user' | 'zjazd' | 'series'
  /** The session of the session layer, the lecture series, the template block it was made from, the series' root (D381). */
  sourceId: string | null
  /** The computer that records a lecture (spec „Plan wykładów”). */
  recorder: string | null
  /** Moves you made yourself (spec „Licznik przeniesień”). */
  moves: number
  /** Requests from the queue done in this block (several chosen in the morning are one block, one contact). */
  requests: string[]
  /**
   * The task of „Sprawy” this block is for (D384: a task put on the axis – its title names the block, its end asks
   * „Zadanie zrobione?”); null – none. A version that does not know the field names the block by its category.
   */
  task: string | null
  /** The routine whose steps this block is (spec „Rutyna”). */
  routine: string | null
  /**
   * Its list „Kroki” (D440, `model/steps.ts`): in memory with the ticks of its day (`dayPlan` – a block of a file or a
   * template has none ticked); a version that does not know the field keeps it in the file. A block of a snapshot written
   * by such a version has none (`dayPlan` makes it an empty list).
   */
  steps: Step[]
  /** The day this block was moved from (the morning plan shows „z wczoraj”). */
  movedFrom: string | null
  /** A variant of a change of the plan shortened it or moved it (the game: „niezmieniony przez warianty”). */
  byVariant: boolean
  /**
   * Parallel blocks (D476, D492): the block of the plan this one stands beside – the first block of its group, the one the
   * others were dropped on; null – none. A block of a group starts with that block and keeps its own length (`engine/parallel.ts`;
   * its own `startMin` is the group's start written at the drop, for a version that does not know the field: it shows the
   * block there, one after another, and keeps the field in the file).
   */
  alongside: string | null
  /**
   * A template's session (D511, D515): „według czasu” and the answers of the weekdays – a block of a category of sessions
   * with it is the day's session; null (or left out – a block made before D511, a day's block) – none. A version that does
   * not know the field keeps it in the file and shows the block as an ordinary fixed block of its category on every day of
   * its template (T1403).
   */
  session?: BlockSession | null
  /**
   * A session of a day whose place a change of the day's type set (T1451): the type whose template gave it – a later change
   * of type moves it again or takes it out of the day's file (`typeChange.ts` `sessionMoves`); none – the morning's or yours.
   * Only on such a block (no block else gets a new field in its file).
   */
  byType?: DayTypeId
}

export interface TemplateVersion {
  /** The version applies from this date (a change of a template applies from a date, by default tomorrow). */
  from: string
  blocks: PlanBlock[]
  /** From this version on the template may override its type's budget and maximum. */
  budgetMin: number | null
  maxMin: number | null
  /**
   * A version made after the move of the layer of sessions (D511, T1413): the move's date – the move writes it into every
   * version from its date, and a new version made from one that has it (a copy of the version in force) keeps it. A version
   * of a moved template from the move's date on without it was made from a view before the move (a computer offline, a
   * version before D511): the leader gives it its entries (`staleVersionFixes`), the day till then the layer (`daySettingsOf`).
   */
  sessionsMoved?: string
}

export interface Template {
  id: string
  name: string
  dayType: DayTypeId
  /** 1 = Monday … 7 = Sunday; empty = the type's default template (the fallback). */
  weekdays: number[]
  versions: TemplateVersion[]
  archived: boolean
  /**
   * The template was written by the move of the layer of sessions (D511, `model/sessionMigration.ts`): its date. Only
   * there; a day of a template the move wrote whose file lacks it (OneDrive brought rd.json first) is made as before the
   * move (`daySettingsOf`, T1405).
   */
  sessionsMoved?: string
}

/** A series of the plan of lectures: cyclic fixed blocks (spec „Plan wykładów”). */
export interface LectureSeries {
  id: string
  name: string
  categoryId: string
  variantId: string | null
  weekday: number
  startMin: number
  durationMin: number
  from: string
  to: string
  /** Dates without the lecture. */
  exceptions: string[]
  recorder: string | null
  background: boolean | null
  archived: boolean
}

/**
 * Your edits of a day: the type planned for it, its own wake time, the session answers, blocks you added or changed
 * (a block of the template changed or cancelled keeps the template block's derived id) and blocks moved away.
 */
export interface DayFile {
  schema: 1
  date: string
  dayType: DayTypeId | null
  wakeMin: number | null
  /** Per session of the layer: kept or not on this day (an answer to „pytaj”, or a change). */
  sessions: Record<string, 'yes' | 'no'>
  /** Blocks of this day: new ones whole, changes of the snapshot's blocks as whole blocks too. */
  blocks: PlanBlock[]
  /** Blocks of the snapshot cancelled for this day. */
  cancelled: string[]
  /** Blocks moved to another day (id → date); their ids stay. */
  movedTo: Record<string, string>
  /**
   * Questions asked once for this day and their answers (e.g. „lateWake” → „yes”, „holiday” → „no”): a question
   * answered on any computer is never asked again.
   */
  asked: Record<string, string>
  /** The steps ticked off on this day (D440, T786): block id → its ticked step ids (in the file a map block → step → true). */
  stepsDone: Record<string, string[]>
  /**
   * The lists of its blocks' routines the day keeps (D473, T1100: written at the first tick or the version picked – `model/
   * routineSteps.ts`); a block not in it shows its routine as the routine is now. Unknown to older versions (kept in the file).
   */
  routineSteps?: Record<string, RoutineStepsEntry>
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const intIn = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null)

/**
 * A block of its day's own layers (D401, D424, T980): a session of the layer, a lecture of the plan, a class of a „zjazd” –
 * never a series, never moved to another day with the block it is anchored to. The one structural rule.
 */
export const layerKept = (b: Pick<PlanBlock, 'origin'>): boolean => b.origin === 'session' || b.origin === 'lecture' || b.origin === 'zjazd'

/** Logical minutes a plan may use: 04:00 to 03:59 of the night after. */
export const PLAN_MIN = 240
export const PLAN_MAX = 1679

/** The longest block (minutes): a planned length, one „Przedłuż”, one shortening, an exchange – the one limit. */
export const MAX_BLOCK_MIN = 24 * 60
/** A block on the axis (D305, D365): its start and its edges move in steps of 5 min. */
export const DRAG_STEP_MIN = 5
/** The shortest block a drag of its edge leaves (D365) – the field „Długość” takes from 1 min. */
export const MIN_BLOCK_MIN = 5
/** The longest own name of a block. */
export const BLOCK_NAME_MAX = 120
/** A block's own name as read from a file or a log (D430, D431): trimmed, at most `BLOCK_NAME_MAX`; anything else or empty – none. */
export const blockNameFrom = (v: unknown): string | null => (typeof v === 'string' ? v.trim().slice(0, BLOCK_NAME_MAX) || null : null)
/** The requests of a block as read from a file or a log: their ids, each once, at most 50. */
export const requestIdsFrom = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))].slice(0, 50) : [])

/**
 * A block's own cost as a file holds it: the schema's range of a pool's cost (`RANGES.cost`, `poolCostsFrom`), as the settings' categories
 * read it; written before the body (D520, ≤ 1.26 – three pools) – the body of its subcategory and variant's starting cost (T1520).
 */
export const ownCostsFrom = (v: unknown, categoryId: unknown, variantId: unknown): PlanBlock['costs'] =>
  isPlain(v) ? poolCostsFrom(v, startingBody(typeof categoryId === 'string' ? categoryId : null, typeof variantId === 'string' ? variantId : null)) : null

/** A block from a file, or null when it cannot be one (no id, no category, no start nor anchor, no length). */
export function planBlockFrom(v: unknown, origin: PlanBlock['origin'] = 'user'): PlanBlock | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id || typeof v.categoryId !== 'string' || !v.categoryId) return null
  const startMin = intIn(v.startMin, PLAN_MIN, PLAN_MAX)
  const anchor = typeof v.anchor === 'string' && v.anchor ? v.anchor : null
  const durationMin = intIn(v.durationMin, 1, MAX_BLOCK_MIN)
  if ((startMin == null && !anchor) || durationMin == null) return null
  const origins = ['template', 'lecture', 'session', 'user', 'zjazd', 'series']
  const variantId = typeof v.variantId === 'string' && v.variantId ? v.variantId : null
  return {
    id: v.id,
    categoryId: v.categoryId,
    variantId,
    startMin: anchor ? null : startMin,
    anchor,
    durationMin,
    fixed: v.fixed === true,
    background: typeof v.background === 'boolean' ? v.background : null,
    costs: ownCostsFrom(v.costs, v.categoryId, variantId),
    bgCostPct: intIn(v.bgCostPct, 0, 100),
    note: str(v.note).slice(0, NOTE_MAX),
    name: blockNameFrom(v.name),
    origin: origins.includes(v.origin as string) ? (v.origin as PlanBlock['origin']) : origin,
    sourceId: typeof v.sourceId === 'string' ? v.sourceId : null,
    recorder: typeof v.recorder === 'string' ? v.recorder : null,
    moves: intIn(v.moves, 0, 1_000_000) ?? 0,
    requests: requestIdsFrom(v.requests),
    task: typeof v.task === 'string' && v.task ? v.task : null,
    routine: typeof v.routine === 'string' && v.routine ? v.routine : null,
    steps: stepsFrom(v.steps),
    movedFrom: isIsoDate(v.movedFrom) ? v.movedFrom : null,
    byVariant: v.byVariant === true,
    alongside: typeof v.alongside === 'string' && v.alongside && v.alongside !== v.id ? v.alongside : null,
    // Only a template's session has the field (D511): no block else gets a new field in its file.
    ...withSession(blockSessionFrom(v.session)),
    ...(isDayType(v.byType) ? { byType: v.byType } : {})
  }
}

const withSession = (session: BlockSession | null): { session?: BlockSession } => (session ? { session } : {})

/** A block with the defaults filled in (for building plans and tests). */
export function planBlock(p: Partial<PlanBlock> & Pick<PlanBlock, 'id' | 'categoryId' | 'durationMin'>): PlanBlock {
  return {
    variantId: null,
    startMin: null,
    anchor: null,
    fixed: false,
    background: null,
    costs: null,
    bgCostPct: null,
    note: '',
    name: null,
    origin: 'user',
    sourceId: null,
    recorder: null,
    moves: 0,
    requests: [],
    task: null,
    routine: null,
    steps: [],
    movedFrom: null,
    byVariant: false,
    alongside: null,
    ...p
  }
}

const isDayType = (v: unknown): v is DayTypeId => typeof v === 'string' && (DAY_TYPES as readonly string[]).includes(v)

export function templateFrom(v: unknown): Template | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !isDayType(v.dayType)) return null
  const versions: TemplateVersion[] = []
  // A list (E1), or a map by the date a version applies from (written by the app: one version per date).
  const rawVersions = Array.isArray(v.versions) ? v.versions : isPlain(v.versions) ? Object.entries(v.versions).map(([from, x]) => (isPlain(x) ? { from, ...x } : x)) : []
  for (const x of rawVersions) {
    if (!isPlain(x) || !isIsoDate(x.from) || versions.some((y) => y.from === x.from)) continue
    versions.push({
      from: x.from,
      blocks: blocksFrom(x.blocks, 'template'),
      budgetMin: intIn(x.budgetMin, 0, 16 * 60),
      maxMin: intIn(x.maxMin, 12 * 60, 23 * 60 + 59),
      ...(isIsoDate(x.sessionsMoved) ? { sessionsMoved: x.sessionsMoved } : {})
    })
  }
  versions.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  return {
    id: v.id,
    name: str(v.name, v.id).slice(0, 80),
    dayType: v.dayType,
    weekdays: Array.isArray(v.weekdays) ? [...new Set(v.weekdays.filter((d): d is number => intIn(d, 1, 7) != null))].sort() : [],
    versions,
    archived: v.archived === true,
    ...(isIsoDate(v.sessionsMoved) ? { sessionsMoved: v.sessionsMoved } : {})
  }
}

/** The version of a template in force on `date` (null before its first version). */
export function templateVersionOn(t: Template, date: string): TemplateVersion | null {
  let found: TemplateVersion | null = null
  for (const v of t.versions) if (v.from <= date) found = v
  return found
}

/**
 * A block of a template is alive (D415, T847): it still makes days from `tomorrow` on – the version in force then or a
 * later one has it (today is made already). One only in versions before stays in the days gone by – its attachments go
 * with its removal. The one rule of adding an attachment to it (`ownerAlive`) and of what its removal takes.
 */
export function templateBlockAlive(t: Template, blockId: string, tomorrow: string): boolean {
  const inForce = templateVersionOn(t, tomorrow)
  return t.versions.some((v) => (v === inForce || v.from > tomorrow) && v.blocks.some((b) => b.id === blockId))
}

/** The version of `t` in force on `date` makes the block `blockId` (that day of origin „template” has it). */
export const templateBlockOn = (t: Template, blockId: string, date: string): boolean => !!templateVersionOn(t, date)?.blocks.some((b) => b.id === blockId)

/**
 * The version a version from `from` is written over (a template's, a series'): its own of that date, else the last one
 * before it – a new version is a copy of the one in force then, and what that one keeps (items and fields this version does
 * not read) goes on in it. Undefined – none before it.
 */
export function sourceVersionKey(keys: Iterable<string>, from: string): string | undefined {
  let best: string | undefined
  for (const k of keys) {
    if (k === from) return k
    if (k < from && (best === undefined || k > best)) best = k
  }
  return best
}

/**
 * The template with its version from `from` changed by `patch` – the version made when it is not there yet, as a copy of
 * the one in force then (a change of a template applies from a date, by default tomorrow). One rule for the page of
 * templates and the steps of a template's block.
 */
export function withTemplateVersion(t: Template, from: string, patch: Partial<TemplateVersion> | ((v: TemplateVersion) => Partial<TemplateVersion>)): Template {
  const inForceThen = templateVersionOn(t, from)
  const v = t.versions.find((x) => x.from === from) ?? (inForceThen ? { ...inForceThen, from } : { from, blocks: [], budgetMin: null, maxMin: null })
  const next = { ...v, ...(typeof patch === 'function' ? patch(v) : patch) }
  return { ...t, versions: [...t.versions.filter((x) => x.from !== from), next].sort((a, b) => (a.from < b.from ? -1 : 1)) }
}

/** The template for a type and weekday on `date` (spec): the type's template for that weekday, else its default one. */
export function templateFor(templates: readonly Template[], dayType: DayTypeId, weekday: number, date: string): { template: Template; version: TemplateVersion } | null {
  const live = templates.filter((t) => !t.archived && t.dayType === dayType)
  const pick = (list: Template[]) => {
    for (const t of [...list].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const version = templateVersionOn(t, date)
      if (version) return { template: t, version }
    }
    return null
  }
  return pick(live.filter((t) => t.weekdays.includes(weekday))) ?? pick(live.filter((t) => t.weekdays.length === 0))
}

export function lectureFrom(v: unknown): LectureSeries | null {
  if (!isPlain(v) || typeof v.id !== 'string' || typeof v.categoryId !== 'string' || !isIsoDate(v.from) || !isIsoDate(v.to)) return null
  const weekday = intIn(v.weekday, 1, 7)
  const startMin = intIn(v.startMin, PLAN_MIN, PLAN_MAX)
  const durationMin = intIn(v.durationMin, 1, MAX_BLOCK_MIN)
  if (weekday == null || startMin == null || durationMin == null) return null
  return {
    id: v.id,
    name: str(v.name).slice(0, 80),
    categoryId: v.categoryId,
    variantId: typeof v.variantId === 'string' && v.variantId ? v.variantId : null,
    weekday,
    startMin,
    durationMin,
    from: v.from,
    to: v.to,
    exceptions: Array.isArray(v.exceptions) ? v.exceptions.filter(isIsoDate) : [],
    recorder: typeof v.recorder === 'string' ? v.recorder : null,
    background: typeof v.background === 'boolean' ? v.background : null,
    archived: v.archived === true
  }
}

export function dayFileFrom(v: unknown, date: string): DayFile {
  const r = isPlain(v) ? v : {}
  const sessions: Record<string, 'yes' | 'no'> = {}
  if (isPlain(r.sessions)) for (const [k, x] of Object.entries(r.sessions)) if (x === 'yes' || x === 'no') sessions[k] = x
  const movedTo: Record<string, string> = {}
  if (isPlain(r.movedTo)) for (const [k, x] of Object.entries(r.movedTo)) if (isIsoDate(x)) movedTo[k] = x
  const asked: Record<string, string> = {}
  if (isPlain(r.asked)) for (const [k, x] of Object.entries(r.asked)) if (typeof x === 'string') asked[k] = x.slice(0, 40)
  const stepsDone: Record<string, string[]> = {}
  if (isPlain(r.stepsDone))
    for (const [k, x] of Object.entries(r.stepsDone)) {
      const ids = [...doneSetFrom(x)]
      if (ids.length) stepsDone[k] = ids
    }
  return {
    schema: 1,
    date,
    dayType: isDayType(r.dayType) ? r.dayType : null,
    wakeMin: intIn(r.wakeMin, 4 * 60, 12 * 60),
    sessions,
    blocks: blocksFrom(r.blocks),
    // A list (E1), or a map id → true written by the app (cancels from two computers merge).
    cancelled: Array.isArray(r.cancelled)
      ? r.cancelled.filter((x): x is string => typeof x === 'string')
      : isPlain(r.cancelled)
        ? Object.entries(r.cancelled)
            .filter(([, x]) => x === true)
            .map(([k]) => k)
        : [],
    movedTo,
    asked,
    stepsDone,
    routineSteps: routineStepsEntries(r.routineSteps)
  }
}

/**
 * The blocks of a file: a list (written by E1 tests and the generator) or a map by id (written by the app from E3 on:
 * two computers adding blocks to the same day merge field by field instead of meeting on one list).
 */
export function blocksFrom(v: unknown, origin: PlanBlock['origin'] = 'user'): PlanBlock[] {
  const raw = Array.isArray(v) ? v : isPlain(v) ? Object.entries(v).map(([id, b]) => (isPlain(b) ? { ...b, id: typeof b.id === 'string' ? b.id : id } : b)) : []
  const out: PlanBlock[] = []
  for (const b of raw) {
    const p = planBlockFrom(b, origin)
    if (p && !out.some((x) => x.id === p.id)) out.push(p)
  }
  return out
}

export const emptyDayFile = (date: string): DayFile => dayFileFrom({}, date)
