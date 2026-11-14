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
import { dayFileFrom, layerKept, MAX_BLOCK_MIN, PLAN_MAX, PLAN_MIN, planBlock, type DayFile, type PlanBlock, type Template } from '../model/plan'
import { freshSteps } from '../model/steps'
import { logicalMinuteOf } from '../time/day'
import { plannedSpan, type BlockInfo } from './blocks'
import { dayPlan, dayWakeMin, morningBound, wakeShiftedStart } from './createDay'
import type { DayState } from './day'
import { stayingIds, type BlockFact, type DayFacts } from './facts'
import type { RulesSettings } from '../model/settings'
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
    origin: movedOrigin(b.origin),
    // A block moved to another day leaves its group of parallel blocks (D492, T1167): the group stays on its day.
    alongside: null
  }
}

/**
 * A block moved to another day is yours there (the template of that day has its own; a class imported for one day is a
 * block of that day's „zjazd” only – an import of the other day never takes it); an occurrence of a series stays one.
 */
const movedOrigin = (o: PlanBlock['origin']): PlanBlock['origin'] => (o === 'session' || o === 'lecture' || o === 'zjazd' || o === 'template' ? 'user' : o)

/**
 * What keeps a block anchored to the moved one on its day (D424, D426, T961, T980): its state – begun or done, parked,
 * cancelled (`ids`, from `stayingIds`) – and its kind, by the categories of the day (`categories`).
 */
export interface StayRule {
  ids: ReadonlySet<string>
  categories: Readonly<Record<string, CategoryRules>>
}

/** No block stays by its state nor by its category – only by its layer (`layerKept`). */
export const NO_STAY: StayRule = { ids: new Set(), categories: {} }

/** The rule of a day as counted: its facts (none – no state known) and its settings. */
export const stayRuleOf = (facts: Pick<DayFacts, 'blocks'> | null | undefined, settings: Pick<RulesSettings, 'categories'>): StayRule => ({ ids: facts ? stayingIds(facts) : new Set(), categories: settings.categories })

/**
 * A block of a kind that keeps its day (D426, T980): of its day's layers (`layerKept` – a session of the layer, a lecture, a
 * class of a „zjazd”), a session of a category of the kind „sesja” (D338), a block of a category „nie przenosić na jutro”
 * or protected.
 */
function keptKind(b: PlanBlock, categories: StayRule['categories']): boolean {
  if (layerKept(b)) return true
  const r = categories[b.categoryId]
  return r != null && (r.kind === 'session' || r.noMoveTomorrow || r.protected)
}

/**
 * What goes with a block moved to another day (D424, D426, T951, T961, T980): the blocks anchored to it – directly or through
 * one another – that have not begun, are on the day and may move (`StayRule`) – `followers`, in the plan's order: they go
 * with it, still anchored; any other stays on its day (`stayers`) with its own hour, and what is anchored to it stays with it.
 */
export function moveGroup(plan: readonly PlanBlock[], id: string, stay: StayRule = NO_STAY): { followers: PlanBlock[]; stayers: PlanBlock[] } {
  const going = new Set([id])
  const staying = new Set<string>()
  for (let grew = true; grew; ) {
    grew = false
    for (const b of plan) {
      if (b.anchor == null || !going.has(b.anchor) || going.has(b.id) || staying.has(b.id)) continue
      ;(stay.ids.has(b.id) || keptKind(b, stay.categories) ? staying : going).add(b.id)
      grew = true
    }
  }
  return { followers: plan.filter((b) => b.id !== id && going.has(b.id)), stayers: plan.filter((b) => staying.has(b.id)) }
}

/**
 * The blocks among `ids` a variant moves as moves of their own (T962): those not going already as a follower of another one
 * of them (`moveGroup`) – a block anchored to a moved one goes with it, never as a second move.
 */
export function moveRoots(plan: readonly PlanBlock[], ids: readonly string[], stay: StayRule = NO_STAY): string[] {
  const along = new Set(ids.flatMap((id) => moveGroup(plan, id, stay).followers.map((f) => f.id)))
  return ids.filter((id) => !along.has(id))
}

/**
 * Where a block that stays on its day stands (D424, T961): its planned start – its anchor's end – kept in the logical day,
 * else its own start, else 09:00. The one rule of the write (`moveSource`) and of a variant's count (`planWith`).
 */
export const stayerStart = (s: PlanBlock, plan: readonly PlanBlock[]): number => inDay(plannedStartMin(s, plan) ?? s.startMin ?? 9 * 60)

/** Why a block anchored to the moved one stayed on its day (D424, D426, T965): it runs, it is over, parked, cancelled, or of a kind that stays. */
export type StayHow = 'running' | 'done' | 'parked' | 'cancelled' | 'kept'

export function stayHowOf(f: Pick<BlockFact, 'startedAt' | 'endedAt' | 'parkedAt' | 'cancelledAt'> | undefined): StayHow {
  if (f?.startedAt != null) return f.endedAt != null ? 'done' : 'running'
  if (f?.parkedAt != null) return 'parked'
  if (f?.cancelledAt != null) return 'cancelled'
  return 'kept'
}

