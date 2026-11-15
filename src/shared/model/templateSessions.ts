/**
 * Sessions in the templates of day types (D511, D515, replaces the layer of sessions of the settings, keeps its rules): a
 * session is a block of a template with the field „według czasu” (`PlanBlock.session` – New York, London or Poland, the one
 * rule `isSessionEntry`) and the answers of the weekdays („tak / pytaj / nie”, `BlockSession.days`). Its hour is written in
 * Polish time as usual – as the axis of „Szablony” shows it – and kept in its zone's time: the hour less the usual difference
 * of the zones (in the middle of January, when both keep standard time), so in the weeks the USA and Europe change their
 * clocks on other Sundays it starts an hour earlier in Poland, as a session of the layer did. A day's sessions are the entries
 * of its template (`templateFor`) whose answer of its weekday is not „nie”, as `SessionDef`s in the settings of its snapshot
 * (`daySettings`) – the one place the engine reads them, before D511 and after it.
 */
import { SESSION_CATEGORY, type CategoryRules } from './categories'
import { ALL_DAYS_YES, PLAN_MIN, isSessionEntry, sessionBlockFields, sessionIdOf, templateFor, templateVersionOn, type BlockSession, type PlanBlock, type SessionEntry, type Template, type TemplateVersion } from './plan'
import { DAY_TYPES, NY_ZONE, isDayTypeId, type DayTypeId, type MovedLayer, type RulesSettings, type SessionChoice, type SessionDef, type SessionMarket } from './settings'
import { PL_ZONE, addDays, offsetMin, weekday } from '../time/zone'

export { isSessionEntry, type SessionEntry } from './plan'

export const LONDON_ZONE = 'Europe/London'

/** The choices of „według czasu” (D511). */
export const SESSION_ZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: NY_ZONE, label: 'Nowy Jork' },
  { value: LONDON_ZONE, label: 'Londyn' },
  { value: PL_ZONE, label: 'Polska' }
]

/**
 * The zones a session may be kept in (T1350, T1417): New York, London, Poland, and the zone it has when it is none of them
 * (a session of the layer of an earlier version, a draft of the wizard) – by its name, kept as it was.
 */
export function zoneChoices(current: string | null): Array<{ value: string; label: string }> {
  const own = current != null && !SESSION_ZONES.some((z) => z.value === current) ? [{ value: current, label: current }] : []
  return [...SESSION_ZONES, ...own]
}

/** The markets whose holidays a session of a zone has (New York – NYSE and CME for currencies, London – the LSE, Poland – none). */
export function marketsOfZone(zone: string): SessionMarket[] {
  if (zone === NY_ZONE) return ['NYSE', 'CME_FX']
  if (zone === LONDON_ZONE) return ['UK']
  return []
}

/** The field of a session new in a template: New York time, „tak” every weekday (T1404). */
export const newBlockSession = (zone: string = NY_ZONE): BlockSession => ({ zone, markets: marketsOfZone(zone), days: [...ALL_DAYS_YES] })

/** How many minutes Poland is ahead of `zone` as usual: in the middle of January of `year`, both in standard time. */
export function usualDiffMin(zone: string, year: number): number {
  const ref = Date.UTC(year, 0, 15, 12)
  return offsetMin(PL_ZONE, ref) - offsetMin(zone, ref)
}

const mod = (v: number, m: number) => ((v % m) + m) % m
const yearOf = (date: string) => Number(date.slice(0, 4))
/** Templates in the order of their ids (`templateFor` picks by it). */
export const byTemplateId = (a: Template, b: Template): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The answer of a template's session on `date`'s weekday (D515). */
export const dayAnswer = (b: Pick<PlanBlock, 'session'>, date: string): SessionChoice => b.session?.days[weekday(date) - 1] ?? 'yes'

/** A session's start in Polish time as usual (logical minutes of the day) – the hour its entry keeps (the move, T1341). */
export const entryStartMin = (d: Pick<SessionDef, 'startMin' | 'zone'>, year: number): number => mod(d.startMin + usualDiffMin(d.zone, year) - PLAN_MIN, 1440) + PLAN_MIN

/**
 * A template's session as a session of the day (`SessionDef`, start and end in its zone's minutes of the day), with its id
 * (`sessionIdOf`), „pytaj rano” of the day (`ask`) and only the fields of its block the day's block takes (T1419).
 */
