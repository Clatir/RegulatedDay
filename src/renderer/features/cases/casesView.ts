/**
 * The view of the page „Sprawy” – „Listy” or „Macierz” (HKU3, D450) – remembered by this computer in the window's own storage
 * (nothing in the data folder: a habit of the window, as `plan/lastCategory.ts`). Storage that cannot be read or written is no
 * memory, never an error: the page opens on the lists. The matrix's filter of lists is remembered the same way (D457).
 */
import { MATRIX_FILTERS, type MatrixFilter } from '@shared/engine/casePriority'

export type CasesView = 'lists' | 'matrix'

const KEY = 'rd.casesView'

/** The view remembered, „lists” when none (or the storage is not there, or holds something else). */
export function readCasesView(): CasesView {
  try {
    return localStorage.getItem(KEY) === 'matrix' ? 'matrix' : 'lists'
  } catch {
    return 'lists'
  }
}

/** Remembers the view the page was left on (or is to open on). */
export function rememberCasesView(view: CasesView): void {
  try {
    localStorage.setItem(KEY, view)
  } catch {
    // No storage: the next opening of the page is on the lists again.
  }
}

const FILTER_KEY = 'rd.casesMatrixFilter'

/** The matrix's filter of lists remembered (D457), „all” when none (or the storage is not there, or holds something else). */
export function readMatrixFilter(): MatrixFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    return MATRIX_FILTERS.find((f) => f === v) ?? 'all'
  } catch {
    return 'all'
  }
}

/** Remembers the matrix's filter (D457); „Pokaż w „Sprawach”” of the morning plan puts back „all”, so its sprawy are seen. */
export function rememberMatrixFilter(filter: MatrixFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, filter)
  } catch {
    // No storage: the next opening of the matrix shows all the lists.
  }
}
