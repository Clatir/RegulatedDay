/**
 * Creating a day (spec „Dzień i czas”, „Typy dni i szablony”, „Sesje tradingowe”, „Plan wykładów”): one deterministic
 * function. It takes the template and settings in force on the date, the lectures of the plan, the sessions of the
 * session layer placed from their own zone (shortened on early-close days), and writes them as the day's snapshot; your
 * edits of the day (its file) are laid over the snapshot by `dayPlan`, before and after the creation alike. Every
 * computer computes the same snapshot from the same files, and the derived ids make the same blocks.
 */
import { derivedId } from '../model/ids'
import { SESSION_CATEGORY } from '../model/categories'
import type { DaySnapshot } from '../model/events'
import { planBlock, templateFor, type DayFile, type LectureSeries, type PlanBlock, type Template } from '../model/plan'
import { settingsOn, type DayTypeId, type RulesSettings, type SessionDef, type SettingsChange } from '../model/settings'
import { dayEnd, dayStart, logicalMinuteOf } from '../time/day'
import { MINUTE, PL_ZONE, addDays, offsetMin, placeWall, weekday } from '../time/zone'

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
  /** The day's file (your edits so far); null = none yet. */
  dayFile: DayFile | null
  holidays: HolidayLookup
  /** The instant of creation: „od dziś” changes of the day up to it are in the snapshot. */
  at: number | null
}

/** The type a date has unless you choose another: weekdays are ordinary days, Saturday and Sunday weekend days. */
export function defaultDayType(date: string): DayTypeId {
  return weekday(date) >= 6 ? 'weekend' : 'zwykly'
}

/** Anchors in templates point at template blocks by their id, or at a session as „session:<id>”. */
export const SESSION_ANCHOR = 'session:'

const sessionBlockId = (date: string, sessionId: string) => derivedId(date, 'ses', sessionId)
const templateBlockId = (date: string, templateId: string, blockId: string) => derivedId(date, 'tpl', templateId, blockId)
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
  const dayType = dayFile?.dayType ?? defaultDayType(date)
  const settings = settingsOn(inp.changes, date, inp.at)
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
    if (!sessionKept(settings, dayType, date, def.id, dayFile)) continue
    const win = sessionWindow(def, date)
    if (!win) continue
    let end = win.end
    for (const m of def.markets) {
      noteMarket(m)
      const h = holidays.find((x) => x.market === m)
      if (h?.earlyCloseAt != null) end = Math.min(end, h.earlyCloseAt)
    }
    if (end <= win.start) continue
    const id = sessionBlockId(date, def.id)
    sessionIds.set(def.id, id)
    shift = Math.min(shift, sessionShiftMin(def, win.start))
    blocks.push(
      planBlock({
        id,
        categoryId: SESSION_CATEGORY,
        startMin: Math.round(logicalMinuteOf(date, win.start)),
        durationMin: Math.round((end - win.start) / MINUTE),
        fixed: true,
        origin: 'session',
        sourceId: def.id
      })
    )
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

  blocks.sort((a, b) => (a.startMin ?? 1e9) - (b.startMin ?? 1e9) || (a.id < b.id ? -1 : 1))
  const templateWakeMin = params.wakeMin
  // While the sessions start an hour earlier the wake time does too (not before 04:00); your own wake for the day wins.
  const wakeMin = Math.max(4 * 60, templateWakeMin + shift)
  return {
    dayType,
    settings,
    templateId: tpl?.template.id ?? null,
    templateFrom: tpl?.version.from ?? null,
    budgetMin: tpl?.version.budgetMin ?? params.budgetMin,
    maxMin: tpl?.version.maxMin ?? params.maxMin,
    wakeMin,
    templateWakeMin,
    blocks,
    changes,
    holidays
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
  const out = new Map<string, PlanBlock>()
  for (const b of snapshot.blocks) if (!gone.has(b.id)) out.set(b.id, own.get(b.id) ?? b)
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
  const type = nextFile?.dayType ?? defaultDayType(nextDate)
  return settingsOn(changes, nextDate).dayTypes[type].wakeMin
}
