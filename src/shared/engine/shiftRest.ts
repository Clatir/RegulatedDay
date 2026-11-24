/**
 * „Przesuń resztę dnia o…” (N17, D584, T2465–T2475, T2490–T2494): from the earliest of the selected blocks of a day the flexible blocks after it
 * (`restOf` – the blocks the push apart moves, D367, past fixed blocks too) shift by ±N minutes on the day's file, as one change. Later (T2465):
 * every one N later than the axis shows it (`shiftPatches`); the first of them stands where the forecast then puts it (one that would hit a fixed
 * block jumps behind it), the others are the push apart's blocks after it (`pushApart` with `only` – the rest: written where the forecast then
 * shows them, a 25-hour day's doubled hour as there); past the day's last start the rest is laid back from 03:59 a minute apart, in its order
 * (T2492). Earlier (T2466): the chain of „Przesuń resztę wcześniej” through the whole rest of the day (`earlierRest` – never before now, 04:00
 * nor a block that stays before it). Fixed, protected, waiting, begun, session, lecture and background blocks stay; anchored ones and the
 * buffers of decompression (N7, T2475) follow their anchor and are never written; a group of parallel blocks goes whole. With the settings'
 * changes (`changes`) the buffers are laid again on the file after the change (`replanned`, T2493): a block a buffer that grew or appeared now
 * pushes is written where the day will show it, and counted (D583). Pure: what the window writes and says (`groupActions.ts`).
 *
 * What is said beside (D72 – a warning, the change is written, T2470): the first of – blocks past the day's end, work past the maximum, work past
 * the approved boundary, the rest past the bedtime – that the shift made worse (later only; earlier – never).
 */
import { dayRaw, type Raw } from '../data/dayEdits'
import { countLabel, logicalClock } from '../format'
import { dayFileFrom, PLAN_MAX, type PlanBlock } from '../model/plan'
import { setsDecompress, type SettingsChange } from '../model/settings'
import { logicalMinuteOf } from '../time/day'
import { blockInfos, type BlockInfo } from './blocks'
import { replanned } from './context'
import { dayPlan } from './createDay'
import { computeDay, routineCostsIn, settingsAtMinute, shownForecaster, type DayState } from './day'
import { isBuffer } from './decompress'
import { earlierRest } from './gaps'
import { atOf } from './grid'
import { axisStartsOf, patchedDay, patchedPlan, restOf, shiftPatches, withPushedStarts, type DayChanged, type GroupDay } from './groupEdit'
import type { Placed } from './forecast'
import { groupOf, groupRootOf, plannedStart, type BlockPatch } from './parallel'
import { ownMinuteIdx, pushApart } from './pushApart'

/** What a shift of the rest of the day pushed past a limit (logical minutes): the first that applies of the four, in this order. */
export type RestOver =
  /** Blocks of the rest that end after 04:00 of the next morning. */
  | { kind: 'dayEnd'; n: number }
  /** The forecast end of work after the day type's maximum. */
  | { kind: 'max'; atMin: number }
  /** The forecast end of work (`endMin`) after the approved boundary (today). */
  | { kind: 'boundary'; atMin: number; endMin: number }
  /** The last block of the rest ends (`endMin`) after the plan's bedtime. */
  | { kind: 'bedtime'; atMin: number; endMin: number }

/** A shift of the rest of the day: the day's file and plan after it, the blocks whose start it writes (`moved`, the axis' order), what it pushed past. */
export interface RestShifted extends DayChanged {
  moved: string[]
  over: RestOver | null
}

/**
 * „Przesuń resztę dnia o” ±`minutes` on the day's file (`raw`): the rest from the earliest of `ids` (`restOf`, `today` – the logical day now),
 * later or earlier (see above); `changes` – the settings' changes of rd.json (the buffers of decompression laid again, T2493). Nothing to move (a
 * day gone by, no flexible block after the selected ones, 0 min) – the file as it is.
 */
export function shiftedRestDay(day: GroupDay, raw: Raw | null, ids: readonly string[], minutes: number, today: string, onUnsettled?: () => void, changes?: readonly SettingsChange[]): RestShifted {
  const { ctx } = day
  const date = ctx.date
  const rest = restOf(day, ids, today)
  if (!rest.take.length || rest.atIdx == null || minutes === 0) return { raw: dayRaw(raw, date), plan: [...ctx.plan], pushed: [], moved: [], over: null }
  const done = minutes > 0 ? later(day, raw, rest.take, minutes, today, onUnsettled) : earlier(day, raw, rest.take, -minutes, onUnsettled)
  const laid = withBuffersLaid(day, done, changes)
  const was = new Map(ctx.plan.map((b) => [b.id, b]))
  const now = new Map(laid.plan.map((b) => [b.id, b]))
  const moved = [...rest.take, ...laid.extra.filter((id) => !rest.take.includes(id))].filter((id) => {
    const a = was.get(id)
    const b = now.get(id)
    return a != null && b != null && plannedStart(a, was) !== plannedStart(b, now)
  })
  // Nothing moved (all at the day's last start, all at their floor): the file as it is – no entry for a block of a template, no group left (T2492).
  if (!moved.length) return { raw: dayRaw(raw, date), plan: [...ctx.plan], pushed: [], moved: [], over: null }
  return { raw: laid.raw, plan: laid.plan, pushed: done.pushed, moved, over: minutes > 0 ? overOf(day, laid.plan, rest.take) : null }
}

