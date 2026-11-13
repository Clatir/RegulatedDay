/**
 * Changes of a plan you make in the main window (spec „Bloki”, „Przeniesienie”, „Szablony dnia z datą obowiązywania,
 * kopiowanie dnia i szablonu”): a new block, a block moved to another day (its id stays, the counter of moves grows only
 * when you move it yourself), a day copied to other dates, a template copied. Pure: they answer the new blocks; the
 * window writes them as edits of the files.
 */
import { REQUEST_CATEGORY, type CategoryRules } from '../model/categories'
import { newId } from '../model/ids'
import { blockJson, dayBlocks, dayRaw, isRaw, putBlock, putRawBlock, setMovedTo, setStepsDone, stepsDoneIn, takeBlock, type Raw } from '../data/dayEdits'
import type { DaySnapshot } from '../model/events'
import { dayFileFrom, MAX_BLOCK_MIN, PLAN_MAX, PLAN_MIN, planBlock, type DayFile, type PlanBlock, type Template } from '../model/plan'
import { freshSteps } from '../model/steps'
import { logicalMinuteOf } from '../time/day'
import { plannedSpan, type BlockInfo } from './blocks'
import { dayPlan, dayWakeMin, morningBound, wakeShiftedStart } from './createDay'
import type { DayState } from './day'
import { atOf, idxOfLogical } from './grid'

/** A start kept in the logical day (04:00–03:59). */
const inDay = (startMin: number): number => Math.max(PLAN_MIN, Math.min(PLAN_MAX - 1, startMin))

/** A new block of yours: flexible, in the place its category starts in, its id random. */
export function newUserBlock(categoryId: string, startMin: number, durationMin: number, rules: CategoryRules | undefined, p: Partial<PlanBlock> = {}): PlanBlock {
  return planBlock({
    id: newId(),
    categoryId,
    startMin: inDay(startMin),
    durationMin: Math.max(1, Math.min(MAX_BLOCK_MIN, durationMin)),
    fixed: false,
    background: rules?.startsInBackground ? true : null,
    origin: 'user',
    ...p
  })
}

/**
 * The first gap of the day's forecast from index `from` that holds `lengthMin` in the foreground (after the blocks it
 * meets), as a logical minute – where a block chosen „teraz” (requests from the queue) goes.
 */
export function freeStart(state: DayState, from: number, lengthMin: number): number {
  const fg = state.forecast.filter((p) => !p.bg).sort((a, b) => a.from - b.from)
  let at = Math.max(0, from)
  for (const p of fg) {
    if (p.to <= at) continue
    if (p.from >= at + lengthMin) break
    at = Math.max(at, p.to)
  }
  return logicalMinuteOf(state.grid.date, atOf(state.grid, at))
}

/**
 * Ctrl+N (spec „Tworzenie”): a new block of `lengthMin` in the nearest free place of the day's forecast from the logical
 * minute `fromMin` – never over a block planned or running there (A6-24).
 */
export function newBlockStart(state: DayState, fromMin: number, lengthMin = 60): number {
  return freeStart(state, idxOfLogical(state.grid, fromMin), lengthMin)
}

/** A block dragged on the axis of a day or a template (D305) to a new start, kept in the logical day. */
export const draggedBlock = (b: PlanBlock, startMin: number): PlanBlock => ({ ...b, startMin: inDay(startMin) })

/**
 * The blocks of the day's own file a changed wake moves (D334, spec „Pobudkę możesz ustawić osobno”, replaces T450 for the
 * blocks you placed): once, at the change, by the difference between the new wake and the old one – the flexible ones
 * that start before the first fixed block of the plan (in a day without a fixed block: every flexible one), not those
 * anchored to another, and not those in `keep` (begun ones). `firstFixed` is the bound of the morning as `dayPlan` counts it (`morningBound`). The blocks of the snapshot follow the day's wake on their
 * own (`dayPlan`); a block added after the change stays where it was put. Returns the moved copies only.
 */
export function wakeShifted(own: readonly PlanBlock[], plan: readonly PlanBlock[], firstFixed: number, fromWakeMin: number, toWakeMin: number, keep: ReadonlySet<string> = new Set()): PlanBlock[] {
  const delta = toWakeMin - fromWakeMin
  const shown = new Set(plan.map((b) => b.id))
  const out: PlanBlock[] = []
  for (const b of own) {
    if (keep.has(b.id) || !shown.has(b.id)) continue
    const startMin = wakeShiftedStart(b, delta, firstFixed)
    if (startMin != null) out.push({ ...b, startMin })
  }
  return out
}

/**
 * The blocks a change of the day's wake moves (D334): `snapshot` is the day's own as the engine counts it (the log's,
 * else the one computed now), `file` the day's file as it is, `wakeMin` the value to store (null: the day's type again).
 */
