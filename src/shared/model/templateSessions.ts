/**
 * Sessions in the templates of day types (D511, D515, replaces the layer of sessions of the settings, keeps its rules): a
 * session is a block of a template of a category of sessions with the field „według czasu” (`PlanBlock.session` – New York,
 * London or Poland) and the answers of the weekdays („tak / pytaj / nie”, `BlockSession.days`). Its hour is written in Polish
 * time as usual – as the axis of „Szablony” shows it – and kept in its zone's time: the hour less the usual difference of the
 * zones (in the middle of January, when both keep standard time), so in the weeks the USA and Europe change their clocks on
 * other Sundays it starts an hour earlier in Poland, as a session of the layer did. A day's sessions are the entries of its
 * template (`templateFor`) whose answer of its weekday is not „nie”, as `SessionDef`s in the settings of its snapshot
 * (`daySettings`) – the one place the engine reads them, before D511 and after it.
 */
import { SESSION_CATEGORY, type CategoryRules } from './categories'
import { ALL_DAYS_YES, sessionIdOf, templateFor, templateVersionOn, type BlockSession, type PlanBlock, type Template, type TemplateVersion } from './plan'
import { DAY_TYPES, NY_ZONE, isDayTypeId, type DayTypeId, type RulesSettings, type SessionChoice, type SessionDef, type SessionMarket } from './settings'
import { PL_ZONE, offsetMin, weekday } from '../time/zone'

export const LONDON_ZONE = 'Europe/London'

/** The choices of „według czasu” (D511). */
export const SESSION_ZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: NY_ZONE, label: 'Nowy Jork' },
  { value: LONDON_ZONE, label: 'Londyn' },
  { value: PL_ZONE, label: 'Polska' }
]

/** The markets whose holidays a session of a zone has (New York – NYSE and CME for currencies, London – the LSE, Poland – none). */
export function marketsOfZone(zone: string): SessionMarket[] {
  if (zone === NY_ZONE) return ['NYSE', 'CME_FX']
  if (zone === LONDON_ZONE) return ['UK']
  return []
}

/** The field of a session new in a template: New York time, „tak” every weekday (T1404). */
export const newBlockSession = (zone: string = NY_ZONE): BlockSession => ({ zone, markets: marketsOfZone(zone), days: [...ALL_DAYS_YES] })

/** A template's block that is a session (`isSessionEntry`). */
export type SessionEntry = PlanBlock & { session: BlockSession; startMin: number }

/** A block of a template is a session: the field „według czasu” on a block of a category of sessions, with its own hour. */
export function isSessionEntry(b: PlanBlock, categories: Readonly<Record<string, CategoryRules>>): b is SessionEntry {
  return !!b.session && b.startMin != null && categories[b.categoryId]?.kind === 'session'
}

/** How many minutes Poland is ahead of `zone` as usual: in the middle of January of `year`, both in standard time. */
export function usualDiffMin(zone: string, year: number): number {
  const ref = Date.UTC(year, 0, 15, 12)
  return offsetMin(PL_ZONE, ref) - offsetMin(zone, ref)
}

const mod = (v: number, m: number) => ((v % m) + m) % m
const yearOf = (date: string) => Number(date.slice(0, 4))
const byId = (a: Template, b: Template) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The answer of a template's session on `date`'s weekday (D515). */
export const dayAnswer = (b: Pick<PlanBlock, 'session'>, date: string): SessionChoice => b.session?.days[weekday(date) - 1] ?? 'yes'

/**
 * A template's session as a session of the day (`SessionDef`, start and end in its zone's minutes of the day), with its id
 * (`sessionIdOf`) and „pytaj rano” of the day (`ask`).
 */
export function entryDef(b: SessionEntry, year: number, ask = false): SessionDef {
  const startMin = mod(b.startMin - usualDiffMin(b.session.zone, year), 1440)
  // „Sesja NY” – a version before D511 names a session of its settings „Sesja <name>”.
  const name = (b.name ?? '').replace(/^sesja\s+/i, '').slice(0, 40) || 'tradingowa'
  return { id: sessionIdOf(b), name, zone: b.session.zone, startMin, endMin: startMin + b.durationMin, markets: [...b.session.markets], ask, block: b }
}

