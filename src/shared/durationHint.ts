/**
 * „Długość z historii” (N6, D569, D625): the hint by „Długość” of a block and „Szacunek” of a sprawa – „zwykle trwa 45 min · Przyjmij” –
 * when the median of the minutes the blocks of the subcategory really ran (finished, the last 90 days – `engine/durationHistory.ts`)
 * rounded to 5 min differs from the value by both thresholds of the settings: a share of the value (20 %) and minutes (10). Nothing
 * changes by itself: „Przyjmij” saves the median as a change of the field would. Pure.
 */
import { durationLabel } from './format'
import { REQUEST_CATEGORY, type CategoryRules } from './model/categories'
import { DEFAULT_TASK_CATEGORY, type RequestRecord } from './model/requests'
import type { GeneralSettings } from './model/rd'
import { DURATION_HISTORY_DAYS, type DurationHistory } from './engine/durationHistory'

/** The thresholds of the settings (D569): how many blocks at least, and how far from the value the median must be – in % and minutes. */
export interface DurationHintRules {
  blocks: number
  pct: number
  min: number
}

export interface DurationHint {
  /** The median rounded to 5 min – what „Przyjmij” puts in the field. */
  minutes: number
  /** How many blocks it is the median of. */
  count: number
}

/** The thresholds in force; null – the hints are switched off. */
export function hintRulesOf(g: Pick<GeneralSettings, 'durationHints' | 'durationHintBlocks' | 'durationHintPct' | 'durationHintMin'>): DurationHintRules | null {
  return g.durationHints ? { blocks: g.durationHintBlocks, pct: g.durationHintPct, min: g.durationHintMin } : null
}

/** The median (an even count – the mean of the two in the middle); null for none. */
export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Whole minutes rounded to 5 (as the axis' grid), never under 5 – the shortest length of a block. */
export const roundToFive = (minutes: number): number => Math.max(5, Math.round(minutes / 5) * 5)

/**
 * The hint for a value: the median of the samples rounded to 5 min, when there are at least `rules.blocks` of them and it differs from
 * the value by at least `rules.pct` % of it and at least `rules.min` minutes (both). Null – no hint (also once the value is the median).
 */
export function durationHint(samples: readonly number[] | undefined, valueMin: number | null | undefined, rules: DurationHintRules | null): DurationHint | null {
  if (!rules || !samples || samples.length < rules.blocks || valueMin == null || !(valueMin > 0)) return null
  const minutes = roundToFive(median(samples)!)
  const diff = Math.abs(minutes - valueMin)
  if (diff < rules.min || diff * 100 < rules.pct * valueMin) return null
  return { minutes, count: samples.length }
}

/** The samples of a block's subcategory. */
export const blockSamples = (h: DurationHistory | null, categoryId: string): readonly number[] | undefined => h?.byCategory[categoryId]

/**
 * The samples a sprawa's „Szacunek” is compared with – the subcategory of the block it would be planned in (`caseBlock`): a task's
 * category (gone or none – „Inne”), a request's – the blocks of requests that held one request (a block of several is no measure of
 * one); without that subcategory – none.
 */
export function caseSamples(h: DurationHistory | null, r: Pick<RequestRecord, 'kind' | 'categoryId'>, rules: Readonly<Record<string, CategoryRules>>): readonly number[] | undefined {
  if (!h) return undefined
  if (r.kind !== 'task') return rules[REQUEST_CATEGORY] ? h.oneRequest : undefined
  return h.byCategory[r.categoryId && rules[r.categoryId] ? r.categoryId : DEFAULT_TASK_CATEGORY]
}

/** „zwykle trwa 45 min” (the length as everywhere – `durationLabel`). */
export const hintText = (h: DurationHint): string => `zwykle trwa ${durationLabel(h.minutes)}`

/** The title and the name for a screen reader: „mediana z 7 bloków w 90 dniach”. */
export const hintTitle = (h: DurationHint): string => `mediana z ${h.count} ${h.count === 1 ? 'bloku' : 'bloków'} w ${DURATION_HISTORY_DAYS} dniach`
