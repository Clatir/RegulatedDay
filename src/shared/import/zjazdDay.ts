/**
 * A day of „zjazd” from the imported schedule (D357) as an edit of its file (days/RRRR/RRRR-MM-DD.json) – only with the
 * fields every version reads, so a computer on an older version (≤ 1.0.x) computes the same plan from the same file:
 * - the type of the day, as marking it in the calendar does (stationary – a room in the building, remote – TEAMS only);
 * - every row as a fixed block of its own (origin „zjazd”, named „<przedmiot> · <forma>”): a room in the building – the
 *   commute category's variant „Zajęcia”, TEAMS – „Zajęcia zdalne”; the breaks between them are time without a block;
 * - the template's blocks of classes (those two) cancelled; its commute legs („Dojazd”) of a stationary day moved to the
 *   hours of the classes: the way there ends at the first class, the way back starts at the end of the last one, each
 *   with the template's length (no commute in the template – none); the template's other blocks stay where they are, and
 *   a block anchored to a replaced class (a meal after the classes, yours too) follows the imported class ending nearest
 *   to it;
 * - a record of the import (`classImport`): the type before it and the one it set, what it cancelled (with the planned
 *   end of each template class), every block it changed as the file had it before and as it left it.
 * The same date imported again first resets the import before (`withoutZjazd`) – but only what still stands as that
 * import left it: a commute leg you moved, a block you changed, a type you set after it stay yours (the new import does
 * not move them either); its classes always go (the new import's classes replace them), and a block anchored to one of
 * them follows the template's class ending nearest to it (it comes back), else keeps its time – it never leaves the plan.
 * Only days to come take an import: a day that has begun (today) or is gone keeps its plan (`zjazdSkipOf`).
 */
import { dayBlocks, dayRaw, isRaw, putBlock, putRawBlock, setCancelled, setDayField, takeBlock, type Raw } from '../data/dayEdits'
import { deepEqual, sameContentAs } from '../data/merge'
import { createDay, dayPlan, type HolidayLookup } from '../engine/createDay'
import { plannedStartMin } from '../engine/planEdit'
import { COMMUTE_CATEGORY, REMOTE_CLASS_CATEGORY } from '../model/categories'
import { derivedId } from '../model/ids'
import { DAY_TYPES, type DayTypeId, type SettingsChange } from '../model/settings'
import { PLAN_MAX, PLAN_MIN, dayFileFrom, planBlock, type LectureSeries, type PlanBlock, type Template } from '../model/plan'
import type { SeriesPlan } from '../model/series'
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
  series: readonly SeriesPlan[]
  holidays: HolidayLookup
}

/**
 * What the file keeps of an import – what resetting it needs (no instant of the import: the same schedule imported on
 * two computers writes the same file, never a question about a field that only says when).
 */
export interface ClassImport {
  /** The day's own type before the import (null: its weekday's). */
  dayType: DayTypeId | null
  /** The type the import set (the reset gives the type before back only while the day still has it). */
  setType: DayTypeId | null
  /** The blocks of the snapshot it cancelled (the template's classes). */
  cancelled: string[]
  /** The planned end of each cancelled class of the template (where a block anchored to an imported class goes back). */
  classEnds: Record<string, number>
  /** The blocks it changed (commute, anchors): as the file had them before it (null: not in the file) and as it left them. */
  changed: Record<string, { before: Raw | null; after: Raw }>
}

export const zjazdDayType = (kind: ZjazdKind): DayTypeId => (kind === 'stacjonarny' ? 'zjazd-stacjonarny' : 'zjazd-zdalny')

/**
 * A block of classes: remote classes, or the commute category's „Zajęcia” – also a block of that category without a
 * variant („Dojazd, zajęcia stacjonarne” as a whole is the classes, the commute is its variant „Dojazd”).
 */
export const isClassBlock = (b: Pick<PlanBlock, 'categoryId' | 'variantId'>): boolean =>
  b.categoryId === REMOTE_CLASS_CATEGORY || (b.categoryId === COMMUTE_CATEGORY && (b.variantId === CLASS_VARIANT || b.variantId == null))
/** A leg of the commute: the commute category's „Dojazd”. */
export const isCommuteLeg = (b: Pick<PlanBlock, 'categoryId' | 'variantId'>): boolean => b.categoryId === COMMUTE_CATEGORY && b.variantId === COMMUTE_VARIANT

