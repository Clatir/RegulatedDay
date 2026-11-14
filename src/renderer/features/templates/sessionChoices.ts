/**
 * The fields of a template's session in its panel (D511), without DOM: the choices of „według czasu” – New York, London,
 * Poland, a zone a session of the layer had (kept as it was) and „zwykły blok” (no rules of a session) – and the change a
 * choice makes; the template's block a block of the axis of „Szablony” is (a session of the day is its entry).
 */
import type { PlanBlock } from '@shared/model/plan'
import { marketsOfZone, SESSION_ZONES } from '@shared/model/templateSessions'

/** „Według czasu” of a block that is no session: an ordinary block of its category. */
export const NO_ZONE = '-'

export function zoneOptions(current: string | null): Array<{ value: string; label: string }> {
  const own = current != null && !SESSION_ZONES.some((z) => z.value === current) ? [{ value: current, label: current }] : []
  return [...SESSION_ZONES, ...own, { value: NO_ZONE, label: 'zwykły blok (bez reguł sesji)' }]
}

/** A choice of „według czasu”: the zone with its markets (the hour in Polish time stays), fixed; „zwykły blok” – no field. */
export function zonePatch(b: Pick<PlanBlock, 'session'>, zone: string): Partial<PlanBlock> {
  if (zone === NO_ZONE) return { session: null }
  return { session: { zone, ask: b.session?.ask ?? false, markets: marketsOfZone(zone) }, fixed: true }
}

/**
 * The template's block of each block of the day the axis shows (by the day's id): one of origin „template” by its source, a
 * session by its entry – the session's id is its entry's.
 */
export function axisSources(plan: readonly Pick<PlanBlock, 'id' | 'origin' | 'sourceId'>[], version: readonly Pick<PlanBlock, 'id' | 'session'>[]): Map<string, string> {
  const entries = new Set(version.filter((b) => b.session).map((b) => b.id))
  return new Map(plan.filter((b) => b.sourceId && (b.origin === 'template' || (b.origin === 'session' && entries.has(b.sourceId)))).map((b) => [b.id, b.sourceId!]))
}
