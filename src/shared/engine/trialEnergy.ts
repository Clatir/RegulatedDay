/**
 * Energy live (N19, D573): the lowest energy of a day before a change and with it, counted on trial – never written – while a block or a
 * group is dragged, an edge changes a block's length, or the window of a tile's cost is open before its save. The same words and the same
 * rule as the line after a change („najniższa energia 52 → 44”, D529; „Ułóż pod energię”, D369 – `lowestEnergy`): the lowest of the four
 * pools from now to the bedtime's forecast – a day to come from its first minute –, as the screen shows it (`shownOf`), so the caption while
 * dragging and the line after the drop never say two numbers for one day (T2574). The day is counted again with the plan after the change
 * and the events it would write (`computeDay` + `computeEnergy` – the one engine of the day, T2575). A day without its own check-in (one to
 * come, today before it) – from the assumed check-in, as its curve beside the axis and in its column (T903, T2430; `assumed`, T2576).
 */
import { POOLS, type Costs, type Pool } from '../model/categories'
import type { AnyEvent } from '../model/events'
import type { PlanBlock } from '../model/plan'
import { logicalDayOf } from '../time/day'
import { computeDay, type DayContext, type DayState } from './day'
import { computeEnergy, shownOf, toUnits, type EnergyState } from './energy'
import { assumedCheckin } from './energyTrack'
import { resizeClick } from './resize'
import { simEvents } from './sim'

/** The day a trial is made on, as the window counts it (`countDay` – a `DayModel` is one): its context, its state and its energy. */
export interface TrialDay {
  ctx: DayContext
  state: DayState
  energy: EnergyState
}

/**
 * A change on trial: the day's plan after it (blocks moved, pushed apart, a new length, an own cost – absent: the plan stays) and the
 * events it would write (laid after the day's log by `simEvents` – a begun block's cost from now, the click `resize` of a running block).
 */
export interface TrialChange {
  plan?: readonly PlanBlock[]
  events?: readonly AnyEvent[]
}

/** The lowest energy of a day: its number on the screen and the pool it is in (a tie – the first of głowa, emocje, bodźce, ciało). */
export interface Lowest {
  value: number
  pool: Pool
}

/** The lowest energy before the change and with it (D529 words, N19): the pool of the lowest after it (`pool`) and before it (`beforePool`). */
export interface TrialLowest {
  before: number
  after: number
  pool: Pool
  beforePool: Pool
  /** Counted from the assumed check-in (a day to come, today before its own – T903, T2430): the window says so, as beside the curve. */
  assumed: boolean
}

/** Whether the day's energy is counted from the assumed check-in – `dayAxis`'s rule (today or a day to come without a check-in, the module on). */
function isAssumed(day: TrialDay): boolean {
  return !day.energy.known && day.energy.enabled && day.ctx.date >= logicalDayOf(day.ctx.now)
}

/** The lowest of an energy's forecast (from now to the bedtime's forecast), as shown; null – no forecast (no check-in, the module off). */
export function lowestOf(e: EnergyState): Lowest | null {
  if (!e.known || !e.enabled || !e.forecast) return null
  let pool: Pool = POOLS[0]!
  let units = Number.POSITIVE_INFINITY
  for (const p of POOLS) {
    const u = toUnits(e.forecast.min[p])
    if (u < units) {
      units = u
      pool = p
    }
  }
  return { value: shownOf(units), pool }
}

/** The day's energy counted with `ctx` and its state: from the assumed check-in when the day has it so (T2576), the module as it is now. */
function energyOf(ctx: DayContext, state: DayState, assumed: boolean, moduleOn: boolean): EnergyState {
  return computeEnergy(assumed ? { ...ctx, events: [...ctx.events, assumedCheckin(ctx, state.grid)] } : ctx, state, { moduleOn })
}

/** The lowest before a change, once a counted day (by its state – a day counted again is a new object). */
const beforeMemo = new WeakMap<DayState, Lowest | null>()

/** The lowest energy of the counted day as it is (T2577: once a day – a trial only counts the day after the change). */
export function lowestBefore(day: TrialDay): Lowest | null {
  const known = beforeMemo.get(day.state)
  if (known !== undefined) return known
  const assumed = isAssumed(day)
  const low = assumed ? lowestOf(energyOf(day.ctx, day.state, true, day.energy.enabled)) : lowestOf(day.energy)
  beforeMemo.set(day.state, low)
  return low
}

/**
 * The lowest energy of the day before `change` and with it (N19). Null – nothing to say: a day gone by (history – no trial), the module off,
 * a day without a forecast of energy (gone by without a check-in). Pure – nothing is written; the day's state and its log stay as given.
 */
export function trialLowest(day: TrialDay, change: TrialChange): TrialLowest | null {
  if (day.ctx.date < logicalDayOf(day.ctx.now) || !day.energy.enabled) return null
  const before = lowestBefore(day)
  if (!before) return null
  const ctx: DayContext = {
    ...day.ctx,
    ...(change.plan ? { plan: change.plan } : {}),
    ...(change.events?.length ? { events: [...day.ctx.events, ...change.events] } : {})
  }
  const assumed = isAssumed(day)
  const after = lowestOf(energyOf(ctx, computeDay(ctx), assumed, day.energy.enabled))
  return after && { before: before.value, after: after.value, pool: after.pool, beforePool: before.pool, assumed }
}

/**
 * The cost of block `id` changed to `costs` (null – „Jak podkategoria”, its base again) as its tile's window saves it (D501, `costSave.ts`),
 * on trial: a block begun and not ended – `block.cost` from now (the day's instant); one not begun – its own cost in the plan. Null – no
 * trial: an ended block, one not in the plan nor begun.
 */
export function costTrial(day: Pick<TrialDay, 'ctx' | 'state'>, id: string, costs: Costs | null): TrialChange | null {
  const f = day.state.facts.blocks.get(id)
  const at = day.ctx.now
  if (f?.startedAt != null) return f.endedAt == null ? { events: simEvents(day.ctx, [{ k: 'block.cost', block: id, at, costs }], at) } : null
  const b = day.ctx.plan.find((x) => x.id === id)
  return b ? { plan: day.ctx.plan.map((x) => (x === b ? { ...b, costs } : x)) } : null
}

/**
 * The bottom edge of the running block `id` dragged to the instant `to` (`ResizePreview.to`), on trial: the events its click `resize` writes
 * (confirmed past the boundary – as „Potwierdź”), at the day's instant (`resizeClick`). Null – refused, or nothing changes.
 */
export function resizeTrial(day: Pick<TrialDay, 'ctx' | 'state'>, id: string, to: number): TrialChange | null {
  const at = day.ctx.now
  const { events } = resizeClick(day.ctx, day.state, id, to, at)
  return events.length ? { events: simEvents(day.ctx, events, at) } : null
}
