/**
 * Przeciąganie grupy (D531, ciąg Z): a selected block of a selection of two and more dragged in „Dziś”, „Szablony”, „Tydzień” or „3 dni” moves
 * (with Ctrl – copies) every selected block that may be dragged (D305) by the same difference of days and minutes – the place the grabbed one is
 * dropped at less where its tile stood. Pure: which blocks go and where (`judgeDrag` – each by the rule of its own drag, the same as „Przesuń o”
 * and „Przenieś na dzień” of the menu, `judgeGroup`); the others stay where they are and are said why (`DragStayWhy`, the words of the line
 * „Przeniesiono 3 bloki · 1 został – już trwa”); the files of all the days after it – ONE change (`draggedDays`): within its day each block at its
 * start plus the minutes (`shiftedDay`), to another day as „Przenieś na…” moves one (`moveTarget` / `moveSource` – its id stays, the blocks
 * anchored to it that may go go with it, D424), at its start plus the minutes; the flexible blocks of every day on the places taken pushed apart
 * (D367: `groupPush` – the blocks the drag put hold their starts); a copy – each one as Ctrl + drag copies a block (D513), the originals held where
 * they are. What is written is what the days show after it (the starts of the drag from where the axis shows each block – `axisStartOf`).
 */
import { blockNow, dayRaw, putBlock, type Raw } from '../data/dayEdits'
import { dayFileFrom, PLAN_MAX, PLAN_MIN, type PlanBlock } from '../model/plan'
import { addDays } from '../time/zone'
import { dayPlan } from './createDay'
import type { BlockFact } from './facts'
import { axisStartsOf, followsMoving, groupPush, judgeGroup, patchedPlan, pushedPlan, shiftedDay, shiftPatches, withPushedStarts, type GroupDay, type GroupSkip } from './groupEdit'
import { groupRootOf } from './parallel'
import { moveGroup, moveSource, moveTarget, stayRuleOf, type StayRule } from './planEdit'
import { axisMoves, withBlock, type PushedBlock } from './pushApart'

/** A block of the selection: its day and its id. */
export interface DragKey {
  date: string
  id: string
}

/** The difference the drag moves every block by: whole days and minutes (the grabbed block's drop less its start). */
export interface DragDelta {
  days: number
  minutes: number
}

/**
 * Why a selected block stays where it is (D531) – the words of the line after „został – ”: it runs or it is over, parked, cancelled, a session of
 * the layer, a lecture, a class of a „zjazd”, anchored to a block that does not go (`zakotwiczony`; one that follows a moved block never stays),
 * anchored to a moved one but of a kind that keeps its day (`w swoim dniu`, D426), without an hour of its own, its time passed (`minął`), its day
 * or the day it would go to gone by (`dzień minął`), out of the logical day (`poza dniem`), onto a day the view does not show (`poza widokiem`),
 * not in the plan any more (`nie ma w planie` – removed on another computer).
 */
export type DragStayWhy =
  | 'już trwa'
  | 'już zrobiony'
  | 'zaparkowany'
  | 'odwołany'
  | 'sesja'
  | 'wykład'
  | 'zjazd'
  | 'zakotwiczony'
  | 'w swoim dniu'
  | 'bez godziny'
  | 'minął'
  | 'dzień minął'
  | 'poza dniem'
  | 'poza widokiem'
  | 'nie ma w planie'

export interface DragStay extends DragKey {
  why: DragStayWhy
}

/** A block the drag takes: from its day to the day it goes to (the same – within its day), at its new start (logical minutes). */
export interface DragMove extends DragKey {
  to: string
  startMin: number
}

/**
 * What the drag does (D531): `take` – the blocks it moves (copies), each with its new place, in the order of their days and plans; `along` – the
 * selected blocks that follow a moved one (anchored to it, D424: nothing of their own is written; a copy takes none); `stayed` – the others.
 */
export interface DragJudged {
  take: DragMove[]
  along: DragKey[]
  stayed: DragStay[]
  /** The difference it was judged for (T1779: kept, never counted back from the starts). */
  delta: DragDelta
}

/** The words of a block left out by the rule of its drag (`judgeGroup`'s reason, the fact of the block for a begun or taken-off one). */
function stayWhy(day: GroupDay, s: GroupSkip, today: string): DragStayWhy {
  return stayWordOf(s.why, day.state.facts.blocks.get(s.id), day.ctx.date < today)
}