/** The sessions of a version of a template (its entries), in its order. */
export function sessionEntries(version: TemplateVersion, categories: Readonly<Record<string, CategoryRules>>): SessionEntry[] {
  return version.blocks.filter((b): b is SessionEntry => isSessionEntry(b, categories))
}

/** The sessions a version of a template gives on `date`: its entries whose answer of that weekday is not „nie” (D515). */
export function templateSessionDefs(version: TemplateVersion, categories: Readonly<Record<string, CategoryRules>>, date: string): SessionDef[] {
  const year = yearOf(date)
  const out: SessionDef[] = []
  for (const b of sessionEntries(version, categories)) {
    const a = dayAnswer(b, date)
    if (a !== 'no') out.push(entryDef(b, year, a === 'ask'))
  }
  return out
}

/**
 * A template the move of the layer wrote (D511, listed in `movedLayer.templates`) whose file has not come with the move yet
 * – OneDrive brought rd.json first (T1405): it is as before the move, without entries, so its days are made as before it,
 * from the layer of that date the move kept in rd.json.
 */
const waitsForMove = (settings: RulesSettings, t: Template): boolean => !!settings.movedLayer?.templates.includes(t.id) && !t.sessionsMoved

/** The settings with the layer a move took (`movedLayer`): its sessions and grid as they were before it on that date. */
function withMovedLayer(settings: RulesSettings): RulesSettings {
  const moved = settings.movedLayer!
  const dayTypes = Object.fromEntries(DAY_TYPES.map((t) => [t, { ...settings.dayTypes[t], sessions: moved.grid[t] }])) as RulesSettings['dayTypes']
  return { ...settings, sessions: moved.sessions, dayTypes }
}

/**
 * The settings of a day (`createDay`, a change of type, a snapshot „od dziś”) and the template it is made from (looked up
 * once): the settings in force with the sessions of its template laid in – the template's first (its entries but those with
 * „nie” on the day's weekday), then a session left in the layer (one a version before D511 added after the move) by the
 * layer's own choice of the day (never twice: an entry's id wins, also one with „nie”; „nie” – none). With the template's
 * entries the choice of the layer for the type and weekday says what the day has: „tak”, „pytaj” when every one is asked
 * about, „nie” when none is left – the rule of the maximum („domyślnie bez sesji”) and a version before D511 reading the
 * snapshot see the day as it is. A template without entries – the settings as they are; a template the move wrote whose
 * file has not come yet – the layer the move took (`waitsForMove`): one id is one session either way.
 */
export function daySettingsOf(settings: RulesSettings, templates: readonly Template[], dayType: DayTypeId, date: string): { settings: RulesSettings; tpl: ReturnType<typeof templateFor> } {
  const tpl = templateFor(templates, dayType, weekday(date), date)
  if (tpl && waitsForMove(settings, tpl.template)) return { settings: withMovedLayer(settings), tpl }
  const entries = tpl ? sessionEntries(tpl.version, settings.categories) : []
  if (!tpl || !entries.length) return { settings, tpl }
  const defs = templateSessionDefs(tpl.version, settings.categories, date)
  const wd = weekday(date) - 1
  const params = settings.dayTypes[dayType]
  const layerChoice = params.sessions[wd] ?? 'no'
  const ids = new Set(entries.map(sessionIdOf))
  const layer = layerChoice === 'no' ? [] : settings.sessions.filter((d) => !ids.has(d.id)).map((d) => ({ ...d, ask: layerChoice === 'ask' }))
  const sessions = [...defs, ...layer]
  const choice: SessionChoice = !sessions.length ? 'no' : sessions.every((d) => d.ask) ? 'ask' : 'yes'
  return { settings: { ...settings, sessions, dayTypes: { ...settings.dayTypes, [dayType]: { ...params, sessions: params.sessions.map((c, i) => (i === wd ? choice : c)) } } }, tpl }
}

/** `daySettingsOf` without the template. */
export const daySettings = (settings: RulesSettings, templates: readonly Template[], dayType: DayTypeId, date: string): RulesSettings => daySettingsOf(settings, templates, dayType, date).settings

/**
 * Every session known on a date, of any type and answer (the announcement of the week of the shift, the calendar's mark
 * „sesje −1 h”): the entries of every template in force then, the layer of the settings of that date and – while a template
 * the move wrote has not come yet – the layer the move took, each id once.
 */
