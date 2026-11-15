/**
 * The move of the layer of sessions into the templates (D511): once, from a date (the day it is made – „od dziś”; the
 * wizard's from the start). The sessions of the settings and the grid „tak / nie / pytaj” (type × weekday) become entries of
 * the templates (`PlanBlock.session`, `model/templateSessions.ts`) in every version from that date: „tak” – a session, „pytaj”
 * – a session with „pytaj rano”, „nie” – none. A change of the layer or its grid from a later date (made before the move,
 * „od jutra”) is moved too: from its date the templates have the sessions it set (a version from that date), and the layer is
 * emptied from it as well. A template whose weekdays have different answers is split into copies: it keeps the answers of
 * most of its weekdays (a tie – of the first weekday), every other answer gets a copy for its weekdays (a weekday's template
 * wins over the type's default one – `templateFor`); a copy has its original's versions from the date (and its file the
 * original's fields this version cannot read – `folder.sessionsStart`) – a day before it stays its original's – and its days
 * get the copy's ids: the move rewrites the files of the days from the date and their attachments to them (`dayIdMap`), so a
 * version before D511 makes the same ids. A type and
 * weekday with sessions that no template makes gets a new template with only them. A copy or a new template sorts after a
 * template of yours that starts later on its weekdays (`templateFor` picks by id) – from its start yours makes the day. An
 * ordinary block with a session's id gets another id (`<id>-blok`): one id is one session (answers, its typical length). The
 * changes of the settings from those dates empty the layer (no session, every type „nie”) – a version before D511 sees no
 * session of the layer and shows the entries as fixed blocks of their category, never twice – and mark the move as made.
 *
 * Pure and deterministic: the same files give the same templates, the same ids and the same changes (their order from the
 * files, no instant of the clock) – two computers moving at once write the same records; a move over records it made already
 * changes nothing in them (a fixed point), and with the change in the settings it is not made again.
 */
