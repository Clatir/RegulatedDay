/**
 * „Wstaw regenerację tutaj” (N3, D599, T2644–T2649, T2871–T2874): by the warning of energy at the reserve, one proposal – a block of
 * regeneration of `REGEN_HERE_MIN` minutes right before the block in whose time a pool first reaches the reserve after now (the
 * descent of the forecast, `EnergyState.forecast.reserveAt`), by the way of regeneration the reserve's message proposes for
 * that pool (`suggestRegen`, 1.27: the lowest cost in the pool, on a tie the first of your list), with the blocks after it
 * pushed apart as a new block pushes them (D367, `pushApart`). Never before the end of the current step of 5 minutes: the block
 * with the descent begun, or due by then, takes the regeneration at the next full 5 minutes after now, at the latest at the
 * descent. Judged by counting the day and its energy again (once a pool, `REGEN_COUNTS` at most): the proposal says the lowest
 * state of the pool from now before and with it, and is there only when it rises (as shown, whole) while no other pool goes lower
 * on the screen into the watch of the bar (below the reserve + 15, T2876) nor comes to the reserve. Today and days to come – a day
 * gone by has none. Pure and deterministic (the id of the block is the caller's – the same id is written); only a proposal –
 * nothing is blocked (D72).
 */
import { POOLS, REGEN_CATEGORY, type Pool } from '../model/categories'
import { PLAN_MAX, type PlanBlock } from '../model/plan'
import type { RulesSettings } from '../model/settings'
import { logicalMinuteOf } from '../time/day'
import { computeDay, type DayContext, type DayState } from './day'
import { computeEnergy, shownOf, toUnits, type EnergyState } from './energy'
import { onScreen, shadeOf } from './energyCurve'
import { reserveWarned } from './energyOrder'
import type { Placed } from './forecast'
import { atOf, idxOfLogical } from './grid'
import { newUserBlock } from './planEdit'
import { pushable, pushApart, withBlock, type PushedBlock } from './pushApart'
import { suggestRegen } from './reserve'

/** The length of the regeneration put in (minutes) – as the reserve's message proposes it (`RESERVE_REGEN_MIN`, D326). */
export const REGEN_HERE_MIN = 15
/** The id the proposal is counted with when the caller gives none (tests; the window gives the id it writes). */
export const REGEN_HERE_ID = 'regen-here'
/**
 * The step of the clock (minutes): a regeneration starts no earlier than the end of the current step – the window counts the
 * proposal once a step (`ENERGY_ORDER_HOLD_MIN`), so a start it counted is not past within that step. A click later than that (the
 * window not counted again – asleep, the folder away) is checked by the live clock when it saves (`insertRegen`, T2879).
 */
const STEP_MIN = 5
/** The days counted again at most: the pools with a descent, the earliest first, until one gives a proposal. */
export const REGEN_COUNTS = 2

/** The proposal: where the regeneration stands, by which way, what it pushes and what it does to the pool. */
export interface RegenHere {
  /** The id of the block it puts in (written as it was counted: an order of equal starts goes by the ids). */
  id: string
  /** The pool that reaches the reserve in the forecast. */
  pool: Pool
  /** The block in whose time it reaches it (id): the regeneration stands right before it. */
  beforeId: string
  /** The regeneration's start (logical minutes) and length. */
  startMin: number
  durationMin: number
  /** The way of regeneration (null – the category has none: its own costs). */
  variantId: string | null
  /** The lowest state of the pool from now to the bedtime's forecast, before and with it (whole points, as shown). */
  before: number
  after: number
  /** The blocks it pushes apart (D367) – their new starts, as the window writes them with the block. */
  pushed: PushedBlock[]
  /** The buffer of decompression it stands on and takes away (D582 – cancelled in the same edit); null – none. */
  takes: PlanBlock | null
}


/**
 * What the caller adds to the count (T2877): `id` – the id of the block it writes (T2872); `taken` – the buffer of decompression the block
 * stands on (D582, `bufferTakenBy` of the window; it is gone from the plan counted and from the file written); `replan` – the plan of the
 * file after the change (its own starts, without the buffers – `ctx.basePlan`) with the buffers laid again (`replanned`, D583: the buffers
 * move the blocks after them as the next count of the day will), with the buffer taken gone. Without them the plan counted is the
 * window's (`ctx.plan`) with the block and the pushed starts.
 */
