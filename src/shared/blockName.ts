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

/** Where a block comes from: its own fields, for a block outside the plan what its start wrote (`BlockInfo.named`). */
type Origin = { origin?: PlanBlock['origin'] | undefined; sourceId?: string | null | undefined; named?: { origin: PlanBlock['origin']; sourceId: string | null } | undefined }

/**
 * The naming input of a block known by its info or facts only (begun outside the plan, a row of the CSV, a variant's
 * list): what names it – category, variant, where it comes from (D338; a block taken out of the plan after it began by
 * what its start wrote, D336) – and nothing of a routine or requests unless given.
 */
export const namedOf = (b: { categoryId: string; variantId: string | null } & Origin, more: Partial<NamedBlock> = {}): NamedBlock => ({
  categoryId: b.categoryId,
  variantId: b.variantId,
  origin: b.named ? b.named.origin : b.origin,
  sourceId: b.named ? b.named.sourceId : b.sourceId,
  routine: null,
  requests: [],
  note: '',
  ...more
})

/**
 * The name of a block only the log knows – begun outside the plan, or taken out of it after it began (D336) – on the axis
 * of the day and in the ritual: its category, a block of the session layer „Sesja <nazwa>” (D338) by where its start says
 * it came from (a start before 1.0.9 says nothing: its category).
 */
export const loggedBlockName = (b: { categoryId: string } & Origin, n: Names): string => blockName(namedOf({ ...b, variantId: null }), n)

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
