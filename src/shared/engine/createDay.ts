/**
 * Creating a day (spec „Dzień i czas”, „Typy dni i szablony”, „Sesje tradingowe”, „Plan wykładów”): one deterministic
 * function. It takes the template and settings in force on the date, the lectures of the plan, the sessions of the
 * session layer placed from their own zone (shortened on early-close days), the occurrences of the series (D381, with
 * the room they make among the template's blocks – D401), and writes them as the day's snapshot; your
 * edits of the day (its file) are laid over the snapshot by `dayPlan`, before and after the creation alike. Every
 * computer computes the same snapshot from the same files, and the derived ids make the same blocks.
 */
import { derivedId } from '../model/ids'
import { SESSION_CATEGORY } from '../model/categories'
import type { DaySnapshot } from '../model/events'
import { PLAN_MAX, PLAN_MIN, planBlock, templateFor, type DayFile, type LectureSeries, type PlanBlock, type Template } from '../model/plan'
import type { SeriesPlan } from '../model/series'
import { DEFAULT_SETTINGS, settingsOn, type DayTypeId, type RulesSettings, type SessionDef, type SettingsChange } from '../model/settings'
import { dayEnd, dayStart, logicalMinuteOf, placeLogical } from '../time/day'
import { MINUTE, PL_ZONE, addDays, offsetMin, placeWall, weekday } from '../time/zone'
import { pushedBySeries, seriesBlocks } from './series'

/** What the holiday calendar answers for a market and date (the calendar module's MarketDay). */
export interface MarketDayInfo {
  closed: boolean
  earlyClose: { zone: string; hour: number; minute: number } | null
  names: string[]
}
export type HolidayLookup = (market: 'NYSE' | 'CME_FX' | 'UK' | 'PL', date: string) => MarketDayInfo

export interface DayInputs {
  date: string
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
  /** The series with their last days (`seriesPlans` – the same on every computer for the same files). */
  series: readonly SeriesPlan[]
  /** The day's file (your edits so far); null = none yet. */
  dayFile: DayFile | null
  holidays: HolidayLookup
  /** The instant of creation: „od dziś” changes of the day up to it are in the snapshot. */
  at: number | null
}

/** The type a date has unless you choose another: the type of its weekday (by default Monday–Friday ordinary days). */
export function defaultDayType(date: string, settings: Pick<RulesSettings, 'weekTypes'> = DEFAULT_SETTINGS): DayTypeId {
  return settings.weekTypes[weekday(date) - 1] ?? (weekday(date) >= 6 ? 'weekend' : 'zwykly')
}

/** Anchors in templates point at template blocks by their id, or at a session as „session:<id>”. */
export const SESSION_ANCHOR = 'session:'

const sessionBlockId = (date: string, sessionId: string) => derivedId(date, 'ses', sessionId)
/** The id a template block gets on a day (a day file cancels or changes it by this id). */
export const templateBlockId = (date: string, templateId: string, blockId: string) => derivedId(date, 'tpl', templateId, blockId)
const lectureBlockId = (date: string, seriesId: string) => derivedId(date, 'lec', seriesId)

/** A session's window on a logical day, as instants (its zone's wall times on the date that falls in the day). */
export function sessionWindow(def: SessionDef, date: string): { start: number; end: number } | null {
  const start0 = dayStart(date)
  const end0 = dayEnd(date)
  for (const d of [date, addDays(date, -1), addDays(date, 1)]) {
    const start = placeWall(def.zone, d, def.startMin)
    if (start >= start0 && start < end0) return { start, end: placeWall(def.zone, d, def.endMin) }
  }
  return null
}

/**
 * How much earlier than usual a session starts in Polish time (minutes, ≤ 0): while the USA has changed its clock and
 * Europe not yet (about 3 weeks a year) both sessions start an hour earlier. „Usual” is the difference of the zones in
 * the middle of January of that year, when both keep standard time.
 */
export function sessionShiftMin(def: SessionDef, at: number): number {
  const year = new Date(at).getUTCFullYear()
  const ref = Date.UTC(year, 0, 15, 12)
  const usual = offsetMin(PL_ZONE, ref) - offsetMin(def.zone, ref)
  const now = offsetMin(PL_ZONE, at) - offsetMin(def.zone, at)
  return now - usual
}

