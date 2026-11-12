/**
 * The changes of series for the main window (OPS1, D381, D382, D401): a new series from a block, a change and a removal by
 * scope („Tylko to · To i następne · Cała seria”), an end, the morning's answer about a special day, and „Cofnij” of one
 * of them. Each reads the records as this computer sees them (the files with your queued edits), counts the change with
 * the pure functions of `engine/series.ts`, and sends the records it touches – the series and the days' files – as one
 * edit of the queue (A3-15: on its disk all of them or none). Days gone by are never written; today's occurrence only
 * while it has not begun.
 */
import type { EditEntry, EditOutcome, RawRecord, SeriesResult, SeriesScope, SeriesUndoFile } from '@shared/api'
import { dayRaw, isRaw, putBlock, setCancelled, takeBlock, type Raw } from '@shared/data/dayEdits'
import { recordEdit, sameContentAs } from '@shared/data/merge'
import { classify, paths } from '@shared/data/paths'
import { dayContextOf } from '@shared/engine/context'
import type { HolidayLookup } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { plannedStartMin } from '@shared/engine/planEdit'
import {
  SeriesEditError,
  blockNotSeries,
  changedFrom,
  endedOn,
  newSeries,
  occurrenceVersion,
  seriesAnswerRaw,
  seriesBlockId,
  seriesBlocks,
  todayOccurrenceEdit,
  withEnd,
  type SeriesPatch,
  type TodayDay
} from '@shared/engine/series'
import { newId } from '@shared/model/ids'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import {
  DEFAULT_SPECIAL,
  SERIES_BLOCK_FIELDS,
  SERIES_COUNT_MAX,
  SPECIAL_DAYS,
  seriesBlockFrom,
  seriesJson,
  seriesOfBlock,
  seriesPlans,
  seriesLast,
  seriesRuleFrom,
  seriesVersionOn,
  typeOfDays,
  type Series,
  type SeriesBlock,
  type SeriesPlan,
  type SpecialDays
} from '@shared/model/series'
import type { DayTypeId } from '@shared/model/settings'
import { logicalDayOf } from '@shared/time/day'
import { addDays, isIsoDate } from '@shared/time/zone'
import type { DataFolder, Inputs } from './folder'
import { attachmentFrom, attachmentJson, attachmentRel, ownAttachmentIds, type Attachment } from '@shared/model/attachment'

export interface SeriesIo {
  folder: DataFolder
  holidays: HolidayLookup
  /** The window's edit (the hub's: the queue, then the window told). */
  edit: (entries: EditEntry[]) => Promise<EditOutcome[]>
}

const SCOPES: readonly SeriesScope[] = ['only', 'following', 'all']

/** The records one change touches: each read once (as this computer sees it), its new content kept until the edit. */
class Touched {
  private readonly files = new Map<string, { before: RawRecord | null; after: RawRecord | null }>()
  constructor(private readonly folder: DataFolder) {}

  async get(rel: string): Promise<RawRecord | null> {
    const had = this.files.get(rel)
    if (had) return had.after
    let before: RawRecord | null
    try {
      before = (await this.folder.recordView(rel)) ?? null
    } catch {
      // There but not readable now: never edited as a new file (its every field would meet the one on the disk).
      throw new SeriesEditError('invalid', 'Plik jest teraz nieczytelny – nic nie zostało zapisane, spróbuj za chwilę.')
    }
    this.files.set(rel, { before, after: before })
    return before
  }

  set(rel: string, after: RawRecord | null): void {
    const had = this.files.get(rel)
    this.files.set(rel, { before: had ? had.before : null, after })
  }

  entries(): { entries: EditEntry[]; undo: SeriesUndoFile[] } {
    const entries: EditEntry[] = []
    const undo: SeriesUndoFile[] = []
    for (const [rel, { before, after }] of this.files) {
      const e = recordEdit(rel, before, after)
      if (!e) continue
      entries.push(e)
      undo.push({ rel, before, after })
    }
    return { entries, undo }
  }
}

/** What every change starts from: today, the inputs as this computer sees them, the series and how their counts read days. */
interface Base {
  today: string
  now: number
  inp: Inputs
  list: Series[]
  /** The own types of days the counts read – those of `inputs` and those read for the series a change makes (`ensureTypes`). */
  days: Record<string, DayTypeId>
  /** The days read for this change (also those without a type of their own): a second count never reads them again. */
  seen: Map<string, DayTypeId | null>
}

