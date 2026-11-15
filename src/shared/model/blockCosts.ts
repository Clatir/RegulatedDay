/**
 * The cost per hour a block has (D501, D512): its own (`PlanBlock.costs`), else its routine's (`Routine.costs`), else its variant's, else
 * its category's – the one rule of the engine (`energy.ts`: `costOf`) and of the tile's label; plus how the four numbers are told (D524).
 */
import { POOLS, costsOf, variantHasCosts, type CategoryRules, type Costs, type LoggedPools, type Pool } from './categories'
import { RANGES } from './settings'

/** The smallest and the largest cost a pool may have – the schema's range (`RANGES.cost`; the field of a block, `costsFrom`, reads the same). */
export const [COST_MIN, COST_MAX] = RANGES.cost
/** A pool's cost the schema takes: a whole number in `RANGES.cost`. */
export const isPoolCost = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= COST_MIN && (v as number) <= COST_MAX

/**
 * The costs of the pools as a file or an event holds them: each `isPoolCost`, else none (null) – never a part of them. No body (D520 – a
 * file or an event of a version before it, ≤ 1.26): `body` (T1520 – `startingBody` of what it is the cost of); a body that is there and no
 * cost – none.
 */
export function poolCostsFrom(v: unknown, body = 0): Costs | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const { head, emotions, senses } = r
  const b = r.body === undefined ? body : r.body
  return isPoolCost(head) && isPoolCost(emotions) && isPoolCost(senses) && isPoolCost(b) ? { head, emotions, senses, body: b } : null
}

/** Costs an event holds (checked by `parseEvent`) with the body: one written before it (D520, ≤ 1.26) – `body` (T1520); null – none. */
export const withBody = (c: LoggedPools<number> | null | undefined, body: number): Costs | null => (c == null ? null : c.body === undefined ? { ...c, body } : (c as Costs))

/**
 * What a block costs: `costs` – what counts, `base` – the routine's, variant's or subcategory's (what „Jak rutyna” / „Jak wariant” /
 * „Jak podkategoria” goes back to), `own` – the block has its own; `baseFrom` – where `base` comes from: 'routine' (D512), 'variant' (its own
 * cost, D510), none – the subcategory's.
 */
export interface BlockCosts {
  costs: Costs
  base: Costs
  own: boolean
  baseFrom?: 'routine' | 'variant'
}

/** Where a block's base cost comes from (D510, D512): its routine's, its variant's own cost, or (none) its subcategory's – told beside `baseCosts`, never in its place. */
export function baseFromOf(categories: Readonly<Record<string, CategoryRules | undefined>>, categoryId: string, variantId: string | null, fallback: CategoryRules, routine: Costs | null): Pick<BlockCosts, 'baseFrom'> {
  if (routine) return { baseFrom: 'routine' }
  return variantHasCosts(categories[categoryId] ?? fallback, variantId) ? { baseFrom: 'variant' } : {}
}

/**
 * The cost on a tile (D501): `edit` – its window may be opened (`costEditable`: a block not begun – into the plan; begun and not ended – from
 * now on, `block.cost`; never on a day gone by).
 */
export type TileCost = BlockCosts & { edit: boolean }

/**
 * A block's cost without its own (D512): its routine's (`routine` – the cost of the block's routine, null: none or the routine has none),
 * else `costsOf(categories[category] ?? fallback, variant)` – the variant's, else the settings' category (the day's), the rules the block was
 * counted with when the settings do not know it any more. The one base of the engine (`energy.ts`: `costOf` – `own ?? base`) and of the tile
 * (`blockCosts`); positional, so the engine's minute loops make no object for it.
 */
export function baseCosts(categories: Readonly<Record<string, CategoryRules | undefined>>, categoryId: string, variantId: string | null, fallback: CategoryRules, routine: Costs | null): Costs {
  return routine ?? costsOf(categories[categoryId] ?? fallback, variantId)
}

/** The costs of a block: `own ?? baseCosts(…)` – `routineCosts` the cost of its routine (`BlockInfo.routineCosts`; undefined – not known now: none). */
export function blockCosts(
  b: { costs: Costs | null; categoryId: string; variantId: string | null; routineCosts: Costs | null | undefined },
  categories: Readonly<Record<string, CategoryRules | undefined>>,
  fallback: CategoryRules
): BlockCosts {
  const routine = b.routineCosts ?? null
  const base = baseCosts(categories, b.categoryId, b.variantId, fallback, routine)
  return { costs: b.costs ?? base, base, own: b.costs != null, ...baseFromOf(categories, b.categoryId, b.variantId, fallback, routine) }
}

/** A number with a true minus (U+2212) – `−1`, never `-1` – so that the four of them read as a column of figures. */
export const costNumber = (n: number): string => (n < 0 ? `−${-n}` : String(n))

/**
 * The four numbers in the order of the pools (D524: G · E · B · C, the body too when it is 0): „3 · 1 · 1 · 0”; `tight` – no spaces
 * („3·1·1·0”, the week's tiles).
 */
export const costsText = (c: Costs, tight = false): string => POOLS.map((p) => costNumber(c[p])).join(tight ? '·' : ' · ')

/** One pool's cost one step up or down, kept in `RANGES.cost` (−5…5; a step past the end changes nothing). */
export const costStep = (c: Costs, pool: Pool, by: 1 | -1): Costs => ({ ...c, [pool]: Math.max(COST_MIN, Math.min(COST_MAX, c[pool] + by)) })

export const sameCosts = (a: Costs, b: Costs): boolean => a.head === b.head && a.emotions === b.emotions && a.senses === b.senses && a.body === b.body