/** Today and the days gone keep their plan (the day has begun – its snapshot is in the log); null – a day to come. */
export function zjazdSkipOf(date: string, today: string): 'today' | 'past' | null {
  return date < today ? 'past' : date === today ? 'today' : null
}

/** Why a day of the import (or of its „Cofnij”) was left as it is. */
export const ZJAZD_SKIP_TEXT: Readonly<Record<'today' | 'past' | 'invalid' | 'unreadable' | 'broken' | 'changed', string>> = {
  today: 'dzień już trwa – jego plan zmienisz w „Dziś”',
  past: 'dzień minął – jego plan zostaje',
  invalid: 'dzień bez poprawnych zajęć',
  unreadable: 'pliku dnia nie da się teraz odczytać – spróbuj za chwilę',
  broken: 'plik dnia jest uszkodzony – nie zapisano (przywróć go z Historii)',
  changed: 'plik dnia zmieniono po imporcie – zostaje, jak jest'
}

const minute = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const isDayType = (v: unknown): v is DayTypeId => typeof v === 'string' && (DAY_TYPES as readonly string[]).includes(v)

/** The record of the import in a file, null without one (or unreadable). */
export function classImportOf(raw: Raw | null | undefined): ClassImport | null {
  const r = raw?.[CLASS_IMPORT]
  if (!isRaw(r)) return null
  const changed: ClassImport['changed'] = {}
  if (isRaw(r.changed)) for (const [id, c] of Object.entries(r.changed)) if (isRaw(c) && isRaw(c.after)) changed[id] = { before: isRaw(c.before) ? c.before : null, after: c.after }
  const classEnds: Record<string, number> = {}
  if (isRaw(r.classEnds)) for (const [id, m] of Object.entries(r.classEnds)) if (minute(m) != null) classEnds[id] = m as number
  return {
    dayType: isDayType(r.dayType) ? r.dayType : null,
    setType: isDayType(r.setType) ? r.setType : null,
    cancelled: Array.isArray(r.cancelled) ? r.cancelled.filter((x): x is string => typeof x === 'string') : [],
    classEnds,
    changed
  }
}

/**
 * Two versions of a day's file with the same content (the save's stamps aside; its blocks by id, in any order – the
 * queue may lay them in another order than they were made): whether a file still stands as a save left it.
 */
export function sameDayFile(a: Raw | null | undefined, b: Raw | null | undefined): boolean {
  const norm = (r: Raw | null | undefined) => {
    if (!isRaw(r) || r.blocks === undefined) return r ?? null
    const blocks = dayBlocks(r)
    const id = (x: unknown) => (isRaw(x) && typeof x.id === 'string' ? x.id : '')
    return { ...r, blocks: [...blocks].sort((x, y) => (id(x) < id(y) ? -1 : id(x) > id(y) ? 1 : 0)) }
  }
  return sameContentAs(norm(a), norm(b))
}

/** The file has classes of an import (or its record). */
export const hasZjazdImport = (raw: Raw | null | undefined): boolean => !!raw && (classImportOf(raw) != null || dayBlocks(raw).some((b) => isRaw(b) && b.origin === 'zjazd'))

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

const inDay = (start: number, duration: number) => Math.max(PLAN_MIN, Math.min(PLAN_MAX + 1 - duration, start))

/** Of `list` (id, end), the one ending nearest to `end` (a tie – the later one); none – null. */
function nearestOf(list: ReadonlyArray<{ id: string; end: number }>, end: number): string | null {
  let best: { id: string; end: number } | null = null
  for (const x of list) {
    const d = Math.abs(x.end - end)
    if (!best || d < Math.abs(best.end - end) || (d === Math.abs(best.end - end) && x.end > best.end)) best = x
  }
  return best?.id ?? null
}

/** A file with the import before reset (`resetZjazd`): what is still yours of it, and the blocks that followed its classes. */
interface Reset {
  raw: Raw
  /** Blocks the import changed and you changed after it: they stay yours (the new import does not move them). */
  kept: Set<string>
  /** Blocks anchored to one of its classes (yours too): id → the planned end of that class. */
  orphans: Map<string, number>
}