async function baseOf(io: SeriesIo): Promise<Base> {
  const now = io.folder.clock.now()
  const inp = await io.folder.inputs(true)
  return { today: logicalDayOf(now), now, inp, list: inp.series.map((p) => p.series), days: { ...inp.seriesDays }, seen: new Map(Object.entries(inp.seriesDays)) }
}

const typeOf = (b: Base) => typeOfDays(b.inp.changes, (d) => b.days[d] ?? null)

/**
 * The types of the days the counts of `list` read, from their files (T717) – a series a change makes or gives a count is
 * counted from the same files as `inputs()` counts it afterwards (never by the weekdays only).
 */
async function ensureTypes(io: SeriesIo, b: Base, list: readonly Series[]): Promise<void> {
  Object.assign(b.days, await io.folder.countTypes(list, b.inp.changes, true, b.seen))
}
const plansOf = (io: SeriesIo, b: Base, list: readonly Series[]): SeriesPlan[] => seriesPlans(list, typeOf(b), io.holidays)

/** A day as this computer counts it now, with `raw` as its file (the file as the change leaves it so far). */
async function dayOf(io: SeriesIo, b: Base, date: string, raw: RawRecord | null): Promise<TodayDay> {
  const read = await io.folder.readDay(date)
  const nextFile = await io.folder.dayFile(addDays(date, 1), true).catch(() => null)
  const ctx = dayContextOf(b.inp, { date, events: read.events, dayFile: raw ? dayFileFrom(raw, date) : null, nextFile }, io.holidays, b.now)
  return { ctx, state: computeDay(ctx) }
}

const begun = (day: TodayDay, id: string): boolean => {
  const f = day.state.facts.blocks.get(id)
  return !!f && (f.startedAt != null || f.runs.length > 0)
}

/**
 * Today's occurrence of the series of `root` written as the change leaves the series (`next` – the series after it): it
 * comes, changes or goes in today's file, and pushes apart what is after it (`todayOccurrenceEdit`); `remove` – a removal
 * or an end (also one changed today goes).
 */
async function today(io: SeriesIo, b: Base, t: Touched, root: string, next: readonly Series[], remove = false, own: { was: PlanBlock; next: PlanBlock } | null = null): Promise<void> {
  const rel = paths.day(b.today)
  const raw = await t.get(rel)
  const day = await dayOf(io, b, b.today, raw)
  const id = seriesBlockId(b.today, root)
  const type = day.ctx.snapshot.dayType
  // `own`: today is the day it is changed from – its own entry with the changed fields (T715).
  const was = own?.was ?? seriesBlocks(b.inp.series.filter((p) => p.series.root === root), b.today, type, io.holidays).find((x) => x.id === id) ?? null
  const now = own?.next ?? seriesBlocks(plansOf(io, b, next).filter((p) => p.series.root === root), b.today, type, io.holidays).find((x) => x.id === id) ?? null
  const after = todayOccurrenceEdit(raw, day, id, was, now, remove)
  if (after) t.set(rel, after)
}

/**
 * The occurrences of `root` changed on their days („Tylko to”) from `from` on – an exception on its own day or one moved to
 * another – taken out of the days' files with a removal or an end (D381: the series is gone from that day on). Today's
 * goes with `today` (it may have begun).
 */
async function dropChanged(io: SeriesIo, b: Base, t: Touched, root: string, from: string): Promise<void> {
  const own = seriesBlockId(b.today, root)
  let dates: string[]
  try {
    // From today: one of `from` on may have been moved to an earlier day (never to a day gone by – those never change).
    dates = await io.folder.dayDatesFrom(b.today)
  } catch {
    throw new SeriesEditError('invalid', 'Folderu dni nie da się teraz odczytać – nic nie zostało zapisane, spróbuj za chwilę.')
  }
  for (const date of dates) {
    const rel = paths.day(date)
    const raw = await t.get(rel)
    if (!raw) continue
    const file = dayFileFrom(raw, date)
    const gone = file.blocks.filter((x) => x.origin === 'series' && x.sourceId === root && (x.movedFrom ?? date) >= from && !(date === b.today && x.id === own))
    if (!gone.length) continue
    // Today: one that has begun stays (it is part of the day's history).
    const day = date === b.today ? await dayOf(io, b, date, raw) : null
    let next: Raw = raw
    for (const x of gone) if (!day || !begun(day, x.id)) next = takeBlock(next, x.id)
    if (next !== raw) t.set(rel, next)
  }
}