import { templateBlockId } from '../engine/createDay'
import { WEEKDAY_SHORT } from '../format'
import { derivedId } from './ids'
import { PLAN_MIN, planBlock, templateFor, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from './plan'
import { DAY_TYPES, DAY_TYPE_NAMES, settingsOn, type DayTypeId, type SessionChoice, type SessionDef, type SettingsChange } from './settings'
import { sessionCategoryOf, usualDiffMin } from './templateSessions'
import { weekday } from '../time/zone'

/** The change of the settings that empties the layer of sessions from the date of the move and marks the move as made. */
export const SESSIONS_CHANGE_ID = 'sesje-w-szablonach'

/** A change of the move: the first one, or one of a later date the layer changed on (`sesje-w-szablonach-<date>`). */
export const isMoveChange = (id: string): boolean => id === SESSIONS_CHANGE_ID || id.startsWith(`${SESSIONS_CHANGE_ID}-`)

export interface SessionsMove {
  from: string
  /** The changes that empty the layer: from `from` and from every later date the layer or its grid changes on. */
  changes: SettingsChange[]
  /** Templates there were, as they are to be written (versions from the dates with the sessions, weekdays of a split). */
  changed: Template[]
  /** Templates made by the move: copies of a split (`copyOf` – its original, whose file is the copy's base) and new ones. */
  made: Array<{ template: Template; copyOf: string | null }>
  /** Every template after the move (the days' ids – `dayIdMap`). */
  after: Template[]
  /** Ordinary blocks given another id for a session's (template → its id before → after), in versions from `from`. */
  renamed: Record<string, Record<string, string>>
}

/** The move was made (its change is in the settings): never again – a session added later to the layer stays in it. */
export const sessionsMoved = (changes: readonly SettingsChange[]): boolean => changes.some((c) => c.id === SESSIONS_CHANGE_ID)

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const NO7: SessionChoice[] = ['no', 'no', 'no', 'no', 'no', 'no', 'no']
const daysKey = (days: readonly number[]) => days.join('')
const daysText = (days: readonly number[]) => days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')
const byId = (a: Template, b: Template) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A change sets the layer: its sessions or a type's grid. */
function setsLayer(c: SettingsChange): boolean {
  if (c.patch.sessions !== undefined) return true
  const dt = c.patch.dayTypes
  return isPlain(dt) && Object.values(dt).some((x) => isPlain(x) && x.sessions !== undefined)
}

/**
 * An id that sorts after `others` (`templateFor` picks a template of a weekday, and a default one, by id): `preferred`, unless
 * one of them is not before it – then after the last of them; too long – derived (64 characters at most).
 */
function idAfter(preferred: string, others: readonly string[], suffix: string): string {
  const later = others.filter((o) => o >= preferred).sort()
  const own = later.length ? `${later.at(-1)}_${suffix}` : preferred
  return own.length <= 64 ? own : derivedId('sesje', own)
}

/** Weekdays grouped by their answers (one per date of the layer), in the order of their first weekday. */
function groups(days: readonly number[], answers: (w: number) => SessionChoice[]): Array<{ answers: SessionChoice[]; days: number[] }> {
  const out: Array<{ answers: SessionChoice[]; days: number[] }> = []
  for (const w of [...days].sort()) {
    const a = answers(w)
    const g = out.find((x) => x.answers.join() === a.join())
    if (g) g.days.push(w)
    else out.push({ answers: a, days: [w] })
  }
  return out
}

/** The group a split template keeps: most weekdays, a tie – the one with the first weekday. */
const mainOf = <G extends { days: number[] }>(gs: readonly G[]): G => gs.reduce((best, g) => (g.days.length > best.days.length ? g : best), gs[0]!)
const hasSessions = (answers: readonly SessionChoice[]) => answers.some((a) => a !== 'no')

/** The layer on each date of the move: its sessions and grid there. */
interface Layer {
  dates: string[]
  sessions: SessionDef[][]
  answer: (type: DayTypeId, w: number) => SessionChoice[]
}

/**
 * The template with the sessions of `answers` (one per date of the layer) in its versions from the move's date – a version
 * from a date of the layer where it applies and the answer or the sessions change (a copy of the one in force); its ordinary
 * blocks with a session's id renamed (`renamed`), a block anchored to a session („session:<id>”) following its entry.
 */
function withSessions(t: Template, layer: Layer, answers: readonly SessionChoice[], category: string, renamed: Record<string, string>): Template {
  if (!hasSessions(answers)) return t
  const from = layer.dates[0]!
  let versions = [...t.versions]
  layer.dates.forEach((d, i) => {
    const inForce = templateVersionOn({ ...t, versions }, d)
    if (!inForce || versions.some((v) => v.from === d)) return
    const same = i > 0 && answers[i] === answers[i - 1] && JSON.stringify(layer.sessions[i]) === JSON.stringify(layer.sessions[i - 1])
    if (!same || i === 0) versions = [...versions, { ...inForce, from: d }].sort((a, b) => (a.from < b.from ? -1 : 1))
  })
  const interval = (d: string) => layer.dates.reduce((k, x, i) => (x <= d ? i : k), 0)
  versions = versions.map((v) => {
    if (v.from < from) return v
    const i = interval(v.from)
    return withEntries(renamedIn(v, renamed), layer.sessions[i]!, answers[i]!, category, Number(v.from.slice(0, 4)))
  })
  return { ...t, versions }
}

/** A version with its blocks renamed (and what follows or stands beside them). */
function renamedIn(v: TemplateVersion, renamed: Record<string, string>): TemplateVersion {
  if (!Object.keys(renamed).length) return v
  const to = (id: string | null) => (id != null ? (renamed[id] ?? id) : id)
  return { ...v, blocks: v.blocks.map((b) => ({ ...b, id: b.session ? b.id : to(b.id)!, anchor: b.anchor?.startsWith('session:') ? b.anchor : to(b.anchor), alongside: to(b.alongside) })) }
}

/**
 * The sessions as entries of a version (its other blocks as they are): each once – one there already stays as it is – with
 * the session's id, the hour in Polish time as usual and the session's name („Sesja NY”); a block anchored to a session
 * („session:<id>”) follows its entry by its id.
 */
function withEntries(v: TemplateVersion, sessions: readonly SessionDef[], answer: SessionChoice, category: string, year: number): TemplateVersion {
  if (answer === 'no' || !sessions.length) return v
  const blocks = [...v.blocks]
  for (const d of sessions) {
    if (blocks.some((b) => b.id === d.id)) continue
    const startMin = (((d.startMin + usualDiffMin(d.zone, year) - PLAN_MIN) % 1440) + 1440) % 1440 + PLAN_MIN
    const durationMin = Math.max(1, Math.min(1440, d.endMin - d.startMin))
    blocks.push(planBlock({ id: d.id, categoryId: category, startMin, durationMin, fixed: true, origin: 'template', name: `Sesja ${d.name}`.slice(0, 120), session: { zone: d.zone, ask: answer === 'ask', markets: [...d.markets] } }))
  }
  const ids = new Set(sessions.map((d) => d.id))
  return { ...v, blocks: blocks.map((b) => (b.anchor?.startsWith('session:') && ids.has(b.anchor.slice('session:'.length)) ? { ...b, anchor: b.anchor.slice('session:'.length) } : b)) }
}

/** The ordinary blocks of a template's versions from `from` with a session's id, each with a free id of its own. */
function renamesOf(t: Template, from: string, sessionIds: ReadonlySet<string>): Record<string, string> {
  const taken = new Set(t.versions.flatMap((v) => v.blocks.map((b) => b.id)))
  const out: Record<string, string> = {}
  for (const v of t.versions) {
    if (v.from < from && v !== templateVersionOn(t, from)) continue
    for (const b of v.blocks) {
      if (b.session || !sessionIds.has(b.id) || out[b.id]) continue
      let id = `${b.id}-blok`
      for (let n = 2; taken.has(id); n++) id = `${b.id}-blok${n}`
      taken.add(id)
      out[b.id] = id
    }
  }
  return out
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
  const settings = dates.map((d, i) => settingsOn(changes, d, i === 0 ? Number.MAX_SAFE_INTEGER : null))
  const layer: Layer = {
    dates,
    sessions: settings.map((s) => s.sessions),
    answer: (type, w) => settings.map((s) => (s.sessions.length ? (s.dayTypes[type].sessions[w - 1] ?? 'no') : 'no'))
  }
  const sessionIds = new Set(layer.sessions.flat().map((d) => d.id))
  const category = sessionCategoryOf(settings[0]!.categories)
  const live = templates.filter((t) => !t.archived).sort(byId)
  const exists = new Set(templates.map((t) => t.id))
  const changed: Template[] = []
  const made: SessionsMove['made'] = []
  const renamed: SessionsMove['renamed'] = {}
  const change = (before: Template, after: Template) => {
    if (JSON.stringify(after) !== JSON.stringify(before)) changed.push(after)
  }
  const make = (t: Template, copyOf: string | null) => {
    if (exists.has(t.id)) return
    exists.add(t.id)
    made.push({ template: t, copyOf })
  }
  const withSessionsOf = (t: Template, answers: readonly SessionChoice[]) => {
    const r = hasSessions(answers) ? renamesOf(t, from, sessionIds) : {}
    if (Object.keys(r).length) renamed[t.id] = r
    return withSessions(t, layer, answers, category, r)
  }

  for (const type of DAY_TYPES) {
    const ofType = live.filter((t) => t.dayType === type)
    const answers = (w: number) => layer.answer(type, w)
    // What applies on the date: the weekday's templates over the type's default (`templateFor`).
    const covered = new Set(ofType.filter((t) => t.weekdays.length && templateVersionOn(t, from)).flatMap((t) => t.weekdays))
    // A template of a weekday of yours from a later date: from its start it makes the day, a copy sorts after it.
    const laterOn = (days: readonly number[], except: string) => ofType.filter((t) => t.id !== except && t.weekdays.some((w) => days.includes(w))).map((t) => t.id)
    for (const t of ofType) {
      if (!templateVersionOn(t, from) && !t.versions.some((v) => v.from > from)) continue
      const days = t.weekdays.length ? t.weekdays : ALL_DAYS.filter((w) => !covered.has(w))
      if (!days.length) continue
      const gs = groups(days, answers)
      const main = mainOf(gs)
      // The template keeps the answers of most of its weekdays; a weekday's template keeps only those weekdays.
      let kept = withSessionsOf(t, main.answers)
      if (gs.length > 1 && t.weekdays.length) kept = { ...kept, weekdays: main.days }
      change(t, kept)
      for (const g of gs) {
        if (g === main) continue
        // From the move's date only (the version in force then and the later ones): a day before it stays its original's.
        const inForce = templateVersionOn(t, from)
        const versions = [...(inForce ? [{ ...inForce, from }] : []), ...t.versions.filter((v) => v.from > from)]
        const copy: Template = { ...t, id: idAfter(`${t.id}_${daysKey(g.days)}`, laterOn(g.days, t.id), daysKey(g.days)), name: `${t.name} (${daysText(g.days)})`.slice(0, 80), weekdays: g.days, versions, archived: false }
        make(withSessionsOf(copy, g.answers), t.id)
      }
    }
    // Weekdays no template of the type makes on the date, with sessions: a template with only them.
    if (ofType.some((t) => !t.weekdays.length && templateVersionOn(t, from))) continue
    const open = ALL_DAYS.filter((w) => !covered.has(w))
    if (!open.length) continue
    const gs = groups(open, answers)
    if (!gs.some((g) => hasSessions(g.answers))) continue
    // A default of yours from a later date: from its start it makes the day – one default of the move sorts after it (with
    // weekdays of other answers, the answers of most of them – a template of weekdays would win over yours).
    const defaults = ofType.filter((t) => !t.weekdays.length).map((t) => t.id)
    const whole = gs.length === 1 ? gs[0]! : defaults.length ? mainOf(gs) : null
    const fresh = (id: string, weekdays: number[], name: string, answersOf: readonly SessionChoice[]) => {
      const t: Template = { id, name, dayType: type, weekdays, versions: [{ from, blocks: [], budgetMin: null, maxMin: null }], archived: false }
      make(withSessionsOf(t, answersOf), null)
    }
    if (whole) {
      if (hasSessions(whole.answers)) fresh(idAfter(`sesje-${type}`, defaults, 'sesje'), [], DAY_TYPE_NAMES[type], whole.answers)
      continue
    }
    for (const g of gs) {
      if (hasSessions(g.answers)) fresh(idAfter(`sesje-${type}-${daysKey(g.days)}`, laterOn(g.days, ''), daysKey(g.days)), g.days, `${DAY_TYPE_NAMES[type]} (${daysText(g.days)})`, g.answers)
    }
  }

  // The changes that empty the layer, each laid after the changes of its date made before it (from the files, not the clock):
  // on the move's date also after its changes „od dziś” of the layer.
  const patchOf = (sessions: SessionDef[]) => ({ sessions: [], movedSessions: sessions, dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])) })
  const out: SettingsChange[] = dates.map((d, i) => {
    const same = changes.filter((c) => c.from === d)
    const ats = i === 0 ? same.filter((c) => c.at != null && setsLayer(c)).map((c) => c.at!) : []
    return {
      id: i === 0 ? SESSIONS_CHANGE_ID : `${SESSIONS_CHANGE_ID}-${d}`,
      from: d,
      at: ats.length ? Math.max(...ats) + 1 : null,
      made: Math.max(0, ...same.map((c) => c.made ?? 0)) + 1,
      patch: patchOf(layer.sessions[i]!)
    }
  })
  const after = movedTemplates(templates, { changed, made })
  return { from, changes: out, changed, made, after, renamed }
}

