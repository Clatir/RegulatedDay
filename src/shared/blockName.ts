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
