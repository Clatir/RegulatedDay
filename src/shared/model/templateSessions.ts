/**
 * Sessions in the templates of day types (D511, replaces the layer of sessions of the settings, keeps its rules): a session
 * is a block of a template of a category of sessions with the field „według czasu” (`PlanBlock.session` – New York, London
 * or Poland) and „pytaj rano”. Its hour is written in Polish time as usual – as the axis of „Szablony” shows it – and kept
 * in its zone's time: the hour less the usual difference of the zones (in the middle of January, when both keep standard
 * time), so in the weeks the USA and Europe change their clocks on other Sundays it starts an hour earlier in Poland, as a
 * session of the layer did. A day's sessions are the entries of its template (`templateFor`) as `SessionDef`s in the
 * settings of its snapshot (`daySettings`) – the one place the engine reads them, before D511 and after it.
 */
import { SESSION_CATEGORY, type CategoryRules } from './categories'
import { templateFor, templateVersionOn, type BlockSession, type PlanBlock, type Template, type TemplateVersion } from './plan'
import { NY_ZONE, type DayTypeId, type RulesSettings, type SessionDef, type SessionMarket } from './settings'
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

/** The field of a session new in a template: New York time, without „pytaj rano” (as „+ Sesja” of the layer made one). */
export const newBlockSession = (zone: string = NY_ZONE): BlockSession => ({ zone, ask: false, markets: marketsOfZone(zone) })

/** A block of a template is a session: the field „według czasu” on a block of a category of sessions, with its own hour. */
export function isSessionEntry(b: PlanBlock, categories: Readonly<Record<string, CategoryRules>>): b is PlanBlock & { session: BlockSession; startMin: number } {
  return !!b.session && b.startMin != null && categories[b.categoryId]?.kind === 'session'
}

/** How many minutes Poland is ahead of `zone` as usual: in the middle of January of `year`, both in standard time. */
export function usualDiffMin(zone: string, year: number): number {
  const ref = Date.UTC(year, 0, 15, 12)
  return offsetMin(PL_ZONE, ref) - offsetMin(zone, ref)
}

const mod = (v: number, m: number) => ((v % m) + m) % m

/** A template's session as a session of the day (`SessionDef`, start and end in its zone's minutes of the day). */
export function entryDef(b: PlanBlock & { session: BlockSession; startMin: number }, year: number): SessionDef {
  const startMin = mod(b.startMin - usualDiffMin(b.session.zone, year), 1440)
  // „Sesja NY” – a version before D511 names a session of its settings „Sesja <name>”.
  const name = (b.name ?? '').replace(/^sesja\s+/i, '').slice(0, 40) || 'tradingowa'
  return { id: b.id, name, zone: b.session.zone, startMin, endMin: startMin + b.durationMin, markets: [...b.session.markets], ask: b.session.ask, block: b }
}

/** The sessions of a version of a template, in its order. */
export function templateSessionDefs(version: TemplateVersion, categories: Readonly<Record<string, CategoryRules>>, year: number): SessionDef[] {
  return version.blocks.filter((b) => isSessionEntry(b, categories)).map((b) => entryDef(b as PlanBlock & { session: BlockSession; startMin: number }, year))
}

const yearOf = (date: string) => Number(date.slice(0, 4))

/**
 * The settings of a day (`createDay`, a change of type, a snapshot „od dziś”) and the template it is made from (looked up
 * once): the settings in force with the sessions of its template laid in – the template's first, then a session left in the
 * layer (one a version before D511 added after the move) by the layer's own choice of the day (never twice: an id of the
 * template's wins; „nie” – none). With the template's sessions the choice of the layer for the type and weekday says what the
 * day has: „tak”, „pytaj” when every one is asked about – the rule of the maximum („domyślnie bez sesji”) and a version
 * before D511 reading the snapshot see the day as it is. A template without sessions – the settings as they are.
 */
export function daySettingsOf(settings: RulesSettings, templates: readonly Template[], dayType: DayTypeId, date: string): { settings: RulesSettings; tpl: ReturnType<typeof templateFor> } {
  const tpl = templateFor(templates, dayType, weekday(date), date)
  const defs = tpl ? templateSessionDefs(tpl.version, settings.categories, yearOf(date)) : []
  if (!defs.length) return { settings, tpl }
  const wd = weekday(date) - 1
  const params = settings.dayTypes[dayType]
  const layerChoice = params.sessions[wd] ?? 'no'
  const ids = new Set(defs.map((d) => d.id))
  const layer = layerChoice === 'no' ? [] : settings.sessions.filter((d) => !ids.has(d.id)).map((d) => ({ ...d, ask: layerChoice === 'ask' }))
  const sessions = [...defs, ...layer]
  const choice = sessions.every((d) => d.ask) ? 'ask' : 'yes'
  return { settings: { ...settings, sessions, dayTypes: { ...settings.dayTypes, [dayType]: { ...params, sessions: params.sessions.map((c, i) => (i === wd ? choice : c)) } } }, tpl }
}

/** `daySettingsOf` without the template. */
export const daySettings = (settings: RulesSettings, templates: readonly Template[], dayType: DayTypeId, date: string): RulesSettings => daySettingsOf(settings, templates, dayType, date).settings

/**
 * Every session known on a date, of any type (the announcement of the week of the shift, the calendar's mark „sesje −1 h”):
 * the entries of every template in force then and the layer of the settings of that date, each id once.
 */
export function knownSessionDefs(settings: RulesSettings, templates: readonly Template[], date: string): SessionDef[] {
  const own = allTemplateSessions(templates, settings.categories, date)
  return [...own, ...settings.sessions.filter((d) => !own.some((x) => x.id === d.id))]
}

/** The sessions of every template in force on a date, of any type (by the templates' ids, each id once). */
export function allTemplateSessions(templates: readonly Template[], categories: Readonly<Record<string, CategoryRules>>, date: string): SessionDef[] {
  const out: SessionDef[] = []
  for (const t of [...templates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (t.archived) continue
    const v = templateVersionOn(t, date)
    if (v) for (const d of templateSessionDefs(v, categories, yearOf(date))) if (!out.some((x) => x.id === d.id)) out.push(d)
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
  for (const t of [...templates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (t.archived) continue
    for (const v of t.versions) for (const b of v.blocks) for (const m of b.session?.markets ?? []) if (!out.includes(m)) out.push(m)
  }
  marketsMemo.set(templates, out)
  return out
}

/**
 * A change of a template's block in „Szablony” with the rule of sessions (D511): a block given a category of sessions becomes
 * a session – New York time, fixed – unless it has the field already; one given another category stops being one. The same
 * category, or a patch without it – the patch as it is.
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
