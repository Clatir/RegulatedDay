/**
 * Series in the days (OPS1, D381, D382, D401): the occurrences a day's snapshot takes (as blocks of a template are taken),
 * the blocks of the template an occurrence pushes apart on a day being made, the questions of the morning plan on a
 * „zjazd” and a day of regeneration, and the changes of a series („Tylko to · To i następne · Cała seria”, a removal, an
 * end) as new records and edits of today's file. Pure: the main process reads and writes the files (`main/data/series.ts`).
 *
 * Days gone by never change: a change applies from today (a version of the series, or a split), a day counted later takes
 * the version of its own date, and today's occurrence is written into today's file only while it has not begun.
 */
import type { Raw } from '../data/dayEdits'
import { dayBlocks, dayRaw, putBlock, setAsked, setCancelled, takeBlock } from '../data/dayEdits'
import type { DaySnapshot } from '../model/events'
import { derivedId } from '../model/ids'
import { dayFileFrom, planBlock, type DayFile, type PlanBlock } from '../model/plan'
import {
  SERIES_BLOCK_FIELDS,
  countedBefore,
  ruleFallsOn,
  seriesOfBlock,
  seriesVersionOn,
  specialOutcome,
  type PlHolidays,
  type Series,
  type SeriesBlock,
  type SeriesPlan,
  type SeriesRule,
  type SeriesVersion,
  type SpecialDays,
  type TypeOf
} from '../model/series'
import type { DayTypeId } from '../model/settings'
import { sameStepList, stepsFrom } from '../model/steps'
import { dayStart } from '../time/day'
import { addDays } from '../time/zone'
import { computeDay, type DayContext, type DayState } from './day'
import { pushApart, withBlock } from './pushApart'

/** The id an occurrence gets on a day (a day's file changes, cancels or moves it by this id; a split keeps the root). */
export const seriesBlockId = (date: string, root: string): string => derivedId(date, 'ser', root)

/** The key of the morning's answer about an occurrence on a special day in the day's `asked` (D382). */
export const seriesAskKey = (blockId: string): string => `series:${blockId}`

/** The version a series holds on `date` – a day of `dayType` – or null: no occurrence (D381, D382, D401). */
export function occurrenceVersion(p: SeriesPlan, date: string, dayType: DayTypeId, holidays: PlHolidays): SeriesVersion | null {
  const s = p.series
  if (date < s.start || (p.last != null && date > p.last)) return null
  const v = seriesVersionOn(s, date)
  if (!v || !ruleFallsOn(v.rule, date, holidays)) return null
  return specialOutcome(v.special, dayType) === 'skip' ? null : v
}

/** An occurrence as a block of `date`: the version's block, the derived id, the series' root as its source. */
export function occurrenceBlock(s: Pick<Series, 'root'>, block: SeriesBlock, date: string): PlanBlock {
  return planBlock({ ...block, id: seriesBlockId(date, s.root), anchor: null, origin: 'series', sourceId: s.root })
}

/** The occurrences of `date`, a day of `dayType` (in the order of the series' ids – `seriesPlans`). */
export function seriesBlocks(plans: readonly SeriesPlan[], date: string, dayType: DayTypeId, holidays: PlHolidays): PlanBlock[] {
  const out: PlanBlock[] = []
  for (const p of plans) {
    const v = occurrenceVersion(p, date, dayType, holidays)
    if (v && !out.some((b) => b.sourceId === p.series.root)) out.push(occurrenceBlock(p.series, v.block, date))
  }
  return out
}

const overlaps = (a: PlanBlock, b: PlanBlock): boolean => a.startMin != null && b.startMin != null && a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin

/** How many times the room of occurrences was counted (`pushedBySeries`; the tests see the memory work). */
export const seriesPushRuns = { count: 0 }

/** The rooms counted lately, by what they are counted from (a day is made again and again – „Dziś” every 30 s, the morning's 7 days). */
const pushMemo = new Map<string, PlanBlock[]>()
const PUSH_MEMO_MAX = 64

