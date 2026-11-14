/**
 * The move of the layer of sessions into the templates (D511): once, from a date (the day it is made – „od dziś”; the
 * wizard's from the start). The sessions of the settings and the grid „tak / nie / pytaj” (type × weekday) become entries of
 * the templates (`PlanBlock.session`, `model/templateSessions.ts`) in every version from that date: „tak” – a session, „pytaj”
 * – a session with „pytaj rano”, „nie” – none. A template whose weekdays have different answers is split into copies: it
 * keeps the answer of most of its weekdays (a tie – the one of the first weekday), every other answer gets a copy for its
 * weekdays (a weekday's template wins over the type's default one – `templateFor`); a copy keeps every version of its
 * original and the days' ids of its blocks (`blockIdsOf`), so a day before the date and a day's own changes stay as they were.
 * A type and weekday with sessions that no template makes gets a new template with only them. A change of the settings
 * from the date empties the layer (no session, every type „nie”) – a version before D511 sees no session of the layer from
 * then and shows the entries as fixed blocks of their category, never twice – and marks the move as made.
 *
 * Pure and deterministic: the same files give the same templates, the same ids (a copy `<id>_<weekdays>`, a new template
 * `sesje-<type>[-<weekdays>]`, an entry the session's id) and the same change (`SESSIONS_CHANGE_ID`, no instant) – two
 * computers moving at once write the same records; a move over records it made already changes nothing in them (a fixed
 * point), and with the change in the settings it is not made again.
 */
