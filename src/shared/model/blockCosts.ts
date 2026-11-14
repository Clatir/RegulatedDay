/**
 * The cost per hour a block has (D501): its own (`PlanBlock.costs`), else its variant's, else its category's – the one rule of the
 * engine (`energy.ts`: `costOf`) and of the tile's label; plus how the three numbers are told.
 */
import { costsOf, type CategoryRules, type Costs, type Pool } from './categories'

/** The smallest and the largest cost a pool may have (the field of a block reads −5…5, `costsFrom`). */
export const COST_MIN = -5
export const COST_MAX = 5

/** What a block costs: `costs` – what counts, `base` – the variant's or category's (what „Jak kategoria” goes back to), `own` – the block has its own. */
export interface BlockCosts {
  costs: Costs
  base: Costs
  own: boolean
}

/** The cost on a tile (D501): `edit` – its window may be opened (the block is in the plan, not begun, not taken off, its day not gone by). */
export type TileCost = BlockCosts & { edit: boolean }

/**
 * The costs of a block: `own ?? costsOf(categories[category] ?? fallback, variant)` – the settings' category (the day's), the rules the
 * block was counted with when the settings do not know it any more.
 */
export function blockCosts(b: { costs: Costs | null; categoryId: string; variantId: string | null }, categories: Readonly<Record<string, CategoryRules | undefined>>, fallback: CategoryRules): BlockCosts {
  const base = costsOf(categories[b.categoryId] ?? fallback, b.variantId)
  return { costs: b.costs ?? base, base, own: b.costs != null }
}

/** A number with a true minus (U+2212) – `−1`, never `-1` – so that the three of them read as a column of figures. */
export const costNumber = (n: number): string => (n < 0 ? `−${-n}` : String(n))

/** The three numbers in the order of the pools: „3 · 1 · 1”; `tight` – no spaces („3·1·1”, the week's tiles). */
export const costsText = (c: Costs, tight = false): string => [c.head, c.emotions, c.senses].map(costNumber).join(tight ? '·' : ' · ')

/** One pool's cost one step up or down, kept in −5…5 (a step past the end changes nothing). */
export const costStep = (c: Costs, pool: Pool, by: 1 | -1): Costs => ({ ...c, [pool]: Math.max(COST_MIN, Math.min(COST_MAX, c[pool] + by)) })

export const sameCosts = (a: Costs, b: Costs): boolean => a.head === b.head && a.emotions === b.emotions && a.senses === b.senses
