/**
 * The cost of a begun block changed from a minute on (D501, rule A): the window of the tile writes `block.cost` to the day's log – a
 * fact, never a change of what is past (`energy.cost` of the first builds of 1.24 reads the same, T1300). A block counts as it began
 * (`block.start.planned`: category, variant, own cost, its routine's cost – D512; without them – an older start – as planned, a start
 * without the routine's cost – none); from the minute of each change to its end it costs what the change says (null – its routine's,
 * variant's or category's again). A change counts only after the block's start in the log's order (`BlockFact.startOrder`): one of a
 * start taken back („Cofnij”) never reaches a later start (T1301). Minutes before a change
 * stay as they were counted, so the log counted again at any later moment gives the same past. One rule for the energy (`energy.ts`:
 * `Kind`, `costOf`), the calibration's evidence and the tile's label (`begunCosts`). The cost of the block's routine changed while it runs
 * (D514, T1430: `routine.cost`, written by the main process with every write of the routine's record with another cost) follows the same
 * rule for its routine's cost – the base its own cost falls back to – matched here to the begun blocks of that routine (T1431: by time,
 * whatever start).
 */
import { baseCosts, baseFromOf, type BlockCosts } from '../model/blockCosts'
import type { Costs } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type LogEvent, type StartPlanned } from '../model/events'
import type { PlanBlock } from '../model/plan'
import { routineCostApplies } from '../model/routines'
import type { RulesSettings } from '../model/settings'
import { plannedSpan, type BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import type { BlockFact, DayFacts } from './facts'
import { idxOf } from './grid'

/**
 * A change of a block's cost: from the minute `at` (index) on, `costs` – its own (null – no own cost any more), or with `routine` its
 * routine's (D514, `routine.cost`; null – the routine has none: the variant's or category's) and `was` – the routine's cost before it.
 */
export interface CostChange {
  at: number
  costs: Costs | null
  routine?: true
  was?: Costs | null
}

type CostEvent = Extract<LogEvent, { k: 'block.cost' | 'energy.cost' }>
type RoutineCostEvent = Extract<LogEvent, { k: 'routine.cost' }>

/** A change of a block's cost, as written now (`block.cost`) or by the first builds of 1.24 (`energy.cost`, the energy's domain). */
export const isCostChange = (e: AnyEvent): e is CostEvent & AnyEvent => isKnown(e) && (e.k === 'block.cost' || e.k === 'energy.cost')

/** A change of a routine's cost (`routine.cost`, T1430). */
export const isRoutineCostChange = (e: AnyEvent): e is RoutineCostEvent & AnyEvent => isKnown(e) && e.k === 'routine.cost'

/**
 * The routine whose cost a begun block counts (D512, T1371): its start's (`planned.routine`; a start without it, of an older version – the
 * plan's), when its start's category (else the plan's) is of the kind „rutyna” in `categories` (the day's snapshot, as `blockInfos`);
 * null – none.
 */
export function routineOfStart(f: Pick<BlockFact, 'planned'>, p: Pick<PlanBlock, 'routine' | 'categoryId'> | undefined, categories: RulesSettings['categories']): string | null {
  const routine = f.planned?.routine !== undefined ? f.planned.routine : (p?.routine ?? null)
  const cat = f.planned?.categoryId ?? p?.categoryId
  return routine != null && cat != null && routineCostApplies(categories, cat) ? routine : null
}

/**
 * The changes of every begun block, in the order they apply: by their minute, then by the log's full order (`compareEvents`) – the last
 * of a minute wins, whatever the order the logs of the computers arrived in. A change of its own cost only after the block's start
 * (`startOrder`); a change of its routine's cost (`routine.cost`) – every one of its routine (`routineOfStart`): it applies from its minute,
 * so one before the start counts from the start (T1431).
 */
export function costChangesOf(ctx: Pick<DayContext, 'events' | 'plan' | 'snapshot'>, facts: Pick<DayFacts, 'grid' | 'blocks'>): Map<string, CostChange[]> {
  const found = new Map<string, Array<{ e: AnyEvent; change: CostChange }>>()
  const add = (block: string, e: AnyEvent, change: CostChange) => {
    let list = found.get(block)
    if (!list) found.set(block, (list = []))
    list.push({ e, change })
  }
  const ofRoutine = new Map<string, Array<RoutineCostEvent & AnyEvent>>()
  for (const e of ctx.events) {
    if (isCostChange(e)) {
      const start = facts.blocks.get(e.block)?.startOrder
      if (start != null && compareEvents(e, start) > 0) add(e.block, e, { at: idxOf(facts.grid, e.at), costs: e.costs })
    } else if (isRoutineCostChange(e)) {
      let list = ofRoutine.get(e.routine)
      if (!list) ofRoutine.set(e.routine, (list = []))
      list.push(e)
    }
  }
  if (ofRoutine.size) {
    // The plan by id once (a start without its routine or category names the plan's).
    const plan = new Map(ctx.plan.map((b) => [b.id, b]))
    for (const f of facts.blocks.values()) {
      if (f.startedAt == null) continue
      const routine = routineOfStart(f, plan.get(f.id), ctx.snapshot.settings.categories)
      for (const e of (routine != null ? ofRoutine.get(routine) : undefined) ?? []) add(f.id, e, { at: idxOf(facts.grid, e.at), costs: e.costs, routine: true, was: e.was })
    }
  }
  const out = new Map<string, CostChange[]>()
  for (const [block, list] of found) out.set(block, list.sort((a, b) => a.change.at - b.change.at || compareEvents(a.e, b.e)).map((x) => x.change))
  return out
}

/** The block's own cost at minute k: the last change of it from k or before, else what its start wrote (`own`). */
export function ownAt(changes: readonly CostChange[], k: number, own: Costs | null): Costs | null {
  for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.at <= k && !changes[i]!.routine) return changes[i]!.costs
  return own
}

