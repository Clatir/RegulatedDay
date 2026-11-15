/**
 * The fields of a template's session in its panel (D511, D515), without DOM: the choices of „według czasu” – New York,
 * London, Poland, a zone a session of the layer had (kept as it was) and „zwykły blok” (no rules of a session) – and the
 * change a choice makes; the answers of the weekdays („✓ tak · ? pytaj · ✗ nie”, a click – the next one); the template's
 * block a block of the axis of „Szablony” is (a session of the day is its entry) and the version that axis shows (every
 * entry on its day).
 */
import { sessionIdOf, type PlanBlock, type TemplateVersion } from '@shared/model/plan'
import type { SessionChoice } from '@shared/model/settings'
import { marketsOfZone, newBlockSession, SESSION_ZONES } from '@shared/model/templateSessions'

/** „Według czasu” of a block that is no session: an ordinary block of its category. */
export const NO_ZONE = '-'

export function zoneOptions(current: string | null): Array<{ value: string; label: string }> {
  const own = current != null && !SESSION_ZONES.some((z) => z.value === current) ? [{ value: current, label: current }] : []
  return [...SESSION_ZONES, ...own, { value: NO_ZONE, label: 'zwykły blok (bez reguł sesji)' }]
}

/**
 * A choice of „według czasu”: the zone with its markets (the hour in Polish time, the answers of the weekdays and the
 * session's id stay), fixed; „zwykły blok” – no field.
 */
export function zonePatch(b: Pick<PlanBlock, 'session'>, zone: string): Partial<PlanBlock> {
  if (zone === NO_ZONE) return { session: null }
  return { session: { ...(b.session ?? newBlockSession(zone)), zone, markets: marketsOfZone(zone) }, fixed: true }
}

/** What a weekday's answer shows on its button and says. */
export const DAY_MARK: Record<SessionChoice, string> = { yes: '✓', ask: '?', no: '✗' }
export const DAY_WORD: Record<SessionChoice, string> = { yes: 'tak', ask: 'pytaj rano', no: 'nie' }

/** A click on a weekday: tak → pytaj → nie → tak. */
const NEXT: Record<SessionChoice, SessionChoice> = { yes: 'ask', ask: 'no', no: 'yes' }

/** The session with the answer of weekday `i` (0 – Monday) moved on by a click (D515). */
export function dayPatch(b: Pick<PlanBlock, 'session'>, i: number): Partial<PlanBlock> {
  const s = b.session!
  return { session: { ...s, days: s.days.map((c, j) => (j === i ? NEXT[c] : c)) } }
}

/**
 * The template's block of each block of the day the axis shows (by the day's id): one of origin „template” by its source, a
 * session by its entry – the session's id is its entry's (`sessionIdOf`).
 */
export function axisSources(plan: readonly Pick<PlanBlock, 'id' | 'origin' | 'sourceId'>[], version: readonly Pick<PlanBlock, 'id' | 'session'>[]): Map<string, string> {
  const entries = new Map(version.filter((b) => b.session).map((b) => [sessionIdOf(b), b.id]))
  const out = new Map<string, string>()
  for (const b of plan) {
    if (!b.sourceId) continue
    if (b.origin === 'template') out.set(b.id, b.sourceId)
    else if (b.origin === 'session' && entries.has(b.sourceId)) out.set(b.id, entries.get(b.sourceId)!)
  }
  return out
}

/**
 * The version as the axis of „Szablony” draws it (D515): every session of the template on its day, whatever the answer of
 * the weekday it shows – a session with „nie” that day is still a block of the template to open and change.
 */
export function axisVersion(v: TemplateVersion): TemplateVersion {
  if (!v.blocks.some((b) => b.session?.days.includes('no'))) return v
  return { ...v, blocks: v.blocks.map((b) => (b.session?.days.includes('no') ? { ...b, session: { ...b.session, days: b.session.days.map((c) => (c === 'no' ? 'yes' : c)) } } : b)) }
}