export function wakeChange(snapshot: DaySnapshot, file: DayFile, wakeMin: number | null, keep: ReadonlySet<string> = new Set()): PlanBlock[] {
  return wakeShifted(file.blocks, dayPlan(snapshot, file), morningBound(snapshot, file), dayWakeMin(snapshot, file), wakeMin ?? snapshot.wakeMin, keep)
}

/**
 * Whether a block of the day's plan leaves it by being cancelled for the day (the snapshot's – template, lecture, session –
 * also a session the answer „tak” added, which is in no snapshot) and not by being taken out of the file (your own).
 */
export function leavesByCancel(id: string, snapshot: Pick<DaySnapshot, 'blocks'>, file: Pick<DayFile, 'blocks'> | null): boolean {
  return snapshot.blocks.some((b) => b.id === id) || !file?.blocks.some((b) => b.id === id)
}

/** The planned start of a block (an anchored one: its anchor's planned end), a logical minute; null when unknown. */
export function plannedStartMin(b: PlanBlock, plan: readonly PlanBlock[], depth = 0): number | null {
  if (b.startMin != null) return b.startMin
  if (!b.anchor || depth > 20) return null
  const a = plan.find((x) => x.id === b.anchor)
  if (!a) return null
  const s = plannedStartMin(a, plan, depth + 1)
  return s == null ? null : s + a.durationMin
}

/**
 * A block moved to another day (spec „Przeniesienie bloku na inny dzień zachowuje jego identyfikator”): on the source
 * day it leaves (movedTo), on the target it comes with its planned time (an anchored one is placed where its anchor
 * ends – the anchor is not on that day), the day it came from, and one move more when you move it yourself.
 */
export function movedBlock(b: PlanBlock, plan: readonly PlanBlock[], fromDate: string, byYou: boolean, startMin?: number): PlanBlock {
  const start = startMin ?? plannedStartMin(b, plan) ?? 9 * 60
  return {
    ...b,
    startMin: inDay(start),
    anchor: null,
    movedFrom: fromDate,
    moves: b.moves + (byYou ? 1 : 0),
    origin: movedOrigin(b.origin)
  }
}

/**
 * A block moved to another day is yours there (the template of that day has its own; a class imported for one day is a
 * block of that day's „zjazd” only – an import of the other day never takes it); an occurrence of a series stays one.
 */
const movedOrigin = (o: PlanBlock['origin']): PlanBlock['origin'] => (o === 'session' || o === 'lecture' || o === 'zjazd' || o === 'template' ? 'user' : o)

/** The blocks of the plan anchored to `id` – directly or through one another – in the plan's order (D417, T911). */
export function anchoredTo(plan: readonly PlanBlock[], id: string): PlanBlock[] {
  const ids = new Set([id])
  for (let grew = true; grew; ) {
    grew = false
    for (const b of plan) {
      if (b.anchor == null || !ids.has(b.anchor) || ids.has(b.id)) continue
      ids.add(b.id)
      grew = true
    }
  }
  return plan.filter((b) => b.id !== id && ids.has(b.id))
}

/** What a move takes besides the block (D417): its start on the target and the blocks anchored to it (T911). */
export interface MoveOptions {
  /** Its start on the target (where it was dropped in a column of „Tydzień” or „3 dni”); none – its planned time, as „Przenieś na…”. */
  startMin?: number
  /** Blocks anchored to it (`anchoredTo`): they go with it and stay anchored – as on its day, where they follow it. */
  followers?: readonly PlanBlock[]
}

/**
 * The source's half of a move: the day notes where each block went (`movedTo`), one of yours leaves its blocks, their ticks
 * leave it (they go with them). Made over the file as it is (`moveBetweenDays` – a write of the source after the target's).
 */
export function moveSource(fromRaw: Raw | null, ids: readonly string[], fromDate: string, toDate: string): Raw {
  const own = new Set(dayFileFrom(fromRaw ?? {}, fromDate).blocks.map((x) => x.id))
  let source = dayRaw(fromRaw, fromDate)
  for (const id of ids) {
    source = setStepsDone(setMovedTo(source, id, toDate), id, [])
    if (own.has(id)) source = takeBlock(source, id)
  }
  return source
}

/**
 * The target's half of a move: it takes the block (and its followers, still anchored to it) – and forgets a move of the
 * same block away from it before (a block moved back is there again). Their ticks go with them (D440, D442): the target has
 * exactly the ticks the source day has for each now – its file says them, whatever ticks the block given carries (one read
 * from the file has none) – an old tick of the block there (from before it left that day) goes. Each block as the source's
 * file holds it goes whole (T901): fields this version does not know (a newer one wrote them) stay with it – only what the
 * move changes is written over them.
 */
