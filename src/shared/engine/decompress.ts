/**
 * Bufory dekompresji (D386, D403, D569, D580–D583; T2450–T2458): after a block of the plan long and costly enough – at least
 * `minLengthMin` (its plan with „Przedłuż”) and a cost of the head, the emotions or the senses of at least `minCost` an hour – the day's
 * plan has a block „Dekompresja” (a regeneration) anchored to it. It is counted, never written (T2450): `dayContextOf` lays the buffers
 * over the plan of the day's file (`planWithBuffers`), each by the settings in force at its block's planned end (T2454) – off, the plan
 * is the very same list. Its place and length on the plan's axis are the forecast's from the day's start (one rule with today's
 * forecast, `forecast.ts`): right after its block, as long as `bufferMinutes`, cut to the room before a fixed block and the bedtime
 * (every 5 min, at least 5); the flexible blocks of their own hour the buffers move later stand where that forecast puts them (T2455,
 * D367 – as `pushApart` writes them), fixed, protected, begun and anchored ones stay. Cancelled in the day's file (`cancelled`) – gone,
 * „Cofnij” brings it back; changed by you – written to the file whole without `decompress` (D582: yours, not counted again).
 */
import { REGEN_CATEGORY, type Costs } from '../model/categories'
import { blockCosts } from '../model/blockCosts'
import type { AnyEvent, DaySnapshot } from '../model/events'
import { derivedId } from '../model/ids'
import { PLAN_MAX, planBlock, type PlanBlock } from '../model/plan'
import { routineCostApplies, routineCostOf, type RoutineCosts } from '../model/routines'
import { decompressOn, setsDecompress, type RulesSettings, type SettingsChange } from '../model/settings'
import { logicalMinuteOf, placeLogical } from '../time/day'
import { addDays } from '../time/zone'
import { afterSpans, bufferMinutes, bufferRoom } from './bufferLength'
import { blockInfos, plannedSpan, type BlockInfo } from './blocks'
import { endShiftOf, foldFacts, OPEN, type BlockFact, type DayFacts } from './facts'
import { forecast, runEnd } from './forecast'
import { atOf, gridOf, idxOf, idxOfLogical, type Grid } from './grid'
export { BUFFER_MAX, BUFFER_MIN, bufferMinutes, bufferRoom } from './bufferLength'

/** The name of a buffer on the axis and the bar (D403: „Dekompresja · 10 min”). */
export const DECOMPRESS_NAME = 'Dekompresja'
/** What the buffer says on its tile (spec 5.3). */
export const DECOMPRESS_HINT = 'Czas na samotność i herbatę – nie planuj tu pracy'
/** The rule of the leader that begins a buffer after its block and ends it after its length (T2456). */
export const DECOMPRESS_RULE = 'decompress'

/** The id of the buffer after a block of a day: the same on every computer. */
export const decompressBlockId = (date: string, sourceId: string): string => derivedId(date, 'dek', sourceId)

/** A buffer of decompression: one the plan counts, one you changed (in the day's file) or begun (`planned.decompress`). */
export const isBuffer = (b: Pick<PlanBlock, 'origin'>): boolean => b.origin === 'decompress'

/** The cost that decides (D386): the highest of the head's, the emotions' and the senses' an hour – never the body's. */
export const psychicCost = (c: Costs): number => Math.max(c.head, c.emotions, c.senses)

/** The warning of a work block laid on a buffer (D386, D582) – in the drag's hint and the edit panel. */
export const decompressWarning = (blockName: string): string => `Na miejscu dekompresji po ${blockName}`

export interface BufferDay {
  date: string
  snapshot: DaySnapshot
  /** The plan of the day's file (`dayPlan`). */
  plan: readonly PlanBlock[]
  nextWakeMin: number
  events: readonly AnyEvent[]
  routineCosts?: RoutineCosts
  /** Your dated settings' changes (rd.json): the buffers' settings in force at a block's planned end (T2454). */
  changes: readonly SettingsChange[]
  /** The ids the day's file cancels or moves away: a buffer cancelled there is gone. */
  gone: ReadonlySet<string>
  /** Now (ms): a buffer whose moment passed today has no place – nor do the moves it made (T2463). */
  now?: number
}

