/**
 * A day of „zjazd” from the imported schedule (D357) as an edit of its file (days/RRRR/RRRR-MM-DD.json) – only with the
 * fields every version reads, so a computer on an older version (≤ 1.0.x) computes the same plan from the same file:
 * - the type of the day, as marking it in the calendar does (stationary – a room in the building, remote – TEAMS only);
 * - every row as a fixed block of its own (origin „zjazd”, named „<przedmiot> · <forma>”): a room in the building – the
 *   commute category's variant „Zajęcia”, TEAMS – „Zajęcia zdalne”; the breaks between them are time without a block;
 * - the template's blocks of classes (those two) cancelled; its commute legs („Dojazd”) of a stationary day moved to the
 *   hours of the classes: the way there ends at the first class, the way back starts at the end of the last one, each
 *   with the template's length (no commute in the template – none); the template's other blocks stay where they are, and
 *   a block anchored to a replaced class (a meal after the classes) follows the imported class ending nearest to it;
 * - a record of the import (`classImport`): what it cancelled and the blocks it changed as they were before it – the
 *   same date imported again first undoes the import before, so the new one replaces it whole.
 * Only days to come take an import: a day that has begun (today) or is gone keeps its plan (`zjazdSkipOf`).
 */
import { dayRaw, putBlock, setCancelled, setDayField, takeBlock, type Raw } from '../data/dayEdits'
import { createDay, dayPlan, type HolidayLookup } from '../engine/createDay'
import { plannedStartMin } from '../engine/planEdit'
import { COMMUTE_CATEGORY, REMOTE_CLASS_CATEGORY } from '../model/categories'
import { derivedId } from '../model/ids'
import { DAY_TYPES, type DayTypeId, type SettingsChange } from '../model/settings'
import { PLAN_MAX, PLAN_MIN, dayFileFrom, planBlock, type LectureSeries, type PlanBlock, type Template } from '../model/plan'
import { classTitle, isRemoteRoom, type ZjazdDay, type ZjazdKind } from './zjazdy'

/** The field of the day's file that records the import (unknown to older versions, which keep it as it is). */
export const CLASS_IMPORT = 'classImport'
/** The commute category's variants (spec „Kategorie startowe”: „Dojazd, zajęcia stacjonarne”). */
export const CLASS_VARIANT = 'zajecia'
export const COMMUTE_VARIANT = 'dojazd'

/** What a day is made from (as `createDay` takes it). */
export interface ZjazdInputs {
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
  holidays: HolidayLookup
}

/**
 * What the file keeps of an import – only what undoing it needs (no instant of the import: the same schedule imported
 * on two computers writes the same file, never a question about a field that only says when).
 */
export interface ClassImport {
  /** The day's own type before the import (null: its weekday's). */
  dayType: DayTypeId | null
  /** The blocks of the snapshot it cancelled (the template's classes). */
  cancelled: string[]
  /** The blocks it changed (commute, anchors), as the file had them before it (null: not in the file). */
  before: Record<string, Raw | null>
}

export const zjazdDayType = (kind: ZjazdKind): DayTypeId => (kind === 'stacjonarny' ? 'zjazd-stacjonarny' : 'zjazd-zdalny')

/** A block of classes: remote classes, or the commute category's „Zajęcia”. */
export const isClassBlock = (b: Pick<PlanBlock, 'categoryId' | 'variantId'>): boolean =>
  b.categoryId === REMOTE_CLASS_CATEGORY || (b.categoryId === COMMUTE_CATEGORY && b.variantId === CLASS_VARIANT)
/** A leg of the commute: the commute category's „Dojazd”. */
export const isCommuteLeg = (b: Pick<PlanBlock, 'categoryId' | 'variantId'>): boolean => b.categoryId === COMMUTE_CATEGORY && b.variantId === COMMUTE_VARIANT

/** Today and the days gone keep their plan (the day has begun – its snapshot is in the log); null – a day to come. */
export function zjazdSkipOf(date: string, today: string): 'today' | 'past' | null {
  return date < today ? 'past' : date === today ? 'today' : null
}

/** Why a day of the import (or of its „Cofnij”) was left as it is. */
export const ZJAZD_SKIP_TEXT: Readonly<Record<'today' | 'past' | 'invalid' | 'unreadable' | 'noImport', string>> = {
  today: 'dzień już trwa – jego plan zmienisz w „Dziś”',
  past: 'dzień minął – jego plan zostaje',
  invalid: 'dzień bez poprawnych zajęć',
  unreadable: 'pliku dnia nie da się teraz odczytać – spróbuj za chwilę',
  noImport: 'ten dzień nie ma zajęć z importu'
}

