/**
 * Plans (spec „Bloki”, „Typy dni i szablony”): templates of a day type and weekday, the plan of lectures as recurring
 * fixed blocks, and a day's own edits (days/RRRR/RRRR-MM-DD.json – only your changes; facts like starts and the approved
 * boundary live only in the log). Times are logical minutes of the day. Records are read tolerantly: a broken field
 * falls back, a broken block is left out (and reported), unknown fields stay in the file.
 */
import { isIsoDate } from '../time/zone'
import { DAY_TYPES, type DayTypeId } from './settings'

/** „druga zmiana” and „analiza tygodniowa” (spec „Model dnia”): a block with either waits for „Zacznij”. */
export type BlockTag = 'secondShift' | 'weeklyAnalysis'

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
  tag: BlockTag | null
  /** The latest a weekly analysis waits for „Zacznij” (logical minute, D226); null: its planned end. */
  waitUntilMin: number | null
  /** Its own costs instead of the category's. */
  costs: { head: number; emotions: number; senses: number } | null
  note: string
  /** Where it comes from: the template, the plan of lectures, the session layer, or you. */
  origin: 'template' | 'lecture' | 'session' | 'user'
  /** The session of the session layer, the lecture series, the template block it was made from. */
  sourceId: string | null
  /** The computer that records a lecture (spec „Plan wykładów”). */
  recorder: string | null
  /** Moves you made yourself (spec „Licznik przeniesień”). */
  moves: number
}

export interface TemplateVersion {
  /** The version applies from this date (a change of a template applies from a date, by default tomorrow). */
  from: string
  blocks: PlanBlock[]
  /** From this version on the template may override its type's budget and maximum. */
  budgetMin: number | null
  maxMin: number | null
}

export interface Template {
  id: string
  name: string
  dayType: DayTypeId
  /** 1 = Monday … 7 = Sunday; empty = the type's default template (the fallback). */
  weekdays: number[]
  versions: TemplateVersion[]
  archived: boolean
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
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const intIn = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null)

/** Logical minutes a plan may use: 04:00 to 03:59 of the night after. */
export const PLAN_MIN = 240
export const PLAN_MAX = 1679

function costsFrom(v: unknown): PlanBlock['costs'] {
  if (!isPlain(v)) return null
  const k = (x: unknown) => intIn(x, -5, 5)
  const [head, emotions, senses] = [k(v.head), k(v.emotions), k(v.senses)]
  return head == null || emotions == null || senses == null ? null : { head, emotions, senses }
}

/** A block from a file, or null when it cannot be one (no id, no category, no start nor anchor, no length). */
export function planBlockFrom(v: unknown, origin: PlanBlock['origin'] = 'user'): PlanBlock | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id || typeof v.categoryId !== 'string' || !v.categoryId) return null
  const startMin = intIn(v.startMin, PLAN_MIN, PLAN_MAX)
  const anchor = typeof v.anchor === 'string' && v.anchor ? v.anchor : null
  const durationMin = intIn(v.durationMin, 1, 24 * 60)
  if ((startMin == null && !anchor) || durationMin == null) return null
  const origins = ['template', 'lecture', 'session', 'user']
  return {
    id: v.id,
    categoryId: v.categoryId,
    variantId: typeof v.variantId === 'string' && v.variantId ? v.variantId : null,
    startMin: anchor ? null : startMin,
    anchor,
    durationMin,
    fixed: v.fixed === true,
    background: typeof v.background === 'boolean' ? v.background : null,
    tag: v.tag === 'secondShift' || v.tag === 'weeklyAnalysis' ? v.tag : null,
    waitUntilMin: intIn(v.waitUntilMin, PLAN_MIN, PLAN_MAX),
    costs: costsFrom(v.costs),
    note: str(v.note).slice(0, 2000),
    origin: origins.includes(v.origin as string) ? (v.origin as PlanBlock['origin']) : origin,
    sourceId: typeof v.sourceId === 'string' ? v.sourceId : null,
    recorder: typeof v.recorder === 'string' ? v.recorder : null,
    moves: intIn(v.moves, 0, 1_000_000) ?? 0
  }
}

/** A block with the defaults filled in (for building plans and tests). */
export function planBlock(p: Partial<PlanBlock> & Pick<PlanBlock, 'id' | 'categoryId' | 'durationMin'>): PlanBlock {
  return {
    variantId: null,
    startMin: null,
    anchor: null,
    fixed: false,
    background: null,
    tag: null,
    waitUntilMin: null,
    costs: null,
    note: '',
    origin: 'user',
    sourceId: null,
    recorder: null,
    moves: 0,
    ...p
  }
}

const isDayType = (v: unknown): v is DayTypeId => typeof v === 'string' && (DAY_TYPES as readonly string[]).includes(v)

export function templateFrom(v: unknown): Template | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !isDayType(v.dayType)) return null
  const versions: TemplateVersion[] = []
  for (const x of Array.isArray(v.versions) ? v.versions : []) {
    if (!isPlain(x) || !isIsoDate(x.from)) continue
    versions.push({
      from: x.from,
      blocks: (Array.isArray(x.blocks) ? x.blocks : []).map((b) => planBlockFrom(b, 'template')).filter((b): b is PlanBlock => !!b),
      budgetMin: intIn(x.budgetMin, 0, 16 * 60),
      maxMin: intIn(x.maxMin, 12 * 60, 23 * 60 + 59)
    })
  }
  versions.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  return {
    id: v.id,
    name: str(v.name, v.id).slice(0, 80),
    dayType: v.dayType,
    weekdays: Array.isArray(v.weekdays) ? [...new Set(v.weekdays.filter((d): d is number => intIn(d, 1, 7) != null))].sort() : [],
    versions,
    archived: v.archived === true
  }
}

/** The version of a template in force on `date` (null before its first version). */
export function templateVersionOn(t: Template, date: string): TemplateVersion | null {
  let found: TemplateVersion | null = null
  for (const v of t.versions) if (v.from <= date) found = v
  return found
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
  const durationMin = intIn(v.durationMin, 1, 24 * 60)
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
  return {
    schema: 1,
    date,
    dayType: isDayType(r.dayType) ? r.dayType : null,
    wakeMin: intIn(r.wakeMin, 4 * 60, 12 * 60),
    sessions,
    blocks: (Array.isArray(r.blocks) ? r.blocks : []).map((b) => planBlockFrom(b)).filter((b): b is PlanBlock => !!b),
    cancelled: Array.isArray(r.cancelled) ? r.cancelled.filter((x): x is string => typeof x === 'string') : [],
    movedTo
  }
}

export const emptyDayFile = (date: string): DayFile => dayFileFrom({}, date)
