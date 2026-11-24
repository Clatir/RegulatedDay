/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619): the blocks of a day's plan – the selection of the menu „Zmień N bloków”, or the whole plan
 * from the menu of the day – as the blocks of a template's version from a date (a new version, as a change in „Szablony”: the days before it
 * stay as they are), or as the steps of a new routine. Pure – the window reads and counts the day in the turn of the write and saves.
 *
 * What goes: the blocks of the plan at their planned hours (a begun or done block as it was planned – no facts), with their subcategory, variant,
 * routine, own cost, name, note, steps (no ticks) and place (fixed, background); a block anchored to another keeps its anchor when that one goes too
 * (or is the template's session, „po sesji NY”), else it gets the hour its anchor gives it in the plan. What stays out (D615): the occurrences of a
 * series, the sessions, the lectures and the classes of a „zjazd” (they come from records of their own) and the blocks taken off the plan
 * (parked, cancelled) – each counted with its word.
 */
import { BLOCK_NAME_MAX, isSessionEntry, planBlock, sessionIdOf, withTemplateVersion, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import { MAX_STEPS, STEP_RANGE, type RoutineStep } from '../model/routines'
import { freshSteps } from '../model/steps'
import { addDays } from '../time/zone'
import { SESSION_ANCHOR } from './createDay'
import { plannedStartMin } from './planEdit'
import { isOfTemplate } from './templateApply'

/** „Zastąp bloki szablonu” – the version's blocks become these (its sessions stay); „Dołóż” – these join the version's blocks. */
export type SaveAsMode = 'replace' | 'add'

/** Why a block of the day does not go (the words of the window and of the line, as `SkipWhy` of the group's changes). */
export type SaveAsWhy = 'seria' | 'sesja' | 'wykład' | 'zjazd' | 'zdjęty'

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
  /** „Dołóż”: the day's blocks that are this template's own blocks of the version already – left, not twice. */
  inTemplate: number
}

/**
 * The template's blocks made of the day's `take` (of `plan`, the day `date`): a block the template `templateId` gave the day keeps its id in the
 * template (its attachments and the days' changes of it go on), any other gets a new one (`newId`). `version` – the template's version in force from
 * the date of the save (null – none yet): „Dołóż” leaves a block of the template the version has already (`inTemplate`); an anchor goes to a
 * block of the version as it will be (one saved, or – „Dołóż” – one it keeps), or to a session of it (`session:<id>`), else the block takes the hour
 * the plan gives it. A block beside another (D492) keeps its hour without the group – a template has no parallel blocks. `taskTitle` – the title of
 * the task of „Sprawy” that names a block of a task (the template has no task: the title is its name).
 */
export function templateBlocksOf(
  take: readonly PlanBlock[],
  plan: readonly PlanBlock[],
  o: { date: string; templateId: string; version: TemplateVersion | null; mode: SaveAsMode; newId: () => string; taskTitle?: (task: string) => string | null }
): TemplateSave {
  const versionBlocks = o.version?.blocks ?? []
  const own = new Set(versionBlocks.filter((b) => !isSessionEntry(b)).map((b) => b.id))
  const sessions = new Set(versionBlocks.filter(isSessionEntry).map(sessionIdOf))
  // The ids the version will have besides the ones made here: its sessions, and – „Dołóż” – every block it keeps.
  const used = new Set(versionBlocks.filter((b) => o.mode === 'add' || isSessionEntry(b)).map((b) => b.id))
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
    while (used.has(id)) id = o.newId()
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
    const id = src && !used.has(src) ? src : fresh()
    used.add(id)
    idOf.set(b.id, id)
    going.push({ b, id })
  }
  const byId = new Map(plan.map((b) => [b.id, b]))
  const blocks: PlanBlock[] = []
  for (const { b, id } of going) {
    let anchor: string | null = null
    if (b.anchor) {
      const a = byId.get(b.anchor)
      anchor = idOf.get(b.anchor) ?? (a?.origin === 'session' && a.sourceId && sessions.has(a.sourceId) ? `${SESSION_ANCHOR}${a.sourceId}` : null)
    }
    const startMin = anchor ? null : plannedStartMin(b, plan)
    if (!anchor && startMin == null) continue
    const title = b.task ? (o.taskTitle?.(b.task) ?? null) : null
    blocks.push(
      planBlock({
        id,
        categoryId: b.categoryId,
        variantId: b.variantId,
        startMin,
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
  return { blocks, inTemplate }
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
 * The day saved takes the template's blocks itself (D616): it is on or after `from` and the template makes it – its own blocks and the template's
 * copies of them would stand twice. The window says it (D72 – nothing is refused).
 */
export const savedDayTwice = (date: string, from: string, dayTemplateId: string | null, templateId: string): boolean => from <= date && dayTemplateId === templateId

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