/**
 * A session of the layer as a block of `date`: fixed, of the session category, placed from its zone and ending at the
 * early close of its markets (as the day's holidays say); null when it does not fall in the day or closes before it starts.
 */
export function sessionBlock(def: SessionDef, date: string, holidays: DaySnapshot['holidays']): PlanBlock | null {
  const win = sessionWindow(def, date)
  if (!win) return null
  let end = win.end
  for (const m of def.markets) {
    const h = holidays.find((x) => x.market === m)
    if (h?.earlyCloseAt != null) end = Math.min(end, h.earlyCloseAt)
  }
  if (end <= win.start) return null
  return planBlock({
    id: sessionBlockId(date, def.id),
    categoryId: SESSION_CATEGORY,
    startMin: Math.round(logicalMinuteOf(date, win.start)),
    durationMin: Math.round((end - win.start) / MINUTE),
    fixed: true,
    origin: 'session',
    sourceId: def.id
  })
}

/** The lectures of the plan held on `date`. */
export function lecturesOn(lectures: readonly LectureSeries[], date: string): LectureSeries[] {
  const wd = weekday(date)
  return lectures.filter((s) => !s.archived && s.weekday === wd && s.from <= date && date <= s.to && !s.exceptions.includes(date))
}

/** Whether the session layer keeps a session on this day: your answer, else the layer („pytaj” without an answer keeps it). */
function sessionKept(settings: RulesSettings, type: DayTypeId, date: string, sessionId: string, dayFile: DayFile | null): boolean {
  const answer = dayFile?.sessions[sessionId]
  if (answer) return answer === 'yes'
  const choice = settings.dayTypes[type].sessions[weekday(date) - 1] ?? 'no'
  return choice !== 'no'
}