/**
 * The words of a reason of `judgeGroup` for a block a drag leaves (D531): a begun one runs or is over (`f` – its fact), one taken off is parked
 * or cancelled; `pastDay` – its day has gone by.
 */
export function stayWordOf(why: GroupSkip['why'], f?: Pick<BlockFact, 'endedAt' | 'parkedAt' | 'cancelledAt'>, pastDay = false): DragStayWhy {
  switch (why) {
    case 'zaczęty':
    case 'skończony':
      return f?.endedAt != null ? 'już zrobiony' : 'już trwa'
    case 'zdjęty':
      return f?.cancelledAt != null && f.parkedAt == null ? 'odwołany' : 'zaparkowany'
    case 'sesja':
    case 'wykład':
    case 'zjazd':
    case 'zakotwiczony':
    case 'bez godziny':
    case 'poza dniem':
      return why
    case 'zostaje':
      return 'w swoim dniu'
    case 'miniony':
      return pastDay ? 'dzień minął' : 'minął'
    default:
      return 'nie ma w planie'
  }
}

/**
 * Which of the selected blocks (`keys`) the drag takes and where (D531, D305): each day's blocks judged on that day by the rule of their own drag
 * – within its day as „Przesuń o” (`judgeGroup` 'shift': begun, taken off, a session, a lecture, a „zjazd”, anchored, without an hour, passed, out
 * of the logical day – stay), to another day as „Przenieś na dzień” at its start plus the minutes (the blocks anchored to a moved one follow it, one
 * of a kind that keeps its day stays – D424, D426). A block that would go to a day gone by (`today` – the logical day now) or one the view does
 * not show (`inView`) stays. A copy (`copy`, D513) takes only the blocks that may be dragged – one anchored stays. `days` – each day of the
 * selection as counted (a day missing – its blocks are not in the plan).
 */
export function judgeDrag(days: ReadonlyMap<string, GroupDay>, keys: readonly DragKey[], delta: DragDelta, today: string, o: { inView?: (date: string) => boolean; copy?: boolean } = {}): DragJudged {
  const out: DragJudged = { take: [], along: [], stayed: [], delta }
  const byDay = new Map<string, string[]>()
  for (const k of keys) byDay.set(k.date, [...(byDay.get(k.date) ?? []), k.id])
  for (const [date, ids] of [...byDay].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const day = days.get(date)
    if (!day) {
      out.stayed.push(...ids.map((id) => ({ date, id, why: 'nie ma w planie' as const })))
      continue
    }
    const to = addDays(date, delta.days)
    const stay = (s: GroupSkip) => out.stayed.push({ date, id: s.id, why: stayWhy(day, s, today) })
    // Each block by the rule of its drag: its start plus the minutes within the logical day.
    const own = judgeGroup(day, ids, { k: 'shift', minutes: delta.minutes }, today)
    // Where the axis shows each block – one lookup of the day for all of them (the preview counts this at every step of the drag).
    const starts = axisStartsOf(day, ids, today)
    const startOf = (id: string) => starts.get(id)! + delta.minutes
    let take = own.take
    let along = own.along
    if (to === date) own.skipped.forEach(stay)
    else {
      const outOfDay = own.skipped.filter((s) => s.why === 'poza dniem')
      outOfDay.forEach(stay)
      const gone = to < today ? 'dzień minął' : o.inView && !o.inView(to) ? 'poza widokiem' : null
      const rest = ids.filter((id) => !outOfDay.some((s) => s.id === id))
      if (gone) {
        for (const s of own.skipped) if (s.why !== 'poza dniem') stay(s)
        for (const id of [...own.take, ...own.along]) out.stayed.push({ date, id, why: gone })
        take = []
        along = []
      } else {
        // To another day: the anchored ones by what goes with a moved block (D424, D426).
        const moved = judgeGroup(day, rest, { k: 'moveTo', date: to }, today, { stay: stayRuleOf(day.state.facts, day.ctx.snapshot.settings) })
        moved.skipped.forEach(stay)
        take = moved.take
        along = moved.along
      }
    }
    for (const id of take) out.take.push({ date, id, to, startMin: startOf(id) })
    if (o.copy) for (const id of along) out.stayed.push({ date, id, why: 'zakotwiczony' })
    else out.along.push(...along.map((id) => ({ date, id })))
  }
  return out
}

