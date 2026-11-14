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

/**
 * What names a block (`NamedBlock`) of a block of the plan or of what names one – those fields alone, nothing else of it (its hour,
 * its steps …): the one list of them for the columns of „Tydzień”, the month and `namedById`.
 */
export function namedOfPlan(b: NamedBlock): NamedBlock {
  const out: NamedBlock = { categoryId: b.categoryId, variantId: b.variantId, routine: b.routine, requests: b.requests, note: b.note }
  if (b.origin !== undefined) out.origin = b.origin
  if (b.sourceId !== undefined) out.sourceId = b.sourceId
  if (b.name !== undefined) out.name = b.name
  if (b.task !== undefined) out.task = b.task
  return out
}

/** What names the blocks of a day by id (`namingOf` in engine/context.ts builds it from the day and its facts). */
export interface NamingDay {
  plan: readonly PlanBlock[]
  /** The snapshot's entry of a block (also one cancelled for the day, a session the answer „tak” added); null: none. */
  snapshotBlock: (id: string) => PlanBlock | null
  /**
   * What a block's start wrote of its plan (`name`, `task`, `routine`, `requests` – what named it then, D431, T1024; absent – an
   * older start: the snapshot's); null or undefined: it has not begun.
   */
  planned: (id: string) => { categoryId: string; variantId: string | null; name?: string | null; task?: string | null; routine?: string | null; requests?: string[] } | null | undefined
}

/**
 * What names a block of the day by its id: its entry in the plan. One not in the plan (taken out after it began – D336 –
 * or begun outside it): its category, variant, own name, task, routine and requests as its start wrote them (spec: a later
 * edit never changes them; all but the category and variant since 1.19.0 – D431, T1024, also of a block added by hand, none
 * in the snapshot), where it came from and its note – and what the start did not write – from the snapshot's entry while
 * that is the same block (the same category – a session „Sesja NY”, D338); one that has not begun – the snapshot's entry;
 * null without any of them.
 */
export function namedById(id: string, day: NamingDay): NamedBlock | null {
  const p = day.plan.find((b) => b.id === id)
  if (p) return p
  const snap = day.snapshotBlock(id)
  const planned = day.planned(id)
  if (!planned || typeof planned.categoryId !== 'string' || !planned.categoryId) return snap
  const own: Partial<NamedBlock> = {}
  if (planned.name !== undefined) own.name = planned.name
  if (planned.task !== undefined) own.task = planned.task
  if (planned.routine !== undefined) own.routine = planned.routine
  if (planned.requests !== undefined) own.requests = planned.requests
  const started = namedOf({ categoryId: planned.categoryId, variantId: planned.variantId ?? null }, own)
  return snap?.categoryId === planned.categoryId ? { ...namedOfPlan(snap), categoryId: started.categoryId, variantId: started.variantId, ...own } : started
}

/** The name of a block of the day by its id (`namedById`), the same on the axis, in the ritual, the CSV and the bar; „blok” when nothing names it. */
export function nameById(id: string, day: NamingDay, n: Names): string {
  const b = namedById(id, day)
  return b ? blockName(b, n) : 'blok'
}

export function blockName(b: NamedBlock, n: Names): string {
  // Its own name (a class imported from the PDF of „zjazdy”: „<przedmiot> · <forma>”, D357).
  if (b.name) return b.name
  // A block of the session layer is „Sesja <name>” („Sesja NY”, D338); a category block of the template or added by hand
  // stays the category's „Sesja tradingowa”.
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