function resetZjazd(raw: Raw | null | undefined, date: string): Reset {
  let next = dayRaw(raw, date)
  const rec = classImportOf(next)
  // Its classes go, always (the new import's replace them): their ends say where the blocks after them go.
  const classEnd = new Map<string, number>()
  for (const b of dayBlocks(next)) {
    if (!isRaw(b) || b.origin !== 'zjazd' || typeof b.id !== 'string') continue
    const s = minute(b.startMin)
    const d = minute(b.durationMin)
    classEnd.set(b.id, s != null && d != null ? s + d : Number.NaN)
  }
  if (classEnd.size) next = { ...next, blocks: dayBlocks(next).filter((b) => !(isRaw(b) && b.origin === 'zjazd')) }
  const kept = new Set<string>()
  if (rec) {
    // A block back as before the import only while it stands as the import left it; changed (or taken out) since – yours.
    // A block of the file the import put after one of its classes is no block to bring back as it was (its „before” may
    // be a reset of an import before that – a time it no longer has): it follows the classes as the blocks below do.
    for (const [id, { before, after }] of Object.entries(rec.changed)) {
      const now = dayBlocks(next).find((x) => isRaw(x) && x.id === id)
      if (now === undefined || !deepEqual(now, after)) {
        kept.add(id)
        continue
      }
      if (before && typeof after.anchor === 'string' && classEnd.has(after.anchor)) continue
      next = before ? putRawBlock(next, { ...before, id }) : takeBlock(next, id)
    }
    for (const id of rec.cancelled) next = setCancelled(next, id, false)
    // The type before the import – while the day still has the type the import set (one you set after it stays).
    if (rec.setType != null && dayFileFrom(next, date).dayType === rec.setType) next = setDayField(next, 'dayType', rec.dayType)
    delete next[CLASS_IMPORT]
  }
  // A block anchored to one of its classes never leaves the plan: after the template's class ending nearest to it – when
  // they come back (the day keeps the type whose template's classes the import replaced) – else at the time that class
  // ended (another type, its template unknown here).
  const typeStays = rec?.setType != null && dayFileFrom(next, date).dayType === rec.setType
  const back = typeStays ? rec!.cancelled.filter((id) => rec!.classEnds[id] != null).map((id) => ({ id, end: rec!.classEnds[id]! })) : []
  const orphans = new Map<string, number>()
  for (const b of dayBlocks(next)) {
    if (!isRaw(b) || typeof b.id !== 'string' || typeof b.anchor !== 'string' || !classEnd.has(b.anchor)) continue
    const end = classEnd.get(b.anchor)!
    if (!Number.isFinite(end)) continue
    orphans.set(b.id, end)
    const target = nearestOf(back, end)
    const duration = minute(b.durationMin) ?? 1
    next = putRawBlock(next, target ? { ...b, anchor: target } : { ...b, anchor: null, startMin: inDay(end, duration) })
  }
  return { raw: next, kept, orphans }
}

/**
 * The day's file without the import of its classes (as before it, but what you changed after it stays yours – see the
 * top of the file); unknown fields stay. A file without an import – as it is.
 */
export function withoutZjazd(raw: Raw | null | undefined, date: string): Raw {
  return resetZjazd(raw, date).raw
}

/**
 * A day's type set in the calendar (null: its weekday's again): a type that is no „zjazd” takes the day's import away in
 * the same edit (`withoutZjazd` – its classes, the commute it moved, as far as they stand as it left them), so an
 * ordinary day keeps no classes of the import and no commute of the template of a „zjazd”; the other kind of „zjazd”
 * keeps it. A day without an import – only its type.
 */
export function zjazdTypeRaw(raw: Raw, date: string, type: DayTypeId | null): Raw {
  const zjazd = type === 'zjazd-stacjonarny' || type === 'zjazd-zdalny'
  return setDayField(!zjazd && hasZjazdImport(raw) ? withoutZjazd(raw, date) : raw, 'dayType', type)
}

/**
 * The day's file with `day` imported: an import of the date before is reset first (`withoutZjazd`), so the new one
 * replaces it (the same import again gives the same file). The plan it is laid over is the day as it would be made now
 * with its new type (template, sessions, lectures) and your edits of it.
 */
