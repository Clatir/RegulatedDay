/**
 * The cost per hour a block has (D501): its own (`PlanBlock.costs`), else its variant's, else its category's – the one rule of the
 * engine (`energy.ts`: `costOf`) and of the tile's label; plus how the three numbers are told.
 */
import { costsOf, type CategoryRules, type Costs, type Pool } from './categories'
import { RANGES } from './settings'

/** The smallest and the largest cost a pool may have – the schema's range (`RANGES.cost`; the field of a block, `costsFrom`, reads the same). */
export const [COST_MIN, COST_MAX] = RANGES.cost
/** A pool's cost the schema takes: a whole number in `RANGES.cost`. */
export const isPoolCost = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= COST_MIN && (v as number) <= COST_MAX

/** What a block costs: `costs` – what counts, `base` – the variant's or category's (what „Jak kategoria” goes back to), `own` – the block has its own. */
export interface BlockCosts {
  costs: Costs
  base: Costs
  own: boolean
}

/**
 * The cost on a tile (D501): `edit` – its window may be opened (`costEditable`: a block not begun – into the plan; begun and not ended – from
 * now on, `energy.cost`; never on a day gone by).
 */
export type TileCost = BlockCosts & { edit: boolean }

/**
 * A block's cost without its own: `costsOf(categories[category] ?? fallback, variant)` – the settings' category (the day's), the rules the
 * block was counted with when the settings do not know it any more. The one base of the engine (`energy.ts`: `costOf` – `own ?? base`) and
 * of the tile (`blockCosts`); positional, so the engine's minute loops make no object for it.
 */
export function baseCosts(categories: Readonly<Record<string, CategoryRules | undefined>>, categoryId: string, variantId: string | null, fallback: CategoryRules): Costs {
  return costsOf(categories[categoryId] ?? fallback, variantId)
}

/** The costs of a block: `own ?? baseCosts(…)`. */
export function blockCosts(b: { costs: Costs | null; categoryId: string; variantId: string | null }, categories: Readonly<Record<string, CategoryRules | undefined>>, fallback: CategoryRules): BlockCosts {
  const base = baseCosts(categories, b.categoryId, b.variantId, fallback)
  return { costs: b.costs ?? base, base, own: b.costs != null }
}

/** A number with a true minus (U+2212) – `−1`, never `-1` – so that the three of them read as a column of figures. */
export const costNumber = (n: number): string => (n < 0 ? `−${-n}` : String(n))

/** The three numbers in the order of the pools: „3 · 1 · 1”; `tight` – no spaces („3·1·1”, the week's tiles). */
export const costsText = (c: Costs, tight = false): string => [c.head, c.emotions, c.senses].map(costNumber).join(tight ? '·' : ' · ')

/** One pool's cost one step up or down, kept in `RANGES.cost` (−5…5; a step past the end changes nothing). */
export const costStep = (c: Costs, pool: Pool, by: 1 | -1): Costs => ({ ...c, [pool]: Math.max(COST_MIN, Math.min(COST_MAX, c[pool] + by)) })

export const sameCosts = (a: Costs, b: Costs): boolean => a.head === b.head && a.emotions === b.emotions && a.senses === b.senses