const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const blockList = (raw: Raw): unknown[] => (Array.isArray(raw.blocks) ? (raw.blocks as unknown[]) : isPlain(raw.blocks) ? Object.values(raw.blocks) : [])

/** The record of the import in a file, null without one (or unreadable). */
export function classImportOf(raw: Raw | null | undefined): ClassImport | null {
  const r = raw?.[CLASS_IMPORT]
  if (!isPlain(r)) return null
  const before: Record<string, Raw | null> = {}
  if (isPlain(r.before)) for (const [id, b] of Object.entries(r.before)) before[id] = isPlain(b) ? b : null
  return {
    dayType: typeof r.dayType === 'string' && (DAY_TYPES as readonly string[]).includes(r.dayType) ? (r.dayType as DayTypeId) : null,
    cancelled: Array.isArray(r.cancelled) ? r.cancelled.filter((x): x is string => typeof x === 'string') : [],
    before
  }
}

/** The file has classes of an import (or its record). */
export const hasZjazdImport = (raw: Raw | null | undefined): boolean => !!raw && (classImportOf(raw) != null || blockList(raw).some((b) => isPlain(b) && b.origin === 'zjazd'))

/** The classes of a day as its blocks: fixed, named, with ids from the date and the row (the same row – the same block on every computer). */
export function zjazdClassBlocks(day: ZjazdDay): PlanBlock[] {
  const seen = new Map<string, number>()
  return day.classes.map((c) => {
    const title = classTitle(c)
    const key = `${c.startMin}|${c.endMin}|${title}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    const remote = day.kind === 'zdalny' || isRemoteRoom(c.room)
    return planBlock({
      id: derivedId(day.date, 'zjazd', c.startMin, c.endMin, title, n),
      categoryId: remote ? REMOTE_CLASS_CATEGORY : COMMUTE_CATEGORY,
      variantId: remote ? null : CLASS_VARIANT,
      startMin: c.startMin,
      durationMin: c.endMin - c.startMin,
      fixed: true,
      origin: 'zjazd',
      name: title || null
    })
  })
}

/** A raw block put back as it was (replacing the one with its id). */
function putRaw(raw: Raw, b: Raw): Raw {
  const list = blockList(raw)
  const i = list.findIndex((x) => isPlain(x) && x.id === b.id)
  const next = [...list]
  if (i >= 0) next[i] = b
  else next.push(b)
  return { ...raw, blocks: next }
}

/**
 * The day's file without an import of its classes: the imported classes out, the blocks it changed back as they were,
 * its cancels undone, the day's type before it again; unknown fields stay. A file without an import – as it is.
 */
export function withoutZjazd(raw: Raw | null | undefined, date: string): Raw {
  let next = dayRaw(raw, date)
  const rec = classImportOf(next)
  if (blockList(next).some((b) => isPlain(b) && b.origin === 'zjazd')) next = { ...next, blocks: blockList(next).filter((b) => !(isPlain(b) && b.origin === 'zjazd')) }
  if (!rec) return next
  for (const [id, b] of Object.entries(rec.before)) next = b ? putRaw(next, { ...b, id }) : takeBlock(next, id)
  for (const id of rec.cancelled) next = setCancelled(next, id, false)
  next = setDayField(next, 'dayType', rec.dayType)
  delete next[CLASS_IMPORT]
  return next
}

const inDay = (start: number, duration: number) => Math.max(PLAN_MIN, Math.min(PLAN_MAX + 1 - duration, start))

/**
 * The day's file with `day` imported: an import of the date before is replaced (the same import again gives the same
 * file). The plan it is laid over is the day as it would be made now with its new type (template, sessions, lectures)
 * and your edits of it.
 */
export function zjazdDayRaw(raw: Raw | null | undefined, day: ZjazdDay, inp: ZjazdInputs): Raw {
  const date = day.date
  const base = withoutZjazd(raw, date)
  const typeBefore = dayFileFrom(base, date).dayType
  const dayType = zjazdDayType(day.kind)
  let next = setDayField(base, 'dayType', dayType)
  // A day without classes is never imported (the parser and `zjazdDayFrom` leave it out): only its type, nothing replaced.
  if (!day.classes.length) return next
  const file = dayFileFrom(next, date)
  const snapshot = createDay({ date, changes: inp.changes, templates: inp.templates, lectures: inp.lectures, dayFile: file, holidays: inp.holidays, at: null })
  const plan = dayPlan(snapshot, file)

  const classes = zjazdClassBlocks(day)
  const replaced = plan.filter((b) => b.origin === 'template' && isClassBlock(b))
  const replacedIds = new Set(replaced.map((b) => b.id))
  const before: Record<string, Raw | null> = {}
  const baseBlocks = blockList(base)
  const touch = (b: PlanBlock) => {
    if (!(b.id in before)) before[b.id] = (baseBlocks.find((x) => isPlain(x) && x.id === b.id) as Raw | undefined) ?? null
    next = putBlock(next, b)
  }
  for (const b of replaced) next = setCancelled(next, b.id, true)
  for (const b of classes) next = putBlock(next, b)

  const span = (b: PlanBlock) => {
    const s = plannedStartMin(b, plan)
    return s == null ? null : { start: s, end: s + b.durationMin }
  }
  const first = Math.min(...classes.map((b) => b.startMin!))
  const lastEnd = Math.max(...classes.map((b) => b.startMin! + b.durationMin))
  const lastClass = [...classes].sort((a, b) => a.startMin! + a.durationMin - (b.startMin! + b.durationMin) || a.startMin! - b.startMin!).at(-1)!
  /** The imported class ending nearest to `end` (a tie – the later one); unknown – the last one. */
  const nearest = (end: number | null) => {
    if (end == null) return lastClass
    let best = lastClass
    for (const b of classes) {
      const d = Math.abs(b.startMin! + b.durationMin - end)
      const bd = Math.abs(best.startMin! + best.durationMin - end)
      if (d < bd || (d === bd && b.startMin! + b.durationMin > best.startMin! + best.durationMin)) best = b
    }
    return best
  }

  // The commute of a stationary day: the legs before the template's classes go there, the ones after them come back.
  const handled = new Set<string>()
  if (dayType === 'zjazd-stacjonarny') {
    const legs = plan
      .filter((b) => b.origin === 'template' && isCommuteLeg(b))
      .map((b) => ({ b, sp: span(b) }))
      .filter((x): x is { b: PlanBlock; sp: { start: number; end: number } } => x.sp != null)
      .sort((x, y) => x.sp.start - y.sp.start)
    const tplSpans = replaced.map(span).filter((x): x is { start: number; end: number } => x != null)
    let there: typeof legs
    let back: typeof legs
    if (tplSpans.length) {
      const tplFirst = Math.min(...tplSpans.map((s) => s.start))
      const tplLast = Math.max(...tplSpans.map((s) => s.end))
      there = legs.filter((x) => x.sp.start < tplFirst)
      back = legs.filter((x) => x.sp.start >= tplLast)
    } else {
      there = legs.slice(0, 1)
      back = legs.slice(1)
    }
    if (there.length) {
      const delta = first - Math.max(...there.map((x) => x.sp.end))
      for (const { b } of there) {
        handled.add(b.id)
        if (b.anchor == null && b.startMin != null && delta !== 0) touch({ ...b, startMin: inDay(b.startMin + delta, b.durationMin) })
      }
    }
    if (back.length) {
      const delta = lastEnd - Math.min(...back.map((x) => x.sp.start))
      for (const { b } of back) {
        handled.add(b.id)
        if (b.anchor != null) {
          if (replacedIds.has(b.anchor)) touch({ ...b, anchor: lastClass.id })
        } else if (b.startMin != null && delta !== 0) touch({ ...b, startMin: inDay(b.startMin + delta, b.durationMin) })
      }
    }
  }

  // Blocks anchored to a replaced class (of the template or yours) follow the imported class ending nearest to it.
  for (const b of plan) {
    if (!b.anchor || !replacedIds.has(b.anchor) || replacedIds.has(b.id) || handled.has(b.id)) continue
    const anchor = replaced.find((x) => x.id === b.anchor)!
    touch({ ...b, anchor: nearest(span(anchor)?.end ?? null).id })
  }

  const record: ClassImport = { dayType: typeBefore, cancelled: replaced.map((b) => b.id), before }
  return { ...next, [CLASS_IMPORT]: record }
}