export function moveTarget(fromRaw: Raw | null, toRaw: Raw | null, b: PlanBlock, plan: readonly PlanBlock[], fromDate: string, toDate: string, byYou = true, opts: MoveOptions = {}): Raw {
  const raws = dayBlocks(dayRaw(fromRaw, fromDate))
  const put = (raw: Raw, moved: PlanBlock): Raw => {
    const was = raws.find((x) => isRaw(x) && x.id === moved.id) as Raw | undefined
    return setStepsDone(setMovedTo(was ? putRawBlock(raw, blockJson(moved, was)) : putBlock(raw, moved), moved.id, null), moved.id, stepsDoneIn(fromRaw, moved.id))
  }
  let target = put(dayRaw(toRaw, toDate), movedBlock(b, plan, fromDate, byYou, opts.startMin))
  // A follower keeps its anchor (its hour is its anchor's end), the day it came from and one move more, as the block.
  for (const f of opts.followers ?? []) target = put(target, { ...f, movedFrom: fromDate, moves: f.moves + (byYou ? 1 : 0), origin: movedOrigin(f.origin) })
  return target
}

/**
 * The two files of a move (spec „Przeniesienie”): the source notes where the block went (one of yours leaves its blocks),
 * the target takes it (`moveSource`, `moveTarget`).
 */
export function moveBetweenDays(fromRaw: Raw | null, toRaw: Raw | null, b: PlanBlock, plan: readonly PlanBlock[], fromDate: string, toDate: string, byYou = true, opts: MoveOptions = {}): { source: Raw; target: Raw } {
  const ids = [b.id, ...(opts.followers ?? []).map((f) => f.id)]
  return { source: moveSource(fromRaw, ids, fromDate, toDate), target: moveTarget(fromRaw, toRaw, b, plan, fromDate, toDate, byYou, opts) }
}

/**
 * A day copied to another (spec „Skopiuj ten dzień do…”): your blocks and the template's, with new ids (anchors follow
 * them), as yours; sessions and lectures come from that day's own layer and plan of lectures, so they are not copied.
 * The target's own template blocks are cancelled – its plan becomes the copied one.
 */
export function copiedDay(plan: readonly PlanBlock[]): PlanBlock[] {
  const take = plan.filter((b) => b.origin === 'user' || b.origin === 'template')
  const ids = new Map(take.map((b) => [b.id, newId()]))
  const out: PlanBlock[] = []
  for (const b of take) {
    const anchor = b.anchor ? (ids.get(b.anchor) ?? null) : null
    const start = b.anchor && !anchor ? plannedStartMin(b, plan) : b.startMin
    if (anchor == null && start == null) continue
    out.push({
      ...b,
      id: ids.get(b.id)!,
      anchor,
      startMin: anchor ? null : start,
      origin: 'user',
      sourceId: null,
      moves: 0,
      movedFrom: null,
      // A request belongs to one day: a copy is a plain block of its category; no variant changed it there.
      requests: [],
      // Its steps start again on the day of the copy (D440): the copy has new ids, the day's ticks are the original's.
      steps: freshSteps(b.steps),
      byVariant: false
    })
  }
  return out
}

/**
 * A template copied (spec „kopiowanie … szablonu”): a new id, its versions with new ids of blocks (anchors follow). The
 * copy starts in the archive – it makes no day until you give it its weekdays and bring it back (a copy in use at once
 * would take the original's days: templates of one weekday are chosen by id).
 */
export function copiedTemplate(t: Template, id: string, name: string): Template {
  return {
    ...t,
    id,
    name,
    archived: true,
    versions: t.versions.map((v) => {
      const ids = new Map(v.blocks.map((b) => [b.id, newId(10)]))
      return {
        ...v,
        blocks: v.blocks.map((b) => ({
          ...b,
          id: ids.get(b.id)!,
          anchor: b.anchor && !b.anchor.startsWith('session:') ? (ids.get(b.anchor) ?? null) : b.anchor
        }))
      }
    })
  }
}

/** A block of requests chosen from the queue: one block (one contact), as long as their estimates. */
export function requestsBlock(ids: readonly string[], minutes: number, startMin: number, rules: CategoryRules | undefined): PlanBlock {
  return newUserBlock(REQUEST_CATEGORY, startMin, Math.max(5, minutes), rules, { requests: [...ids] })
}

/** The planned span of a block of the day as logical minutes (for the views). */
export function spanMin(state: DayState, b: BlockInfo): { start: number; end: number } | null {
  const s = plannedSpan(b, new Map(state.blocks.map((x) => [x.id, x])))
  if (!s) return null
  const lm = (idx: number) => logicalMinuteOf(state.grid.date, atOf(state.grid, idx))
  return { start: lm(s.start), end: lm(s.end) }
}