export interface RegenOptions {
  id?: string
  taken?: (block: PlanBlock) => PlanBlock | null
  replan?: (base: readonly PlanBlock[], taken: PlanBlock | null) => readonly PlanBlock[]
}
/** A descent of the day's forecast: the pool, the minute (index) and the block of the foreground in whose time it falls. */
export interface DescentPlace {
  pool: Pool
  at: number
  placed: Placed
}

/**
 * Where the forecast of energy reaches the reserve (the warning „prognoza energii na poziomie rezerwy”, T2644), pool by pool – the
 * earliest `reserveAt` first (on the same minute – the order of `POOLS`), only after `after` (an index; a pool at the reserve now
 * has the reserve's message) – each with the block of the foreground in whose time it falls: the one running through that minute
 * (the series at minute k is the state after minute k − 1 and the one-off costs at k), else the one that starts there (its switch),
 * else the one that ends there. A descent in free time (no block there) is left out.
 */
export function descentPlaces(state: DayState, energy: EnergyState | null, after = Number.NEGATIVE_INFINITY): DescentPlace[] {
  if (!energy || !reserveWarned(energy)) return []
  const fg = state.forecast.filter((p) => !p.bg)
  const out: DescentPlace[] = []
  for (const pool of POOLS) {
    const at = energy.forecast!.reserveAt[pool]
    if (at == null || at <= after) continue
    const placed = fg.find((p) => p.from < at && at < p.to) ?? fg.find((p) => p.from === at) ?? fg.find((p) => p.to === at)
    if (placed) out.push({ pool, at, placed })
  }
  // A stable sort: on the same minute the order of `POOLS` stays.
  return out.sort((a, b) => a.at - b.at)
}

/** The first descent of the forecast (`descentPlaces`) – one rule for the proposal and for the hint of the tile at the cause (N20). */
export const descentPlace = (state: DayState, energy: EnergyState | null): DescentPlace | null => descentPlaces(state, energy)[0] ?? null

/**
 * „Wstaw regenerację tutaj” for the day as counted (N3, D599): the regeneration before the block with a descent of the forecast
 * after now (`descentPlaces` – the earliest pool first; one that gives none, the next, `REGEN_COUNTS` counts of the day at most), or
 * null – no warning of the reserve, a day gone by, no block of the foreground at a descent, no start up to the descent, the
 * regeneration would not stand where it is put (a flexible block that does not fit before a fixed one goes behind it, D340), the
 * lowest state of the pool does not rise, or another pool's goes lower on the screen into the watch of the bar (T2876) or comes to the reserve.
 *
 * A block rozsuwanie may push (flexible, not begun, `pushable`) takes the regeneration at its place on the axis and goes behind it
 * with the blocks after it; any other (fixed, waiting for „Zacznij”, protected, anchored) keeps its place – the regeneration ends at
 * its start, the flexible blocks there go behind it. A start before the end of the current step of 5 minutes (the block begun or
 * due) – the next full 5 minutes after now, at the latest the minute of the descent (a regeneration there still takes the switch
 * into the block off it). `opts` – the id of the block and the buffers of decompression (`RegenOptions`, T2872, T2877).
 */
export function regenHere(ctx: DayContext, state: DayState, energy: EnergyState | null, opts: RegenOptions = {}): RegenHere | null {
  // A day gone by (now past its last minute) has nothing left to put in.
  if (!energy || state.now >= state.grid.length) return null
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const step = nextStep(state, lm)
  if (step == null) return null
  let counts = 0
  for (const d of descentPlaces(state, energy, state.now)) {
    if (counts >= REGEN_COUNTS) break
    const tried = tryDescent(ctx, state, energy, d, step, lm, opts)
    if (tried.counted) counts++
    if (tried.value) return tried.value
  }
  return null
}

