/**
 * The cost of a begun block changed from a minute on (D501, rule A): the window of the tile writes `block.cost` to the day's log – a
 * fact, never a change of what is past (`energy.cost` of the first builds of 1.24 reads the same, T1300). A block counts as it began
 * (`block.start.planned`: category, variant, own cost, its routine's cost – D512; without them – an older start – as planned, a start
 * without the routine's cost – none); from the minute of each change to its end it costs what the change says (null – its routine's,
 * variant's or category's again). A change counts only after the block's start in the log's order (`BlockFact.startOrder`): one of a
 * start taken back („Cofnij”) never reaches a later start (T1301). Minutes before a change
 * stay as they were counted, so the log counted again at any later moment gives the same past. One rule for the energy (`energy.ts`:
 * `Kind`, `costOf`), the calibration's evidence and the tile's label (`begunCosts`). The cost of the block's routine changed while it runs
 * (D514, T1395: `block.routineCost`, written by the window that saved the routine's cost for each block of `routineCostTargets`) follows the
 * same rule for its routine's cost – the base its own cost falls back to.
 */
import { baseCosts, baseFromOf, type BlockCosts } from '../model/blockCosts'
import type { Costs } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type LogEvent, type StartPlanned } from '../model/events'
import type { PlanBlock } from '../model/plan'
import type { RulesSettings } from '../model/settings'
import { plannedSpan, type BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import type { BlockFact, DayFacts } from './facts'
import { idxOf } from './grid'

/**
 * A change of a block's cost: from the minute `at` (index) on, `costs` – its own (null – no own cost any more), or with `routine` its
 * routine's (D514, `block.routineCost`; null – the routine has none: the variant's or category's).
 */
export interface CostChange {
  at: number
  costs: Costs | null
  routine?: true
}

type CostEvent = Extract<LogEvent, { k: 'block.cost' | 'energy.cost' | 'block.routineCost' }>

/**
 * A change of a block's cost, as written now (`block.cost`) or by the first builds of 1.24 (`energy.cost`, the energy's domain), or of its
 * routine's cost (`block.routineCost`, T1395).
 */
export const isCostChange = (e: AnyEvent): e is CostEvent & AnyEvent => isKnown(e) && (e.k === 'block.cost' || e.k === 'energy.cost' || e.k === 'block.routineCost')

/**
 * The changes of every begun block, in the order they apply: by their minute, then by the log's full order (`compareEvents`) – the last
 * of a minute wins, whatever the order the logs of the computers arrived in. Only those after the block's start (`startOrder`).
 */
export function costChangesOf(events: readonly AnyEvent[], facts: Pick<DayFacts, 'grid' | 'blocks'>): Map<string, CostChange[]> {
  const list = events.filter((e): e is CostEvent & AnyEvent => {
    if (!isCostChange(e)) return false
    const start = facts.blocks.get(e.block)?.startOrder
    return start != null && compareEvents(e, start) > 0
  })
  const at = new Map(list.map((e) => [e, idxOf(facts.grid, e.at)]))
  const out = new Map<string, CostChange[]>()
  for (const e of list.sort((a, b) => at.get(a)! - at.get(b)! || compareEvents(a, b))) {
    let changes = out.get(e.block)
    if (!changes) out.set(e.block, (changes = []))
    changes.push(e.k === 'block.routineCost' ? { at: at.get(e)!, costs: e.costs, routine: true } : { at: at.get(e)!, costs: e.costs })
  }
  return out
}

/** The block's own cost at minute k: the last change of it from k or before, else what its start wrote (`own`). */
export function ownAt(changes: readonly CostChange[], k: number, own: Costs | null): Costs | null {
  for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.at <= k && !changes[i]!.routine) return changes[i]!.costs
  return own
}

/** The cost of the block's routine at minute k (D514, T1395): the last change of it from k or before, else its start's (`routine`). */
export function routineAt(changes: readonly CostChange[], k: number, routine: Costs | null): Costs | null {
  for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.at <= k && changes[i]!.routine) return changes[i]!.costs
  return routine
}

/**
 * The blocks a change of the routine `routine`'s cost reaches from now on (D514, T1395): begun and not ended, whose start's routine
 * (`planned.routine`; a start without it, of an older version – the plan's) is it and whose start's category (else the plan's) is of the
 * kind „rutyna” in `settings` (the day's snapshot, as `blockInfos` – T1371). A block with its own cost too: its cost stays, but „Jak rutyna”
 * goes back to the routine's new cost. Ids in the order of the facts.
 */