interface Candidate {
  block: PlanBlock
  cost: number
  lengthMin: number
}

/** What the forecast from the day's start says of the buffers: their lengths (by id) and the new starts of the blocks they move. */
interface Placement {
  lengths: Map<string, number>
  starts: Map<string, number>
}

const memo = new Map<string, Placement>()
const MEMO_MAX = 160
/** How many placements were counted (tests: the memory saves the month). */
export const bufferRuns = { count: 0 }

const emptyFacts = new Map<string, DayFacts>()
function noFacts(grid: Grid): DayFacts {
  let f = emptyFacts.get(grid.date)
  if (!f) {
    f = foldFacts(grid, [])
    emptyFacts.set(grid.date, f)
    if (emptyFacts.size > MEMO_MAX) emptyFacts.delete(emptyFacts.keys().next().value!)
  }
  return f
}

/** The plan's bedtime of the day (logical minutes): its type's, or earlier for tomorrow's wake – where a buffer ends at the latest. */
function bedtimeMinOf(d: BufferDay, grid: Grid): number {
  const s = d.snapshot.settings
  const params = s.dayTypes[d.snapshot.dayType]
  const idx = Math.min(idxOfLogical(grid, params.bedtimeMin), idxOf(grid, placeLogical(addDays(d.date, 1), d.nextWakeMin)) - s.targetSleepMin)
  return logicalMinuteOf(d.date, atOf(grid, idx))
}

/**
 * The day's plan with its buffers of decompression (T2450): `d.plan` itself when no block calls for one (always with the setting
 * off – D569: then nothing of the plan changes), else a new list – each buffer right after its block, the blocks it moves with
 * their new starts.
 */
export function planWithBuffers(d: BufferDay): readonly PlanBlock[] {
  if (!setsDecompress(d.changes) || !d.plan.length) return d.plan
  const grid = gridOf(d.date)
  const settings = d.snapshot.settings
  const routines = d.routineCosts ?? {}
  // The facts only for „Przedłuż” and what began (a day to come has no events).
  const facts = d.events.length ? foldFacts(grid, d.events) : noFacts(grid)
  const infos = blockInfos(grid, d.plan, facts, settings, routines)
  const byId = new Map(infos.map((b) => [b.id, b]))
  // D582: a buffer you changed (in the day's file) not begun leaves with the setting switched off for its block's end, as every buffer.
  const off = new Set<string>()
  for (const p of d.plan) {
    if (!isBuffer(p) || facts.blocks.get(p.id)?.startedAt != null) continue
    const src = p.sourceId ? byId.get(p.sourceId) : undefined
    const own = byId.get(p.id)
    const at = (src && plannedSpan(src, byId)?.end) ?? (own && plannedSpan(own, byId)?.start) ?? null
    if (at != null && !decompressOn(d.changes, d.date, atOf(grid, at)).on) off.add(p.id)
  }
  const plan = off.size ? d.plan.filter((p) => !off.has(p.id)) : d.plan
  const candidates: Candidate[] = []
  for (const p of plan) {
    if (isBuffer(p) || p.alongside != null) continue
    const id = decompressBlockId(d.date, p.id)
    if (d.gone.has(id) || plan.some((x) => isBuffer(x) && (x.id === id || x.sourceId === p.id || x.anchor === p.id))) continue
    const info = byId.get(p.id)
    if (!info || info.bg || info.isRegen) continue
    const span = plannedSpan(info, byId)
    if (!span) continue
    const f = facts.blocks.get(p.id)
    const shift = f ? endShiftOf(f) : 0
    const rules = decompressOn(d.changes, d.date, atOf(grid, span.end + shift))
    if (!rules.on) continue
    const lengthMin = (f?.planned?.durationMin ?? p.durationMin) + shift
    if (lengthMin < rules.minLengthMin) continue
    const rulesOf = settings.categories[p.categoryId]
    if (!rulesOf) continue
    const routineCosts = routineCostApplies(settings.categories, p.categoryId) ? routineCostOf(routines, p.routine) : null
    const cost = psychicCost(blockCosts({ costs: p.costs, categoryId: p.categoryId, variantId: p.variantId, routineCosts }, settings.categories, rulesOf).costs)
    if (cost < rules.minCost) continue
    candidates.push({ block: p, cost, lengthMin })
  }
  if (!candidates.length) return plan

  const untilMin = bedtimeMinOf(d, grid)
  const begun = new Set([...facts.blocks].filter(([, f]) => f.startedAt != null).map(([id]) => id))
  let laid = layBuffers(d, grid, plan, settings, routines, begun, untilMin, candidates)
  if (!d.events.length) return laid.out
  // Today (T2463): a buffer whose moment passed by the facts – by the forecast's rule, with the length the plan gives it – goes, and its moves.
  // One you parked or cancelled (T2488) stays in the plan as any such block (dimmed, among the parked) – its moves go.
  const lengthOf = (c: Candidate) => laid.lengths.get(decompressBlockId(d.date, c.block.id)) ?? 0
  const quiet = candidates.filter((c) => {
    const own = facts.blocks.get(decompressBlockId(d.date, c.block.id))
    return own != null && own.startedAt == null && (own.parkedAt != null || own.cancelledAt != null) && lengthOf(c) > 0
  })
  const left = candidates.filter((c) => !quiet.includes(c) && !passedToday(d, grid, facts, byId, c, lengthOf(c), untilMin))
  if (left.length === candidates.length) return laid.out
  const kept = new Map(quiet.map((c) => [c.block.id, { ...bufferOf(d, c, untilMin), durationMin: lengthOf(c) }]))
  const out = left.length ? layBuffers(d, grid, plan, settings, routines, begun, untilMin, left).out : [...plan]
  return kept.size ? out.flatMap((p) => (kept.has(p.id) ? [p, kept.get(p.id)!] : [p])) : out
}

