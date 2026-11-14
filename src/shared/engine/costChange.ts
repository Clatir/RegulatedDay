/**
 * The cost of a begun block changed from a minute on (D501, rule A): the window of the tile writes `energy.cost` to the day's log – a
 * fact, never a change of what is past. A block counts as it began (`block.start.planned`: category, variant, own cost; without them –
 * an older start – as planned); from the minute of each change to its end it costs what the change says (null – its variant's or
 * category's again). Minutes before a change stay as they were counted, so the log counted again at any later moment gives the same
 * past. One rule for the energy (`energy.ts`: `Kind`, `costOf`), the calibration's evidence and the tile's label (`begunCosts`).
 */
import { baseCosts, type BlockCosts } from '../model/blockCosts'
import type { Costs } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type LogEvent, type StartPlanned } from '../model/events'
import type { BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import type { BlockFact } from './facts'
import { idxOf, type Grid } from './grid'

/** A change of a block's cost: from the minute `at` (index) on, `costs` (null – no own cost any more). */
export interface CostChange {
  at: number
  costs: Costs | null
}

type CostEvent = Extract<LogEvent, { k: 'energy.cost' }>

/**
 * The changes of every block, in the order they apply: by their minute, then by the log's full order (`compareEvents`) – the last of a
 * minute wins, whatever the order the logs of the computers arrived in.
 */
export function costChangesOf(events: readonly AnyEvent[], grid: Grid): Map<string, CostChange[]> {
  const list = events.filter((e): e is CostEvent & AnyEvent => isKnown(e) && e.k === 'energy.cost')
  const at = new Map(list.map((e) => [e, idxOf(grid, e.at)]))
  const out = new Map<string, CostChange[]>()
  for (const e of list.sort((a, b) => at.get(a)! - at.get(b)! || compareEvents(a, b))) {
    let changes = out.get(e.block)
    if (!changes) out.set(e.block, (changes = []))
    changes.push({ at: at.get(e)!, costs: e.costs })
  }
  return out
}

/** The block's own cost at minute k: the last change from k or before, else what its start wrote (`own`). */
export function ownAt(changes: readonly CostChange[], k: number, own: Costs | null): Costs | null {
  for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.at <= k) return changes[i]!.costs
  return own
}

/** What a block's cost counts from: its start's category, variant and own cost (`block.start.planned`), else the plan's (an older start). */
export function startCostOf(b: Pick<BlockInfo, 'categoryId' | 'variantId' | 'costs'>, p: StartPlanned | null | undefined): { cat: string; variant: string | null; own: Costs | null } {
  return { cat: p?.categoryId ?? b.categoryId, variant: p ? p.variantId : b.variantId, own: p?.costs !== undefined ? p.costs : b.costs }
}

/**
 * What a block costs at minute k (now, by default) as the engine counts it – for the tile of a begun block (D501): from its start and its
 * changes; `base` – its variant's or category's in the settings of now (what „Jak kategoria” goes back to).
 */
export function begunCosts(
  ctx: Pick<DayContext, 'events' | 'snapshot'>,
  state: Pick<DayState, 'facts' | 'grid' | 'settings' | 'now'>,
  b: BlockInfo,
  /** The day's changes (`costChangesOf`) – counted once for every tile of the day. */
  all: ReadonlyMap<string, readonly CostChange[]> = costChangesOf(ctx.events, state.grid),
  k = state.now
): BlockCosts {
  const start = startCostOf(b, state.facts.blocks.get(b.id)?.planned)
  const changes = all.get(b.id)
  const own = changes ? ownAt(changes, k, start.own) : start.own
  const base = baseCosts(state.settings.categories, start.cat, start.variant, ctx.snapshot.settings.categories[start.cat] ?? b.rules)
  return { costs: own ?? base, base, own: own != null }
}

/**
 * The tile's cost may be changed (D501): on a day not gone by, a block not taken off before it began (parked, cancelled) – one not begun
 * while its time has not passed (its own cost in the plan), one begun until it ends (from now on, `energy.cost`). An ended block only tells.
 */
export function costEditable(f: Pick<BlockFact, 'startedAt' | 'endedAt' | 'parkedAt' | 'cancelledAt'> | undefined, dayGone: boolean, passed: boolean): boolean {
  if (dayGone) return false
  if (f?.startedAt != null) return f.endedAt == null
  return f?.parkedAt == null && f?.cancelledAt == null && !passed
}