export function routineCostTargets(plan: readonly PlanBlock[], facts: Pick<DayFacts, 'blocks'>, settings: RulesSettings, routine: string): string[] {
  const out: string[] = []
  for (const f of facts.blocks.values()) {
    if (f.startedAt == null || f.endedAt != null) continue
    const p = plan.find((b) => b.id === f.id)
    const ofStart = f.planned?.routine !== undefined ? f.planned.routine : (p?.routine ?? null)
    const cat = f.planned?.categoryId ?? p?.categoryId
    if (ofStart === routine && cat != null && Object.hasOwn(settings.categories, cat) && settings.categories[cat]?.kind === 'routine') out.push(f.id)
  }
  return out
}

/**
 * What a block's cost counts from: its start's category, variant, own cost and its routine's cost (`block.start.planned`), else the plan's
 * (an older start). D512: a start of a version before routine costs has none (`foldFacts` – null: the past stays as counted, whatever the
 * routine costs later); a start of this version without the field (the routine's file could not be read then, T1372) and a block not begun
 * – the routine's cost now (`BlockInfo.routineCosts`; not known now – none).
 */
export function startCostOf(
  b: Pick<BlockInfo, 'categoryId' | 'variantId' | 'costs' | 'routineCosts'>,
  p: StartPlanned | null | undefined
): { cat: string; variant: string | null; own: Costs | null; routine: Costs | null } {
  return { cat: p?.categoryId ?? b.categoryId, variant: p ? p.variantId : b.variantId, own: p?.costs !== undefined ? p.costs : b.costs, routine: p?.routineCosts !== undefined ? p.routineCosts : (b.routineCosts ?? null) }
}

/**
 * What a block costs at minute k (now, by default) as the engine counts it – for the tile of a begun block (D501): from its start and its
 * changes; `base` – its routine's (from its start, D512, changed from a minute on – T1395), variant's or subcategory's in the settings of now (what „Jak rutyna” / „Jak wariant” /
 * „Jak podkategoria” goes back to).
 */
export function begunCosts(
  ctx: Pick<DayContext, 'events' | 'snapshot'>,
  state: Pick<DayState, 'facts' | 'settings' | 'now'>,
  b: BlockInfo,
  /** The day's changes (`costChangesOf`) – counted once for every tile of the day. */
  all: ReadonlyMap<string, readonly CostChange[]> = costChangesOf(ctx.events, state.facts),
  k = state.now
): BlockCosts {
  const start = startCostOf(b, state.facts.blocks.get(b.id)?.planned)
  const changes = all.get(b.id)
  const own = changes ? ownAt(changes, k, start.own) : start.own
  const routine = changes ? routineAt(changes, k, start.routine) : start.routine
  const fallback = ctx.snapshot.settings.categories[start.cat] ?? b.rules
  const base = baseCosts(state.settings.categories, start.cat, start.variant, fallback, routine)
  return { costs: own ?? base, base, own: own != null, ...baseFromOf(state.settings.categories, start.cat, start.variant, fallback, routine) }
}

/**
 * The tile's cost may be changed (D501): on a day not gone by, a block not taken off before it began (parked, cancelled) – one not begun
 * while its time has not passed (its own cost in the plan), one begun until it ends (from now on, `block.cost`). An ended block only tells.
 */
export function costEditable(f: Pick<BlockFact, 'startedAt' | 'endedAt' | 'parkedAt' | 'cancelledAt'> | undefined, dayGone: boolean, passed: boolean): boolean {
  if (dayGone) return false
  if (f?.startedAt != null) return f.endedAt == null
  return f?.parkedAt == null && f?.cancelledAt == null && !passed
}

/**
 * A block not begun whose time has passed by the clock (minute `now`) – as the forecast drops it (T1304): a fixed or waiting block once
 * its planned window is over; a flexible one never (the forecast puts it from now on). The save checks it at its moment, the tiles have it
 * from the forecast (`dayAxis`, `horizonDay`: the end where the axis shows it).
 */
export function windowPassed(b: BlockInfo, byId: ReadonlyMap<string, BlockInfo>, now: number): boolean {
  if ((!b.fixed && !b.waits) || (b.start == null && b.alongside == null)) return false
  const span = plannedSpan(b, byId as Map<string, BlockInfo>)
  return span != null && now >= span.end
}
