/**
 * The week (D356, spec „Etap 2” – „Horyzont”): seven days from Monday on one axis of hours – each with its type, its
 * blocks (the plan; on days gone by – as it was), whether the boundary was kept and the regeneration against its minimum;
 * only a view. One count of a day (`horizonDay`) gives the column and the measures of the month's goals (`goals.ts`):
 * hours of study, the minimum of regeneration reached, the trading sessions without an extension and outside no plan.
 *
 * A day gone by is counted as its grade counts it (T553): a frozen one up to the events its freeze names, with the
 * boundary, the extension and the regeneration of its stored grade (its axis shows a correction made after the freeze,
 * as the day's own plan does); one not frozen yet with all its events as it would freeze now – preliminary. Today
 * counts live, a day to come from its plan (templates, lectures, sessions, the day's file – a „zjazd” marked in the
 * calendar). Pure, one `computeDay` a day (no loop over minutes with a full forecast).
 */
import { namedById, namedOf, type NamedBlock } from '../blockName'
import { isKnown } from '../model/events'
import type { Step } from '../model/steps'
import type { BoundaryOutcome } from './outcome'
import { dayOutcome } from './outcome'
import { blockInfos, plannedSpan, type BlockInfo } from './blocks'
import { namingOf } from './context'
import { snapshotEntries } from './createDay'
import { computeDay, type DayContext, type DayState } from './day'
import { foldFacts, isPassive, lastRunEnd, OPEN, ranMinutes, type BlockFact } from './facts'
import { countedEvents, isFreeDay } from './freeze'
import { atOf, gridOf } from './grid'
import { plannedEndOf } from './timer'
import { dayEnd, logicalMinuteOf } from '../time/day'
import { addDays } from '../time/zone'

/** The categories whose blocks are study (D356: „Nauka” and „Oglądanie wykładu”; no classes, lectures nor „zjazdy”). */
export const STUDY_CATEGORIES: ReadonlySet<string> = new Set(['nauka', 'ogladanie'])

/** Where the day stands against today. */
export type HorizonWhen = 'past' | 'today' | 'future'

/**
 * How a block stands on the axis: `ran` – begun and over (on a day gone by: everything begun), `running` – runs now,
 * `paused` – today, begun and paused (not ended): it stands up to the end of its last run and may still go on,
 * `planned` – still to come, `missed` – not begun and its time gone, `parked` / `cancelled` – taken off the day before
 * it began.
 */
export type HorizonBlockState = 'ran' | 'running' | 'paused' | 'planned' | 'missed' | 'parked' | 'cancelled'

export interface HorizonBlock {
  id: string
  /** What names it (`blockName` in the window – the same name as on the day's axis; never an id). */
  named: NamedBlock
  categoryId: string
  /** Logical minutes of the day (00:00–03:59 of the night after: +1440). */
  startMin: number
  endMin: number
  state: HorizonBlockState
  /** Begun outside the plan („Pracuję”, a block begun by hand) or taken out of it after it began (D336). */
  outsidePlan: boolean
  background: boolean
  /** Its steps with the ticks of the day (D440) – the counter „✓ 3/4” on the tile; absent – none. */
  steps?: Step[]
}

/**
 * The boundary of the day: kept, broken, without data (the grade's words); `free` – a free day (not in „x z y”);
 * `open` – today, not over (a day closed already – the ritual, „Jak zapisano” – has its outcome); null – a day to come.
 */
export type HorizonBoundary = BoundaryOutcome | 'free' | 'open' | null

export interface HorizonRegen {
  /** Toward the minimum so far (a day gone by: as graded; a day to come: 0). */
  towardMin: number
  requiredMin: number
  /** The minimum reached (only a minimum of 30 min and more counts, spec „Nagrody”). */
  reached: boolean
}

/** Trading sessions of a day (blocks of a category of the kind „sesja”, the second shift of „Sesja tradingowa” too). */
export interface SessionCount {
  /** From the plan, over, without an extension: no „Przedłuż” and no minute outside its planned window. */
  clean: number
  /** From the plan, over, with an extension. */
  extended: number
  /** Begun outside the plan (see `sessionsOf`). */
  outsidePlan: number
}

/** How the day's log was read: whole, without some computer's log (its numbers may be short), not at all now. */
export type HorizonRead = 'full' | 'partial' | 'unknown'

export interface HorizonDay {
  date: string
  when: HorizonWhen
  read: HorizonRead
  /** The type in force (after a change of type during the day – the new one); null when not read. */
  dayType: string | null
  /** Frozen: its grade is final; a day gone by from the ritual's first day and not frozen is preliminary (`goalsProgress`). */
  frozen: boolean
  blocks: HorizonBlock[]
  /** The wake and the bedtime's forecast (logical minutes); null when not read. */
  wakeMin: number | null
  bedtimeMin: number | null
  boundary: HorizonBoundary
  extensionMin: number
  /**
   * Null: not read, or a day gone by without your presence on any computer (no data – as „Strona B”, T554; a stationary
   * „zjazd”, whose plan is its record, has it).
   */
  regen: HorizonRegen | null
  /** Minutes of study blocks run (today: so far). */
  studyMin: number
  sessions: SessionCount
}

