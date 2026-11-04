/**
 * How a block is named (spec „W interfejsie tylko prawdziwe nazwy”): its routine, the people of its requests, its
 * variant or its category – never an id. The main window and the widget (the main process) name it the same way.
 */
import { categoryName, personName, type RdFile } from './model/rd'
import type { PlanBlock } from './model/plan'
import type { RequestRecord } from './model/requests'
import type { Routine } from './model/routines'
import type { RulesSettings } from './model/settings'

export interface Names {
  rd: RdFile
  settings: RulesSettings
  routines: readonly Routine[]
  requests: readonly RequestRecord[]
}

/** What names a block: its plan fields, and for a block of the session layer also where it comes from (D338). */
export type NamedBlock = Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'requests' | 'note'> & Partial<Pick<PlanBlock, 'origin' | 'sourceId'>>

/**
 * The naming input of a block known by its info or facts only (begun outside the plan, a row of the CSV, a variant's
 * list): what names it – category, variant, where it comes from (D338) – and nothing of a routine or requests unless given.
 */
export const namedOf = (b: { categoryId: string; variantId: string | null; origin?: PlanBlock['origin'] | undefined; sourceId?: string | null | undefined }, more: Partial<NamedBlock> = {}): NamedBlock => ({
  categoryId: b.categoryId,
  variantId: b.variantId,
  origin: b.origin,
  sourceId: b.sourceId,
  routine: null,
  requests: [],
  note: '',
  ...more
})

export function blockName(b: NamedBlock, n: Names): string {
  // A block of the session layer is „Sesja <name>” („Sesja NY”, D338); the second shift and a category block added by
  // hand stay the category's „Sesja tradingowa”.
  if (b.origin === 'session' && b.sourceId) {
    const s = n.settings.sessions.find((x) => x.id === b.sourceId)
    if (s) return `Sesja ${s.name}`
  }
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