export function entryDef(b: SessionEntry, year: number, ask = false): SessionDef {
  const startMin = mod(b.startMin - usualDiffMin(b.session.zone, year), 1440)
  // „Sesja NY” – a version before D511 names a session of its settings „Sesja <name>”.
  const name = (b.name ?? '').replace(/^sesja\s+/i, '').slice(0, 40) || 'tradingowa'
  return { id: sessionIdOf(b), name, zone: b.session.zone, startMin, endMin: startMin + b.durationMin, markets: [...b.session.markets], ask, block: sessionBlockFields(b) }
}

/** The sessions of a version of a template, in its order – each session's id once, the first of its entries (T1416). */
export function sessionEntries(version: TemplateVersion): SessionEntry[] {
  const seen = new Set<string>()
  const out: SessionEntry[] = []
  for (const b of version.blocks) {
    if (!isSessionEntry(b) || seen.has(sessionIdOf(b))) continue
    seen.add(sessionIdOf(b))
    out.push(b)
  }
  return out
}

/** The sessions a version of a template gives on `date`: its entries whose answer of that weekday is not „nie” (D515). */
export function templateSessionDefs(version: TemplateVersion, date: string): SessionDef[] {
  const year = yearOf(date)
  const out: SessionDef[] = []
  for (const b of sessionEntries(version)) {
    const a = dayAnswer(b, date)
    if (a !== 'no') out.push(entryDef(b, year, a === 'ask'))
  }
  return out
}

/**
 * The version of a template the move of the layer wrote (D511) that is not as the move left it yet (T1405, T1413): the file
 * has not come (no `sessionsMoved` – OneDrive brought rd.json first), or the version in force from the move's date was made
 * from a view before the move (no mark of its own – a computer offline, a version before D511). Its day is made as before the
 * move, from the layer of that date the move kept in rd.json.
 */
function waitsForMove(moved: MovedLayer, t: Template, v: TemplateVersion): boolean {
  if (!moved.templates.includes(t.id)) return false
  return !t.sessionsMoved || (v.from >= moved.from && !v.sessionsMoved)
}

/** How long a template the move made may be „on the way” (OneDrive, T1450): its first days; later a missing one is gone. */
export const MADE_ON_THE_WAY_DAYS = 3

/**
 * A day no template makes (`templateFor` – none) of a type the move made a template for (`sesje-<type>`) that is not here –
 * it has not come yet (T1412, T1450): the day is made from the layer, but only in the first `MADE_ON_THE_WAY_DAYS` days of
 * the move (later it is gone whatever way it went). One you removed in the window (`gone`), archived or gave another type
 * (it is here) – not.
 */
function madeMissing(moved: MovedLayer, templates: readonly Template[], dayType: DayTypeId, date: string): boolean {
  if (date >= addDays(moved.from, MADE_ON_THE_WAY_DAYS)) return false
  return Object.entries(moved.made).some(([id, type]) => type === dayType && !moved.gone[id] && !templates.some((t) => t.id === id))
}

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
 * snapshot see the day as it is. A template without entries – the settings as they are; a template of the move not as the
 * move left it yet, or a type whose template made by the move has not come (`waitsForMove`, `madeMissing`) – the layer the
 * move took: one id is one session either way.
 */