/** The deterministic snapshot of a day. */
export function createDay(inp: DayInputs): DaySnapshot {
  const { date, dayFile } = inp
  const settings = settingsOn(inp.changes, date, inp.at)
  const dayType = dayFile?.dayType ?? defaultDayType(date, settings)
  const params = settings.dayTypes[dayType]
  const tpl = templateFor(inp.templates, dayType, weekday(date), date)
  const changes = inp.changes.filter((c) => c.from < date || (c.from === date && (c.at == null || (inp.at != null && c.at <= inp.at)))).map((c) => c.id).sort()

  const blocks: PlanBlock[] = []
  const holidays: DaySnapshot['holidays'] = []
  const seenMarkets = new Set<string>()
  const noteMarket = (market: 'NYSE' | 'CME_FX' | 'UK' | 'PL') => {
    if (seenMarkets.has(market)) return
    seenMarkets.add(market)
    const h = inp.holidays(market, date)
    if (!h.closed && !h.earlyClose && h.names.length === 0) return
    const earlyCloseAt = h.earlyClose ? placeWall(h.earlyClose.zone, date, h.earlyClose.hour * 60 + h.earlyClose.minute) : null
    holidays.push({ market, closed: h.closed, earlyCloseAt, names: h.names })
  }
  noteMarket('PL')

  // The session layer: fixed blocks of the session category, placed from their zone, ending at the market's early close.
  const sessionIds = new Map<string, string>()
  let shift = 0
  for (const def of settings.sessions) {
    // Every session's markets, kept or not: a session added later the same day (an answer „tak”, a change of type)
    // ends at its market's early close too.
    for (const m of def.markets) noteMarket(m)
    if (!sessionKept(settings, dayType, date, def.id, dayFile)) continue
    const block = sessionBlock(def, date, holidays)
    if (!block) continue
    sessionIds.set(def.id, block.id)
    shift = Math.min(shift, sessionShiftMin(def, placeLogical(date, block.startMin!)))
    blocks.push(block)
  }

  // The template's blocks; anchors to template blocks and sessions get the day's ids. A block anchored to a session that
  // is not on this day is not on it either (a cancelled session cancels the blocks anchored to it).
  if (tpl) {
    const ids = new Map(tpl.version.blocks.map((b) => [b.id, templateBlockId(date, tpl.template.id, b.id)]))
    for (const b of tpl.version.blocks) {
      let anchor: string | null = null
      if (b.anchor) {
        anchor = b.anchor.startsWith(SESSION_ANCHOR) ? (sessionIds.get(b.anchor.slice(SESSION_ANCHOR.length)) ?? null) : (ids.get(b.anchor) ?? null)
        if (!anchor) continue
      }
      blocks.push({ ...b, id: ids.get(b.id)!, anchor, startMin: anchor ? null : b.startMin, origin: 'template', sourceId: b.id })
    }
  }

  for (const s of lecturesOn(inp.lectures, date)) {
    blocks.push(
      planBlock({
        id: lectureBlockId(date, s.id),
        categoryId: s.categoryId,
        variantId: s.variantId,
        startMin: s.startMin,
        durationMin: s.durationMin,
        fixed: true,
        background: s.background,
        origin: 'lecture',
        sourceId: s.id,
        recorder: s.recorder
      })
    )
  }

  // The series' occurrences (D381) – a special day by the series' own field (D382).
  const occurrences = seriesBlocks(inp.series, date, dayType, inp.holidays)
  blocks.push(...occurrences)

  blocks.sort((a, b) => (a.startMin ?? 1e9) - (b.startMin ?? 1e9) || (a.id < b.id ? -1 : 1))
  const templateWakeMin = params.wakeMin
  // While the sessions start an hour earlier the wake time does too (not before 04:00); your own wake for the day wins.
  const wakeMin = Math.max(4 * 60, templateWakeMin + shift)
  const snapshot: DaySnapshot = {
    dayType,
    settings,
    templateId: tpl?.template.id ?? null,
    templateFrom: tpl?.version.from ?? null,
    budgetMin: tpl?.version.budgetMin ?? params.budgetMin,
    maxMin: tpl?.version.maxMin ?? params.maxMin,
    maxFromTemplate: tpl?.version.maxMin != null,
    wakeMin,
    templateWakeMin,
    blocks,
    changes,
    holidays,
    series: occurrences.map((b) => b.sourceId!).sort()
  }
  // An occurrence on a place a block of the template takes makes room for itself (D401) – on the axis of the plan; a block
  // the day's file cancels or moves away takes no place (T718).
  if (!occurrences.length) return snapshot
  const nextWakeMin = nextWakeForBedtime(null, null, inp.changes, addDays(date, 1))
  const gone = new Set([...(dayFile?.cancelled ?? []), ...Object.keys(dayFile?.movedTo ?? {})])
  return { ...snapshot, blocks: pushedBySeries(snapshot, date, nextWakeMin, gone) }
}

/** The snapshot's blocks with the session layer's answers given after the day was made (spec „Sesje tradingowe”): „nie” takes a session away, „tak” brings one the day was made without. */
function snapshotBlocksOf(snapshot: DaySnapshot, dayFile: DayFile | null): PlanBlock[] {
  const answers = dayFile?.sessions ?? {}
  const blocks = snapshot.blocks.filter((b) => !(b.origin === 'session' && b.sourceId && answers[b.sourceId] === 'no'))
  if (dayFile) blocks.push(...addedSessions(snapshot, dayFile.date, (def) => answers[def.id] === 'yes' && !blocks.some((b) => b.origin === 'session' && b.sourceId === def.id)))
  return blocks
}

/** The sessions of the layer an answer „tak” brings to a day (`which` of them), as blocks of `date` – none in the snapshot. */
function addedSessions(snapshot: DaySnapshot, date: string, which: (def: SessionDef) => boolean): PlanBlock[] {
  return snapshot.settings.sessions.filter(which).flatMap((def) => sessionBlock(def, date, snapshot.holidays) ?? [])
}

/**
 * The blocks the day's snapshot gives, by id, whether in the plan or not: the snapshot's (also one cancelled for the day)
 * and the sessions an answer „tak” may add (in no snapshot) – a block taken out of the plan after it began (D336) is named
 * by its entry (D338). Counted once, at the first look.
 */
