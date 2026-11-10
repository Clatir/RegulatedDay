/**
 * The category a new block starts with in the small window of „Tydzień” (D371): the one of the block added last from that
 * window or from the panel of a new block – remembered by this computer in the window's own storage (nothing in the data
 * folder: it is a habit of this window, not data). Storage that cannot be read or written is no memory, never an error.
 */
const KEY = 'rd.newBlockCategory'

/** The category remembered, null when none (or the storage is not there). */
export function lastNewBlockCategory(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Remembers the category of a block just added. */
export function rememberNewBlockCategory(categoryId: string): void {
  try {
    localStorage.setItem(KEY, categoryId)
  } catch {
    // No storage: the next block starts with „Inne” again.
  }
}

/** The category to start with: the remembered one if it can still be chosen (not archived or gone), else „Inne”, else the first. */
export function startCategory(remembered: string | null, available: readonly string[], fallback = 'inne'): string {
  if (remembered != null && available.includes(remembered)) return remembered
  return available.includes(fallback) ? fallback : (available[0] ?? fallback)
}
