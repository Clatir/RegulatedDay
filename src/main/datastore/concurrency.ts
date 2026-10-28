// adapted from FI src/main/datastore/fsutil.ts @ 816604d (mapLimit)

/**
 * Run `fn` over items with bounded concurrency, preserving the order of results (FI fsutil `mapLimit`, without the
 * abort signal nobody here uses). The first failure rejects, as one after another would.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
