/** Helpers of the tests of the body (D520): data as a version before it (≤ 1.26) writes them. */
import type { RulesSettings } from '@shared/model/settings'

/** Settings as a version before the body (≤ 1.26) writes them: no `body` in any category's or variant's cost. */
export function withoutBodies(settings: RulesSettings): Record<string, unknown> {
  const strip = (c: unknown) => {
    if (!c || typeof c !== 'object') return c
    const { body: _body, ...rest } = c as Record<string, unknown>
    return rest
  }
  const categories = Object.fromEntries(Object.entries(settings.categories).map(([id, c]) => [id, { ...c, costs: strip(c.costs), variants: c.variants.map((v) => (v.costs ? { ...v, costs: strip(v.costs) } : v)) }]))
  return { ...settings, categories }
}