export function zjazdDayRaw(raw: Raw | null | undefined, day: ZjazdDay, inp: ZjazdInputs): Raw {
  const date = day.date
  const { raw: base, kept, orphans } = resetZjazd(raw, date)
  const typeBefore = dayFileFrom(base, date).dayType
  const dayType = zjazdDayType(day.kind)
  let next = setDayField(base, 'dayType', dayType)
  // A day without classes is never imported (the parser and `zjazdDayFrom` leave it out): only its type, nothing replaced.
  if (!day.classes.length) return next
  const file = dayFileFrom(next, date)
  const snapshot = createDay({ date, changes: inp.changes, templates: inp.templates, lectures: inp.lectures, series: inp.series, dayFile: file, holidays: inp.holidays, at: null })
  const plan = dayPlan(snapshot, file)

  const classes = zjazdClassBlocks(day)
  const replaced = plan.filter((b) => b.origin === 'template' && isClassBlock(b))
  const replacedIds = new Set(replaced.map((b) => b.id))
  const baseBlocks = dayBlocks(base)
  const touched = new Map<string, Raw | null>()
  const touch = (b: PlanBlock) => {
    if (!touched.has(b.id)) touched.set(b.id, (baseBlocks.find((x) => isRaw(x) && x.id === b.id) as Raw | undefined) ?? null)
    next = putBlock(next, b)
  }
  for (const b of replaced) next = setCancelled(next, b.id, true)
  for (const b of classes) next = putBlock(next, b)

  const span = (b: PlanBlock) => {
    const s = plannedStartMin(b, plan)
    return s == null ? null : { start: s, end: s + b.durationMin }
  }
  const ends = classes.map((b) => ({ id: b.id, end: b.startMin! + b.durationMin }))
  const first = Math.min(...classes.map((b) => b.startMin!))
  const lastEnd = Math.max(...ends.map((x) => x.end))
  const lastClass = nearestOf(ends, Number.POSITIVE_INFINITY)!
  /** The imported class ending nearest to `end` (a tie – the later one). */
  const nearest = (end: number | null) => (end == null ? lastClass : nearestOf(ends, end)!)

  // The commute of a stationary day: the legs before the template's classes go there, the ones after them come back;
  // a leg you changed after an import before stays where you put it.
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
    const movable = (x: (typeof legs)[number]) => !kept.has(x.b.id)
    if (there.some(movable)) {
      const delta = first - Math.max(...there.map((x) => x.sp.end))
      for (const x of there) {
        handled.add(x.b.id)
        const b = x.b
        if (movable(x) && b.anchor == null && b.startMin != null && delta !== 0) touch({ ...b, startMin: inDay(b.startMin + delta, b.durationMin) })
      }
    }
    if (back.some(movable)) {
      const delta = lastEnd - Math.min(...back.map((x) => x.sp.start))
      for (const x of back) {
        const b = x.b
        if (b.anchor != null) {
          if (replacedIds.has(b.anchor)) {
            handled.add(b.id)
            touch({ ...b, anchor: lastClass })
          }
          continue
        }
        handled.add(b.id)
        if (movable(x) && b.startMin != null && delta !== 0) touch({ ...b, startMin: inDay(b.startMin + delta, b.durationMin) })
      }
    }
  }

  // Blocks that followed a class – a replaced class of the template, or a class of the import before (yours too): after
  // the imported class ending nearest to it; only their anchor changes (a block you changed keeps the rest).
  for (const b of plan) {
    if (handled.has(b.id) || replacedIds.has(b.id)) continue
    const old = orphans.get(b.id)
    if (old != null) {
      touch({ ...b, anchor: nearest(old), startMin: null })
      continue
    }
    if (!b.anchor || !replacedIds.has(b.anchor)) continue
    const anchor = replaced.find((x) => x.id === b.anchor)!
    touch({ ...b, anchor: nearest(span(anchor)?.end ?? null) })
  }

  const blocksNow = dayBlocks(next)
  const changed: ClassImport['changed'] = {}
  for (const [id, before] of touched) changed[id] = { before, after: blocksNow.find((x) => isRaw(x) && x.id === id) as Raw }
  const classEnds: Record<string, number> = {}
  for (const b of replaced) {
    const s = span(b)
    if (s) classEnds[b.id] = s.end
  }
  const record: ClassImport = { dayType: typeBefore, setType: dayType, cancelled: replaced.map((b) => b.id), classEnds, changed }
  return { ...next, [CLASS_IMPORT]: record }
}