const isScope = (v: unknown): v is SeriesScope => typeof v === 'string' && (SCOPES as readonly string[]).includes(v)

/** The patch from the window (untrusted): only fields it may have, each checked; null – not one. */
function patchFrom(v: unknown, start: string): SeriesPatch | null {
  if (!isRaw(v)) return null
  const out: SeriesPatch = {}
  if (v.block !== undefined) {
    if (!isRaw(v.block)) return null
    out.block = v.block as SeriesPatch['block']
  }
  if (v.rule !== undefined) {
    const rule = seriesRuleFrom(v.rule, start)
    if (!rule) return null
    out.rule = rule
  }
  if (v.special !== undefined) {
    if (!(SPECIAL_DAYS as readonly unknown[]).includes(v.special)) return null
    out.special = v.special as SpecialDays
  }
  if (v.until !== undefined) {
    if (v.until !== null && !isIsoDate(v.until)) return null
    out.until = v.until as string | null
  }
  if (v.count !== undefined) {
    if (v.count !== null && !(typeof v.count === 'number' && Number.isInteger(v.count) && v.count >= 1 && v.count <= SERIES_COUNT_MAX)) return null
    out.count = v.count as number | null
  }
  return out
}

/**
 * A patch's block checked over the version in force on `from` (as a block of a file): only the fields it changes, with
 * their values as read (T715 – a later version keeps what else it has); null – not a block.
 */
function blockPatched(s: Series, patch: SeriesPatch, from: string): SeriesPatch | null {
  if (!patch.block) return patch
  const full = seriesBlockFrom({ ...(seriesVersionOn(s, from) ?? s.versions[0]!).block, ...patch.block })
  if (!full) return null
  const block: Record<string, unknown> = {}
  for (const k of SERIES_BLOCK_FIELDS) if (k in patch.block) block[k] = full[k]
  return { ...patch, block: block as Partial<SeriesBlock> }
}

/** The series a target names, with the occurrence when it names one (a block of a day). */
async function targetOf(io: SeriesIo, b: Base, v: unknown): Promise<{ series: Series; date: string | null; block: PlanBlock | null; day: TodayDay | null }> {
  if (isRaw(v) && typeof v.seriesId === 'string') {
    const s = b.list.find((x) => x.id === v.seriesId)
    if (!s) throw new SeriesEditError('notFound', 'Tej serii już nie ma.')
    return { series: s, date: null, block: null, day: null }
  }
  if (!isRaw(v) || !isIsoDate(v.date) || typeof v.blockId !== 'string') throw new SeriesEditError('invalid', 'Nie wiadomo, której serii dotyczy zmiana.')
  const day = await dayOf(io, b, v.date, (await io.folder.recordView(paths.day(v.date)).catch(() => undefined)) ?? null)
  const block = day.ctx.plan.find((x) => x.id === v.blockId) ?? null
  const s = block ? seriesOfBlock(b.list, block, v.date) : null
  if (!block || !s) throw new SeriesEditError('notFound', 'Tego bloku serii już nie ma w planie dnia.')
  return { series: s, date: v.date, block, day }
}

/** The change written: every record as one edit; a refusal – nothing written, with why. */
async function run(io: SeriesIo, fn: (t: Touched) => Promise<string | null>, folder: DataFolder): Promise<SeriesResult> {
  const t = new Touched(folder)
  let seriesId: string | null
  try {
    seriesId = await fn(t)
  } catch (e) {
    if (e instanceof SeriesEditError) return { ok: false, error: e.message, code: e.code, seriesId: null, outcomes: [], undo: [] }
    throw e
  }
  const { entries, undo } = t.entries()
  const outcomes = entries.length ? await io.edit(entries) : []
  const ok = outcomes.every((o) => o.status === 'applied' || o.status === 'waiting')
  return { ok, error: null, code: null, seriesId, outcomes, undo: ok ? undo : [] }
}

const rel = (s: Series) => paths.record('series', s.id)

async function putSeries(t: Touched, s: Series): Promise<void> {
  t.set(rel(s), seriesJson(s, await t.get(rel(s))))
}

/**
 * „Powtarzaj” (D381): a new series from a block of `date`. It starts on its day (a day gone by – today; a block of today
 * that has begun – tomorrow, the block stays as it is). When its rule falls on that day, the block becomes the first
 * occurrence: taken out of its day (a block of the template cancelled) – today the occurrence is written into the file.
 */