import { WEEKDAY_SHORT } from '../format'
import { derivedId } from './ids'
import { PLAN_MIN, planBlock, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from './plan'
import { DAY_TYPES, DAY_TYPE_NAMES, settingsOn, type DayTypeId, type SessionChoice, type SessionDef, type SettingsChange } from './settings'
import { sessionCategoryOf, usualDiffMin } from './templateSessions'

/** The change of the settings that empties the layer of sessions and marks the move as made. */
export const SESSIONS_CHANGE_ID = 'sesje-w-szablonach'

export interface SessionsMove {
  change: SettingsChange
  /** Templates there were, as they are to be written (a version from the date with the sessions, weekdays of a split). */
  changed: Template[]
  /** Templates made by the move: copies of a split and new ones. */
  made: Template[]
}

/** The move was made (its change is in the settings): never again – a session added later to the layer stays in it. */
export const sessionsMoved = (changes: readonly SettingsChange[]): boolean => changes.some((c) => c.id === SESSIONS_CHANGE_ID)

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const NO7: SessionChoice[] = ['no', 'no', 'no', 'no', 'no', 'no', 'no']
const daysKey = (days: readonly number[]) => days.join('')
const daysText = (days: readonly number[]) => days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')
const byId = (a: Template, b: Template) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The id of a copy of a split template: `<id>_<weekdays>` – after its original in the list of „Szablony” (the files by name;
 * „_” after „.”); an id too long for it – derived from both.
 */
function copyId(id: string, days: readonly number[]): string {
  const own = `${id}_${daysKey(days)}`
  return own.length <= 64 ? own : derivedId('sesje', id, daysKey(days))
}

/** The id of a session's entry in a version: the session's own, unless an ordinary block of the version has it. */
function entryIdIn(blocks: readonly PlanBlock[], sessionId: string): string {
  const own = blocks.find((b) => b.id === sessionId)
  return own && !own.session ? `ses-${sessionId}` : sessionId
}

/**
 * The sessions of the layer as entries of a version (its other blocks as they are): each once – one there already stays as
 * it is – with the hour in Polish time as usual and the session's name („Sesja NY”); a block anchored to a session
 * („session:<id>”) follows its entry by its id.
 */
function withEntries(v: TemplateVersion, layer: readonly SessionDef[], answer: SessionChoice, category: string, year: number): TemplateVersion {
  if (answer === 'no' || !layer.length) return v
  const blocks = [...v.blocks]
  const entryOf = new Map<string, string>()
  for (const d of layer) {
    const id = entryIdIn(v.blocks, d.id)
    entryOf.set(d.id, id)
    if (blocks.some((b) => b.id === id)) continue
    const startMin = (((d.startMin + usualDiffMin(d.zone, year) - PLAN_MIN) % 1440) + 1440) % 1440 + PLAN_MIN
    const durationMin = Math.max(1, Math.min(1440, d.endMin - d.startMin))
    blocks.push(planBlock({ id, categoryId: category, startMin, durationMin, fixed: true, origin: 'template', name: `Sesja ${d.name}`.slice(0, 120), session: { zone: d.zone, ask: answer === 'ask', markets: [...d.markets] } }))
  }
  const anchored = blocks.map((b) => {
    const to = b.anchor?.startsWith('session:') ? entryOf.get(b.anchor.slice('session:'.length)) : undefined
    return to ? { ...b, anchor: to } : b
  })
  return { ...v, blocks: anchored }
}

/** The template with the sessions of `answer` in every version from `from` (one made from `from` when it applies then). */
function withSessionsFrom(t: Template, from: string, layer: readonly SessionDef[], answer: SessionChoice, category: string): Template {
  if (answer === 'no' || !layer.length) return t
  let versions = t.versions
  const inForce = templateVersionOn(t, from)
  if (inForce && !versions.some((v) => v.from === from)) versions = [...versions, { ...inForce, from }].sort((a, b) => (a.from < b.from ? -1 : 1))
  const year = Number(from.slice(0, 4))
  return { ...t, versions: versions.map((v) => (v.from >= from ? withEntries(v, layer, answer, category, year) : v)) }
}

/** Weekdays grouped by their answer, in the order of their first weekday. */
function groups(days: readonly number[], answerOf: (w: number) => SessionChoice): Array<{ answer: SessionChoice; days: number[] }> {
  const out: Array<{ answer: SessionChoice; days: number[] }> = []
  for (const w of [...days].sort()) {
    const a = answerOf(w)
    const g = out.find((x) => x.answer === a)
    if (g) g.days.push(w)
    else out.push({ answer: a, days: [w] })
  }
  return out
}

/** The group a split template keeps: most weekdays, a tie – the one with the first weekday. */
const mainOf = <G extends { days: number[] }>(gs: readonly G[]): G => gs.reduce((best, g) => (g.days.length > best.days.length ? g : best), gs[0]!)

/**
 * The move as it is to be written from `from` (`changes`, `templates` – as the folder holds them, with your queued edits),
 * null when it was made already.
 */
export function moveSessions(changes: readonly SettingsChange[], templates: readonly Template[], from: string): SessionsMove | null {
  if (sessionsMoved(changes)) return null
  const s = settingsOn(changes, from)
  const layer = s.sessions
  const answerOf = (type: DayTypeId) => (w: number) => (layer.length ? (s.dayTypes[type].sessions[w - 1] ?? 'no') : 'no')
  const category = sessionCategoryOf(s.categories)
  const live = templates.filter((t) => !t.archived).sort(byId)
  const exists = new Set(templates.map((t) => t.id))
  const changed: Template[] = []
  const made: Template[] = []
  const change = (before: Template, after: Template) => {
    if (JSON.stringify(after) !== JSON.stringify(before)) changed.push(after)
  }
  const make = (t: Template) => {
    if (exists.has(t.id)) return
    exists.add(t.id)
    made.push(t)
  }

  for (const type of DAY_TYPES) {
    const ofType = live.filter((t) => t.dayType === type)
    const answer = answerOf(type)
    // What applies on the date: the weekday's templates over the type's default (`templateFor`).
    const covered = new Set(ofType.filter((t) => t.weekdays.length && templateVersionOn(t, from)).flatMap((t) => t.weekdays))
    // A default of the type, also one from a later date, is never shadowed by a new one (`templateFor` picks by id).
    const hasDefault = ofType.some((t) => !t.weekdays.length)
    for (const t of ofType) {
      if (!templateVersionOn(t, from) && !t.versions.some((v) => v.from > from)) continue
      const days = t.weekdays.length ? t.weekdays : ALL_DAYS.filter((w) => !covered.has(w))
      if (!days.length) continue
      const gs = groups(days, answer)
      const main = mainOf(gs)
      // The template keeps the answer of most of its weekdays; a weekday's template keeps only those weekdays.
      let kept = withSessionsFrom(t, from, layer, main.answer, category)
      if (gs.length > 1 && t.weekdays.length) kept = { ...kept, weekdays: main.days }
      change(t, kept)
      for (const g of gs) {
        if (g === main) continue
        const copy: Template = { ...t, id: copyId(t.id, g.days), name: `${t.name} (${daysText(g.days)})`.slice(0, 80), weekdays: g.days, archived: false, blockIdsOf: t.blockIdsOf ?? t.id }
        make(withSessionsFrom(copy, from, layer, g.answer, category))
      }
    }
    // Weekdays no template of the type makes, with sessions: a template with only them.
    if (hasDefault) continue
    const open = ALL_DAYS.filter((w) => !covered.has(w))
    if (!open.length) continue
    const gs = groups(open, answer).filter((g) => g.answer !== 'no')
    const whole = gs.length === 1 && gs[0]!.days.length === open.length
    for (const g of gs) {
      const t: Template = {
        id: whole ? `sesje-${type}` : `sesje-${type}-${daysKey(g.days)}`,
        name: whole ? DAY_TYPE_NAMES[type] : `${DAY_TYPE_NAMES[type]} (${daysText(g.days)})`,
        dayType: type,
        weekdays: whole ? [] : g.days,
        versions: [{ from, blocks: [], budgetMin: null, maxMin: null }],
        archived: false
      }
      make(withSessionsFrom(t, from, layer, g.answer, category))
    }
  }

  const patch = { sessions: [], dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])) }
  // Laid after every change from the same date made before it (also the wizard's) – from the files, not the clock.
  const after = Math.max(0, ...changes.filter((c) => c.from === from).map((c) => c.made ?? 0)) + 1
  return { change: { id: SESSIONS_CHANGE_ID, from, at: null, made: after, patch }, changed, made }
}

/** The templates after a move: the changed ones in their places, the made ones after them. */
export function movedTemplates(templates: readonly Template[], move: SessionsMove): Template[] {
  const changed = new Map(move.changed.map((t) => [t.id, t]))
  return [...templates.map((t) => changed.get(t.id) ?? t), ...move.made]
}