/** The templates after a move: the changed ones in their places, the made ones after them. */
export function movedTemplates(templates: readonly Template[], move: Pick<SessionsMove, 'changed' | 'made'>): Template[] {
  const changed = new Map(move.changed.map((t) => [t.id, t]))
  return [...templates.map((t) => changed.get(t.id) ?? t), ...move.made.map((m) => m.template)]
}

/**
 * The ids of a day's blocks of a template that change with the move (D511): a block of a template whose weekday went to a
 * copy, or an ordinary block renamed for a session's id – the id the day had (`templateBlockId` of the template before) →
 * the one it has now. Empty when the day is made by the same template with the same ids. A day from the move's date on.
 */
export function dayIdMap(move: Pick<SessionsMove, 'after' | 'renamed'>, before: readonly Template[], date: string, dayType: DayTypeId): Map<string, string> {
  const out = new Map<string, string>()
  const a = templateFor(before, dayType, weekday(date), date)
  const b = templateFor(move.after, dayType, weekday(date), date)
  if (!a || !b) return out
  const renamed = move.renamed[b.template.id] ?? {}
  for (const x of a.version.blocks) {
    if (x.session) continue
    const y = renamed[x.id] ?? x.id
    if (!b.version.blocks.some((z) => z.id === y && !z.session)) continue
    const was = templateBlockId(date, a.template.id, x.id)
    const now = templateBlockId(date, b.template.id, y)
    if (was !== now) out.set(was, now)
  }
  return out
}

/** A record with the ids of `map` changed wherever they are – keys and values (a day's file, an attachment's owner). */
export function withIds(value: unknown, map: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return map.get(value) ?? value
  if (Array.isArray(value)) return value.map((x) => withIds(x, map))
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, x]) => [map.get(k) ?? k, withIds(x, map)]))
  return value
}