/** The buffer of a candidate, before the forecast places it. */
const bufferOf = (d: BufferDay, c: Candidate, untilMin: number): PlanBlock =>
  planBlock({
    id: decompressBlockId(d.date, c.block.id),
    categoryId: REGEN_CATEGORY,
    anchor: c.block.id,
    durationMin: bufferMinutes(c.lengthMin, c.cost),
    origin: 'decompress',
    sourceId: c.block.id,
    name: DECOMPRESS_NAME,
    decompress: { cost: c.cost, untilMin }
  })

/** The plan with the buffers of `candidates` laid by the forecast from the day's start (`placementOf`), and their lengths there. */
function layBuffers(d: BufferDay, grid: Grid, plan: readonly PlanBlock[], settings: RulesSettings, routines: RoutineCosts, begun: ReadonlySet<string>, untilMin: number, candidates: readonly Candidate[]): { out: PlanBlock[]; lengths: ReadonlyMap<string, number> } {
  const buffers = new Map(candidates.map((c) => [c.block.id, bufferOf(d, c, untilMin)]))
  const withBuffers = plan.flatMap((p) => (buffers.has(p.id) ? [p, buffers.get(p.id)!] : [p]))
  const placement = placementOf(grid, plan, withBuffers, settings, routines, begun, untilMin, candidates)
  const out: PlanBlock[] = []
  for (const p of withBuffers) {
    if (isBuffer(p) && buffers.get(p.sourceId ?? '') === p) {
      const len = placement.lengths.get(p.id)
      if (len) out.push(len === p.durationMin ? p : { ...p, durationMin: len })
      continue
    }
    const start = placement.starts.get(p.id)
    out.push(start != null && start !== p.startMin ? { ...p, startMin: start } : p)
  }
  return { out, lengths: placement.lengths }
}

