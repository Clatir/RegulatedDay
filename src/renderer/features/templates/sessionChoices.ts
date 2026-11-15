/**
 * The fields of a template's session in its panel (D511, D515), without DOM: the choices of „według czasu” – New York,
 * London, Poland, a zone a session of the layer had (kept as it was) and „zwykły blok” (no rules of a session) – and the
 * change a choice makes; the answers of the weekdays („✓ tak · ? pytaj · ✗ nie”, a click – the next one); the template's
 * block a block of the axis of „Szablony” is (a session of the day is its entry) and the version that axis shows (every
 * entry on its day).
 */
import { isSessionEntry, sessionIdOf, type PlanBlock, type TemplateVersion } from '@shared/model/plan'
import type { SessionChoice } from '@shared/model/settings'
import { PL_ZONE } from '@shared/time/zone'
import { blockSessionFor, marketsOfZone, zoneChoices } from '@shared/model/templateSessions'

/** „Według czasu” of a block that is no session: an ordinary block of its category. */
export const NO_ZONE = '-'

export function zoneOptions(current: string | null): Array<{ value: string; label: string }> {
  return [...zoneChoices(current), { value: NO_ZONE, label: 'zwykły blok (bez reguł sesji)' }]
}

/**
 * A choice of „według czasu”: the zone with its markets (the hour in Polish time, the answers of the weekdays and the
 * session's id stay), fixed; „zwykły blok” – no field. A block becoming a session never takes another session's id of its
 * version (`blocks`, T1416).
 */
export function zonePatch(b: Pick<PlanBlock, 'id' | 'session'>, zone: string, blocks: readonly PlanBlock[] = []): Partial<PlanBlock> {
  if (zone === NO_ZONE) return { session: null }
  return { session: { ...(b.session ?? blockSessionFor(b, blocks, zone)), zone, markets: marketsOfZone(zone) }, fixed: true }
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
export function axisSources(plan: readonly Pick<PlanBlock, 'id' | 'origin' | 'sourceId'>[], version: readonly PlanBlock[]): Map<string, string> {
  // The first entry of a session's id (T1416) – the one the day has.
  const entries = new Map<string, string>()
  for (const b of version) if (isSessionEntry(b) && !entries.has(sessionIdOf(b))) entries.set(sessionIdOf(b), b.id)
  const out = new Map<string, string>()
  for (const b of plan) {
    if (!b.sourceId) continue
    if (b.origin === 'template') out.set(b.id, b.sourceId)
    else if (b.origin === 'session' && entries.has(b.sourceId)) out.set(b.id, entries.get(b.sourceId)!)
  }
  return out
}

/**
 * The version as the axis of „Szablony” draws it (D515, T1417): every session of the template at its hour as written (Polish
 * time as usual), whole and on its day – whatever the answer of the weekday the axis shows, the shift of the clocks in the USA
 * or an early close of its market that day: a block of the template to open and change. Its field kept in Polish time, no
 * markets, no „nie” (the version's own blocks keep theirs – the panel shows them).
 */
export function axisVersion(v: TemplateVersion): TemplateVersion {
  if (!v.blocks.some(isSessionEntry)) return v
  return { ...v, blocks: v.blocks.map((b) => (isSessionEntry(b) ? { ...b, session: { ...b.session, zone: PL_ZONE, markets: [], days: b.session.days.map((c) => (c === 'no' ? 'yes' : c)) } } : b)) }
}
