/**
 * The move of the layer of sessions into the templates (D511, D515): once, from a date (the day it is made – „od dziś”; the
 * wizard's from the start). The sessions of the settings become entries of the templates (`PlanBlock.session`,
 * `model/templateSessions.ts`) in every version from that date, and the grid „tak / nie / pytaj” goes into each entry as the
 * answers of its weekdays (`BlockSession.days` – the type of the template × the weekday; a weekday a template of weekdays
 * does not make – „nie”). Every template keeps its id, its weekdays and its blocks with their ids, so no day's file and no
 * attachment changes (T1401). A change of the layer or its grid from a later date (made before the move, „od jutra”) is
 * moved too: from its date the templates have the sessions and answers it set (a version from that date where they change),
 * and the layer is emptied from it as well. A type with sessions without a default template gets one with only them
 * (`sesje-<type>`, T1402). An ordinary block of a template with a session's id keeps it: the entry gets another block id and
 * keeps the session's own in its field (`BlockSession.id`, T1406). The changes of the settings from those dates empty the
 * layer (no session, every type „nie”) – a version before D511 sees no session of the layer and shows the entries as fixed
 * blocks of their category, never twice (T1403) – keep the layer as it was (`movedLayer` – a day of a template whose file
 * comes after rd.json is made from it, T1405) and the names of its sessions (`movedSessions`, T1408), and mark the move as
 * made.
 *
 * Pure and deterministic: the same files give the same templates and the same changes (their order from the files, no
 * instant of the clock) – two computers moving at once write the same records; a template the move wrote already
 * (`sessionsMoved`) is never changed again, and with the change in the settings the move is not made again.
 */