/**
 * Today (T2463): the buffer of `c` not begun whose moment passed by the facts – the forecast's rule (`forecast.ts`): its block parked or
 * cancelled before its start; its moment (the block's end, after a session or classes then – `afterSpans`, D583) taken by a block begun in
 * the foreground after the block's end (not a session nor a class), its start by itself taken back by „Cofnij”, its whole time gone by; or
 * no room (`bufferRoom`) from then – now at the earliest – before a fixed block in the foreground or the bedtime. `planned` – its length in
 * the plan (before a change of its block's end – the forecast's length too).
 */
function passedToday(d: BufferDay, grid: Grid, facts: DayFacts, byId: Map<string, BlockInfo>, c: Candidate, planned: number, untilMin: number): boolean {
  const src = c.block.id
  const id = decompressBlockId(d.date, src)
  const sf = facts.blocks.get(src)
  if (facts.blocks.get(id)?.startedAt != null) return false
  const nowIdx = d.now != null ? idxOf(grid, d.now) : 0
  if (!sf || sf.startedAt == null) {
    if (sf && (sf.parkedAt != null || sf.cancelledAt != null)) return true
    // A fixed block or a session not begun whose window passed (T2480): the forecast drops it, and its buffer with it.
    const info = byId.get(src)
    const span = info && (info.fixed || info.waits) ? plannedSpan(info, byId) : null
    return span != null && span.end <= nowIdx
  }
  const mode = (x: BlockInfo | undefined) => x?.rules.kind === 'session' || x?.rules.classMode === true
  // The planned end of a block running now: its start, its length, its changes of the end (a fixed one – its window's end).
  // Where a begun block ends as the forecast counts it (`runEnd`, T2481): pauses counted, „Przedłuż” too.
  const liveEnd = (x: BlockInfo, f: BlockFact) => runEnd(x, f, nowIdx, byId)
  const end = sf.endedAt ?? liveEnd(byId.get(src)!, sf)
  const spans: Array<{ from: number; to: number }> = []
  for (const x of byId.values()) {
    if (!mode(x)) continue
    const f = facts.blocks.get(x.id)
    for (const r of f?.runs ?? []) spans.push({ from: r.from, to: r.to === OPEN ? Math.max(nowIdx, liveEnd(x, f!)) : r.to })
    const span = f?.startedAt == null && f?.parkedAt == null && f?.cancelledAt == null && x.inPlan && (x.fixed || x.waits) ? plannedSpan(x, byId) : null
    if (span) spans.push({ from: span.start, to: span.end })
  }
  const moment = afterSpans(end, spans)
  const length = c.cost != null && sf.endChanges.length ? bufferMinutes(c.lengthMin, c.cost) : planned
  if (sf.endedAt != null) {
    const ended = sf.endedAt
    if ([...facts.blocks].some(([x, f]) => x !== src && x !== id && !mode(byId.get(x)) && f.runs.some((r) => !r.bg && r.from >= ended))) return true
    if (facts.undone.has(derivedId(d.date, 'auto', DECOMPRESS_RULE, 'block.start', id, atOf(grid, ended)))) return true
    if (moment + length <= nowIdx) return true
  }
  const start = Math.max(moment, nowIdx)
  let room = idxOfLogical(grid, untilMin) - start
  for (const x of byId.values()) {
    const f = facts.blocks.get(x.id)
    if (!x.inPlan || !(x.fixed || x.waits) || x.bg || f?.startedAt != null || f?.parkedAt != null || f?.cancelledAt != null) continue
    const span = plannedSpan(x, byId)
    if (span && span.end > start) room = Math.min(room, span.start - start)
  }
  return bufferRoom(length, room) === 0
}

/** The categories' rules the forecast reads of a plan (its kind, class, protection, the background): part of the memory's key. */
const categoryKey = (settings: RulesSettings, plan: readonly PlanBlock[]) =>
  [...new Set(plan.map((p) => p.categoryId))].sort().map((id) => {
    const r = settings.categories[id]
    return r ? [id, r.cls, r.kind, r.protected, r.startsInBackground, r.classMode] : [id]
  })