/** A day the drag wrote: its file before and after, the blocks it pushed apart there (D367) and its plan after (the energy, the preview). */
export interface DraggedDay {
  date: string
  before: Raw | null
  after: Raw
  pushed: PushedBlock[]
  plan: PlanBlock[]
}

/**
 * What the drag writes: `days` – each day's whole change (for „Cofnij”); `stages` – the entries of the ONE edit in their order: the halves that
 * bring the blocks to other days first (`owner` – T952: a day lets a block go only after the day it goes to has it), then the halves that let them
 * go and the pushed starts (each over the file as the stage before left it); `links` – the days that go back together (a block moved between two
 * days goes back to both or to none, D417), each list of them sorted; `sources` – the days blocks left for other days (their „Cofnij” brings
 * them back – it goes first, T953); `copies` – the copies made (their day, the copy, its original); `moved` – the blocks taken and the selected
 * ones that went with them.
 */
export interface GroupDragged {
  days: DraggedDay[]
  stages: Array<{ date: string; before: Raw | null; after: Raw; owner: boolean }>
  links: string[][]
  sources: string[]
  copies: Array<{ date: string; block: PlanBlock; of: PlanBlock }>
  moved: string[]
}


/** The days that change together (a move links its two days): the connected lists, each sorted, in the order of their first day. */
function linksOf(dates: readonly string[], pairs: ReadonlyArray<readonly [string, string]>): string[][] {
  const parent = new Map(dates.map((d) => [d, d]))
  const find = (d: string): string => {
    let r = d
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(d, r)
    return r
  }
  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    parent.set(find(a), find(b))
  }
  const groups = new Map<string, string[]>()
  for (const d of [...parent.keys()].sort()) groups.set(find(d), [...(groups.get(find(d)) ?? []), d])
  return [...groups.values()]
}

/** What `draggedDays` needs besides the judgement: the days as counted and their files now (a date missing – no file). */
export interface DragFiles {
  days: ReadonlyMap<string, GroupDay>
  raws: ReadonlyMap<string, Raw | null>
}

/**
 * The files of the drag (D531): within its day – each day's blocks at their new starts and the blocks they push apart (`shiftedDay`); to another
 * day – every block as „Przenieś na…” moves one, at its new start (a block beside the first block of its group stays beside it when that one goes
 * too), the target's flexible blocks on the places taken pushed apart (`groupPush`; a day that cannot be counted – none); a copy (`copy` makes
 * each one: a new id, D513) – every copy in its day, the originals held as fixed blocks there (a copy never changes them), the blocks after the
 * copies pushed apart. `today` – the logical day now (a day gone by pushes nothing).
 */