import { PLAN_MIN, planBlock, sessionIdOf, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from './plan'
import { DAY_TYPES, DAY_TYPE_NAMES, settingsOn, type DayTypeId, type RulesSettings, type SessionChoice, type SessionDef, type SettingsChange } from './settings'
import { sessionCategoryOf, usualDiffMin } from './templateSessions'

/** The change of the settings that empties the layer of sessions from the date of the move and marks the move as made. */
export const SESSIONS_CHANGE_ID = 'sesje-w-szablonach'

export interface SessionsMove {
  from: string
  /** The changes that empty the layer: from `from` and from every later date the layer or its grid changes on. */
  changes: SettingsChange[]
  /** Templates there were, as they are to be written (entries in versions from the dates of the layer, `sessionsMoved`). */
  changed: Template[]
  /** Templates the move makes: the default of a type with sessions and no default template of its own (`sesje-<type>`). */
  made: Template[]
}

/** The move was made (its change is in the settings): never again – a session added later to the layer stays in it. */
export const sessionsMoved = (changes: readonly SettingsChange[]): boolean => changes.some((c) => c.id === SESSIONS_CHANGE_ID)

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const NO7: SessionChoice[] = ['no', 'no', 'no', 'no', 'no', 'no', 'no']
const END = '9999-12-31'
const byId = (a: Template, b: Template) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const hasSessions = (days: readonly SessionChoice[]) => days.some((a) => a !== 'no')

/** A change sets the layer: its sessions or a type's grid. */
function setsLayer(c: SettingsChange): boolean {
  if (c.patch.sessions !== undefined) return true
  const dt = c.patch.dayTypes
  return isPlain(dt) && Object.values(dt).some((x) => isPlain(x) && x.sessions !== undefined)
}

/** The entries a template has from one date of the layer to the next: its sessions with the answers of the weekdays. */
interface Wanted {
  sessions: readonly SessionDef[]
  days: SessionChoice[]
}

/**
 * The block ids of a template's entries (T1406): the session's id, unless an ordinary block of the template (any version)
 * has it – then `<id>-sesja` (a number after it while taken). The same in every version.
 */
function entryIds(t: Template, sessionIds: readonly string[]): Map<string, string> {
  const taken = new Set(t.versions.flatMap((v) => v.blocks.filter((b) => !b.session).map((b) => b.id)))
  const out = new Map<string, string>()
  const used = new Set(sessionIds)
  for (const sid of sessionIds) {
    if (!taken.has(sid)) {
      out.set(sid, sid)
      continue
    }
    let id = `${sid}-sesja`
    for (let n = 2; taken.has(id) || used.has(id); n++) id = `${sid}-sesja${n}`
    used.add(id)
    out.set(sid, id)
  }
  return out
}

/**
 * A version with the entries of `want` (its other blocks as they are): each session of the layer once, at its place when the
 * version has it already (a copy of the version in force), with the hour in Polish time as usual, its name („Sesja NY”) and
 * the answers of the weekdays of that interval; an entry of a session of the layer that `want` has not (a later date of the
 * layer without it) leaves. A block anchored to a session („session:<id>”) follows its entry by its block id – a version
 * before D511 follows it as an ordinary block.
 */
function withEntries(v: TemplateVersion, want: Wanted | null, all: ReadonlySet<string>, ids: ReadonlyMap<string, string>, category: string): TemplateVersion {
  const sessions = want?.sessions ?? []
  const wanted = new Set(sessions.map((d) => d.id))
  const year = Number(v.from.slice(0, 4))
  const entry = (d: SessionDef): PlanBlock => {
    const id = ids.get(d.id) ?? d.id
    const startMin = ((((d.startMin + usualDiffMin(d.zone, year) - PLAN_MIN) % 1440) + 1440) % 1440) + PLAN_MIN
    const durationMin = Math.max(1, Math.min(1440, d.endMin - d.startMin))
    const session = { zone: d.zone, markets: [...d.markets], days: [...want!.days], ...(id !== d.id ? { id: d.id } : {}) }
    return planBlock({ id, categoryId: category, startMin, durationMin, fixed: true, origin: 'template', name: `Sesja ${d.name}`.slice(0, 120), session })
  }
  const of = (b: PlanBlock) => (b.session && all.has(sessionIdOf(b)) ? sessionIdOf(b) : null)
  const blocks = v.blocks.filter((b) => of(b) == null || wanted.has(of(b)!)).map((b) => (of(b) != null ? entry(sessions.find((d) => d.id === of(b))!) : b))
  for (const d of sessions) if (!blocks.some((b) => of(b) === d.id)) blocks.push(entry(d))
  const anchored = blocks.map((b) => {
    const sid = b.anchor?.startsWith('session:') ? b.anchor.slice('session:'.length) : null
    return sid != null && wanted.has(sid) ? { ...b, anchor: ids.get(sid) ?? sid } : b
  })
  return JSON.stringify(anchored) === JSON.stringify(v.blocks) ? v : { ...v, blocks: anchored }
}

/**
 * The template with its entries from the move's date: from each date of the layer to the next the entries of that interval
 * (`wanted`) – a version from the date where the one in force then would change (a copy of it), every later version of the
 * interval with them too. Versions before the move's date stay as they are.
 */
function withSessions(t: Template, dates: readonly string[], wanted: ReadonlyArray<Wanted | null>, all: ReadonlySet<string>, category: string): Template {
  const ids = entryIds(t, [...all])
  let versions = [...t.versions]
  dates.forEach((d, i) => {
    const end = dates[i + 1] ?? END
    const inForce = templateVersionOn({ ...t, versions }, d)
    if (inForce && inForce.from < d) {
      const next = withEntries(inForce, wanted[i]!, all, ids, category)
      if (next !== inForce) versions = [...versions, { ...next, from: d }].sort((a, b) => (a.from < b.from ? -1 : 1))
    }
    versions = versions.map((v) => (v.from >= d && v.from < end ? withEntries(v, wanted[i]!, all, ids, category) : v))
  })
  return { ...t, versions }
}

/**
 * The move as it is to be written from `from` (`changes`, `templates` – as the folder holds them, with your queued edits),
 * null when it was made already.
 */
export function moveSessions(changes: readonly SettingsChange[], templates: readonly Template[], from: string): SessionsMove | null {
  if (sessionsMoved(changes)) return null
  // The dates of the layer: the move's, and every later one a change sets the layer or its grid on.
  const dates = [from, ...new Set(changes.filter((c) => c.from > from && setsLayer(c)).map((c) => c.from))].sort()
  // On the move's date with every change „od dziś” of that day.
  const settings: RulesSettings[] = dates.map((d, i) => settingsOn(changes, d, i === 0 ? Number.MAX_SAFE_INTEGER : null))
  const grid = (type: DayTypeId, i: number): SessionChoice[] => (settings[i]!.sessions.length ? settings[i]!.dayTypes[type].sessions : NO7)
  const all = new Set(settings.flatMap((s) => s.sessions.map((d) => d.id)))
  const category = sessionCategoryOf(settings[0]!.categories)
  // What a template of a type and weekdays has from each date: the sessions with the grid of its type, „nie” on a weekday it
  // does not make; none – no weekday has one.
  const wantedOf = (type: DayTypeId, weekdays: readonly number[]): Array<Wanted | null> =>
    dates.map((_, i) => {
      const days = ALL_DAYS.map((w) => (!weekdays.length || weekdays.includes(w) ? (grid(type, i)[w - 1] ?? 'no') : 'no'))
      return hasSessions(days) ? { sessions: settings[i]!.sessions, days } : null
    })

  const live = templates.filter((t) => !t.archived).sort(byId)
  const exists = new Set(templates.map((t) => t.id))
  const listed = new Set<string>()
  const changed: Template[] = []
  const made: Template[] = []
  for (const t of live) {
    if (!t.versions.length) continue
    const wanted = wantedOf(t.dayType, t.weekdays)
    if (wanted.every((w) => !w)) continue
    listed.add(t.id)
    // Written by the move already (another computer, its rd.json still on the way): never again – your changes since stay.
    if (t.sessionsMoved) continue
    changed.push({ ...withSessions(t, dates, wanted, all, category), sessionsMoved: from })
  }
  // A type with sessions on a weekday no template of its weekdays makes on the date, and no default template of its own: a
  // default with only them – the weekdays of its templates of weekdays stay theirs (`templateFor` – a template of the
  // weekday first), the others get the sessions they had.
  for (const type of DAY_TYPES) {
    if (live.some((t) => t.dayType === type && !t.weekdays.length)) continue
    const covered = new Set(live.filter((t) => t.dayType === type && templateVersionOn(t, from)).flatMap((t) => t.weekdays))
    const wanted = wantedOf(type, [])
    const id = `sesje-${type}`
    if (!wanted.some((w) => w?.days.some((a, i) => a !== 'no' && !covered.has(i + 1))) || exists.has(id)) continue
    const base: Template = { id, name: DAY_TYPE_NAMES[type], dayType: type, weekdays: [], versions: [{ from, blocks: [], budgetMin: null, maxMin: null }], archived: false }
    made.push({ ...withSessions(base, dates, wanted, all, category), sessionsMoved: from })
    listed.add(id)
  }

  // The changes that empty the layer, each laid after the changes of its date made before it (from the files, not the clock):
  // on the move's date also after its changes „od dziś” of the layer. Each keeps the layer of its date (`movedLayer`) and the
  // names of the sessions of every date up to it (`movedSessions`).
  const templateIds = [...listed].sort()
  const names = new Map<string, SessionDef>()
  const out: SettingsChange[] = dates.map((d, i) => {
    for (const s of settings[i]!.sessions) names.set(s.id, s)
    const same = changes.filter((c) => c.from === d)
    const ats = i === 0 ? same.filter((c) => c.at != null && setsLayer(c)).map((c) => c.at!) : []
    const layerGrid = Object.fromEntries(DAY_TYPES.map((t) => [t, settings[i]!.dayTypes[t].sessions]))
    return {
      id: i === 0 ? SESSIONS_CHANGE_ID : `${SESSIONS_CHANGE_ID}-${d}`,
      from: d,
      at: ats.length ? Math.max(...ats) + 1 : null,
      made: Math.max(0, ...same.map((c) => c.made ?? 0)) + 1,
      patch: {
        sessions: [],
        dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])),
        movedSessions: [...names.values()],
        movedLayer: { sessions: settings[i]!.sessions, grid: layerGrid, templates: templateIds }
      }
    }
  })
  return { from, changes: out, changed, made }
}

/** The templates after a move: the changed ones in their places, the made ones after them. */
export function movedTemplates(templates: readonly Template[], move: Pick<SessionsMove, 'changed' | 'made'>): Template[] {
  const changed = new Map(move.changed.map((t) => [t.id, t]))
  return [...templates.map((t) => changed.get(t.id) ?? t), ...move.made]
}