/**
 * The snapshot's blocks with the room its occurrences make (D401): an occurrence on a place a block of the template takes
 * pushes the flexible blocks after it as „Dodaj” does (D367, `pushApart` on the axis of the plan – a day counted from its
 * start with no events), the fixed, protected and anchored ones stay; one occurrence after another by its start. Only the
 * snapshot's own blocks, without those the day's file cancels or moves away (`gone` – a block of the template a series
 * was made from that day takes no place, T718); never the file's own blocks: the same files make the same snapshot on
 * every computer. Nothing on a taken place – the blocks as they are (no day counted); counted once per its inputs.
 */
export function pushedBySeries(snapshot: DaySnapshot, date: string, nextWakeMin: number, gone: ReadonlySet<string> = new Set()): PlanBlock[] {
  const live = (b: PlanBlock) => !gone.has(b.id)
  const occurrences = snapshot.blocks.filter((b) => live(b) && b.origin === 'series' && b.startMin != null && b.background !== true)
  if (!occurrences.some((o) => snapshot.blocks.some((b) => live(b) && b.id !== o.id && b.origin === 'template' && !b.anchor && overlaps(b, o)))) return snapshot.blocks
  const key = JSON.stringify([date, nextWakeMin, [...gone].sort(), snapshot])
  const known = pushMemo.get(key)
  if (known) return [...known]
  let blocks = snapshot.blocks.filter(live)
  for (const o0 of [...occurrences].sort((a, b) => a.startMin! - b.startMin! || (a.id < b.id ? -1 : 1))) {
    const o = blocks.find((b) => b.id === o0.id)!
    const others = blocks.filter((b) => b.id !== o.id)
    if (!others.some((b) => b.origin === 'template' && !b.anchor && overlaps(b, o))) continue
    const ctx: DayContext = { date, snapshot: { ...snapshot, blocks: others }, plan: others, wakeMin: snapshot.wakeMin, nextWakeMin, events: [], now: dayStart(date) }
    seriesPushRuns.count++
    const starts = new Map(pushApart(ctx, computeDay(ctx), blocks, o.id).map((p) => [p.id, p.startMin]))
    if (starts.size) blocks = blocks.map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
  }
  const moved = new Map(blocks.map((b) => [b.id, b]))
  // The blocks the file cancels stay in the snapshot as they were (an answer „tak” or a „Cofnij” brings them back).
  const out = snapshot.blocks.map((b) => moved.get(b.id) ?? b)
  pushMemo.set(key, out)
  if (pushMemo.size > PUSH_MEMO_MAX) pushMemo.delete(pushMemo.keys().next().value!)
  return [...out]
}

/**
 * A snapshot of the log made by a version without series (no `series` field): the day's occurrences by the series in
 * force are laid over it – as the day's file is – so a newer computer shows them; a snapshot of a version with series is
 * as the log has it.
 */
export function withSeriesOccurrences(snapshot: DaySnapshot, plans: readonly SeriesPlan[], date: string, holidays: PlHolidays): DaySnapshot {
  if (snapshot.series) return snapshot
  const occ = seriesBlocks(plans, date, snapshot.dayType, holidays).filter((o) => !snapshot.blocks.some((b) => b.id === o.id))
  return { ...snapshot, blocks: [...snapshot.blocks, ...occ], series: occ.map((b) => b.sourceId!) }
}

/** An occurrence on a special day the morning plan asks about (D382: „<blok> z serii – zostaw · odwołaj”). */
export interface SeriesQuestion {
  /** The occurrence's block id (the answer cancels it or keeps it). */
  blockId: string
  /** The series' root (`seriesOfBlock` finds its record). */
  root: string
}

/**
 * The questions of the morning plan about the day's occurrences (D382): an occurrence of a series that asks („pytaj”) on
 * a „zjazd” or a day of regeneration, still in the plan, not moved in from another day, without an answer. No answer – it
 * stays in the plan, as a session of „pytaj” does.
 */
