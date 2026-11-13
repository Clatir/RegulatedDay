/**
 * „Sprawy” – priorities (HKU3: D450), pure: the matrix's layout and what a drop between its fields changes, and the morning plan's
 * line of the sprawy „Ważne i pilne” that have no place in today's plan. Not the day's engine – nothing here moves a block or
 * the day's counts (`computeDay` stays as it is), and nothing blocks (D72).
 */
import { plural } from '../format'
import type { PlanBlock } from '../model/plan'
import { PRIORITIES, type CaseList, type Priority } from '../model/requests'
import { caseCompare, isDone, type CaseItem, type CasePatch } from './cases'

// ------------------------------------------------------------------ the matrix

/**
 * The matrix 2×2 as the classic one stands (D450): „ważne” down the page (the top row important), „pilne” across it (the left
 * column urgent) – P1 „Ważne i pilne” and P2 „Ważne” above, P3 „Pilne” and P4 „Ani to, ani to” below.
 */
export const MATRIX_ROWS: ReadonlyArray<readonly [Priority, Priority]> = [
  ['p1', 'p2'],
  ['p3', 'p4']
]
/** The headings of the axes: across (urgent, not urgent) and down (important, not important). */
export const MATRIX_COLUMNS = ['Pilne', 'Niepilne'] as const
export const MATRIX_SIDES = ['Ważne', 'Nieważne'] as const

/** A field a sprawa is dropped on: a quarter or the field „Bez priorytetu” (`none`). */
export type MatrixField = Priority | 'none'

/** The lists a filter of the matrix picks (`all` – every list not done); the order the filter is shown in (D450). */
export type MatrixFilter = Exclude<CaseList, 'done'> | 'all'
export const MATRIX_FILTERS: readonly MatrixFilter[] = ['inbox', 'today', 'week', 'someday', 'all']
export const isMatrixFilter = (v: unknown): v is MatrixFilter => (MATRIX_FILTERS as readonly unknown[]).includes(v)

export interface Matrix {
  /** The sprawy of each quarter, in the order of `caseCompare`. */
  cells: Record<Priority, CaseItem[]>
  /** The sprawy without a priority – the field under the matrix. */
  none: CaseItem[]
}

/** The matrix of the sprawy not done on the lists the filter picks – each field in the order of the lists (due dates first). */
export function matrixOf(items: readonly CaseItem[], filter: MatrixFilter = 'all'): Matrix {
  const open = items.filter((x) => x.list !== 'done' && (filter === 'all' || x.list === filter)).sort(caseCompare)
  const cells = Object.fromEntries(PRIORITIES.map((p) => [p, open.filter((x) => x.record.priority === p)])) as Record<Priority, CaseItem[]>
  return { cells, none: open.filter((x) => x.record.priority == null) }
}

/** How many sprawy not done each filter of the matrix leaves (the number by its chip). */
export const matrixCounts = (items: readonly CaseItem[]): Record<MatrixFilter, number> =>
  Object.fromEntries(MATRIX_FILTERS.map((f) => [f, items.filter((x) => x.list !== 'done' && (f === 'all' || x.list === f)).length])) as Record<MatrixFilter, number>

/** The priority a field stands for. */
export const fieldPriority = (f: MatrixField): Priority | null => (f === 'none' ? null : f)

/**
 * What dropping a sprawa on a field changes (D450): one patch, `changeCase` writes it in one go; null – nothing (it is there
 * already, or it is not a sprawa not done).
 */
export function dropPatch(x: Pick<CaseItem, 'list' | 'record'> | undefined, field: MatrixField): CasePatch | null {
  if (!x || x.list === 'done') return null
  const priority = fieldPriority(field)
  return x.record.priority === priority ? null : { priority }
}

// ------------------------------------------------------------------ the morning plan

/**
 * The sprawy „Ważne i pilne” of „Dziś” and „W tym tygodniu” (not done) when none of them has a place in today's plan (D450 to the
 * letter: „a żadna nie ma dziś bloku”) – all of them, in the order of the lists; when any has one (a block of its own, a place in a
 * block of requests, „zaplanowane” today) – none: no line.
 */
export function priorityWithoutPlace(items: readonly CaseItem[], blocks: readonly Pick<PlanBlock, 'task' | 'requests'>[], today: string): CaseItem[] {
  const inPlan = new Set(blocks.flatMap((b) => [...(b.task ? [b.task] : []), ...b.requests]))
  const urgent = items.filter((x) => x.record.priority === 'p1' && !isDone(x.record) && (x.list === 'today' || x.list === 'week'))
  if (urgent.some((x) => inPlan.has(x.record.id) || x.scheduled?.day === today)) return []
  return urgent.sort(caseCompare)
}

/** The morning plan's line (D450): „3 sprawy ważne i pilne bez miejsca w planie”; null – none to say (no line). */
export const priorityLine = (n: number): string | null =>
  n > 0 ? `${n} ${plural(n, 'sprawa ważna i pilna', 'sprawy ważne i pilne', 'spraw ważnych i pilnych')} bez miejsca w planie` : null