export function knownSessionDefs(settings: RulesSettings, templates: readonly Template[], date: string): SessionDef[] {
  const out = allTemplateSessions(templates, settings.categories, date)
  const waiting = templates.some((t) => waitsForMove(settings, t)) ? (settings.movedLayer?.sessions ?? []) : []
  for (const d of [...settings.sessions, ...waiting]) if (!out.some((x) => x.id === d.id)) out.push(d)
  return out
}

/** The sessions of every template in force on a date, of any type and answer (by the templates' ids, each id once). */
export function allTemplateSessions(templates: readonly Template[], categories: Readonly<Record<string, CategoryRules>>, date: string): SessionDef[] {
  const out: SessionDef[] = []
  const year = yearOf(date)
  for (const t of [...templates].sort(byId)) {
    if (t.archived) continue
    const v = templateVersionOn(t, date)
    if (v) for (const b of sessionEntries(v, categories)) if (!out.some((x) => x.id === sessionIdOf(b))) out.push(entryDef(b, year))
  }
  return out
}

const marketsMemo = new WeakMap<readonly Template[], SessionMarket[]>()

/**
 * The markets of the sessions of every template (any version, in the templates' order by id), once per list of templates:
 * they are in every day's snapshot, as the markets of every session of the layer were – a session a change of type brings
 * from another template ends at its early close too.
 */
export function templateMarkets(templates: readonly Template[]): SessionMarket[] {
  let out = marketsMemo.get(templates)
  if (out) return out
  out = []
  for (const t of [...templates].sort(byId)) {
    if (t.archived) continue
    for (const v of t.versions) for (const b of v.blocks) for (const m of b.session?.markets ?? []) if (!out.includes(m)) out.push(m)
  }
  marketsMemo.set(templates, out)
  return out
}

/** Where a session of a day has its entry: the template and the entry's block (whose attachments it shows, T1407). */
export interface SessionOwner {
  templateId: string
  blockId: string
}

/**
 * The entry each session of a day comes from (T1407): of the template of the day's type now (after a change of type – the
 * new type's), else of the template of its snapshot – an entry whose answer of the weekday is not „nie” (the first of a
 * session's id). None – the session has no entry that day (the layer's): no attachments of a template.
 */
export function sessionOwnersOf(templates: readonly Template[], dayType: string | null, snapshotTemplateId: string | null, date: string): Record<string, SessionOwner> {
  const out: Record<string, SessionOwner> = {}
  const add = (t: Template | undefined, v: TemplateVersion | null | undefined) => {
    if (!t || !v) return
    for (const b of v.blocks) {
      if (!b.session || dayAnswer(b, date) === 'no') continue
      const sid = sessionIdOf(b)
      out[sid] ??= { templateId: t.id, blockId: b.id }
    }
  }
  const now = isDayTypeId(dayType) ? templateFor(templates, dayType, weekday(date), date) : null
  add(now?.template, now?.version)
  const own = templates.find((t) => t.id === snapshotTemplateId)
  add(own, own ? templateVersionOn(own, date) : null)
  return out
}

/**
 * A change of a template's block in „Szablony” with the rule of sessions (D511): a block given a category of sessions becomes
 * a session – New York time, fixed, „tak” every weekday – unless it has the field already; one given another category stops
 * being one. The same category, or a patch without it – the patch as it is.
 */
export function templateBlockPatch(b: PlanBlock, patch: Partial<PlanBlock>, categories: Readonly<Record<string, CategoryRules>>): Partial<PlanBlock> {
  if (patch.categoryId === undefined || patch.categoryId === b.categoryId) return patch
  const session = categories[patch.categoryId]?.kind === 'session'
  if (session && !b.session) return { ...patch, session: newBlockSession(), fixed: true }
  if (!session && b.session) return { ...patch, session: null }
  return patch
}

/** The category of the sessions a move puts in templates: „Sesja tradingowa”, else the first of the kind sessions. */
export function sessionCategoryOf(categories: Readonly<Record<string, CategoryRules>>): string {
  if (categories[SESSION_CATEGORY]?.kind === 'session') return SESSION_CATEGORY
  return Object.keys(categories).find((id) => categories[id]!.kind === 'session') ?? SESSION_CATEGORY
}