/** What a move takes besides the block: its start on the target (D417) and the blocks that stay (D424). */
export interface MoveOptions {
  /** Its start on the target (where it was dropped in a column of „Tydzień” or „3 dni”); none – its planned time, as „Przenieś na…”. */
  startMin?: number
  /** What keeps a block anchored to it on its day (`stayRuleOf`: its state and its category – D424, D426, T961, T980). */
  stay?: StayRule
  /** Moved by a variant (D313): the whole group is marked (`byVariant` – no note for accuracy, T963). */
  byVariant?: boolean
  /** Dropped onto a block of the target (D492): beside that block (the first of its group) – `startMin` is the group's start. */
  alongside?: string | null
}

/**
 * The source's half of a move (D424): the day notes where the block and its followers went (`movedTo`), one of yours leaves
 * its blocks, their ticks leave it (they go with them); a block anchored to it that stays keeps its own hour – its planned
 * start, no anchor (it would leave the plan with its anchor gone). Made over the file as it is (`file` – the same, parsed).
 */
export function moveSource(fromRaw: Raw | null, file: DayFile, b: PlanBlock, plan: readonly PlanBlock[], toDate: string, group: { followers: readonly PlanBlock[]; stayers: readonly PlanBlock[] }): Raw {
  const fromDate = file.date
  const own = new Set(file.blocks.map((x) => x.id))
  let source = dayRaw(fromRaw, fromDate)
  for (const id of [b.id, ...group.followers.map((f) => f.id)]) {
    source = setStepsDone(setMovedTo(source, id, toDate), id, [])
    if (own.has(id)) source = takeBlock(source, id)
  }
  for (const s of group.stayers) {
    const now = file.blocks.find((x) => x.id === s.id) ?? s
    source = putBlock(source, { ...now, anchor: null, startMin: stayerStart({ ...s, startMin: s.startMin ?? now.startMin }, plan) })
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
export function moveTarget(
  fromRaw: Raw | null,
  toRaw: Raw | null,
  b: PlanBlock,
  plan: readonly PlanBlock[],
  fromDate: string,
  toDate: string,
  byYou: boolean,
  startMin: number | undefined,
  followers: readonly PlanBlock[],
  byVariant = false,
  alongside: string | null = null
): Raw {
  const raws = dayBlocks(dayRaw(fromRaw, fromDate))
  const put = (raw: Raw, moved: PlanBlock): Raw => {
    const was = raws.find((x) => isRaw(x) && x.id === moved.id) as Raw | undefined
    return setStepsDone(setMovedTo(was ? putRawBlock(raw, blockJson(moved, was)) : putBlock(raw, moved), moved.id, null), moved.id, stepsDoneIn(fromRaw, moved.id))
  }
  const mark = byVariant ? { byVariant: true } : {}
  let target = put(dayRaw(toRaw, toDate), { ...movedBlock(b, plan, fromDate, byYou, startMin), ...mark, alongside })
  // A follower keeps its anchor (its hour is its anchor's end), the day it came from and one move more, as the block; it stays
  // beside a block that goes too, else leaves its group (T1167).
  const going = new Set([b.id, ...followers.map((f) => f.id)])
  for (const f of followers) target = put(target, { ...f, movedFrom: fromDate, moves: f.moves + (byYou ? 1 : 0), origin: movedOrigin(f.origin), alongside: f.alongside && going.has(f.alongside) ? f.alongside : null, ...mark })
  return target
}

/**
 * The two files of a move (spec „Przeniesienie”, D424 – every way: „Przenieś na…”, a variant, „Tydzień”): the source notes
 * where the block went (one of yours leaves its blocks), the target takes it, with the blocks anchored to it that go
 * (`moveGroup`); one that stays keeps its day with its own hour (`moveSource`, `moveTarget`). The blocks given as the plan has
 * them – the file's version of each is taken where the file has one (the file parsed once).
 */
export function moveBetweenDays(fromRaw: Raw | null, toRaw: Raw | null, b: PlanBlock, plan: readonly PlanBlock[], fromDate: string, toDate: string, byYou = true, opts: MoveOptions = {}): { source: Raw; target: Raw; followers: PlanBlock[]; stayers: PlanBlock[] } {
  const group = moveGroup(plan, b.id, opts.stay)
  const file = dayFileFrom(fromRaw ?? {}, fromDate)
  const followers = group.followers.map((f) => file.blocks.find((x) => x.id === f.id) ?? f)
  return {
    source: moveSource(fromRaw, file, b, plan, toDate, group),
    target: moveTarget(fromRaw, toRaw, b, plan, fromDate, toDate, byYou, opts.startMin, followers, opts.byVariant, opts.alongside ?? null),
    followers,
    stayers: group.stayers
  }
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
      byVariant: false,
      // Beside the copy of its group's block (T1167); that one not copied – a block of its own.
      alongside: b.alongside ? (ids.get(b.alongside) ?? null) : null
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
          anchor: b.anchor && !b.anchor.startsWith('session:') ? (ids.get(b.anchor) ?? null) : b.anchor,
          alongside: b.alongside ? (ids.get(b.alongside) ?? null) : null
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