export function draggedDays(f: DragFiles, judged: DragJudged, today: string, o: { copy?: (b: PlanBlock, startMin: number, date: string) => PlanBlock; onUnsettled?: () => void } = {}): GroupDragged {
  const raw = (d: string): Raw | null => f.raws.get(d) ?? null
  if (o.copy) return copiedDays(f, judged, today, o.copy, o.onUnsettled)
  const within = judged.take.length > 0 && judged.take.every((m) => m.to === m.date)
  if (within) {
    const out: GroupDragged = { days: [], stages: [], links: [], sources: [], copies: [], moved: [] }
    for (const date of [...new Set(judged.take.map((m) => m.date))]) {
      const day = f.days.get(date)!
      const take = judged.take.filter((m) => m.date === date)
      const c = shiftedDay(day, raw(date), take.map((m) => m.id), judged.delta.minutes, today, o.onUnsettled)
      out.days.push({ date, before: raw(date), after: c.raw, pushed: c.pushed, plan: c.plan })
      out.stages.push({ date, before: raw(date), after: c.raw, owner: false })
      out.links.push([date])
      out.moved.push(...take.map((m) => m.id), ...judged.along.filter((a) => a.date === date).map((a) => a.id))
    }
    return out
  }
  // To other days: the halves that bring the blocks first, over the target's file as each half before left it.
  const base = new Map<string, Raw | null>()
  const cur = new Map<string, Raw | null>()
  const dates = [...new Set(judged.take.flatMap((m) => [m.date, m.to]))].sort()
  for (const d of dates) {
    base.set(d, raw(d))
    cur.set(d, raw(d))
  }
  const sources = [...new Set(judged.take.map((m) => m.date))]
  const groups = new Map<string, { b: PlanBlock; to: string; group: ReturnType<typeof moveGroup> }>()
  const brought = new Map<string, Set<string>>()
  for (const from of sources) {
    const day = f.days.get(from)!
    const plan = day.ctx.plan
    const map = new Map(plan.map((b) => [b.id, b]))
    const stay: StayRule = stayRuleOf(day.state.facts, day.ctx.snapshot.settings)
    const take = judged.take.filter((m) => m.date === from)
    const going = new Set(take.map((m) => m.id))
    const file = dayFileFrom(base.get(from) ?? {}, from)
    for (const m of take) {
      const b = blockNow(dayRaw(base.get(from) ?? null, from), from, map.get(m.id)!)
      const group = moveGroup(plan, m.id, stay)
      const followers = group.followers.map((x) => file.blocks.find((y) => y.id === x.id) ?? x)
      const root = groupRootOf(map, m.id)
      cur.set(m.to, moveTarget(base.get(from) ?? null, cur.get(m.to) ?? null, b, plan, from, m.to, true, m.startMin, followers, false, root != null && going.has(root) ? root : null))
      groups.set(`${from}|${m.id}`, { b, to: m.to, group })
      const there = brought.get(m.to) ?? new Set<string>()
      for (const id of [m.id, ...followers.map((x) => x.id)]) there.add(id)
      brought.set(m.to, there)
    }
  }
  const afterBring = new Map(cur)
  // Then the halves that let them go, over the file as the bringing left it (a day both a source and a target keeps what it was brought).
  for (const from of sources) {
    const day = f.days.get(from)!
    for (const m of judged.take.filter((x) => x.date === from)) {
      const g = groups.get(`${from}|${m.id}`)!
      const now = cur.get(from) ?? null
      cur.set(from, moveSource(now, dayFileFrom(now ?? {}, from), g.b, day.ctx.plan, g.to, g.group))
    }
  }
  const out: GroupDragged = { days: [], stages: [], links: linksOf(dates, judged.take.map((m) => [m.date, m.to] as const)), sources, copies: [], moved: [] }
  for (const t of brought.keys()) out.stages.push({ date: t, before: base.get(t) ?? null, after: dayRaw(afterBring.get(t) ?? null, t), owner: true })
  // Each half over the file as the stage before it left it (a source with no file of its own – none: its half makes it).
  for (const from of sources) out.stages.push({ date: from, before: afterBring.get(from) ?? null, after: dayRaw(cur.get(from) ?? null, from), owner: false })
  for (const d of dates) {
    const day = f.days.get(d)
    const left = dayRaw(cur.get(d) ?? null, d)
    const ids = brought.get(d)
    const plan = day ? dayPlan(day.ctx.snapshot, dayFileFrom(left, d)) : dayFileFrom(left, d).blocks
    // D367: the target's flexible blocks on the places taken – the blocks brought hold the starts they were given (a day not counted – none).
    const pushed = day && ids && d >= today ? groupPush(day, plan, ids, { onUnsettled: o.onUnsettled }) : []
    const after = withPushedStarts(left, d, plan, pushed)
    if (pushed.length) out.stages.push({ date: d, before: left, after: after.raw, owner: false })
    out.days.push({ date: d, before: base.get(d) ?? null, after: after.raw, pushed, plan: after.plan })
  }
  // The blocks taken and the selected ones that went with them (one anchored to a moved block but not selected is not counted).
  const selected = new Set([...judged.take, ...judged.along].map((k) => `${k.date}|${k.id}`))
  out.moved = judged.take.flatMap((m) => [m.id, ...groups.get(`${m.date}|${m.id}`)!.group.followers.filter((x) => selected.has(`${m.date}|${x.id}`)).map((x) => x.id)])
  return out
}

/**
 * The groups of parallel blocks (D492) among copies (T1766, T1770): `list` – each copy with the key of its original's group (its first block's id),
 * the original's id and the copy's id, in the plan's order. The copies of one group stay a group: beside the copy of its first block – or, that one
 * not copied, of the first of the part (as `shiftPatches` makes a part its own group). By the copy's id: the copy it stands beside.
 */