export function seriesCreate(io: SeriesIo, input: unknown): Promise<SeriesResult> {
  return run(
    io,
    async (t) => {
      if (!isRaw(input) || !isIsoDate(input.date) || typeof input.blockId !== 'string') throw new SeriesEditError('invalid', 'Nie wiadomo, z którego bloku zrobić serię.')
      const b = await baseOf(io)
      const date = input.date
      const raw = await t.get(paths.day(date))
      const day = await dayOf(io, b, date, raw)
      const block = day.ctx.plan.find((x) => x.id === input.blockId)
      if (!block) throw new SeriesEditError('notFound', 'Tego bloku już nie ma w planie dnia.')
      const why = blockNotSeries(block)
      if (why) throw why
      const startMin = plannedStartMin(block, day.ctx.plan)
      if (startMin == null) throw new SeriesEditError('noStart', 'Blok bez własnej godziny nie powtarza się w serii.')
      const begunToday = date === b.today && begun(day, block.id)
      const start = date < b.today ? b.today : begunToday ? addDays(b.today, 1) : date
      const rule = seriesRuleFrom(input.rule, start)
      if (!rule) throw new SeriesEditError('invalid', 'Reguła powtarzania jest niepełna.')
      const special = (SPECIAL_DAYS as readonly unknown[]).includes(input.special) ? (input.special as SpecialDays) : DEFAULT_SPECIAL
      const until = isIsoDate(input.until) ? input.until : null
      const count = typeof input.count === 'number' && Number.isInteger(input.count) && input.count >= 1 && input.count <= SERIES_COUNT_MAX ? input.count : null
      // Its end is counted by `inputs()` from the days' files; what this change writes needs only its first days – the
      // block's day and today are its first occurrence each, before any count can end it.
      const s = newSeries(newId(10), seriesBlockFromPlan(block, startMin), start, rule, special, { until, count })
      await putSeries(t, s)
      const next = [...b.list, s]
      const plan = plansOf(io, b, next).find((p) => p.series.id === s.id)!
      // The block is the first occurrence on its day: it leaves for the occurrence (a block of the snapshot is cancelled).
      if (start === date && occurrenceVersion(plan, date, day.ctx.snapshot.dayType, io.holidays)) {
        const inSnapshot = day.ctx.snapshot.blocks.some((x) => x.id === block.id)
        const base = dayRaw(raw, date)
        t.set(paths.day(date), inSnapshot ? setCancelled(base, block.id, true) : takeBlock(base, block.id))
      }
      if (start <= b.today) await today(io, b, t, s.root, next)
      return s.id
    },
    io.folder
  )
}

const seriesBlockFromPlan = (b: PlanBlock, startMin: number) => seriesBlockFrom({ ...b, startMin })!

/**
 * A change by its scope (D381): „Tylko to” – the occurrence's own block in its day's file (as a block of the template is
 * changed); „Cała seria” – a version from today (the series' first day when it starts later); „To i następne” – a version
 * from the occurrence's day (today at the earliest; T715 – the series stays one record, its later versions get the change
 * too). The day it is changed from gets the changed fields in its own entry; today's occurrence follows while it has not
 * begun and was not changed on its day.
 */