export function snapshotEntries(snapshot: DaySnapshot, date: string): (id: string) => PlanBlock | null {
  let byId: Map<string, PlanBlock> | null = null
  return (id) => {
    byId ??= new Map([...addedSessions(snapshot, date, () => true), ...snapshot.blocks].map((b) => [b.id, b]))
    return byId.get(id) ?? null
  }
}

/**
 * The plan of a day: the snapshot's blocks with your edits laid over them – a block of the file replaces the snapshot's
 * block of the same id, cancelled and moved-away blocks leave, new blocks join; a block anchored to one that left leaves
 * with it.
 */
export function dayPlan(snapshot: DaySnapshot, dayFile: DayFile | null): PlanBlock[] {
  const own = new Map((dayFile?.blocks ?? []).map((b) => [b.id, b]))
  const gone = new Set([...(dayFile?.cancelled ?? []), ...Object.keys(dayFile?.movedTo ?? {})])
  // The answers of the session layer given after the day was made: „nie” takes a session away (and what is anchored to
  // it), „tak” brings one the day was made without (spec „Sesje tradingowe”).
  const snapshotBlocks = snapshotBlocksOf(snapshot, dayFile)
  const shift = wakeShift(snapshot, dayFile, snapshotBlocks, own)
  const out = new Map<string, PlanBlock>()
  for (const b of snapshotBlocks) if (!gone.has(b.id)) out.set(b.id, own.get(b.id) ?? shift(b))
  for (const b of own.values()) if (!gone.has(b.id) && !out.has(b.id)) out.set(b.id, b)
  // A block in a cycle of anchors (anchored to itself, or A→B→A) can never start: it leaves the plan.
  const cyclic = new Set<string>()
  for (const [id, b] of out) {
    const seen = new Set<string>([id])
    for (let a = b.anchor; a != null; a = out.get(a)?.anchor ?? null) {
      if (seen.has(a)) {
        cyclic.add(id)
        break
      }
      seen.add(a)
    }
  }
  for (const id of cyclic) out.delete(id)
  // Anchors to blocks that are gone take their blocks with them (repeated: chains of anchors).
  for (let changed = true; changed; ) {
    changed = false
    for (const [id, b] of out) {
      if (b.anchor && !out.has(b.anchor)) {
        out.delete(id)
        changed = true
      }
    }
  }
  return [...out.values()]
}

/**
 * The morning follows the day's wake (spec „Pobudkę możesz ustawić osobno”): the morning routine and the blocks planned
 * before the first fixed block (in a day without fixed blocks: every flexible one) move by the difference between the
 * day's wake and the template's, also in the weeks of the session shift; fixed blocks stay at their times (the plan shows
 * collisions). Only blocks of the snapshot you have not changed for the day move here; the blocks you placed move once,
 * when you change the wake (`wakeShifted`, D334) – a block added after that keeps its time.
 */
function wakeShift(snapshot: DaySnapshot, dayFile: DayFile | null, blocks: readonly PlanBlock[], own: ReadonlyMap<string, PlanBlock>): (b: PlanBlock) => PlanBlock {
  const delta = dayWakeMin(snapshot, dayFile) - snapshot.templateWakeMin
  if (delta === 0) return (b) => b
  const firstFixed = boundOf(blocks, own)
  return (b) => {
    const startMin = wakeShiftedStart(b, delta, firstFixed)
    return startMin == null ? b : { ...b, startMin }
  }
}

/** The first fixed block that bounds the morning: of the snapshot's blocks (yours over them) and yours – counted with the cancelled and moved away ones, as the morning has always followed the wake. */
function boundOf(blocks: readonly PlanBlock[], own: ReadonlyMap<string, PlanBlock>): number {
  return firstFixedStart([...blocks.map((b) => own.get(b.id) ?? b), ...own.values()])
}

/** The same bound for the blocks you placed (`wakeShifted`, D334): one rule for the snapshot's and for yours. */
export function morningBound(snapshot: DaySnapshot, dayFile: DayFile | null): number {
  return boundOf(snapshotBlocksOf(snapshot, dayFile), new Map((dayFile?.blocks ?? []).map((b) => [b.id, b])))
}