export function copyHeads(list: ReadonlyArray<{ key: string; of: string; copy: string }>): Map<string, string> {
  const byKey = new Map<string, Array<{ key: string; of: string; copy: string }>>()
  for (const c of list) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c])
  const out = new Map<string, string>()
  for (const [key, part] of byKey) {
    if (part.length < 2) continue
    const head = part.find((c) => c.of === key) ?? part[0]!
    for (const c of part) if (c !== head) out.set(c.copy, head.copy)
  }
  return out
}

/** A day's plan with the copies in it (each one where it is put, beside the copy of its group's first block – `copyHeads`). */
interface CopiedPlan {
  copies: PlanBlock[]
  plan: PlanBlock[]
  pushed: PushedBlock[]
}

/**
 * The copies of the selection put into day `t` (`made` – each copy and its original of day `date`; `plans` – the source days' plans by id): the
 * groups kept (`copyHeads`), the selected originals of `t` held as fixed blocks (never pushed nor written), the flexible blocks after the copies
 * pushed apart (D367, the copies holding their starts). The plan is the day's (`day`; not counted – none, nothing pushed).
 */
function copiedPlan(day: GroupDay | undefined, t: string, made: ReadonlyArray<{ date: string; copy: PlanBlock; of: PlanBlock }>, plans: ReadonlyMap<string, ReadonlyMap<string, PlanBlock>>, originals: ReadonlySet<string>, today: string, onUnsettled?: () => void): CopiedPlan {
  const heads = copyHeads(made.map((c) => ({ key: `${c.date}|${groupRootOf(plans.get(c.date)!, c.of.id) ?? c.of.id}`, of: `${c.date}|${c.of.id}`, copy: c.copy.id })))
  const copies = made.map((c) => (heads.has(c.copy.id) ? { ...c.copy, alongside: heads.get(c.copy.id)! } : c.copy))
  const plan = copies.reduce((p, c) => withBlock(p, c), [...(day?.ctx.plan ?? [])])
  // The originals of the selection on this day stand as fixed blocks: a copy never changes them.
  const held = plan.map((b) => (originals.has(`${t}|${b.id}`) ? { ...b, fixed: true } : b))
  const pushed = day && t >= today ? groupPush(day, held, new Set(copies.map((c) => c.id)), { onUnsettled }).filter((p) => !originals.has(`${t}|${p.id}`)) : []
  return { copies, plan, pushed }
}

/** The copies of the selection made for day `t` (`copyOf`), each with its original as the source day's file holds it. */
function copiesFor(f: DragFiles, judged: DragJudged, t: string, plans: ReadonlyMap<string, ReadonlyMap<string, PlanBlock>>, copyOf: (b: PlanBlock, startMin: number, date: string) => PlanBlock) {
  return judged.take
    .filter((x) => x.to === t)
    .map((m) => {
      const of = blockNow(dayRaw(f.raws.get(m.date) ?? null, m.date), m.date, plans.get(m.date)!.get(m.id)!)
      return { date: m.date, id: m.id, copy: copyOf(of, m.startMin, t), of }
    })
}

const plansOf = (f: DragFiles, judged: DragJudged) => new Map([...new Set(judged.take.map((m) => m.date))].map((d) => [d, new Map(f.days.get(d)!.ctx.plan.map((b) => [b.id, b]))]))

/**
 * The copies of the drag (D513 for each, D531): every copy in the day it goes to, at its new start (`copiedPlan` – the groups of parallel blocks
 * kept, the originals held, the blocks after the copies pushed apart), written into the day's file.
 */