/** A frozen day: the events its freeze counted and its stored grade. */
export interface FrozenDay {
  know: Record<string, number>
  grade: Record<string, unknown>
}

const NO_SESSIONS: SessionCount = { clean: 0, extended: 0, outsidePlan: 0 }

/** A day whose log cannot be read now: no blocks, no measures. */
export function unknownDay(date: string, when: HorizonWhen): HorizonDay {
  return { date, when, read: 'unknown', dayType: null, frozen: false, blocks: [], wakeMin: null, bedtimeMin: null, boundary: null, extensionMin: 0, regen: null, studyMin: 0, sessions: { ...NO_SESSIONS } }
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const BOUNDARIES: readonly string[] = ['kept', 'broken', 'noData']

/** What a stored grade says of the boundary and the regeneration (a field missing or broken: null – counted instead). */
export function storedOutcome(grade: Readonly<Record<string, unknown>>): { boundary: BoundaryOutcome | null; free: boolean | null; extensionMin: number | null; regen: HorizonRegen | null } {
  const r = grade.regen
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const regen = isPlain(r) && num(r.towardMin) != null && num(r.requiredMin) != null && typeof r.reached === 'boolean' ? { towardMin: r.towardMin as number, requiredMin: r.requiredMin as number, reached: r.reached } : null
  return {
    boundary: BOUNDARIES.includes(grade.boundary as string) ? (grade.boundary as BoundaryOutcome) : null,
    free: typeof grade.free === 'boolean' ? grade.free : null,
    extensionMin: num(grade.extensionMin),
    regen
  }
}

/**
 * The end of a begun block on the axis: its end; a run still open – up to now (today) or its planned end (as the day's
 * axis; on a day gone by nobody ended it – as written, by its plan); paused and not ended – the end of its last run.
 */
function begunEnd(state: DayState, info: BlockInfo, f: BlockFact, nowIdx: number | null): number {
  if (f.endedAt != null) return f.endedAt
  return lastRunEnd(f) ?? Math.max(nowIdx ?? f.startedAt!, plannedEndOf(state, info, f))
}

/** How a begun block stands: today – running (a run open), paused (no run open, not ended) or over; a day gone by – over. */
function begunState(f: BlockFact, when: HorizonWhen): HorizonBlockState {
  if (when !== 'today' || f.endedAt != null) return 'ran'
  return f.runs.some((r) => r.to === OPEN) ? 'running' : 'paused'
}

/**
 * The blocks of the day on the axis, as the day's own axis places them (`dayAxis`): a begun block where it ran, one still
 * to come today where the forecast puts it, otherwise at its planned time (an anchored one after its anchor); blocks
 * begun outside the plan where they ran.
 */
function axisBlocks(ctx: DayContext, state: DayState, when: HorizonWhen): HorizonBlock[] {
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(ctx.date, atOf(g, idx))
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const nowIdx = when === 'today' ? state.now : null
  const placed = new Map(state.forecast.map((p) => [p.block.id, p]))
  const naming = namingOf(ctx, state.facts)
  const out: HorizonBlock[] = []
  const push = (info: BlockInfo, named: NamedBlock, from: number, to: number, st: HorizonBlockState, outsidePlan: boolean, steps?: Step[]) =>
    out.push({ id: info.id, named, categoryId: info.categoryId, startMin: lm(from), endMin: lm(Math.max(to, from + 1)), state: st, outsidePlan, background: info.bg, ...(steps?.length ? { steps } : {}) })
  for (const p of ctx.plan) {
    const info = byId.get(p.id)
    if (!info) continue
    const f = state.facts.blocks.get(p.id)
    const named: NamedBlock = { categoryId: p.categoryId, variantId: p.variantId, routine: p.routine, requests: p.requests, note: p.note, origin: p.origin, sourceId: p.sourceId }
    if (f?.startedAt != null) {
      push(info, named, f.startedAt, begunEnd(state, info, f, nowIdx), begunState(f, when), false, p.steps)
      continue
    }
    const gone: HorizonBlockState | null = f?.parkedAt != null ? 'parked' : f?.cancelledAt != null ? 'cancelled' : null
    const span = plannedSpan(info, byId)
    const fc = gone == null && nowIdx != null ? placed.get(p.id) : undefined
    const from = fc?.from ?? span?.start
    const to = fc?.to ?? span?.end
    if (from == null || to == null) continue
    const st: HorizonBlockState = gone ?? (when === 'past' || (nowIdx != null && to <= nowIdx) ? 'missed' : 'planned')
    push(info, named, from, to, st, false, p.steps)
  }
  for (const info of state.blocks) {
    if (info.inPlan) continue
    const f = state.facts.blocks.get(info.id)
    if (!f || f.startedAt == null) continue
    push(info, namedById(info.id, naming) ?? namedOf(info), f.startedAt, begunEnd(state, info, f, nowIdx), begunState(f, when), true)
  }
  return out.sort((a, b) => a.startMin - b.startMin || (a.id < b.id ? -1 : 1))
}

/**
 * Minutes of study blocks run (D356, T554): today up to now; on a day gone by every run whole, and a run nobody ended up
 * to the block's planned end – where the axis ends it (never on to 04:00).
 */
function studyMinutes(state: DayState, when: HorizonWhen): number {
  let sum = 0
  for (const b of state.blocks) {
    if (!STUDY_CATEGORIES.has(b.categoryId)) continue
    const f = state.facts.blocks.get(b.id)
    if (f?.startedAt == null) continue
    if (when === 'today') sum += ranMinutes(f, state.now)
    else for (const r of f.runs) sum += Math.max(0, (r.to === OPEN ? begunEnd(state, b, f, null) : r.to) - r.from)
  }
  return sum
}

/**
 * The trading sessions of a day (D356, D360 „sesje bez przedłużenia i bez sesji poza planem”, T554). A session is a begun
 * block of a category of the kind „sesja” (the session layer, the second shift of „Sesja tradingowa”, one added by hand).
 * From the plan: in the day's plan now and there from the day's snapshot (the template, the session layer, a session the
 * answer „tak” added) or from the plan you approved with the boundary – the approval in force, the last one not opened
 * again (as `blockInfos`); one that names no blocks (a change of type) or none in force – the plan as it is. Any other
 * begun session is outside the plan: added after the approval, begun outside the plan, or taken out of the plan after it
 * began (D336 – as the axis shows it). A session from the plan counts once over (ended; on a day gone by – begun): with
 * an extension when it has a „Przedłuż” or its run went on past its planned end as the engine counts it (`plannedEndOf`:
 * a fixed one – its window, a later start not moving it; another – its start, planned length, pauses and extensions), so
 * a session begun 5 min late and run for its length is without one; else without.
 */
export function sessionsOf(ctx: DayContext, state: DayState, when: HorizonWhen): SessionCount {
  const out = { ...NO_SESSIONS }
  if (when === 'future') return out
  const last = state.facts.approvals.at(-1)
  const approved = last && last.undoneAt == null && last.plan ? new Set(last.plan) : null
  const snap = snapshotEntries(ctx.snapshot, ctx.date)
  for (const b of state.blocks) {
    if (b.rules.kind !== 'session') continue
    const f = state.facts.blocks.get(b.id)
    if (!f || f.startedAt == null) continue
    const planned = b.inPlan && (snap(b.id) != null || (approved ? approved.has(b.id) : true))
    if (!planned) {
      out.outsidePlan++
      continue
    }
    if (f.endedAt == null && when !== 'past') continue
    const plannedEnd = plannedEndOf(state, b, f)
    // A run still open on a day gone by (nobody ended it): as written – it ended by its plan.
    const ranTo = Math.max(...f.runs.map((r) => (r.to === OPEN ? plannedEnd : r.to)))
    if (f.extends.length > 0 || ranTo > plannedEnd) out.extended++
    else out.clean++
  }
  return out
}

/**
 * One day of the horizon (`when` – against today; `frozen` – a frozen day's freeze), counted once: its column of the week
 * and its measures of the month's goals.
 */
export function horizonDay(ctx: DayContext, when: HorizonWhen, frozen: FrozenDay | null = null): HorizonDay {
  const past = when === 'past'
  if (past && !ctx.events.length && ctx.snapshot.dayType !== 'zjazd-stacjonarny') return quietDay(ctx)
  // A day gone by as its grade counts it (as written, to its end); a frozen one up to the events its freeze named.
  const counted: DayContext = past ? { ...ctx, events: frozen ? countedEvents(ctx.events, frozen.know) : ctx.events, now: Math.max(ctx.now, dayEnd(ctx.date)), asWritten: true } : ctx
  const state = computeDay(counted)
  const g = state.grid
  const o = dayOutcome(state)
  const stored = frozen ? storedOutcome(frozen.grade) : null
  const lm = (idx: number) => logicalMinuteOf(ctx.date, atOf(g, idx))
  const closedFree = state.facts.closed?.how === 'free'
  const presence = counted.events.some((e) => isKnown(e) && e.k === 'presence.first')
  let boundary: HorizonBoundary
  let regen: HorizonRegen | null
  let extensionMin = state.extensionMin
  if (past) {
    const free = stored?.free ?? isFreeDay(state, counted.events)
    boundary = free ? 'free' : (stored?.boundary ?? o.boundary)
    extensionMin = stored?.extensionMin ?? state.extensionMin
    const r = stored?.regen ?? o.regen
    regen = presence || state.dayType === 'zjazd-stacjonarny' ? { towardMin: r.towardMin, requiredMin: r.requiredMin, reached: r.reached } : null
  } else if (when === 'today') {
    // Closed already (the ritual, „Jak zapisano”, „Nie pamiętam”): what the day came to, no longer „w toku”.
    boundary = state.dayType === 'wolne' || closedFree ? 'free' : state.facts.closed ? o.boundary : 'open'
    regen = { towardMin: o.regen.towardMin, requiredMin: o.regen.requiredMin, reached: o.regen.reached }
  } else {
    boundary = state.dayType === 'wolne' ? 'free' : null
    extensionMin = 0
    regen = { towardMin: 0, requiredMin: state.regen.requiredMin, reached: false }
  }
  // The axis of a frozen day shows corrections made after its freeze too (as the day's own plan does); its measures do not.
  const late = frozen != null && ctx.events.some((e) => e.n > (frozen.know[e.c] ?? -1) && e.k !== 'day.freeze' && !isPassive(e))
  const axis = late ? { ctx: { ...counted, events: ctx.events }, state: computeDay({ ...counted, events: ctx.events }) } : { ctx: counted, state }
  return {
    date: ctx.date,
    when,
    read: 'full',
    dayType: state.dayType,
    frozen: frozen != null,
    blocks: axisBlocks(axis.ctx, axis.state, when),
    wakeMin: lm(state.wake),
    bedtimeMin: lm(state.bedtime.forecast),
    boundary,
    extensionMin,
    regen,
    studyMin: when === 'future' ? 0 : studyMinutes(state, when),
    sessions: sessionsOf(counted, state, when)
  }
}

/**
 * A day gone by without a single event – nobody used the app, nobody froze it yet: its plan, nothing begun, free (as its
 * freeze will make it), no measure – without the full count of a day (a day without events is the slowest to count).
 */
function quietDay(ctx: DayContext): HorizonDay {
  const g = gridOf(ctx.date)
  const infos = blockInfos(g, ctx.plan, foldFacts(g, []), ctx.snapshot.settings)
  const byId = new Map(infos.map((b) => [b.id, b]))
  const lm = (idx: number) => logicalMinuteOf(ctx.date, atOf(g, idx))
  const blocks: HorizonBlock[] = []
  for (const p of ctx.plan) {
    const info = byId.get(p.id)
    const span = info ? plannedSpan(info, byId) : null
    if (!info || !span) continue
    const named: NamedBlock = { categoryId: p.categoryId, variantId: p.variantId, routine: p.routine, requests: p.requests, note: p.note, origin: p.origin, sourceId: p.sourceId }
    blocks.push({ id: p.id, named, categoryId: p.categoryId, startMin: lm(span.start), endMin: lm(Math.max(span.end, span.start + 1)), state: 'missed', outsidePlan: false, background: info.bg, ...(p.steps.length ? { steps: p.steps } : {}) })
  }
  blocks.sort((a, b) => a.startMin - b.startMin || (a.id < b.id ? -1 : 1))
  return { ...unknownDay(ctx.date, 'past'), read: 'full', dayType: ctx.snapshot.dayType, blocks, wakeMin: ctx.wakeMin, boundary: 'free' }
}

/** Where a date stands against today. */
export const whenOf = (date: string, today: string): HorizonWhen => (date < today ? 'past' : date === today ? 'today' : 'future')

/** The seven dates of the week from Monday `week`. */
export const weekDates = (week: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(week, i))

export interface WeekView {
  /** Its Monday. */
  week: string
  today: string
  /** Monday to Sunday. */
  days: HorizonDay[]
  /** The common axis (logical minutes): the earliest wake − 30 min, at the latest 06:00, to the latest bedtime + 30 min, at least 22:00, with every block. */
  from: number
  to: number
}

/** The week from Monday `week` from its days (any order; a missing one – not read). */
export function weekViewOf(week: string, today: string, days: readonly HorizonDay[]): WeekView {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const list = weekDates(week).map((date) => byDate.get(date) ?? unknownDay(date, whenOf(date, today)))
  let from = 6 * 60
  let to = 22 * 60
  for (const d of list) {
    if (d.wakeMin != null) from = Math.min(from, d.wakeMin - 30)
    if (d.bedtimeMin != null) to = Math.max(to, d.bedtimeMin + 30)
    for (const b of d.blocks) {
      from = Math.min(from, b.startMin)
      to = Math.max(to, b.endMin)
    }
  }
  return { week, today, days: list, from: Math.max(240, from), to: Math.min(1680, to) }
}