export function seriesQuestions(list: readonly Series[], plan: readonly PlanBlock[], dayFile: DayFile | null, dayType: DayTypeId, date: string): SeriesQuestion[] {
  const out: SeriesQuestion[] = []
  for (const b of plan) {
    if (b.origin !== 'series' || !b.sourceId || b.movedFrom != null || dayFile?.asked[seriesAskKey(b.id)]) continue
    const s = b.id === seriesBlockId(date, b.sourceId) ? seriesOfBlock(list, b, date) : null
    const v = s ? seriesVersionOn(s, date) : null
    if (v && specialOutcome(v.special, dayType) === 'ask') out.push({ blockId: b.id, root: b.sourceId })
  }
  return out
}

/** The answer to a question about an occurrence (D382): „zostaw” keeps it, „odwołaj” cancels it for the day; asked once. */
export function seriesAnswerRaw(raw: Raw | null, date: string, blockId: string, keep: boolean): Raw {
  const next = setAsked(dayRaw(raw, date), seriesAskKey(blockId), keep ? 'yes' : 'no')
  return keep ? next : setCancelled(next, blockId, true)
}

/** Why a change of a series is refused (the window shows `message`). */
export class SeriesEditError extends Error {
  constructor(
    readonly code: 'kind' | 'series' | 'requests' | 'task' | 'noStart' | 'ended' | 'notFound' | 'begun' | 'invalid',
    message: string
  ) {
    super(message)
  }
}

/** Why a block cannot be made a series (D401: any block of yours, flexible or fixed; not a session, a lecture, a class). */
export function blockNotSeries(b: PlanBlock): SeriesEditError | null {
  if (b.origin === 'series') return new SeriesEditError('series', 'Ten blok już należy do serii.')
  if (b.origin === 'session' || b.origin === 'lecture' || b.origin === 'zjazd' || b.tag === 'secondShift') return new SeriesEditError('kind', 'Blok sesji, wykładu ani zajęć zjazdu nie powtarza się w serii.')
  if (b.requests.length) return new SeriesEditError('requests', 'Blok próśb należy do jednego dnia – nie powtarza się w serii.')
  // D408: a block made from a task of „Sprawy” belongs to its day too – the task is done once.
  if (b.task) return new SeriesEditError('task', 'Blok zadania należy do jednego dnia – zadanie nie powtarza się w serii.')
  return null
}

/** A change of a series: its block's fields, its rule, its field „W dni szczególne”, its end. */
export interface SeriesPatch {
  block?: Partial<SeriesBlock>
  rule?: SeriesRule
  special?: SpecialDays
  until?: string | null
  count?: number | null
}

/**
 * A rule as a version writes it from `from`: a weekly rule keeps its weeks (`anchor`) while it repeats every as many weeks
 * as the rule before it – a change of its weekdays never moves which weeks are its own; another one counts from `from`.
 */
export function ruleFrom(next: SeriesRule | undefined, before: SeriesRule, from: string): SeriesRule {
  if (!next) return before
  if (next.kind !== 'weekly') return next
  const keep = before.kind === 'weekly' && before.every === next.every
  return { ...next, anchor: keep ? before.anchor : from }
}

/** A new series from a block (its first day `start`). */
export function newSeries(id: string, block: SeriesBlock, start: string, rule: SeriesRule, special: SpecialDays, end: { until: string | null; count: number | null }): Series {
  const r = rule.kind === 'weekly' ? { ...rule, anchor: start } : rule
  return { id, root: id, start, until: end.until != null && end.until < start ? start : end.until, count: end.count, versions: [{ from: start, block, rule: r, special }], archived: false }
}

/** The last day the series has ended on before `today` (an end in the past is never moved: the days gone by would change). */
const endedBefore = (last: string | null, today: string): boolean => last != null && last < addDays(today, -1)

/**
 * The end of a series changed (`until`, `count`) with the days gone by kept: an end is never before yesterday (a count
 * the days before today already reached ends the series yesterday, its count what they reached), and a series that ended
 * before yesterday is not taken further (the days between would get occurrences).
 */