export function seriesChange(io: SeriesIo, target: unknown, scope: unknown, patch: unknown): Promise<SeriesResult> {
  return run(
    io,
    async (t) => {
      if (!isScope(scope)) throw new SeriesEditError('invalid', 'Nie wiadomo, czego dotyczy zmiana.')
      const b = await baseOf(io)
      const tg = await targetOf(io, b, target)
      const s = tg.series
      const p0 = patchFrom(patch, b.today)
      if (scope === 'only') {
        if (!tg.date || !tg.block || !p0?.block) throw new SeriesEditError('invalid', '„Tylko to” zmienia jedno wystąpienie – wybierz blok dnia.')
        // The occurrence's own fields with the change (checked as a block of a file).
        const own = seriesBlockFrom({ ...tg.block, ...p0.block, startMin: p0.block.startMin ?? plannedStartMin(tg.block, tg.day!.ctx.plan) })
        if (!own) throw new SeriesEditError('invalid', 'Zmiana bloku jest niepełna.')
        const r = paths.day(tg.date)
        t.set(r, putBlock(dayRaw(await t.get(r), tg.date), { ...tg.block, ...own, anchor: null }))
        return s.id
      }
      // „Cała seria” from today, „To i następne” from the occurrence's day (today at the earliest): one series, a version
      // from that day (T715) – never parts of a series that could overlap.
      const from = scope === 'all' ? b.today : tg.date && tg.date > b.today ? tg.date : b.today
      const p = p0 && blockPatched(s, p0, from < s.start ? s.start : from)
      if (!p) throw new SeriesEditError('invalid', 'Zmiana serii jest niepełna.')
      let changed = changedFrom(s, from, p)
      const lastBefore = b.inp.series.find((x) => x.series.id === s.id)?.last ?? null
      const endChanged = p.until !== undefined || p.count !== undefined
      if (endChanged) {
        // What the days before today reached is counted from their files (T717), with the end as the change sets it.
        const end = { until: p.until !== undefined ? p.until : changed.until, count: p.count !== undefined ? p.count : changed.count }
        await ensureTypes(io, b, [{ ...changed, count: SERIES_COUNT_MAX, until: addDays(b.today, -1) }, { ...changed, ...end }])
        changed = withEnd(changed, p, b.today, lastBefore, typeOf(b), io.holidays)
      }
      await ensureTypes(io, b, [changed])
      await putSeries(t, changed)
      const next = b.list.map((x) => (x.id === s.id ? changed : x))
      // The day you change it from gets the changed fields in its own entry too (an occurrence pushed or dragged there, T715);
      // the other days with an entry keep theirs (D381). Today through `todayOccurrenceEdit`: it pushes apart what is after it.
      const tb = tg.block
      const entryOf = async (date: string) => dayFileFrom((await t.get(paths.day(date))) ?? {}, date).blocks.find((x) => x.id === tb!.id) ?? null
      const own = tg.date && tb && p.block && tg.date >= b.today && !(tg.date === b.today && tg.day && begun(tg.day, tb.id)) ? await entryOf(tg.date) : null
      if (own && tg.date! > b.today) {
        const r = paths.day(tg.date!)
        t.set(r, putBlock(dayRaw(await t.get(r), tg.date!), { ...own, ...p.block }))
      }
      if (own && tg.date === b.today) await today(io, b, t, s.root, next, false, { was: own, next: { ...own, ...p.block } })
      else await today(io, b, t, s.root, next)
      // An end moved earlier takes the occurrences changed on their days after it, as „Zakończ serię” does (D404).
      const lastAfter = seriesLast(changed, typeOf(b), io.holidays)
      if (endChanged && lastAfter != null && (lastBefore == null || lastAfter < lastBefore)) await dropChanged(io, b, t, s.root, addDays(lastAfter, 1))
      return s.id
    },
    io.folder
  )
}

/**
 * A removal by its scope (D381): „Tylko to” – the occurrence cancelled on its day (one moved there – taken out); „To i
 * następne” – the series ends the day before the occurrence (today at the earliest), from its first day – removed;
 * „Cała seria” – it ends yesterday (the day before its first day when it starts later) and leaves the list. Today's
 * occurrence goes while it has not begun (begun – the series ends today), the occurrences changed on their days from
 * then on go too.
 */
export function seriesRemove(io: SeriesIo, target: unknown, scope: unknown): Promise<SeriesResult> {
  return run(
    io,
    async (t) => {
      if (!isScope(scope)) throw new SeriesEditError('invalid', 'Nie wiadomo, czego dotyczy usunięcie.')
      const b = await baseOf(io)
      const tg = await targetOf(io, b, target)
      const s = tg.series
      if (scope === 'only') {
        if (!tg.date || !tg.block || !tg.day) throw new SeriesEditError('invalid', '„Tylko to” usuwa jedno wystąpienie – wybierz blok dnia.')
        if (begun(tg.day, tg.block.id)) throw new SeriesEditError('begun', 'To wystąpienie już się zaczęło – usuń je w planie dnia.')
        const r = paths.day(tg.date)
        const base = dayRaw(await t.get(r), tg.date)
        t.set(r, tg.day.ctx.snapshot.blocks.some((x) => x.id === tg.block!.id) ? setCancelled(base, tg.block.id, true) : takeBlock(base, tg.block.id))
        // The occurrence's own attachments go with it (D410, T805) – in the same edit, back with its „Cofnij”.
        await removeOwnAttachments(io, b, t, tg.block.id)
        return s.id
      }
      const from0 = scope === 'all' ? b.today : tg.date && tg.date > b.today ? tg.date : b.today
      const whole = scope === 'all' || from0 <= s.start
      const from = from0 < s.start ? s.start : from0
      return endFrom(io, b, t, s, from, whole)
    },
    io.folder
  )
}

