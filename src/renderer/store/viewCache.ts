/**
 * The last view read of a week or a month's goals, kept so a screen shows it while the next read runs (no flash of an
 * empty week). Keyed by the data folder too (another folder never shows this one's weeks), only the latest entries kept, and
 * a read that comes late never overwrites a newer one: every read takes a ticket when it starts, and its answer is kept
 * only if no later read has been kept before it.
 */
export const VIEW_CACHE_MAX = 12

/** The key of an entry: the folder (empty – none) and what was read. */
export const cacheKey = (folder: string | null, key: string): string => `${folder ?? ''}\u0000${key}`

export class ViewCache<T> {
  private readonly entries = new Map<string, { ticket: number; value: T }>()
  private ticket = 0

  constructor(private readonly max = VIEW_CACHE_MAX) {}

  get(key: string): T | null {
    return this.entries.get(key)?.value ?? null
  }

  /** A read starts: its ticket, for `keep`. */
  begin(): number {
    return ++this.ticket
  }

  /** The answer of the read with `ticket`: kept unless a read begun later has been kept already; the oldest entries go over `max`. */
  keep(key: string, ticket: number, value: T): boolean {
    const had = this.entries.get(key)
    if (had && had.ticket > ticket) return false
    this.entries.delete(key)
    this.entries.set(key, { ticket, value })
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!)
    return true
  }

  get size(): number {
    return this.entries.size
  }
}