export function withEnd(s: Series, patch: Pick<SeriesPatch, 'until' | 'count'>, today: string, last: string | null, typeOf: TypeOf, holidays: PlHolidays): Series {
  if (patch.until === undefined && patch.count === undefined) return s
  const yesterday = addDays(today, -1)
  let { until, count } = s
  if (patch.until !== undefined) until = patch.until == null ? null : patch.until < yesterday ? yesterday : patch.until
  if (patch.count !== undefined) {
    count = patch.count
    const had = countedBefore(s, today, typeOf, holidays)
    if (count != null && count <= had) {
      count = Math.max(1, had)
      until = until == null || until > yesterday ? yesterday : until
    }
  }
  const later = (until == null && s.until != null) || (until != null && s.until != null && until > s.until) || (count == null && s.count != null) || (count != null && s.count != null && count > s.count)
  if (later && endedBefore(last, today)) throw new SeriesEditError('ended', 'Ta seria już się zakończyła – dni minione się nie zmieniają; utwórz nową serię.')
  return { ...s, until, count }
}

/**
 * A change of the series from `from` on (D381, T715): „Cała seria” – from today (the series' first day when it starts
 * later), „To i następne” – from the occurrence's day. A version from that day with the change over the version in force
 * on it; the versions before it stay (the days gone by), one of the same date is replaced, the later ones get the change
 * too (each keeps what else it changed). The block's fields of the patch are only those changed (the panel sends what you
 * changed, never the whole block). Only its end changed: no version (`withEnd`).
 */
export function changedFrom(s: Series, from: string, patch: SeriesPatch): Series {
  if (patch.block === undefined && patch.rule === undefined && patch.special === undefined) return s
  const at = from < s.start ? s.start : from
  const base = seriesVersionOn(s, at) ?? s.versions[0]!
  // A new rule is one for every version from `at` on – its weeks counted once, from the version it starts in.
  const rule = ruleFrom(patch.rule, base.rule, at)
  const apply = (v: SeriesVersion, f: string): SeriesVersion => ({ from: f, block: { ...v.block, ...patch.block }, rule: patch.rule ? rule : v.rule, special: patch.special ?? v.special })
  return { ...s, versions: [...s.versions.filter((v) => v.from < at), apply(base, at), ...s.versions.filter((v) => v.from > at).map((v) => apply(v, v.from))] }
}

/** The series ended on `last` (at least yesterday – a day gone by keeps its occurrence); `remove` – also out of the list. */
export function endedOn(s: Series, last: string, today: string, remove: boolean): Series {
  const yesterday = addDays(today, -1)
  const end = last < yesterday ? yesterday : last
  return { ...s, until: s.until != null && s.until < end ? s.until : end, archived: remove || s.archived }
}

/** Whether a block of a day's file still is the occurrence as `occ` makes it (not changed on its day – „Tylko to”). */
export function sameOccurrence(b: Raw | PlanBlock, occ: PlanBlock): boolean {
  const r = b as Record<string, unknown>
  // Its steps as a list (D440, T786): a tick is its day's, never a change of the occurrence; a file's list read as a file's.
  return SERIES_BLOCK_FIELDS.every((k) => (k === 'steps' ? sameStepList(stepsFrom(r.steps), stepsFrom(occ.steps)) : JSON.stringify(r[k] ?? null) === JSON.stringify(occ[k] ?? null)))
}

/** Today's day for an edit of today's occurrence: its context and state as this computer counts them now. */
export interface TodayDay {
  ctx: DayContext
  state: DayState
}

/**
 * The field of a day's file with the occurrences a change of their series cancelled (id → true, T719): one a later change
 * brings back is cancelled no more – one you cancelled yourself (no mark) stays cancelled. Unknown to older versions (kept).
 */
export const SERIES_OFF = 'seriesOff'

const offMap = (raw: Raw): Raw => (raw[SERIES_OFF] && typeof raw[SERIES_OFF] === 'object' && !Array.isArray(raw[SERIES_OFF]) ? { ...(raw[SERIES_OFF] as Raw) } : {})