/** Later (T2465): N later each, the first where the forecast then shows it, the push apart for the others (written where they are shown). */
function later(day: GroupDay, raw: Raw | null, take: readonly string[], minutes: number, today: string, onUnsettled?: () => void): DayChanged {
  const { ctx, state } = day
  const date = ctx.date
  const g = state.grid
  const starts = axisStartsOf(day, take, today)
  let patches = shiftPatches(ctx.plan, take, minutes, (id) => starts.get(id) ?? null)
  let plan = patchedPlan(ctx.plan, patches)
  // The first of the rest in the foreground (a group's first block): it holds where the forecast shows it once shifted – a fixed block on its
  // new place makes it jump behind (the blocks after it are later in the forecast's order: they do not move it).
  const map = new Map(plan.map((b) => [b.id, b]))
  const lead = take.find((id) => groupRootOf(map, id) == null)
  if (lead == null) return { ...withPushedStarts(patchedDay(raw, date, ctx.plan, patches), date, plan, []), pushed: [] }
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const shownOf = (p: readonly PlanBlock[]) => new Map(shownForecaster(ctx, state)(blockInfos(g, p, state.facts, ctx.snapshot.settings, routineCostsIn(ctx), typeAt)).map((x) => [x.block.id, x]))
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const shown = shownOf(plan).get(lead)
  if (shown) {
    const at = lm(ownMinuteIdx(g, shown.from))
    if (at !== map.get(lead)!.startMin) {
      patches = [...patches, { id: lead, patch: { startMin: at } }]
      plan = patchedPlan(ctx.plan, patches)
    }
  }
  // The blocks after it are the rest itself (its own rule of „after”, `restOf`), not those shown from its place.
  const pushed = pushApart(ctx, state, plan, lead, { only: new Set(take), onUnsettled })
  let done = withPushedStarts(patchedDay(raw, date, ctx.plan, patches), date, plan, pushed)
  const heads = take.filter((id) => groupRootOf(new Map(done.plan.map((b) => [b.id, b])), id) == null)
  const apply = (fix: readonly BlockPatch[]) => {
    if (fix.length) done = { raw: patchedDay(done.raw, date, done.plan, fix), plan: patchedPlan(done.plan, fix) }
  }
  // Written = shown (D367, T2465): a block of the rest the forecast puts later than its new plan – one that stood later than its plan already,
  // more than N (on a fixed block in the plan of a day to come) – is written where it is shown, as the push writes the others.
  const synced = shownOf(done.plan)
  const startOf = (id: string) => {
    const m = new Map(done.plan.map((b) => [b.id, b]))
    const b = m.get(id)
    return b ? plannedStart(b, m) : null
  }
  apply(
    heads.flatMap((id): BlockPatch[] => {
      const p = synced.get(id)
      const s = startOf(id)
      const at = p ? lm(ownMinuteIdx(g, p.from)) : null
      return at != null && s != null && at > s ? [{ id, patch: { startMin: at } }] : []
    })
  )
  // Past the day's last start (03:59, T2492) the plan holds no later one: the blocks the push laid there are laid again in the rest's order (they
  // meet in the plan; the day shows them one after another past 04:00, said as „za końcem doby”) – never past 03:59.
  apply(laidBack(day, shownOf(done.plan), heads, startOf, lm, onUnsettled))
  return { ...done, pushed }
}

/**
 * The tail of the rest at the day's last start (T2492): the heads from the first one (in the rest's order) the push laid at 03:59 (`PLAN_MAX`) or,
 * by its own pass at the day's end, before where it started – the others stay as the forecast shows them. They get the latest starts that keep their order one minute apart, above the floor: the head
 * before them, every block shown before them that stays (fixed, protected – by its plan; begun or running – by where it runs; one anchored to
 * or beside a head before the tail, its buffer too – by its key, its anchor's start and length as `plannedKey`) and, today, now; never past 03:59
 * (a later start is no start of the day: the block would leave the file) and never earlier than it started before the change (a later shift).
 * Too few minutes: laid on from the floor, the last ones meet at 03:59 – said as unsettled (`onUnsettled`, as the push at the day's end).
 */