/** The regeneration before one descent: the proposal or none, and whether the day was counted again for it. */
function tryDescent(
  ctx: DayContext,
  state: DayState,
  energy: EnergyState,
  d: DescentPlace,
  step: number,
  lm: (idx: number) => number,
  opts: RegenOptions
): { value: RegenHere | null; counted: boolean } {
  const none = { value: null, counted: false }
  const { pool, at, placed: where } = d
  const g = state.grid
  const begun = where.running || state.facts.blocks.get(where.block.id)?.startedAt != null
  const pushes = !begun && pushable(where.block, state.facts)
  let start = pushes ? where.from : where.from - REGEN_HERE_MIN
  if (begun || start < step) start = step
  // A start the plan can hold (a minute with a number of its own, not past 03:59), up to the descent.
  if (start > at || lm(start) > PLAN_MAX || idxOfLogical(g, lm(start)) !== start) return none
  const startMin = lm(start)
  const variantId = suggestRegen(state.settings, pool)
  const id = opts.id ?? REGEN_HERE_ID
  const block = newUserBlock(REGEN_CATEGORY, startMin, REGEN_HERE_MIN, ctx.snapshot.settings.categories[REGEN_CATEGORY], { id, variantId })
  // D582: on a buffer of decompression it takes its place – the buffer is gone from the plan (T2877).
  const takes = opts.taken?.(block) ?? null
  const without = (list: readonly PlanBlock[]) => withBlock(takes ? list.filter((b) => b.id !== takes.id) : list, block)
  const plan = without(ctx.plan)
  // A block that is pushed goes behind the regeneration from where the axis shows it (also one due by now, shown at now).
  const pushed = pushApart(ctx, state, plan, block.id, pushes ? { atMin: lm(where.from) } : {})
  const starts = new Map(pushed.map((p) => [p.id, p.startMin]))
  const moved = (list: readonly PlanBlock[]) => list.map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
  // The day as the next count after the write has it (T2877): the file's plan with the change and the buffers laid again.
  const counted = { ...ctx, plan: ctx.basePlan && opts.replan ? [...opts.replan(moved(without(ctx.basePlan)), takes)] : moved(plan) }
  // The one count of the day again (and of its energy) for this descent.
  const day = computeDay(counted)
  const placed = day.forecast.find((p) => p.block.id === block.id)
  if (!placed || placed.bg || placed.from !== start) return { value: null, counted: true }
  const was = energy.forecast!
  const now = computeEnergy(counted, day, { moduleOn: energy.enabled, calibration: !energy.variants }).forecast
  if (!now) return { value: null, counted: true }
  const shown = (f: typeof was, p: Pool) => shownOf(toUnits(f.min[p]))
  const before = shown(was, pool)
  const after = shown(now, pool)
  // The pool rises; no other goes lower on the screen into the watch of the bar (below the reserve + `WATCH_ABOVE_RESERVE` – `shadeOf`,
  // T2600, T2876: one far above it may lose a point or a few), nor comes to the reserve it did not reach.
  const watched = (p: Pool) => shadeOf(onScreen(shown(now, p)), energy.reserve) !== 'ok'
  const worse = POOLS.some((p) => p !== pool && ((shown(now, p) < shown(was, p) && watched(p)) || (was.reserveAt[p] == null && now.reserveAt[p] != null)))
  if (after <= before || worse) return { value: null, counted: true }
  return { value: { id, pool, beforeId: where.block.id, startMin, durationMin: REGEN_HERE_MIN, variantId, before, after, pushed, takes }, counted: true }
}

/** The next full 5 minutes after now – the end of the current step (an index whose minute has a number of its own), within the day. */
function nextStep(state: DayState, lm: (idx: number) => number): number | null {
  const g = state.grid
  for (let k = state.now + 1; k < g.length; k++) if (lm(k) % STEP_MIN === 0 && idxOfLogical(g, lm(k)) === k) return k
  return null
}

/** The name of a way of regeneration (the settings' list; none – „Regeneracja”, the category). */
export function regenWayName(settings: RulesSettings, variantId: string | null): string {
  const cat = settings.categories[REGEN_CATEGORY]
  return cat?.variants.find((v) => v.id === variantId)?.name ?? 'Regeneracja'
}