/** An occurrence cancelled by a change of its series (marked), or brought back (the mark and the cancel gone). */
function seriesOff(raw: Raw, id: string, on: boolean): Raw {
  const m = offMap(raw)
  if (on) m[id] = true
  else delete m[id]
  return { ...setCancelled(raw, id, on), [SERIES_OFF]: m }
}

/**
 * Today's occurrence of a series after a change (D381: „Cała seria” and „To i następne” from today, a new series, an
 * end, a removal), as an edit of today's file – only while it has not begun, and never one changed on its day (moved
 * away, cancelled by you or edited – „Tylko to”): `was` – the occurrence before the change (null: none), `next` – after it
 * (null: none). One that comes or changes is written whole into the file (a snapshot already in the log holds the old
 * one) and pushes apart the flexible blocks after it as „Dodaj” does (D367, D401 – without the bar's „Cofnij”); one that
 * goes is cancelled with the mark of a change (`SERIES_OFF`), so a change back brings it again. `remove` (a removal, an
 * end): also one changed on its day goes, without the mark.
 */
export function todayOccurrenceEdit(raw: Raw | null, today: TodayDay, id: string, was: PlanBlock | null, next: PlanBlock | null, remove = false): Raw | null {
  const date = today.ctx.date
  const fact = today.state.facts.blocks.get(id)
  if (fact && (fact.startedAt != null || fact.runs.length > 0)) return null
  const base = dayRaw(raw, date)
  const file = dayFileFrom(base, date)
  if (id in file.movedTo) return null
  const inPlan = today.ctx.plan.some((b) => b.id === id)
  const fileBlock = dayBlocks(base).find((b) => !!b && typeof b === 'object' && (b as Raw).id === id) as Raw | undefined
  // The occurrence as the day holds it: its block in the file, else the snapshot's (before the day's wake moves it).
  const current: Raw | PlanBlock | null = fileBlock ?? today.ctx.snapshot.blocks.find((b) => b.id === id) ?? null
  const off = offMap(base)[id] === true && file.cancelled.includes(id)
  if (!remove) {
    if (file.cancelled.includes(id) && !off) return null
    // Cancelled by a change of the series: its block in the file is the series' own copy, never a change of its day.
    if (!off && fileBlock && !(was && sameOccurrence(fileBlock, was)) && !(next && sameOccurrence(fileBlock, next))) return null
  }
  if (!next || remove) {
    if (!inPlan) return null
    const inSnapshot = today.ctx.snapshot.blocks.some((b) => b.id === id)
    if (!inSnapshot) return takeBlock(base, id)
    return remove ? setCancelled(base, id, true) : seriesOff(base, id, true)
  }
  // Cancelled by a change of the series before: back in the plan.
  let after = off ? seriesOff(base, id, false) : base
  if (inPlan && current && sameOccurrence(current, next)) return off ? after : null
  after = putBlock(after, next)
  for (const p of pushApart(today.ctx, today.state, withBlock(today.ctx.plan, next), id)) {
    const b = today.ctx.plan.find((x) => x.id === p.id)
    if (b) after = putBlock(after, { ...(dayFileFrom(after, date).blocks.find((x) => x.id === p.id) ?? b), startMin: p.startMin })
  }
  return after
}

/**
 * Whether a day of the month grid shows the mark of a series (D404): an occurrence the rule puts on it that its file has
 * not cancelled nor moved away, or an occurrence moved to it („Tylko to”). Counted from the files as they are – a cheap
 * mark, without a snapshot of the day.
 */
export function seriesOnDay(plans: readonly SeriesPlan[], date: string, dayType: DayTypeId, dayFile: DayFile | null, holidays: PlHolidays): boolean {
  const gone = new Set([...(dayFile?.cancelled ?? []), ...Object.keys(dayFile?.movedTo ?? {})])
  // As `dayPlan`: a block of the file the file itself cancels or moves away is not on the day.
  if (dayFile?.blocks.some((b) => b.origin === 'series' && !gone.has(b.id))) return true
  return seriesBlocks(plans, date, dayType, holidays).some((b) => !gone.has(b.id))
}
