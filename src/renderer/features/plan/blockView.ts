/**
 * How a block is named and coloured in the main window (spec „W interfejsie tylko prawdziwe nazwy”): its category or
 * variant, its routine, the people of its requests; the category's colour or its class's. Never an id.
 */
import { CLASS_COLORS, categoryName, personName, type RdFile } from '@shared/model/rd'
import type { PlanBlock } from '@shared/model/plan'
import type { RequestRecord } from '@shared/model/requests'
import type { Routine } from '@shared/model/routines'
import type { RulesSettings } from '@shared/model/settings'

export interface Names {
  rd: RdFile
  settings: RulesSettings
  routines: readonly Routine[]
  requests: readonly RequestRecord[]
}

export function blockName(b: Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'requests' | 'note'>, n: Names): string {
  if (b.routine) {
    const r = n.routines.find((x) => x.id === b.routine)
    if (r) return r.name
  }
  if (b.requests.length) {
    const people = b.requests.map((id) => personName(n.rd, n.requests.find((r) => r.id === id)?.person ?? null))
    return `Prośby: ${[...new Set(people)].join(', ')}`
  }
  const rules = n.settings.categories[b.categoryId]
  const variant = b.variantId ? rules?.variants.find((v) => v.id === b.variantId) : undefined
  return variant?.name ?? categoryName(n.rd, b.categoryId)
}

export function blockColor(categoryId: string, n: Pick<Names, 'rd' | 'settings'>): string {
  const meta = n.rd.categories[categoryId]
  if (meta?.color) return meta.color
  const cls = n.settings.categories[categoryId]?.cls ?? 'work'
  return CLASS_COLORS[cls]
}

/** The marks a block shows beside its name. */
export function blockMarks(b: PlanBlock, extra: { afterWork?: boolean; fromYesterday?: boolean } = {}): string[] {
  const out: string[] = []
  if (b.tag === 'secondShift') out.push('druga zmiana')
  if (b.tag === 'weeklyAnalysis') out.push('analiza tygodniowa')
  if (extra.afterWork) out.push('po pracy')
  if (b.fixed) out.push('stały')
  if (b.background) out.push('w tle')
  if (extra.fromYesterday) out.push('z wczoraj')
  if (b.moves > 0) out.push(`przeniesiony ${b.moves}×`)
  return out
}

/** The categories you can choose for a block (not archived), by class and name. */
export function categoryOptions(n: Pick<Names, 'rd' | 'settings'>, keep?: string): Array<{ value: string; label: string }> {
  const order = { work: 0, life: 1, free: 2 }
  return Object.entries(n.settings.categories)
    .filter(([id]) => !n.rd.categories[id]?.archived || id === keep)
    .map(([id, r]) => ({ id, r, name: categoryName(n.rd, id) }))
    .sort((a, b) => order[a.r.cls] - order[b.r.cls] || a.name.localeCompare(b.name, 'pl'))
    .map(({ id, name }) => ({ value: id, label: name }))
}

export const CLASS_NAMES = { work: 'praca', life: 'życie i opieka', free: 'wolne' } as const