function copiedDays(f: DragFiles, judged: DragJudged, today: string, copyOf: (b: PlanBlock, startMin: number, date: string) => PlanBlock, onUnsettled?: () => void): GroupDragged {
  const out: GroupDragged = { days: [], stages: [], links: [], sources: [], copies: [], moved: [] }
  const originals = new Set(judged.take.map((m) => `${m.date}|${m.id}`))
  const plans = plansOf(f, judged)
  for (const t of [...new Set(judged.take.map((m) => m.to))].sort()) {
    const before = f.raws.get(t) ?? null
    const made = copiesFor(f, judged, t, plans, copyOf)
    out.moved.push(...made.map((c) => c.id))
    const c = copiedPlan(f.days.get(t), t, made, plans, originals, today, onUnsettled)
    // The first blocks of the groups first: the day's file gives the blocks beside a block its start.
    let raw = dayRaw(before, t)
    for (const x of [...c.copies.filter((b) => b.alongside == null), ...c.copies.filter((b) => b.alongside != null)]) raw = putBlock(raw, x)
    out.copies.push(...c.copies.map((block, i) => ({ date: t, block, of: made[i]!.of })))
    const plan = f.days.get(t) ? c.plan : dayFileFrom(raw, t).blocks
    const after = withPushedStarts(raw, t, plan, c.pushed)
    out.days.push({ date: t, before, after: after.raw, pushed: c.pushed, plan: after.plan })
    out.stages.push({ date: t, before, after: after.raw, owner: false })
    out.links.push([t])
  }
  return out
}

/** Where a block of the preview stands on its day's axis (logical minutes). */
export interface DragSpan {
  startMin: number
  endMin: number
}

/**
 * What one axis shows while a group is dragged (D531, „Dziś” and a day's columns): `moved` – the blocks of the group at their new places (the
 * grabbed one too) and the blocks anchored to them; `pushed` – the other blocks the drag moves (pushed apart, D367); `copies` – a copy's place
 * by its original's id. Each by where the day's axis shows it after the drop (today – the forecast, another day – the plan).
 */
export interface DragPreview {
  moved: Map<string, DragSpan>
  pushed: Map<string, DragSpan>
  copies: Map<string, DragSpan>
}

/** The id a copy of block `id` has in a preview (one rule for every preview: never a block's own id, never written). */
export const copyKeyOf = (id: string): string => `__copy__${id}`

/**
 * The preview of a group dragged within its day `day` (`ids` – the selected blocks of it, `minutes` – the difference; `copy` – Ctrl held): the
 * blocks the drag takes at their new places, what they push apart – the plan of the write without its file (T1778: `shiftPatches` + `groupPush`
 * as `shiftedDay`, a copy – `copiedPlan`), so what is shown is what the day shows after the drop. Null – nothing would move.
 */
export function dragPreview(day: GroupDay, ids: readonly string[], minutes: number, today: string, o: { copy?: boolean; axis: 'forecast' | 'plan' }): DragPreview | null {
  const date = day.ctx.date
  const days = new Map([[date, day]])
  const judged = judgeDrag(days, ids.map((id) => ({ date, id })), { days: 0, minutes }, today, { copy: o.copy })
  if (!judged.take.length) return null
  const take = judged.take.map((m) => m.id)
  let plan: PlanBlock[]
  const copies = new Map<string, string>()
  if (o.copy) {
    const f: DragFiles = { days, raws: new Map() }
    const plans = plansOf(f, judged)
    const made = copiesFor(f, judged, date, plans, (b, startMin) => ({ ...b, id: copyKeyOf(b.id), startMin: Math.max(PLAN_MIN, Math.min(PLAN_MAX - 1, startMin)), anchor: null, alongside: null }))
    const c = copiedPlan(day, date, made, plans, new Set(take.map((id) => `${date}|${id}`)), today)
    for (const m of made) copies.set(m.copy.id, m.id)
    plan = pushedPlan(c.plan, c.pushed)
  } else {
    // As `shiftedDay` counts it: each from where the axis shows it, the pushed by `groupPush` (a day gone by pushes nothing).
    const starts = axisStartsOf(day, take, today)
    const after = patchedPlan(day.ctx.plan, shiftPatches(day.ctx.plan, take, minutes, (id) => starts.get(id) ?? null))
    plan = pushedPlan(after, date >= today ? groupPush(day, after, new Set(take)) : [])
  }
  const shown = axisMoves(day.ctx, day.state, plan, o.axis)
  const taken = new Set(take)
  const anchored = new Set(judged.along.map((a) => a.id))
  const map = new Map(plan.map((b) => [b.id, b]))
  const out: DragPreview = { moved: new Map(), pushed: new Map(), copies: new Map() }
  for (const [id, span] of shown) {
    if (copies.has(id)) out.copies.set(copies.get(id)!, span)
    else if (!o.copy && (taken.has(id) || anchored.has(id) || followsMoving(map, id, taken))) out.moved.set(id, span)
    else if (!(o.copy && taken.has(id))) out.pushed.set(id, span)
  }
  return out
}