/** The start of the first fixed block of a plan, Infinity without one: what the morning that follows the wake is bounded by. */
export function firstFixedStart(plan: readonly PlanBlock[]): number {
  return Math.min(Number.POSITIVE_INFINITY, ...plan.filter((b) => b.fixed && b.startMin != null).map((b) => b.startMin!))
}

/**
 * Where a day's wake, `delta` minutes later (earlier) than the template's, puts a block: only a flexible block with a
 * start of its own, before `firstFixed`, moves – kept in the logical day; null: it keeps its place. One rule for the
 * blocks of the snapshot (`dayPlan`) and for the blocks you placed (`wakeShifted`, D334).
 */
export function wakeShiftedStart(b: Pick<PlanBlock, 'fixed' | 'anchor' | 'startMin' | 'durationMin'>, delta: number, firstFixed: number): number | null {
  if (delta === 0 || b.fixed || b.anchor || b.startMin == null || b.startMin >= firstFixed) return null
  const startMin = Math.max(PLAN_MIN, Math.min(PLAN_MAX - b.durationMin, b.startMin + delta))
  return startMin === b.startMin ? null : startMin
}

/**
 * The start a block of the template needs for a day to show it at `dayMin` – the inverse of `wakeShiftedStart` (the day's
 * wake `delta` minutes from the template's moves a flexible block of its own hour that starts before `firstFixed`): what
 * the axis of a template shows is written in the template's hours. Fixed and anchored blocks, and a place from the first
 * fixed block on, keep `dayMin` – a block put after the first fixed block stays after it, also where a start before it
 * would show there too (`delta` > 0). A place before it is the template's hour `delta` away. A day whose wake is earlier
 * (`delta` < 0) shows no block of the morning in the last `-delta` minutes before the first fixed block: a place there
 * gets the first fixed block's start, the first place after it the day can show. A moved morning block is shown at most at
 * the day's last start for its length (`PLAN_MAX` less its length – the cut of `wakeShiftedStart`) and at the template's
 * last start moved (`PLAN_MAX` + `delta`): a place after that takes the earlier of them. Kept in the logical day;
 * `shiftedStart(unshiftedStart(D))` is where the day shows the block, and again the same place for it.
 */
export function unshiftedStart(b: Pick<PlanBlock, 'fixed' | 'anchor' | 'durationMin'>, dayMin: number, delta: number, firstFixed: number): number {
  if (delta === 0 || b.fixed || b.anchor || dayMin >= firstFixed) return dayMin
  const shown = Math.min(dayMin, PLAN_MAX - b.durationMin)
  const startMin = Math.max(PLAN_MIN, Math.min(PLAN_MAX, shown - delta))
  return startMin < firstFixed ? startMin : firstFixed
}

/** Where a day whose wake is `delta` minutes from the template's shows a block the template starts at `startMin` (`wakeShiftedStart`). */
export function shiftedStart(b: Pick<PlanBlock, 'fixed' | 'anchor' | 'durationMin'>, startMin: number, delta: number, firstFixed: number): number {
  return wakeShiftedStart({ ...b, startMin }, delta, firstFixed) ?? startMin
}

/** The wake time of a day: your own for the day, else the snapshot's (with the session shift). */
export function dayWakeMin(snapshot: DaySnapshot, dayFile: DayFile | null): number {
  return dayFile?.wakeMin ?? snapshot.wakeMin
}

/**
 * The wake time a day's bedtime is read from (spec „Bazowa pora snu”): the next day's own wake, else its type's – the
 * shift of the session weeks never changes the bedtime of the day before.
 */
export function nextWakeForBedtime(nextSnapshot: DaySnapshot | null, nextFile: DayFile | null, changes: readonly SettingsChange[], nextDate: string): number {
  if (nextFile?.wakeMin != null) return nextFile.wakeMin
  if (nextSnapshot) return nextSnapshot.templateWakeMin
  const settings = settingsOn(changes, nextDate)
  const type = nextFile?.dayType ?? defaultDayType(nextDate, settings)
  return settings.dayTypes[type].wakeMin
}