/**
 * Where the forecast from the day's start (no events: the plan's axis) puts the buffers and the blocks after them (T2455): with and
 * without the buffers; a flexible block of its own hour in the foreground, not protected nor begun, that the buffers put later starts
 * there. Counted once per its inputs (the month counts every day).
 */
function placementOf(
  grid: Grid,
  plan: readonly PlanBlock[],
  withBuffers: readonly PlanBlock[],
  settings: RulesSettings,
  routines: RoutineCosts,
  begun: ReadonlySet<string>,
  untilMin: number,
  candidates: readonly Candidate[]
): Placement {
  const compact = (p: PlanBlock) => [p.id, p.categoryId, p.startMin, p.anchor, p.durationMin, p.fixed, p.background, p.alongside, p.origin, p.decompress?.cost ?? null]
  const key = JSON.stringify([grid.date, settings.transitionBufferMin, untilMin, withBuffers.map(compact), [...begun].sort(), categoryKey(settings, withBuffers), candidates.map((c) => c.lengthMin)])
  const known = memo.get(key)
  if (known) return known
  bufferRuns.count++
  const view = noFacts(grid)
  const run = (list: readonly PlanBlock[]) => {
    const blocks = blockInfos(grid, list, view, settings, routines)
    return { blocks, placed: new Map(forecast({ blocks, view, m: 0, mode: 'window', transitionBufferMin: settings.transitionBufferMin, typicalMin: () => null }).placed.map((p) => [p.block.id, p])) }
  }
  const before = run(plan)
  // A buffer without a place moves nothing (T2479): counted again without it – until every buffer left has one.
  let list = withBuffers
  let after = run(list)
  const counted = (p: PlanBlock) => isBuffer(p) && p.decompress != null
  // Each count takes away at least one buffer: at most as many again as there are buffers.
  for (let guard = list.filter(counted).length; guard > 0; guard--) {
    const none = new Set(list.filter((p) => counted(p) && !((after.placed.get(p.id)?.to ?? 0) > (after.placed.get(p.id)?.from ?? 0))).map((p) => p.id))
    if (!none.size) break
    list = list.filter((p) => !none.has(p.id))
    after = run(list)
  }
  // The lengths of the last count – the one the starts come from.
  const lengths = new Map<string, number>()
  for (const p of list) {
    const at = counted(p) ? after.placed.get(p.id) : undefined
    if (at && at.to > at.from) lengths.set(p.id, at.to - at.from)
  }
  const starts = new Map<string, number>()
  const infoOf = new Map(before.blocks.map((b) => [b.id, b]))
  for (const p of plan) {
    const info = infoOf.get(p.id)
    if (!info || !pushedByBuffer(info, p, begun)) continue
    const was = before.placed.get(p.id)
    const now = after.placed.get(p.id)
    if (!was || !now || now.from <= was.from) continue
    starts.set(p.id, Math.min(PLAN_MAX, logicalMinuteOf(grid.date, atOf(grid, now.from))))
  }
  const out = { lengths, starts }
  memo.set(key, out)
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value!)
  return out
}

/** A block a buffer may move (D367, as `pushApart`): flexible, of its own hour, in the foreground, not protected, not begun. */
const pushedByBuffer = (info: BlockInfo, p: PlanBlock, begun: ReadonlySet<string>): boolean =>
  !p.fixed && !info.waits && p.anchor == null && p.startMin != null && p.alongside == null && !info.bg && !info.protectedLife && !begun.has(p.id) && p.origin !== 'session' && p.origin !== 'lecture' && p.origin !== 'zjazd'

/** The buffer laid on by a block of work moved or set to `span` (logical minutes, D386, D582): the first one it covers, else null. */
export function bufferUnder(axis: ReadonlyArray<{ id: string; startMin: number; endMin: number }>, plan: readonly PlanBlock[], id: string, span: { startMin: number; endMin: number }): PlanBlock | null {
  for (const x of axis) {
    if (x.id === id || x.endMin <= span.startMin || x.startMin >= span.endMin) continue
    const b = plan.find((p) => p.id === x.id)
    if (b && isBuffer(b) && b.sourceId !== id) return b
  }
  return null
}
