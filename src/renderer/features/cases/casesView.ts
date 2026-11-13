/**
 * The view of the page „Sprawy” – „Listy” or „Macierz” (HKU3, D450) – remembered by this computer in the window's own storage
 * (nothing in the data folder: a habit of the window, as `plan/lastCategory.ts`). Storage that cannot be read or written is no
 * memory, never an error: the page opens on the lists.
 */
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