/** The cost of the block's routine at minute k (D514, T1430): the last change of it from k or before, else its start's (`routine`). */
export function routineAt(changes: readonly CostChange[], k: number, routine: Costs | null): Costs | null {
  for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.at <= k && changes[i]!.routine) return changes[i]!.costs
  return routine
}

/**
 * The routine's cost before its first change of the day (`was` of the earliest `routine.cost` among `changes`, T1432); undefined – no
 * change of it.
 */
export const routineBefore = (changes: readonly CostChange[] | null | undefined): Costs | null | undefined => changes?.find((c) => c.routine)?.was

/**
 * What a block's cost counts from: its start's category, variant, own cost and its routine's cost (`block.start.planned`), else the plan's
 * (an older start). D512: a start of a version before routine costs has none (`foldFacts` – null: the past stays as counted, whatever the
 * routine costs later); a start of this version without the field (the routine's file could not be read then, T1372) – the routine's cost
 * before its first change that day (`routineBefore(changes)`, T1432: the log alone says it, so a change never changes the minutes before
 * it), with no change – the routine's cost now, as a block not begun (`BlockInfo.routineCosts`; not known now – none).
 */
export function startCostOf(
  b: Pick<BlockInfo, 'categoryId' | 'variantId' | 'costs' | 'routineCosts'>,
  p: StartPlanned | null | undefined,
  changes?: readonly CostChange[] | null
): { cat: string; variant: string | null; own: Costs | null; routine: Costs | null } {
  const before = p && p.routineCosts === undefined ? routineBefore(changes) : undefined
  return {
    cat: p?.categoryId ?? b.categoryId,
    variant: p ? p.variantId : b.variantId,
    own: p?.costs !== undefined ? p.costs : b.costs,
    routine: p?.routineCosts !== undefined ? p.routineCosts : before !== undefined ? before : (b.routineCosts ?? null)
  }
}

/**
 * What a begun block's cost is made of at minute k as the engine counts it (`energy.ts` `costOf`): its start's category and variant (D501),
 * its own cost and its routine's then (`startCostOf`, changed from a minute on – `ownAt`, `routineAt`). The tile (`begunCosts`) and the count
 * of ✎ (`editScope.ts` `begunToday`, T1434) take it from here.
 */
export function begunBasis(
  b: Pick<BlockInfo, 'categoryId' | 'variantId' | 'costs' | 'routineCosts'>,
  p: StartPlanned | null | undefined,
  changes: readonly CostChange[] | undefined,
  k: number
): { cat: string; variant: string | null; own: Costs | null; routine: Costs | null } {
  const start = startCostOf(b, p, changes)
  return changes ? { ...start, own: ownAt(changes, k, start.own), routine: routineAt(changes, k, start.routine) } : start
}

/**
 * What a block costs at minute k (now, by default) as the engine counts it – for the tile of a begun block (D501): from its start and its
 * changes (`begunBasis`); `base` – its routine's (from its start, D512, changed from a minute on – T1430), variant's or subcategory's in the
 * settings of now (what „Jak rutyna” / „Jak wariant” / „Jak podkategoria” goes back to).
 */
export function begunCosts(
  ctx: Pick<DayContext, 'events' | 'plan' | 'snapshot'>,
  state: Pick<DayState, 'facts' | 'settings' | 'now'>,
  b: BlockInfo,
  /** The day's changes (`costChangesOf`) – counted once for every tile of the day. */
  all: ReadonlyMap<string, readonly CostChange[]> = costChangesOf(ctx, state.facts),
  k = state.now
): BlockCosts {
  const { cat, variant, own, routine } = begunBasis(b, state.facts.blocks.get(b.id)?.planned, all.get(b.id), k)
  const fallback = ctx.snapshot.settings.categories[cat] ?? b.rules
  const base = baseCosts(state.settings.categories, cat, variant, fallback, routine)
  return { costs: own ?? base, base, own: own != null, ...baseFromOf(state.settings.categories, cat, variant, fallback, routine) }
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