/** The attachments a block of a day had of its own (not the series'), removed in the change's edit (T805). */
async function removeOwnAttachments(io: SeriesIo, b: Base, t: Touched, blockId: string): Promise<void> {
  let raws: RawRecord[]
  try {
    raws = await io.folder.collection('attachment')
  } catch {
    // The list cannot be read now: the attachments stay (they are not shown without their block).
    return
  }
  const own = new Set(ownAttachmentIds(raws.map(attachmentFrom).filter((a): a is Attachment => !!a), blockId))
  for (const raw of raws) {
    const a = attachmentFrom(raw)
    if (!a || !own.has(a.id)) continue
    const rel = attachmentRel(a.id)
    const before = await t.get(rel)
    if (before) t.set(rel, attachmentJson({ ...a, removedAt: b.now }, before))
  }
}

/** The series ends the day before `from` (`remove` – also out of the list): today's occurrence and the changed ones after it go. */
async function endFrom(io: SeriesIo, b: Base, t: Touched, s: Series, from: string, remove: boolean): Promise<string> {
  let last = addDays(from, -1)
  if (from <= b.today) {
    // Today's occurrence begun: it stays, the series ends today.
    const day = await dayOf(io, b, b.today, await t.get(paths.day(b.today)))
    if (begun(day, seriesBlockId(b.today, s.root))) last = b.today
  }
  const ended = endedOn(s, last, b.today, remove)
  await putSeries(t, ended)
  const next = b.list.map((x) => (x.id === s.id ? ended : x))
  if (from <= b.today) await today(io, b, t, s.root, next, true)
  await dropChanged(io, b, t, s.root, addDays(last, 1))
  return s.id
}

/** „Koniec serii” (the list in „Szablony”): the last day `last` (yesterday at the earliest). */
export function seriesEnd(io: SeriesIo, seriesId: unknown, last: unknown): Promise<SeriesResult> {
  return run(
    io,
    async (t) => {
      if (typeof seriesId !== 'string' || !isIsoDate(last)) throw new SeriesEditError('invalid', 'Nie wiadomo, kiedy seria ma się skończyć.')
      const b = await baseOf(io)
      const s = b.list.find((x) => x.id === seriesId)
      if (!s) throw new SeriesEditError('notFound', 'Tej serii już nie ma.')
      const yesterday = addDays(b.today, -1)
      return endFrom(io, b, t, s, addDays(last < yesterday ? yesterday : last, 1), false)
    },
    io.folder
  )
}

/** The morning's answer about an occurrence on a special day (D382). */
export function seriesAnswer(io: SeriesIo, date: unknown, blockId: unknown, keep: unknown): Promise<SeriesResult> {
  return run(
    io,
    async (t) => {
      if (!isIsoDate(date) || typeof blockId !== 'string' || typeof keep !== 'boolean') throw new SeriesEditError('invalid', 'Odpowiedź jest niepełna.')
      const r = paths.day(date)
      t.set(r, seriesAnswerRaw(await t.get(r), date, blockId, keep))
      return null
    },
    io.folder
  )
}

/** „Cofnij” of one change of a series: each file back as before it – only one that still stands as the change left it. */
export function seriesUndo(io: SeriesIo, undo: unknown): Promise<SeriesResult> {
  return run(
    io,
    async (t) => {
      const list = Array.isArray(undo) ? undo.slice(0, 400) : []
      for (const u of list) {
        if (!isRaw(u) || typeof u.rel !== 'string') continue
        const c = classify(u.rel)
        if (!c || c.conflict || (c.kind !== 'series' && c.kind !== 'day' && c.kind !== 'attachment')) continue
        const before = isRaw(u.before) ? u.before : null
        const after = isRaw(u.after) ? u.after : null
        const now = await t.get(c.canonical)
        // Changed since (here or on another computer): never written over.
        if (!(now == null ? after == null : after != null && sameContentAs(now, after))) continue
        t.set(c.canonical, before)
      }
      return null
    },
    io.folder
  ).then((r) => ({ ...r, undo: [] }))
}
