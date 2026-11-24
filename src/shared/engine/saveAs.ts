/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619): the blocks of a day's plan – the selection of the menu „Zmień N bloków”, or the whole plan
 * from the menu of the day – as the blocks of a template's version from a date (a new version, as a change in „Szablony”: the days before it
 * stay as they are), or as the steps of a new routine. Pure – the window reads and counts the day in the turn of the write and saves.
 *
 * What goes: the blocks of the plan at their planned hours (a begun or done block as it was planned – no facts) in the template's hours (D617: a
 * block of the snapshot the day did not change – its own hour there; any other – the plan's hour with the morning the day's wake moved taken back, as
 * on the axis of „Szablony”), with their subcategory, variant, routine, own cost, name, note, steps (no ticks) and place (fixed, background); a block
 * anchored to another keeps its anchor when that one goes too (or is the template's session, „po sesji NY”), else it gets the hour its anchor gives
 * it in the plan. What stays out (D615): the occurrences of a series, the sessions, the lectures and the classes of a „zjazd” (they come from records
 * of their own) and the blocks taken off the plan (parked, cancelled) – each counted with its word; a template also leaves out a block with no place
 * in the plan and those anchored to it („bez godziny”, `TemplateSave.left`) – a routine takes them as steps after the others, in the plan's order.
 */
import type { DaySnapshot } from '../model/events'
import { BLOCK_NAME_MAX, isSessionEntry, planBlock, sessionIdOf, templateFor, templateVersionOn, withTemplateVersion, type DayFile, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import { MAX_STEPS, STEP_RANGE, type RoutineStep } from '../model/routines'
import type { DayTypeId } from '../model/settings'
import { freshSteps } from '../model/steps'
import { addDays, weekday } from '../time/zone'
import { deepEqual } from '../data/merge'
import { dayWakeMin, firstFixedStart, SESSION_ANCHOR, templateBlockId, unshiftedStart } from './createDay'
import { plannedStartMin } from './planEdit'
import { isOfTemplate } from './templateApply'

/** „Zastąp bloki szablonu” – the version's blocks become these (its sessions stay); „Dołóż” – these join the version's blocks. */
export type SaveAsMode = 'replace' | 'add'

/**
 * Why a block of the day does not go (the words of the window and of the line, as `SkipWhy` of the group's changes); „bez godziny” – a block
 * with no place in the plan (no hour, no anchor that has one), and those anchored to it.
 */
export type SaveAsWhy = 'seria' | 'sesja' | 'wykład' | 'zjazd' | 'zdjęty' | 'bez godziny'

export interface SaveAsPick {
  /** The blocks that go, in the order of their planned start (ties – the plan's order; one without a place – last). */
  take: PlanBlock[]
  /** One word for each block left out, in the plan's order. */
  skipped: SaveAsWhy[]
}

/** Why a block of the plan does not go – null: it goes. */
function whyLeft(b: PlanBlock, o: { off: (id: string) => boolean; ofSeries?: (b: PlanBlock) => boolean }): SaveAsWhy | null {
  if (b.origin === 'series' || o.ofSeries?.(b)) return 'seria'
  if (b.origin === 'session') return 'sesja'
  if (b.origin === 'lecture') return 'wykład'
  if (b.origin === 'zjazd') return 'zjazd'
  if (o.off(b.id)) return 'zdjęty'
  return null
}

/**
 * The blocks of `plan` that go into a template or a routine: `ids` (the selection; an id no longer in the plan is left without a word) or, with
 * null, the whole plan. `off` – the block is taken off the plan for the day (parked or cancelled before it began); `ofSeries` – the block is an
 * occurrence of a series by its record (besides its origin).
 */
export function blocksToSave(plan: readonly PlanBlock[], ids: readonly string[] | null, o: { off: (id: string) => boolean; ofSeries?: (b: PlanBlock) => boolean }): SaveAsPick {
  const wanted = ids ? new Set(ids) : null
  const take: PlanBlock[] = []
  const skipped: SaveAsWhy[] = []
  for (const b of plan) {
    if (wanted && !wanted.has(b.id)) continue
    const why = whyLeft(b, o)
    if (why) skipped.push(why)
    else take.push(b)
  }
  const start = new Map(take.map((b) => [b.id, plannedStartMin(b, plan)]))
  const order = new Map(take.map((b, i) => [b.id, i]))
  take.sort((a, b) => (start.get(a.id) ?? Infinity) - (start.get(b.id) ?? Infinity) || order.get(a.id)! - order.get(b.id)!)
  return { take, skipped }
}

export interface TemplateSave {
  /** The template's blocks made of the day's, in the order of `take`. */
  blocks: PlanBlock[]
  /** The day's id of each of `blocks` (the same order). */
  sources: string[]
  /** „Dołóż”: the day's blocks that are this template's own blocks of the version already – left, not twice. */
  inTemplate: number
  /** The blocks of `take` with no place in the plan (`bez godziny`) – left out with those anchored to them. */
  left: SaveAsWhy[]
}

/**
 * How the day's wake moved its morning (D617, as „Szablony”): `delta` – the day's wake less the template's (a wake of the day's own, the week of
 * the session shift); `asMade` – the blocks of the template that made the day which its file does not change, by their id on the day: each one's
 * hour in the version that made the day (`snapshot.templateFrom` – never the snapshot's own hour, which an occurrence of a series may have pushed),
 * taken as it is, never counted back (a move past the first fixed block, a cut at the day's end cannot be undone from the hour the day shows) – while
 * the morning of the version as the save leaves it is bounded as that version's was (`madeBound`, its first fixed block in the template's hours).
 */
export interface WakeFrame {
  delta: number
  asMade: ReadonlyMap<string, number>
  madeBound: number
}

/** The frame of the day `date` (`dayPlan`'s own difference of wakes) and the hours of the version of its template (`templates`) that made it. */
export function wakeFrameOf(snapshot: DaySnapshot, dayFile: DayFile | null, date: string, templates: readonly Template[]): WakeFrame {
  const delta = dayWakeMin(snapshot, dayFile) - snapshot.templateWakeMin
  const t = snapshot.templateId ? templates.find((x) => x.id === snapshot.templateId) : undefined
  const version = t ? (t.versions.find((v) => v.from === snapshot.templateFrom) ?? templateVersionOn(t, date)) : null
  if (!t || !version) return { delta, asMade: new Map(), madeBound: Number.POSITIVE_INFINITY }
  const changed = new Set((dayFile?.blocks ?? []).map((b) => b.id))
  const own = new Map(version.blocks.map((b) => [b.id, b]))
  const asMade = new Map<string, number>()
  for (const b of snapshot.blocks) {
    const v = b.origin === 'template' && b.sourceId && b.id === templateBlockId(date, t.id, b.sourceId) ? own.get(b.sourceId) : undefined
    if (v?.startMin != null && !v.anchor && !changed.has(b.id)) asMade.set(b.id, v.startMin)
  }
  return { delta, asMade, madeBound: firstFixedStart(version.blocks) }
}

/**
 * The template's blocks made of the day's `take` (of `plan`, the day `date`): a block the template `templateId` gave the day keeps its id in the
 * template (its attachments and the days' changes of it go on), any other gets a new one (`newId`) – never an id the template has had in any version
 * (`allIds`: its attachments stay its own). `version` – the template's version in force from the date of the save (null – none yet): „Dołóż” leaves
 * a block of the template the version has already (`inTemplate`); an anchor goes to a block of the version as it will be (one saved, or – „Dołóż” –
 * one it keeps), or to a session of it (`session:<id>`), else the block takes the hour the plan gives it. A block with no place at all is left
 * (`left`), and the blocks anchored to it with it – no anchor points at a block that is not there. The hours are the template's (`wake`, D617): a
 * block of the snapshot the day did not change – its own hour in the snapshot; any other – the plan's hour taken back by the day's wake as a drag on
 * the axis of „Szablony” is (`unshiftedStart`), the morning bounded by the first fixed block of the version as the save leaves it (the days made of
 * it bound theirs so). A block beside another (D492) keeps its hour without the group – a template has no parallel blocks. `taskTitle` – the title
 * of the task of „Sprawy” that names a block of a task (the template has no task: the title is its name).
 */
export function templateBlocksOf(
  take: readonly PlanBlock[],
  plan: readonly PlanBlock[],
  o: {
    date: string
    templateId: string
    version: TemplateVersion | null
    mode: SaveAsMode
    newId: () => string
    taskTitle?: (task: string) => string | null
    wake?: WakeFrame
    allIds?: ReadonlySet<string>
  }
): TemplateSave {
  const versionBlocks = o.version?.blocks ?? []
  const own = new Set(versionBlocks.filter((b) => !isSessionEntry(b)).map((b) => b.id))
  const sessions = new Set(versionBlocks.filter(isSessionEntry).map(sessionIdOf))
  // What the version keeps besides the blocks made here: its sessions, and – „Dołóż” – every block of it.
  const kept = versionBlocks.filter((b) => o.mode === 'add' || isSessionEntry(b))
  // The ids the version will have: a block of this template takes its own id when no other has taken it.
  const taken = new Set(kept.map((b) => b.id))
  // The ids a new block never gets: those, and every id the template has had (`allIds`).
  const known = new Set([...taken, ...(o.allIds ?? [])])
  // The day's id → the template's id of every block of the version as it will be (for the anchors).
  const idOf = new Map<string, string>()
  const ofThis = (b: PlanBlock): string | null => (b.sourceId && isOfTemplate(b, o.date, o.templateId) ? b.sourceId : null)
  if (o.mode === 'add')
    for (const b of plan) {
      const src = ofThis(b)
      if (src && own.has(src)) idOf.set(b.id, src)
    }
  const fresh = (): string => {
    let id = o.newId()
    while (known.has(id) || taken.has(id)) id = o.newId()
    return id
  }
  const going: Array<{ b: PlanBlock; id: string }> = []
  let inTemplate = 0
  for (const b of take) {
    const src = ofThis(b)
    if (o.mode === 'add' && src && own.has(src)) {
      inTemplate++
      continue
    }
    const id = src && !taken.has(src) ? src : fresh()
    taken.add(id)
    known.add(id)
    idOf.set(b.id, id)
    going.push({ b, id })
  }
  const byId = new Map(plan.map((b) => [b.id, b]))
  const anchorOf = (b: PlanBlock): string | null => {
    if (!b.anchor) return null
    const a = byId.get(b.anchor)
    return idOf.get(b.anchor) ?? (a?.origin === 'session' && a.sourceId && sessions.has(a.sourceId) ? `${SESSION_ANCHOR}${a.sourceId}` : null)
  }
  // A block with no place leaves the version's ids first – then a block anchored to it has none either (to the fixed point: chains of anchors).
  const placeless = new Set<string>()
  for (let changed = true; changed; ) {
    changed = false
    for (const { b } of going) {
      if (placeless.has(b.id) || anchorOf(b) != null || plannedStartMin(b, plan) != null) continue
      placeless.add(b.id)
      idOf.delete(b.id)
      changed = true
    }
  }
  // The first fixed block of the version as the save leaves it (a fixed block keeps its hour on any wake): what bounds the morning of its days – in
  // the template's hours (to compare with the bound of the version that made the day) and as the day has it (a session where the day has it: a week
  // of the session shift has it an hour earlier – what the day's hours are counted back against, as `templatePush.frameOf`).
  const placed = going.filter(({ b }) => !placeless.has(b.id))
  const placedFixed = placed.flatMap(({ b }) => (b.fixed && !anchorOf(b) ? [{ ...b, startMin: plannedStartMin(b, plan) }] : []))
  const boundAfter = firstFixedStart([...kept, ...placedFixed])
  const sessionStart = new Map(plan.flatMap((b) => (b.origin === 'session' && b.sourceId && b.startMin != null ? [[b.sourceId, b.startMin] as const] : [])))
  const firstFixed = firstFixedStart([...kept.map((b) => (isSessionEntry(b) ? { ...b, startMin: sessionStart.get(sessionIdOf(b)) ?? b.startMin } : b)), ...placedFixed])
  // A block as made goes at its own hour only while the morning of its days is bounded as before (else the day as it is wins: counted back, D617).
  const asMadeOk = o.wake != null && boundAfter === o.wake.madeBound
  const hourOf = (b: PlanBlock, dayStart: number): number => {
    if (!o.wake) return dayStart
    const asMade = asMadeOk && !b.anchor ? o.wake.asMade.get(b.id) : undefined
    return asMade ?? unshiftedStart({ ...b, anchor: null }, dayStart, o.wake.delta, firstFixed)
  }
  const blocks: PlanBlock[] = []
  const sources: string[] = []
  for (const { b, id } of placed) {
    sources.push(b.id)
    const anchor = anchorOf(b)
    const dayStart = anchor ? null : plannedStartMin(b, plan)
    const title = b.task ? (o.taskTitle?.(b.task) ?? null) : null
    blocks.push(
      planBlock({
        id,
        categoryId: b.categoryId,
        variantId: b.variantId,
        startMin: dayStart == null ? null : hourOf(b, dayStart),
        anchor,
        durationMin: b.durationMin,
        fixed: b.fixed,
        background: b.background,
        costs: b.costs,
        bgCostPct: b.bgCostPct,
        note: b.note,
        name: b.name ?? (title?.trim().slice(0, BLOCK_NAME_MAX) || null),
        origin: 'template',
        routine: b.routine,
        steps: freshSteps(b.steps)
      })
    )
  }
  return { blocks, sources, inTemplate, left: [...placeless].map((): SaveAsWhy => 'bez godziny') }
}

/**
 * What a version holds without its date – its blocks by id (their order in the file is not what it makes) with an anchor to a session's entry as
 * `session:<id>` (the same anchor, written either way – a save writes the latter), its budget, limit and the move of sessions.
 */
function bodyOf(v: TemplateVersion) {
  const entries = new Map(v.blocks.filter(isSessionEntry).map((b) => [b.id, sessionIdOf(b)]))
  const blocks = v.blocks.map((b) => (b.anchor && entries.has(b.anchor) ? { ...b, anchor: `${SESSION_ANCHOR}${entries.get(b.anchor)!}` } : b))
  return { blocks: blocks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), budgetMin: v.budgetMin, maxMin: v.maxMin, sessionsMoved: v.sessionsMoved ?? null }
}

/** Two versions make the same days (the save's version and the one in force before it): a save that changes nothing writes nothing – „bez zmian”. */
export const sameVersionBody = (a: TemplateVersion, b: TemplateVersion): boolean => deepEqual(bodyOf(a), bodyOf(b))

/**
 * The day saved would have some block of the save twice (D616): one that stays in the day after the save – a block of its file (yours, or one it
 * changed) – and is not the day's block of this very template (that one is the same block the template gives it). A block of the snapshot of another
 * template leaves the day with that template; a save of the day's blocks of this template alone gives the day what it has already – no warning.
 */
export function bringsNewBlocks(save: Pick<TemplateSave, 'blocks' | 'sources'>, dayFile: Pick<DayFile, 'blocks'> | null, date: string, templateId: string): boolean {
  const file = new Set((dayFile?.blocks ?? []).map((b) => b.id))
  return save.blocks.some((b, i) => {
    const source = save.sources[i]!
    return file.has(source) && source !== templateBlockId(date, templateId, b.id)
  })
}

/**
 * The template with its version from `from` changed (made when it is not there yet – a copy of the one in force then, as every change of a
 * template; the versions before and after it stay as they are): „Zastąp” – its blocks are `blocks` and its sessions (the template's entries,
 * D511 – changed in the template's panel, not here), „Dołóż” – `blocks` join its blocks.
 */
export function savedTemplate(t: Template, from: string, blocks: readonly PlanBlock[], mode: SaveAsMode): Template {
  return withTemplateVersion(t, from, (v) => ({ blocks: mode === 'replace' ? [...v.blocks.filter(isSessionEntry), ...blocks] : [...v.blocks, ...blocks] }))
}

/**
 * The date a save starts from by default (D616): tomorrow (a template's change never takes today, which is made already); a day saved that is
 * tomorrow or later – the day after it: the day keeps its own blocks and the template has them from the next one (else that day would have them twice).
 */
export function saveAsFrom(date: string, today: string): string {
  const tomorrow = addDays(today, 1)
  return date < tomorrow ? tomorrow : addDays(date, 1)
}

/**
 * The day saved takes the template's blocks itself (D616): it is on or after `from`, the template makes it after the save (`dayTemplateId` –
 * `dayTemplateAfter`) and its version in force that day is the one the save wrote (`next` – the template after the save; a later version already in
 * force by then makes the day without them) – its own blocks and the template's copies of them would stand twice. The window says it (D72 – nothing
 * is refused).
 */
export const savedDayTwice = (date: string, from: string, dayTemplateId: string | null, next: Template): boolean =>
  from <= date && dayTemplateId === next.id && templateVersionOn(next, date)?.from === from

/**
 * The template that makes the day `date` of the type `dayType` once the save wrote `next` (`templateFor` – its weekday's, else its type's default):
 * a template without a version on the day before the save may be the day's one after it. Null – none.
 */
export function dayTemplateAfter(templates: readonly Template[], next: Template, dayType: DayTypeId, date: string): string | null {
  const after = templates.some((t) => t.id === next.id) ? templates.map((t) => (t.id === next.id ? next : t)) : [...templates, next]
  return templateFor(after, dayType, weekday(date), date)?.template.id ?? null
}

export interface RoutineSave {
  steps: RoutineStep[]
  /** Blocks longer than a step can be (`STEP_RANGE`, 4 h): their step is 4 h. */
  clipped: number
  /** Blocks beyond the most steps a routine has (`MAX_STEPS`): left out. */
  cut: number
}

/**
 * The steps of a new routine made of the blocks `take` (in their order – the planned start): the name the block shows (`nameOf` – its own, else
 * its task's, routine's, variant's or subcategory's) and its planned length, as a step can have them (1–240 min, at most 40 steps).
 */
export function routineStepsOf(take: readonly PlanBlock[], nameOf: (b: PlanBlock) => string, newId: () => string): RoutineSave {
  const [lo, hi] = STEP_RANGE
  const steps = take.slice(0, MAX_STEPS).map((b): RoutineStep => ({ id: newId(), name: nameOf(b).trim().slice(0, 80), min: Math.min(hi, Math.max(lo, Math.round(b.durationMin))) }))
  return { steps, clipped: take.slice(0, MAX_STEPS).filter((b) => b.durationMin > hi).length, cut: Math.max(0, take.length - MAX_STEPS) }
}
