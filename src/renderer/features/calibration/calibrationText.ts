/**
 * The review of the calibration in words (spec „Kalibracja”): a proposal of time – the median of real ÷ planned and the
 * templates' blocks that change; a proposal of cost – the costs an hour before and after, from how many days; the felt
 * cost of the ritual beside it. Names of categories, variants and templates – never ids. Pure.
 */
import type { CostProposal, FeltCounts, TimeProposal } from '@shared/engine/calibration'
import { countLabel, durationLabel, formatNumber } from '@shared/format'
import type { Costs } from '@shared/model/categories'
import { categoryName, type RdFile } from '@shared/model/rd'
import type { Template } from '@shared/model/plan'
import type { RulesSettings } from '@shared/model/settings'

const POOLS: Array<[keyof Costs, string]> = [
  ['head', 'głowa'],
  ['emotions', 'emocje'],
  ['senses', 'bodźce']
]

export function timeTitle(p: TimeProposal, rd: Pick<RdFile, 'categories'>): string {
  return `${categoryName(rd, p.category)}: realny czas to ×${formatNumber(p.multiplier, 2)} planowanego (${countLabel(p.samples, 'blok', 'bloki', 'bloków')})`
}

/** „Dzień zwykły: Analiza 60 min → 75 min” for every block that changes. */
export function timeLines(p: TimeProposal, templates: readonly Template[]): string[] {
  return p.blocks.map((b) => `${templates.find((t) => t.id === b.template)?.name ?? 'szablon usunięty'}: ${durationLabel(b.fromMin)} → ${durationLabel(b.toMin)}`)
}

export function costTitle(p: CostProposal, rd: Pick<RdFile, 'categories'>, settings: RulesSettings): string {
  const variant = p.variant ? settings.categories[p.category]?.variants.find((v) => v.id === p.variant)?.name ?? 'wariant usunięty' : null
  return `${categoryName(rd, p.category)}${variant ? ` – ${variant}` : ''}: koszt na godzinę (${countLabel(p.days, 'dzień', 'dni', 'dni')}, ${durationLabel(p.hours * 60)})`
}

/** „głowa 2 → 3 · emocje 1 · bodźce 0 → 1” */
export function costLine(p: CostProposal): string {
  return POOLS.map(([k, name]) => (p.from[k] === p.to[k] ? `${name} ${p.from[k]}` : `${name} ${p.from[k]} → ${p.to[k]}`)).join(' · ')
}

/** The felt cost of a category from the ritual (D319 – by category: beside a variant's proposal it says so), or null – none given. */
export function feltLine(felt: FeltCounts, category: string, ofVariant = false): string | null {
  const f = felt[category]
  if (!f || f.lighter + f.usual + f.heavier === 0) return null
  return `odczuwany w rytuale${ofVariant ? ' (cała kategoria)' : ''}: lżej ${f.lighter} · jak zwykle ${f.usual} · ciężej ${f.heavier}`
}
