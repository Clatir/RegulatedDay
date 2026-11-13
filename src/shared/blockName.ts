/**
 * How a block is named (spec „W interfejsie tylko prawdziwe nazwy”): its task's title (D384), its routine, the people of
 * its requests, its variant or its category – never an id. The main window and the widget (the main process) name it the
 * same way. `Names.requests` are the records of „Sprawy” – the tasks and the requests.
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

/** What names a block: its plan fields, its own name (D357), and for a block of the session layer also where it comes from (D338). */
export type NamedBlock = Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'requests' | 'note'> & Partial<Pick<PlanBlock, 'origin' | 'sourceId' | 'name' | 'task'>>

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

/** What names the blocks of a day by id (`namingOf` in engine/context.ts builds it from the day and its facts). */
export interface NamingDay {
  plan: readonly PlanBlock[]
  /** The snapshot's entry of a block (also one cancelled for the day, a session the answer „tak” added); null: none. */
  snapshotBlock: (id: string) => PlanBlock | null
  /** What a block's start wrote of its plan; null or undefined: it has not begun. */
  planned: (id: string) => { categoryId: string; variantId: string | null } | null | undefined
}

/**
 * What names a block of the day by its id: its entry in the plan. One not in the plan (taken out after it began – D336 –
 * or begun outside it): its category and variant as its start wrote them (spec: a later edit never changes them), where it
 * came from, its own name (D431), its routine and requests from the snapshot's entry while that is the same block (the same
 * category – a session „Sesja NY”, D338); one that has not begun – the snapshot's entry; null without any of them.
 */
export function namedById(id: string, day: NamingDay): NamedBlock | null {
  const p = day.plan.find((b) => b.id === id)
  if (p) return p
  const snap = day.snapshotBlock(id)
  const planned = day.planned(id)
  if (!planned || typeof planned.categoryId !== 'string' || !planned.categoryId) return snap
  const started = namedOf({ categoryId: planned.categoryId, variantId: planned.variantId ?? null })
  return snap?.categoryId === planned.categoryId ? { ...started, origin: snap.origin, sourceId: snap.sourceId, name: snap.name, routine: snap.routine, requests: snap.requests, task: snap.task, note: snap.note } : started
}

/** The name of a block of the day by its id (`namedById`), the same on the axis, in the ritual, the CSV and the bar; „blok” when nothing names it. */
export function nameById(id: string, day: NamingDay, n: Names): string {
  const b = namedById(id, day)
  return b ? blockName(b, n) : 'blok'
}

export function blockName(b: NamedBlock, n: Names): string {
  // Its own name (a class imported from the PDF of „zjazdy”: „<przedmiot> · <forma>”, D357).
  if (b.name) return b.name
  // A block of the session layer is „Sesja <name>” („Sesja NY”, D338); the second shift and a category block added by
  // hand stay the category's „Sesja tradingowa”.
  if (b.origin === 'session' && b.sourceId) {
    const s = n.settings.sessions.find((x) => x.id === b.sourceId)
    if (s) return `Sesja ${s.name}`
  }
  // A task's block (D384): the task's title – as „Sprawy” have it now (a task gone: the category).
  if (b.task) {
    const t = n.requests.find((x) => x.id === b.task)
    if (t?.title) return t.title
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

/**
 * What a block with its own name (D430) is besides it: the name it would have without one (its task, routine, variant or
 * category) – said small beside its hours on its tile („09:00–09:45 · Analiza”). Null: no name of its own, or the same
 * words (said once).
 */
export function blockKind(b: NamedBlock, n: Names): string | null {
  if (!b.name) return null
  const kind = blockName({ ...b, name: null }, n)
  return kind === b.name ? null : kind
}