function laidBack(day: GroupDay, shown: ReadonlyMap<string, Placed>, heads: readonly string[], startOf: (id: string) => number | null, lm: (idx: number) => number, onUnsettled?: () => void): BlockPatch[] {
  const wasPlan = new Map(day.ctx.plan.map((b) => [b.id, b]))
  const wasOf = (id: string): number | null => {
    const b = wasPlan.get(id)
    return b ? plannedStart(b, wasPlan) : null
  }
  // From the first head the push laid at 03:59 – or laid back by its own pass at the day's end before where it started (a later shift).
  const at = heads.findIndex((id) => {
    const s = startOf(id) ?? Number.NEGATIVE_INFINITY
    return s >= PLAN_MAX || s < (wasOf(id) ?? Number.NEGATIVE_INFINITY)
  })
  if (at < 0) return []
  const tail = heads.slice(at)
  const isHead = new Set(heads)
  const inTail = new Set(tail)
  const infos = new Map(day.state.blocks.map((b) => [b.id, b]))
  const anchorOf = (b: BlockInfo): BlockInfo | undefined => (b.anchor != null ? ((b.after != null ? infos.get(b.after) : undefined) ?? infos.get(b.anchor)) : undefined)
  /** The block goes with a block of `set` – anchored to it up its chain (after its buffer too) or beside it. */
  const linked = (id: string | null, set: ReadonlySet<string>, depth = 0): boolean => {
    if (id == null || depth > 40) return false
    if (set.has(id)) return true
    const b = infos.get(id)
    return !!b && (linked(b.alongside, set, depth + 1) || linked(b.after ?? null, set, depth + 1) || linked(b.anchor, set, depth + 1))
  }
  /** Where a block going with a head stands in the plan after the change (logical minutes): its anchor's start and length, beside – its first's. */
  const keyOf = (b: BlockInfo, depth = 0): number | null => {
    if (depth > 40) return null
    const of = (x: BlockInfo): number | null => (isHead.has(x.id) ? startOf(x.id) : x.anchor != null || x.alongside != null ? keyOf(x, depth + 1) : x.start == null ? null : lm(x.start))
    if (b.alongside != null) {
      const r = infos.get(b.alongside)
      return r ? of(r) : null
    }
    const a = anchorOf(b)
    const s = a ? of(a) : null
    return s == null || !a ? null : s + a.durationMin
  }
  // The floor: the head before the tail, the blocks that stay shown before the tail's first (not those going with the tail itself), and now.
  let floor = at > 0 ? (startOf(heads[at - 1]!) ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY
  const first = shown.get(tail[0]!)
  if (first)
    for (const p of shown.values()) {
      if (p.bg || p.from >= first.from || isHead.has(p.block.id) || linked(p.block.id, inTail)) continue
      const begun = p.running || day.state.facts.blocks.get(p.block.id)?.startedAt != null
      const k = begun || p.block.start == null && !linked(p.block.id, isHead) ? lm(p.from) : linked(p.block.id, isHead) ? keyOf(p.block) : lm(p.block.start!)
      if (k != null) floor = Math.max(floor, k)
    }
  const g = day.state.grid
  const lo = Math.max(floor + 1, lm(ownMinuteIdx(g, day.state.now)))
  const n = tail.length
  let starts: number[]
  if (lo > PLAN_MAX) starts = tail.map(() => PLAN_MAX)
  else if (PLAN_MAX - lo + 1 >= n) starts = tail.map((_, k) => PLAN_MAX - n + 1 + k)
  else starts = tail.map((_, k) => Math.min(lo + k, PLAN_MAX))
  let unsettled = lo > PLAN_MAX || PLAN_MAX - lo + 1 < n
  // A later shift: never earlier than the block started before it – the order kept, meeting at 03:59 at worst.
  for (let k = 0; k < n; k++) {
    const prev = k > 0 ? starts[k - 1]! : Number.NEGATIVE_INFINITY
    const s = Math.min(PLAN_MAX, Math.max(starts[k]!, wasOf(tail[k]!) ?? Number.NEGATIVE_INFINITY, prev))
    if (s <= prev) unsettled = true
    starts[k] = s
  }
  if (unsettled) onUnsettled?.()
  return tail.flatMap((id, k) => (startOf(id) !== starts[k] ? [{ id, patch: { startMin: starts[k]! } }] : []))
}

/**
 * The buffers of decompression laid again on the day's file after the change (T2493, as `withBufferPushes` of a drag, D583): a buffer that grows
 * once its block moves (cut by the bedtime or a fixed block before) or one that appears pushes the blocks after it on the axis of the plan – each
 * whose start it moves from where the change wrote it and from where the day showed it is written there (`extra`); the plan returned is the one
 * the day will show (fresh buffers). Without the setting – the change as it is.
 */
function withBuffersLaid(day: GroupDay, done: DayChanged, changes?: readonly SettingsChange[]): { raw: Raw; plan: PlanBlock[]; extra: string[] } {
  const { ctx } = day
  if (!changes || !setsDecompress(changes)) return { raw: done.raw, plan: done.plan, extra: [] }
  const date = ctx.date
  const file = dayFileFrom(done.raw, date)
  const base = dayPlan(ctx.snapshot, file)
  const laid = replanned(ctx, base, changes, file)
  const was = new Map(base.map((b) => [b.id, b.startMin]))
  const shown = new Map(ctx.plan.map((b) => [b.id, b.startMin]))
  const fix: BlockPatch[] = []
  for (const b of laid) {
    const w = was.get(b.id)
    if (isBuffer(b) || w == null || b.startMin == null || b.startMin === w || b.startMin === shown.get(b.id)) continue
    fix.push({ id: b.id, patch: { startMin: b.startMin } })
  }
  return { raw: fix.length ? patchedDay(done.raw, date, base, fix) : done.raw, plan: [...laid], extra: fix.map((f) => f.id) }
}

/**
 * Earlier (T2466): the chain through the rest of the day – nothing but the blocks it writes changes. A group of parallel blocks whose first
 * block moves goes as „Przesuń o” moves it (`shiftPatches`, T2468): the blocks of the rest beside it with it, one that stays (begun, parked,
 * cancelled) out of the group at the old hour.
 */
function earlier(day: GroupDay, raw: Raw | null, take: readonly string[], minutes: number, onUnsettled?: () => void): DayChanged {
  const { ctx } = day
  const pushed = earlierRest(ctx, day.state, take, minutes, { onUnsettled })
  const plan = new Map(ctx.plan.map((b) => [b.id, b]))
  const patches = pushed.flatMap((p) => {
    const b = plan.get(p.id)
    const was = b ? plannedStart(b, plan) : null
    if (was == null) return []
    const members = groupOf(ctx.plan, p.id).filter((id) => id === p.id || take.includes(id))
    return shiftPatches(ctx.plan, members, p.startMin - was)
  })
  return { raw: patchedDay(raw, ctx.date, ctx.plan, patches), plan: patchedPlan(ctx.plan, patches), pushed }
}

/** What the later shift pushed past (T2470): counted on the day after it against the day before it – only what it made worse. */
function overOf(day: GroupDay, plan: readonly PlanBlock[], take: readonly string[]): RestOver | null {
  const before = day.state
  const after = computeDay({ ...day.ctx, plan: [...plan] })
  const g = after.grid
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const ids = new Set(take)
  const ofRest = (s: DayState) => s.forecast.filter((p) => ids.has(p.block.id) && !p.bg)
  const pastDay = (s: DayState) => ofRest(s).filter((p) => p.to > g.length).length
  const n = pastDay(after)
  if (n > pastDay(before)) return { kind: 'dayEnd', n }
  const end = after.forecastWorkEnd
  const worse = end != null && (before.forecastWorkEnd == null || end > before.forecastWorkEnd)
  if (worse && end > after.boundary.max) return { kind: 'max', atMin: lm(after.boundary.max) }
  const approved = after.boundary.approved
  if (worse && approved != null && end > approved) return { kind: 'boundary', atMin: lm(approved), endMin: lm(end) }
  const lastEnd = (s: DayState) => Math.max(Number.NEGATIVE_INFINITY, ...ofRest(s).map((p) => p.to))
  const last = lastEnd(after)
  if (last > lastEnd(before) && last > after.bedtime.base) return { kind: 'bedtime', atMin: lm(after.bedtime.base), endMin: lm(last) }
  return null
}

/** The words of what a shift of the rest pushed past (D72): „praca kończy się po maksimum (19:00)”. */
export function restOverText(o: RestOver): string {
  switch (o.kind) {
    case 'dayEnd':
      return `${countLabel(o.n, 'blok', 'bloki', 'bloków')} za końcem doby (04:00)`
    case 'max':
      return `praca kończy się po maksimum (${logicalClock(o.atMin)})`
    case 'boundary':
      return `koniec pracy ${logicalClock(o.endMin)} – po granicy ${logicalClock(o.atMin)}`
    case 'bedtime':
      return `plan do ${logicalClock(o.endMin)} – po porze snu ${logicalClock(o.atMin)}`
  }
}

/** One day's words, or – several days with a warning – „za granicą w 2 dniach”. */
export const restOversText = (overs: readonly RestOver[]): string => (overs.length === 1 ? restOverText(overs[0]!) : `za granicą w ${countLabel(overs.length, 'dniu', 'dniach', 'dniach')}`)
