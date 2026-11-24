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
 * rule for its routine's cost – the base its own cost falls back to – matched here to the begun blocks of that routine (T1431, T1440: one
 * after the start in the log's order always, one before it only when the start did not know the routine's cost).
 */
import { baseCosts, baseFromOf, withBody, type BlockCosts } from '../model/blockCosts'
import { ROUTINE_CATEGORY, costsOf, startingBody, type Costs } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type LogEvent, type StartPlanned } from '../model/events'
import type { PlanBlock } from '../model/plan'
import { routineCostApplies } from '../model/routines'
import type { RulesSettings } from '../model/settings'
import { plannedSpan, type BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import { OPEN, type BlockFact, type DayFacts } from './facts'
import { idxOf } from './grid'
import type { TimerNow } from './timer'
import { logicalDayOf } from '../time/day'

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

/** The body of a routine's cost written before the body (D520, T1520): the starting routines' – as a routine's file reads it (`routineFrom`). */
const ROUTINE_BODY = startingBody(ROUTINE_CATEGORY)

type CostEvent = Extract<LogEvent, { k: 'block.cost' | 'energy.cost' }>
type RoutineCostEvent = Extract<LogEvent, { k: 'routine.cost' }>

/** A change of a block's cost, as written now (`block.cost`) or by the first builds of 1.24 (`energy.cost`, the energy's domain). */
export const isCostChange = (e: AnyEvent): e is CostEvent & AnyEvent => isKnown(e) && (e.k === 'block.cost' || e.k === 'energy.cost')

/** A change of a routine's cost (`routine.cost`, T1430). */
export const isRoutineCostChange = (e: AnyEvent): e is RoutineCostEvent & AnyEvent => isKnown(e) && e.k === 'routine.cost'

/** The routine a begun block began with: its start's (`planned.routine`), a start without it (an older version) – the plan's; null – none. */
export const startRoutine = (f: Pick<BlockFact, 'planned'>, p: Pick<PlanBlock, 'routine'> | undefined): string | null =>
  f.planned?.routine !== undefined ? f.planned.routine : (p?.routine ?? null)

/**
 * The routine whose cost a begun block counts (D512, T1371): its start's (`startRoutine`), when its start's category (else the plan's) is
 * of the kind „rutyna” in `categories` (the day's snapshot, as `blockInfos`); null – none.
 */
export function routineOfStart(f: Pick<BlockFact, 'planned'>, p: Pick<PlanBlock, 'routine' | 'categoryId'> | undefined, categories: RulesSettings['categories']): string | null {
  const routine = startRoutine(f, p)
  const cat = f.planned?.categoryId ?? p?.categoryId
  return routine != null && cat != null && routineCostApplies(categories, cat) ? routine : null
}

/**
 * The changes of every begun block, in the order they apply: by their minute, then by the log's full order (`compareEvents`) – the last
 * of a minute wins, whatever the order the logs of the computers arrived in. A change of its own cost only after the block's start
 * (`startOrder`); a change of its routine's cost (`routine.cost`) of its routine (`routineOfStart`) – one after the start always, one before
 * it only for a start without the routine's cost (T1372: it did not know it – the change counts from the start, T1431); a start with it
 * wrote the cost it knew, maybe newer than the change (the file came before the other computer's log, T1440).
 */
export function costChangesOf(ctx: Pick<DayContext, 'events' | 'plan' | 'snapshot'>, facts: Pick<DayFacts, 'grid' | 'blocks'>): Map<string, CostChange[]> {
  /** `lacks` – a change of its own cost written before the body (D520, ≤ 1.26 – three pools): its body comes from the cost before it. */
  type Found = { e: AnyEvent; change: CostChange; lacks?: true }
  const found = new Map<string, Found[]>()
  const add = (block: string, x: Found) => {
    let list = found.get(block)
    if (!list) found.set(block, (list = []))
    list.push(x)
  }
  const ofRoutine = new Map<string, Array<RoutineCostEvent & AnyEvent>>()
  // The plan by id once (a start without its routine or category names the plan's).
  let planById: Map<string, PlanBlock> | null = null
  const planOf = (id: string) => (planById ??= new Map(ctx.plan.map((b) => [b.id, b]))).get(id)
  for (const e of ctx.events) {
    if (isCostChange(e)) {
      const start = facts.blocks.get(e.block)?.startOrder
      if (start == null || compareEvents(e, start) <= 0) continue
      const lacks = e.costs != null && e.costs.body === undefined
      add(e.block, { e, change: { at: idxOf(facts.grid, e.at), costs: withBody(e.costs, 0) }, ...(lacks ? { lacks: true as const } : {}) })
    } else if (isRoutineCostChange(e)) {
      let list = ofRoutine.get(e.routine)
      if (!list) ofRoutine.set(e.routine, (list = []))
      list.push(e)
    }
  }
  if (ofRoutine.size) {
    for (const f of facts.blocks.values()) {
      if (f.startedAt == null) continue
      const routine = routineOfStart(f, planOf(f.id), ctx.snapshot.settings.categories)
      const knew = f.planned?.routineCosts !== undefined && f.startOrder != null
      for (const e of (routine != null ? ofRoutine.get(routine) : undefined) ?? []) {
        if (knew && compareEvents(e, f.startOrder!) < 0) continue
        // A routine's cost written before the body: the starting routines' body (T1520) – what its file had is not in the event.
        add(f.id, { e, change: { at: idxOf(facts.grid, e.at), costs: withBody(e.costs, ROUTINE_BODY), routine: true, was: withBody(e.was, ROUTINE_BODY) } })
      }
    }
  }
  const out = new Map<string, CostChange[]>()
  for (const [block, list] of found) {
    list.sort((a, b) => a.change.at - b.change.at || compareEvents(a.e, b.e))
    if (list.some((x) => x.lacks)) bodiesBefore(ctx, facts.blocks.get(block), planOf(block), list)
    out.set(block, list.map((x) => x.change))
  }
  return out
}

/**
 * The body of each change of a begun block's own cost written before the body (T1534, ≤ 1.26 – the tile's window showed three numbers):
 * the body of the cost the block had just before it – its own then (the change before, else its start's), else its routine's (from the
 * start or a change of it), variant's or category's (the day's settings; a category they do not know – the starting body, T1520).
 */
function bodiesBefore(
  ctx: Pick<DayContext, 'snapshot'>,
  f: Pick<BlockFact, 'planned'> | undefined,
  p: Pick<PlanBlock, 'categoryId' | 'variantId' | 'costs'> | undefined,
  list: ReadonlyArray<{ change: CostChange; lacks?: true }>
): void {
  const start = f?.planned
  const cat = start?.categoryId ?? p?.categoryId ?? null
  const variant = start ? start.variantId : (p?.variantId ?? null)
  let own: Costs | null = start?.costs !== undefined ? start.costs : (p?.costs ?? null)
  let routine: Costs | null = start?.routineCosts !== undefined ? start.routineCosts : (list.find((x) => x.change.routine)?.change.was ?? null)
  const rules = cat != null && Object.hasOwn(ctx.snapshot.settings.categories, cat) ? ctx.snapshot.settings.categories[cat] : undefined
  const base = (): number => (routine ?? (rules ? costsOf(rules, variant) : null))?.body ?? startingBody(cat, variant)
  for (const x of list) {
    if (x.change.routine) {
      routine = x.change.costs
      continue
    }
    if (x.lacks && x.change.costs) x.change.costs = { ...x.change.costs, body: own ? own.body : base() }
    own = x.change.costs
  }
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
 * The minute a begun block's cost is told at (the tile, T1441): `k`, for one ended – at most its last minute (`endedAt` − 1, never before its
 * start): a change after its end (of its routine, written while it no longer ran) never reaches it – as the energy and the calibration,
 * which count only the minutes it ran. Begun again („Zacznij jeszcze raz”) – not ended, `k`.
 */
const toldAt = (f: Pick<BlockFact, 'startedAt' | 'endedAt'> | undefined, k: number): number =>
  f?.endedAt != null ? Math.min(k, Math.max(f.startedAt ?? f.endedAt, f.endedAt - 1)) : k

/**
 * What a block costs at minute k (now, by default; an ended one – at its last minute, `toldAt`) as the engine counts it – for the tile of a
 * begun block (D501): from its start and its changes (`begunBasis`); `base` – its routine's (from its start, D512, changed from a minute on
 * – T1430), variant's or subcategory's in the settings of now (what „Jak rutyna” / „Jak wariant” / „Jak podkategoria” goes back to).
 */
export function begunCosts(
  ctx: Pick<DayContext, 'events' | 'plan' | 'snapshot'>,
  state: Pick<DayState, 'facts' | 'settings' | 'now'>,
  b: BlockInfo,
  /** The day's changes (`costChangesOf`) – counted once for every tile of the day. */
  all: ReadonlyMap<string, readonly CostChange[]> = costChangesOf(ctx, state.facts),
  k = state.now
): BlockCosts {
  const f = state.facts.blocks.get(b.id)
  const { cat, variant, own, routine } = begunBasis(b, f?.planned, all.get(b.id), toldAt(f, k))
  const fallback = ctx.snapshot.settings.categories[cat] ?? b.rules
  const base = baseCosts(state.settings.categories, cat, variant, fallback, routine)
  return { costs: own ?? base, base, own: own != null, ...baseFromOf(state.settings.categories, cat, variant, fallback, routine) }
}

/** Why the cost of a block is not changed any more (`costEditable`) – said after „Nie zapisano: ” by the tile's save and the bar's „Koszt ▸”. */
export const COST_DAY_GONE_TEXT = 'ten dzień już minął'
export const COST_ENDED_TEXT = 'ten blok już się skończył'
export const COST_TAKEN_OFF_TEXT = 'ten blok jest zaparkowany albo odwołany'
export const COST_PASSED_TEXT = 'czas tego bloku już minął'

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
 * The block whose cost the bar's „Koszt ▸” changes (D585, T2500): the block in front – with nothing in front the paused one „Wznów”
 * resumes –, never one behind, nor one of a day gone by (begun yesterday, running past 04:00 – `costEditable`, as its tile, T2509), nor
 * while „Odcinam się” runs (the widget is hidden); with its cost at minute `state.now` as its tile counts it (`begunCosts`). One rule for
 * the bar's view (`engineView`) and the folder's judging of a click (`DataFolder.barCost`). `now` – the instant (ms) the day is counted at.
 */
export function barCostOf(
  ctx: Pick<DayContext, 'events' | 'plan' | 'snapshot'>,
  state: Pick<DayState, 'facts' | 'settings' | 'now' | 'grid'>,
  t: Pick<TimerNow, 'fg' | 'paused' | 'next'>,
  now: number
): { block: BlockInfo; costs: BlockCosts } | null {
  if (state.facts.disconnect.some((d) => d.to === OPEN)) return null
  const b = t.fg ?? t.paused.find((p) => p.info.id === t.next?.id) ?? null
  if (!b || !costEditable(state.facts.blocks.get(b.info.id), state.grid.date < logicalDayOf(now), false)) return null
  return { block: b.info, costs: begunCosts(ctx, state, b.info) }
}

/**
 * What a click of the bar's „Koszt ▸” on a begun block is put over, and from when it may count (T2513). `now` – the block's cost to step
 * from: the own cost of its newest change in the log's order (`block.cost` after its start – also one whose minute is still to come: a
 * clock of another computer ahead, this one's set back), else of its start; the base of now. `after` – the instant (ms) the new change is
 * written at no earlier than: the latest instant of its start and its changes – `costChangesOf` orders by minute, then by the log, so a
 * change written later in the log at that minute or after it counts from its minute on over every one before it.
 */
export function barCostBasis(ctx: Pick<DayContext, 'events' | 'plan' | 'snapshot'>, state: Pick<DayState, 'facts' | 'settings' | 'now' | 'grid'>, b: BlockInfo): { now: BlockCosts; after: number } {
  const start = state.facts.blocks.get(b.id)?.startOrder ?? null
  let after = start?.at ?? Number.NEGATIVE_INFINITY
  let newest: (AnyEvent & { at: number }) | null = null
  for (const e of ctx.events) {
    if (!isCostChange(e) || e.block !== b.id || !start || compareEvents(e, start) <= 0) continue
    if (!newest || compareEvents(e, newest) > 0) newest = e
    if (e.at > after) after = e.at
  }
  const all = costChangesOf(ctx, state.facts)
  const now = begunCosts(ctx, state, b, all)
  if (!newest) return { now, after }
  // At the newest change's own minute `ownAt` gives that change (the last of its minute in the log's order); the base stays the one of now.
  const then = begunCosts(ctx, state, b, all, idxOf(state.grid, newest.at))
  return { now: { ...now, costs: then.own ? then.costs : now.base, own: then.own }, after }
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