export function daySettingsOf(settings: RulesSettings, templates: readonly Template[], dayType: DayTypeId, date: string): { settings: RulesSettings; tpl: ReturnType<typeof templateFor> } {
  const tpl = templateFor(templates, dayType, weekday(date), date)
  const moved = settings.movedLayer
  if (moved && (tpl ? waitsForMove(moved, tpl.template, tpl.version) : madeMissing(moved, templates, dayType, date))) return { settings: withMovedLayer(settings), tpl }
  const entries = tpl ? sessionEntries(tpl.version) : []
  if (!tpl || !entries.length) return { settings, tpl }
  const defs = templateSessionDefs(tpl.version, date)
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
 * The settings a day's snapshot keeps (`day.create`, `day.snapshot`, T1419, T1454): without the layer the move took – rd.json's,
 * read again from it; the names of its sessions stay (few, they name a block of the layer in „Dziś”, the bar, the window of a
 * change of type – `blockName`).
 */
export const snapshotSettings = (s: RulesSettings): RulesSettings => (s.movedLayer == null ? s : { ...s, movedLayer: null })

/**
 * Every session known on a date, of any type and answer (the announcement of the week of the shift, the calendar's mark
 * „sesje −1 h”): the entries of every template in force then, the layer of the settings of that date and – while a template
 * of the move is not as it left it – the layer the move took, each id once.
 */
export function knownSessionDefs(settings: RulesSettings, templates: readonly Template[], date: string): SessionDef[] {
  const out = allTemplateSessions(templates, date)
  const moved = settings.movedLayer
  const waiting =
    moved != null &&
    (templates.some((t) => {
      const v = templateVersionOn(t, date)
      return v != null && waitsForMove(moved, t, v)
    }) ||
      DAY_TYPES.some((type) => !templateFor(templates, type, weekday(date), date) && madeMissing(moved, templates, type, date)))
  for (const d of [...settings.sessions, ...(waiting ? moved.sessions : [])]) if (!out.some((x) => x.id === d.id)) out.push(d)
  return out
}

/** The sessions of every template in force on a date, of any type and answer (by the templates' ids, each id once). */
export function allTemplateSessions(templates: readonly Template[], date: string): SessionDef[] {
  const out: SessionDef[] = []
  const year = yearOf(date)
  for (const t of [...templates].sort(byTemplateId)) {
    if (t.archived) continue
    const v = templateVersionOn(t, date)
    if (v) for (const b of sessionEntries(v)) if (!out.some((x) => x.id === sessionIdOf(b))) out.push(entryDef(b, year))
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
  for (const t of [...templates].sort(byTemplateId)) {
    if (t.archived) continue
    for (const v of t.versions) for (const b of v.blocks) if (isSessionEntry(b)) for (const m of b.session.markets) if (!out.includes(m)) out.push(m)
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
    for (const b of sessionEntries(v)) if (dayAnswer(b, date) !== 'no') out[sessionIdOf(b)] ??= { templateId: t.id, blockId: b.id }
  }
  const now = isDayTypeId(dayType) ? templateFor(templates, dayType, weekday(date), date) : null
  add(now?.template, now?.version)
  const own = templates.find((t) => t.id === snapshotTemplateId)
  add(own, own ? templateVersionOn(own, date) : null)
  return out
}

/**
 * A block of a version becoming a session (T1416): its id is the session's, unless another session of the version has that
 * id already – then the session gets one of its own (`<id>-2`, the next number while taken). Undefined – the block's.
 */
export function freeSessionId(b: Pick<PlanBlock, 'id'>, blocks: readonly PlanBlock[]): string | undefined {
  const taken = new Set(blocks.filter((x) => x.id !== b.id && isSessionEntry(x)).map(sessionIdOf))
  if (!taken.has(b.id)) return undefined
  let n = 2
  while (taken.has(`${b.id}-${n}`)) n++
  return `${b.id}-${n}`
}

/** The field of a block of `blocks` becoming a session of `zone`: „tak” every day, its own id when the block's is taken. */
export function blockSessionFor(b: Pick<PlanBlock, 'id'>, blocks: readonly PlanBlock[], zone: string = NY_ZONE): BlockSession {
  const id = freeSessionId(b, blocks)
  return { ...newBlockSession(zone), ...(id ? { id } : {}) }
}

/**
 * A change of a template's block in „Szablony” with the rule of sessions (D511): a block given a category of sessions becomes
 * a session – New York time, fixed, „tak” every weekday, never with another session's id (`blocks` – its version) – unless it
 * has the field already; one given another category stops being one. The same category, or a patch without it – the patch
 * as it is.
 */
export function templateBlockPatch(b: PlanBlock, patch: Partial<PlanBlock>, categories: Readonly<Record<string, CategoryRules>>, blocks: readonly PlanBlock[] = []): Partial<PlanBlock> {
  if (patch.categoryId === undefined || patch.categoryId === b.categoryId) return patch
  const session = categories[patch.categoryId]?.kind === 'session'
  if (session && !b.session) return { ...patch, session: blockSessionFor(b, blocks), fixed: true }
  if (!session && b.session) return { ...patch, session: null }
  return patch
}

/** The category of the sessions a move puts in templates: „Sesja tradingowa”, else the first of the kind sessions. */
export function sessionCategoryOf(categories: Readonly<Record<string, CategoryRules>>): string {
  if (categories[SESSION_CATEGORY]?.kind === 'session') return SESSION_CATEGORY
  return Object.keys(categories).find((id) => categories[id]!.kind === 'session') ?? SESSION_CATEGORY
}
