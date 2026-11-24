/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” (D540–D545): a template's blocks copied into the plans of chosen days, or
 * taken out of them. Without a DOM, on the raw day files (`dayEdits.ts` – unknown fields stay).
 *
 * A copy (D540) is the template's version in force on the day (the first one for a day before it): its blocks as the day of the template
 * has them (`templateDayBlocks` – one rule with `createDay`: the ids `templateBlockId`, the same on every computer, so a day of this
 * template and a copy into it are one set of blocks), `origin: 'template'`, at the template's hours (T1901). The template's sessions
 * (D511) come as the sessions of the day: their block from the entry (`entryDef` → `sessionBlock`), a „nie” the day answered taken back.
 * Nothing about the day's type, budget or wake changes.
 *
 * Collision (D541) = an overlap in time on the axis of the plan with a block of the day still in the plan (a block the log cancelled or
 * parked is not – T1906); blocks in the background never collide. A day with blocks of this template already, or without collisions,
 * takes the blocks that fit („Uzupełnij luki”) without asking; otherwise the window asks: „Uzupełnij luki” or „Nadpisz plan”. „Nadpisz”
 * cancels the day's colliding blocks (by `cancelled` – your own block stays in the file with its attachments, T1907) and with them what is
 * anchored to them; a block that has begun and a block of the day's own layers (session, lecture, zjazd – `layerKept`) are never cancelled,
 * nor is a block one of them is anchored to – a template block colliding with one of them is left out in both modes.
 *
 * Today and the days gone by (D546–D549, `ApplyTiming`): „W czasie rzeczywistym – od teraz” (today only) moves every block of its own hour
 * that is neither fixed nor of the day's layers by one offset, so the template's first flexible block starts now (the anchored follow their
 * anchors; one that no longer fits the day once moved stays out). A block gone by – its planned end on the axis of the plan (`dayPlan`, the
 * same axis the main process judges on) not after now, or any block of a day gone by – goes in at its hours as done („Dodaj jako
 * zrealizowane”: the facts `templateDoneDrafts` writes in one step with the file, as „Odbyło się” of the ritual; over a real run of another
 * block in the foreground it stays out – the facts come first, `takeGoneBy`) or stays out („Nie dodawaj minionych”). A block that runs by
 * the plan now is not gone by: it comes in not begun. Collisions are judged at the hours so chosen; a block gone by meets the planned hours
 * of the day's blocks not begun only.
 */
import { dayBlocks, dayRaw, isRaw, putBlock, setCancelled, setSessionAnswer, type Raw } from '../data/dayEdits'
import { compareEvents, isKnown, type AnyEvent, type DaySnapshot } from '../model/events'
import { dayFileFrom, layerKept, PLAN_MAX, PLAN_MIN, sessionIdOf, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import { dayAnswer, entryDef, sessionEntries } from '../model/templateSessions'
import { logicalDayOf, logicalMinuteOf, placeLogical } from '../time/day'
import { startPlanned } from './blocks'
import { dayPlan, sessionBlock, sessionBlockId, templateBlockId, templateDayBlocks } from './createDay'
import type { DayContext, DayState } from './day'
import { OPEN, type DayFacts } from './facts'
import { gridOf, logicalSpan } from './grid'
import { groupRootOf } from './parallel'
import { DEFAULT_GENERAL } from '../model/rd'
import type { TimerDraft } from './timer'

/** A run of a block in the foreground on the axis of the plan (logical minutes; a run still going – to infinity). */
export interface DayRun {
  block: string
  start: number
  end: number
}

/** A day as the apply reads it: its plan as the day shows it (`dayPlan`), its snapshot, its file and what its log says of its blocks. */
export interface ApplyDay {
  date: string
  plan: readonly PlanBlock[]
  snapshot: DaySnapshot
  raw: Raw | null
  /** The ids of the day's blocks that have begun (a run in its log) – never cancelled, never brought back (D336). */
  begun: ReadonlySet<string>
  /** The ids of blocks the log took off the plan before they began (cancelled, parked) – no place, no collision. */
  off?: ReadonlySet<string>
  /** The runs of the day's blocks in the foreground (`foregroundRuns`): a block gone by over one of them is not added as done (D547). */
  runs?: readonly DayRun[]
  /** The most blocks of a group at once (`rd.general.parallelMax`, D476); left out – the default. */
  parallelMax?: number
}

/** How „Zastosuj” takes today and the days gone by (D546–D549). A day after `today` takes the template as it is. */
export interface ApplyTiming {
  /** Today: at the template's hours, or the whole template moved so its first flexible block starts now (D548). */
  hours: 'plan' | 'now'
  /** A block gone by: into the plan as done (D547), or left out. */
  past: 'done' | 'skip'
  /** The logical day of now. */
  today: string
  /** Now as a minute of today's axis of the plan (logical). */
  nowMin: number
}

/** Why a block of the template stays out before the plan is asked (D547–D549): gone by, over a real run, outside the day once moved. */
export type LeftWhy = 'past' | 'ran' | 'outOfDay'
export type LeftCount = Record<LeftWhy, number>
export const noneLeft = (): LeftCount => ({ past: 0, ran: 0, outOfDay: 0 })

export type ApplyMode = 'fill' | 'overwrite'

/** What the template brings to a day, judged against its plan. */
export interface ApplyJudged {
  date: string
  /** The day has blocks of this template already: „Zastosuj” fills the gaps without asking (D541). */
  ofTemplate: boolean
  /**
   * The template's blocks not in the day's plan, at the hours the timing gave: each with the day's blocks it overlaps (empty – it fits);
   * `done` – gone by, it goes in as done; `moved` – „od teraz” gave it another hour.
   */
  missing: Array<{ block: PlanBlock; clash: PlanBlock[]; done: boolean; moved: boolean; span: { start: number; end: number } | null; bg: boolean; doomed?: boolean }>
  /** How many blocks the template's version has for the day (0 – nothing to apply). */
  total: number
  /** The template's blocks left out before the plan is asked, by why (D547–D549). */
  left: LeftCount
  /** Of them, the blocks beside a first block of their group left out then (T2956). */
  beside: number
}

/** The version of `t` a day takes: the one in force on it, the first one for a day before it. */
export function versionForDay(t: Template, date: string): TemplateVersion | null {
  return templateVersionOn(t, date) ?? [...t.versions].sort((a, b) => (a.from < b.from ? -1 : 1))[0] ?? null
}

/** A block of the day the template `templateId` put there (by the day's template or by a copy): its id is the one the template gives. */
export const isOfTemplate = (b: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'>, date: string, templateId: string): boolean =>
  b.origin === 'template' && !!b.sourceId && b.id === templateBlockId(date, templateId, b.sourceId)

/** The session ids of a template's entries in any version (D511). */
const entrySessionIds = (t: Template): Set<string> => new Set(t.versions.flatMap((v) => sessionEntries(v).map(sessionIdOf)))

/**
 * The template's blocks as the day would have them: the sessions of its entries the day of the week does not answer „nie” to, then the
 * other blocks (`templateDayBlocks`); a block anchored to a session neither the template nor the day has – none.
 */
export function templateBlocksFor(t: Template, version: TemplateVersion, day: Pick<ApplyDay, 'date' | 'plan' | 'snapshot'>): PlanBlock[] {
  const { date } = day
  const out: PlanBlock[] = []
  // A session's block of the day: one of the day's plan (by the session's id), or one of the template's entries.
  const sessions = new Map<string, string>()
  for (const b of day.plan) if (b.origin === 'session' && b.sourceId) sessions.set(b.sourceId, b.id)
  const year = Number(date.slice(0, 4))
  for (const e of sessionEntries(version)) {
    const answer = dayAnswer(e, date)
    if (answer === 'no') continue
    const block = sessionBlock(entryDef(e, year, answer === 'ask'), date, day.snapshot.holidays)
    if (!block) continue
    out.push(block)
    if (!sessions.has(sessionIdOf(e))) sessions.set(sessionIdOf(e), block.id)
  }
  out.push(...templateDayBlocks(t.id, version, date, (id) => sessions.get(id) ?? null))
  return out
}

/**
 * Start and end of each block on the axis of the plan (anchored – after the end of its anchor; beside another – at its group's first block's
 * start, its own length: D492, T2951 – never an hour of its own); null – no place.
 */
export function spansOf(blocks: readonly PlanBlock[]): Map<string, { start: number; end: number } | null> {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const memo = new Map<string, { start: number; end: number } | null>()
  const span = (b: PlanBlock, depth: number): { start: number; end: number } | null => {
    if (memo.has(b.id)) return memo.get(b.id)!
    const root = depth < 20 ? groupRootOf(byId, b.id) : null
    let start: number | null = root != null ? (span(byId.get(root)!, depth + 1)?.start ?? null) : b.startMin
    if (root == null && start == null && b.anchor && depth < 20) {
      const a = byId.get(b.anchor)
      const s = a ? span(a, depth + 1) : null
      start = s ? s.end : null
    }
    const r = start == null ? null : { start, end: start + b.durationMin }
    memo.set(b.id, r)
    return r
  }
  for (const b of blocks) span(b, 0)
  return memo
}

/** The background rule of the day (the block's own, else its category's). */
const inBackground = (b: PlanBlock, snapshot: DaySnapshot): boolean => b.background ?? snapshot.settings.categories[b.categoryId]?.startsInBackground ?? false


/** The runs of a day's blocks in the foreground, on the axis of the plan (a run in the background never stands in a block's way). */
export function foregroundRuns(facts: Pick<DayFacts, 'blocks'>, date: string): DayRun[] {
  const g = gridOf(date)
  const out: DayRun[] = []
  for (const [block, f] of facts.blocks) {
    for (const r of f.runs) {
      if (r.bg) continue
      const open = r.to === OPEN
      const s = logicalSpan(g, r.from, open ? r.from : r.to)
      out.push({ block, start: s.startMin, end: open ? Number.POSITIVE_INFINITY : s.endMin })
    }
  }
  return out
}

/** Hours [start, end) meet a run of another block than `id`. */
const meets = (runs: readonly DayRun[], id: string, s: { start: number; end: number }): boolean => runs.some((r) => r.block !== id && r.start < s.end && s.start < r.end)

/** The blocks of `blocks` anchored to `id`, also through others (they leave the plan with it – `dayPlan`), at most 20 links deep. */
function anchoredTo(blocks: readonly PlanBlock[], id: string): PlanBlock[] {
  const out: PlanBlock[] = []
  const seen = new Set([id])
  for (let i = 0, front = [id]; i < 20 && front.length; i++) {
    const next = blocks.filter((b) => b.anchor != null && front.includes(b.anchor) && !seen.has(b.id))
    for (const b of next) seen.add(b.id)
    out.push(...next)
    front = next.map((b) => b.id)
  }
  return out
}

/** `seeds` and every block of `blocks` anchored to one of them, also through others (`anchoredTo`). A seed may be an id not among `blocks`. */
export function anchoredClosure(blocks: readonly PlanBlock[], seeds: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of seeds) {
    if (out.has(id)) continue
    out.add(id)
    for (const b of anchoredTo(blocks, id)) out.add(b.id)
  }
  return out
}

/** A block gone by as `takeGoneBy` takes it: its hours on the axis of the plan, whether it is in the background, its anchor, its group. */
export interface GoneByBlock {
  id: string
  start: number
  end: number
  bg: boolean
  anchor: string | null
  /** The first block of its group of parallel blocks (D492; itself – none): the blocks of one group stand in one time, never on each other (T2951). */
  group?: string
}

/**
 * Which blocks gone by go in as done (D547) – one rule for the window and the main process: by their start (a tie – their order), each
 * whose hours meet no run of another block in the foreground (`runs` – the facts come first) nor a block taken before it; one anchored to
 * a block left out stays out too. A block in the background meets none and holds none. `taken` in the order of their hours.
 */
export function takeGoneBy(blocks: readonly GoneByBlock[], runs: readonly DayRun[]): { taken: string[]; ran: string[] } {
  const busy = [...runs]
  const taken: string[] = []
  const ran = new Set<string>()
  const groupOf = new Map(blocks.map((b) => [b.id, b.group ?? b.id]))
  const order = blocks.map((b, i) => ({ b, i })).sort((x, y) => x.b.start - y.b.start || x.i - y.i)
  for (const { b } of order) {
    // A block of its own group (taken before it, or its run) is no block on it (T2951).
    const others = busy.filter((r) => (groupOf.get(r.block) ?? r.block) !== (b.group ?? b.id))
    if ((b.anchor && ran.has(b.anchor)) || (!b.bg && meets(others, b.id, b))) {
      ran.add(b.id)
      continue
    }
    taken.push(b.id)
    if (!b.bg) busy.push({ block: b.id, start: b.start, end: b.end })
  }
  return { taken, ran: [...ran] }
}

/** A block „od teraz” moves (D548): one of its own hour, neither fixed nor of the day's layers (a session, a lecture, a class). */
const movesWithNow = (b: PlanBlock): boolean => b.startMin != null && b.anchor == null && !b.fixed && !layerKept(b)

/** The file cancelled the block `id` (as a map, or as an older list of ids). */
export const cancelledIn = (raw: Raw | null | undefined, id: string): boolean => (Array.isArray(raw?.cancelled) ? raw.cancelled.includes(id) : isRaw(raw?.cancelled) && !!raw.cancelled[id])

/**
 * A block of the snapshot the file took off, back as the day had it (D540, T1902): its cancel taken back, a „nie” the day answered its
 * session taken back – only what the file has (`cancelled` as a map or a list). One rule for the hours the judgement reads and the file.
 */
export function backInFile(raw: Raw, b: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'>): Raw {
  let out = cancelledIn(raw, b.id) ? setCancelled(raw, b.id, false) : raw
  if (b.origin === 'session' && b.sourceId && isRaw(out.sessions) && out.sessions[b.sourceId] === 'no') out = setSessionAnswer(out, b.sourceId, null)
  return out
}

/**
 * The template's blocks as the day has them (or will have them once back): one in the plan – as the plan shows it; one of the snapshot the
 * file took off – as `dayPlan` shows it once back (`backInFile`: the shift of the wake, your change of it); one of the template only (a
 * copy) – as the template has it (the file's blocks do not move with the wake, D334). One axis with the main process, which judges the
 * facts on the plan after the change, and the hours „od teraz” starts from.
 */
function asTheDayHasThem(cands: readonly PlanBlock[], day: ApplyDay): PlanBlock[] {
  const inPlan = new Map(day.plan.map((b) => [b.id, b]))
  const ofSnapshot = new Set(day.snapshot.blocks.map((b) => b.id))
  const back = cands.filter((b) => !inPlan.has(b.id) && ofSnapshot.has(b.id))
  const restored = back.length ? new Map(dayPlan(day.snapshot, dayFileFrom(back.reduce(backInFile, dayRaw(day.raw, day.date)), day.date)).map((b) => [b.id, b])) : new Map<string, PlanBlock>()
  return cands.map((b) => inPlan.get(b.id) ?? restored.get(b.id) ?? b)
}

/** The first block of the group of `id` among `linked` (D492, T1166), or `id` itself – a block of no group. */
const rootIn = (linked: ReadonlyMap<string, PlanBlock>, id: string): string => groupRootOf(linked, id) ?? id

/**
 * Whether the group `root` stands in the plan of the day after the change without its first block (T2956): a block of the plan of that group,
 * still in it (not taken off by the log), is there – a block beside the first block that does not come in joins it (`groupRootOf` makes it
 * the group's first, T1166).
 */
function groupStands(day: ApplyDay, linked: ReadonlyMap<string, PlanBlock>, root: string): boolean {
  return day.plan.some((p) => !day.off?.has(p.id) && p.id !== root && rootIn(linked, p.id) === root)
}

/**
 * The template's missing blocks as the timing puts them (D546–D549): moved „od teraz” (today; `moved` – a block beside another moves with its
 * group's first block, never by itself – T2951); those that stay out – outside the day once moved, gone by under „Nie dodawaj minionych”, gone
 * by over a real run of another block in the foreground – each with what is anchored to it, for the same reason (it has no place without
 * it), and the blocks beside it „obok pominiętego” (`beside`, T2956 – unless their group stands in the plan); `done` – the blocks gone by that
 * may go in as done. Two of them on each other are judged once the plan has taken them (`applyTemplate` – `takeGoneBy` over the blocks that
 * go in only).
 */
function timed(cands: readonly PlanBlock[], missing: readonly PlanBlock[], day: ApplyDay, timing: ApplyTiming | null): { blocks: PlanBlock[]; done: Set<string>; moved: Set<string>; left: LeftCount; beside: number } {
  const left = noneLeft()
  const moved = new Set<string>()
  if (!timing || day.date > timing.today) return { blocks: [...missing], done: new Set(), moved, left, beside: 0 }
  const isToday = day.date === timing.today
  let blocks = [...missing]
  const linkedOf = (list: readonly PlanBlock[]) => new Map([...day.plan, ...list].map((b) => [b.id, b]))
  const member = (linked: ReadonlyMap<string, PlanBlock>, b: PlanBlock): boolean => groupRootOf(linked, b.id) != null
  if (isToday && timing.hours === 'now') {
    // The offset of the whole template (its blocks already in the plan too), so one apply after another keeps it; a block beside another has
    // the time of its group's first one (T2951) – it neither sets the offset nor moves by itself.
    const all = new Map([...day.plan, ...cands].map((b) => [b.id, b]))
    const starts = cands.filter((b) => movesWithNow(b) && !member(all, b)).map((b) => b.startMin!)
    const offset = starts.length ? timing.nowMin - Math.min(...starts) : 0
    if (offset) {
      const linked = linkedOf(blocks)
      blocks = blocks.map((b) => {
        if (!movesWithNow(b) || member(linked, b)) return b
        moved.add(b.id)
        return { ...b, startMin: b.startMin! + offset }
      })
      // What follows a moved block – anchored to it, beside it – has another hour too.
      const after = linkedOf(blocks)
      for (let grew = true, depth = 0; grew && depth < 20; depth++) {
        grew = false
        const follow = [...anchoredClosure(blocks, [...moved]), ...blocks.filter((b) => member(after, b) && moved.has(rootIn(after, b.id))).map((b) => b.id)]
        for (const id of follow) {
          if (moved.has(id)) continue
          moved.add(id)
          grew = true
        }
      }
    }
  }
  const spans = spansOf([...day.plan, ...blocks])
  const linked = linkedOf(blocks)
  const why = new Map<string, LeftWhy | 'beside'>()
  /** What `ids` leave out leaves out what is anchored to them, for the same reason; the blocks beside them – „obok pominiętego” (T2956). */
  const leave = (ids: Iterable<string>, w: LeftWhy) => {
    for (const id of anchoredClosure(blocks, ids)) if (!why.has(id)) why.set(id, w)
    for (let grew = true, depth = 0; grew && depth < 20; depth++) {
      grew = false
      const out = blocks.filter((b) => !why.has(b.id) && member(linked, b) && why.has(rootIn(linked, b.id)) && !groupStands(day, linked, rootIn(linked, b.id))).map((b) => b.id)
      for (const id of anchoredClosure(blocks, out)) {
        if (why.has(id)) continue
        why.set(id, 'beside')
        grew = true
      }
    }
  }
  leave(
    blocks.filter((b) => {
      const s = spans.get(b.id)
      return moved.has(b.id) && !!s && (s.start < PLAN_MIN || s.end > PLAN_MAX + 1)
    }).map((b) => b.id),
    'outOfDay'
  )
  const goneBy = blocks.flatMap((b): GoneByBlock[] => {
    const s = spans.get(b.id)
    return s && !why.has(b.id) && (!isToday || s.end <= timing.nowMin) ? [{ id: b.id, ...s, bg: inBackground(b, day.snapshot), anchor: b.anchor, group: rootIn(linked, b.id) }] : []
  })
  const done = new Set<string>()
  if (timing.past === 'skip') leave(goneBy.map((b) => b.id), 'past')
  else {
    const runs = day.runs ?? []
    leave(goneBy.filter((b) => !b.bg && meets(runs, b.id, b)).map((b) => b.id), 'ran')
    for (const b of goneBy) if (!why.has(b.id)) done.add(b.id)
  }
  let beside = 0
  for (const w of why.values()) {
    if (w === 'beside') beside++
    else left[w]++
  }
  return { blocks: blocks.filter((b) => !why.has(b.id)), done, moved, left, beside }
}

/**
 * The template's blocks judged against a day's plan: which are missing, what each missing one overlaps – at the hours `timing` gives them
 * (null: the template's, nothing gone by – a day after today). A block gone by that goes in as done collides with the planned hours of the
 * day's blocks not begun only: one that has begun (and ran elsewhere, or still runs) meets it by its runs – `takeGoneBy`, D547.
 */
export function judgeApply(t: Template, day: ApplyDay, timing: ApplyTiming | null = null): ApplyJudged {
  const version = versionForDay(t, day.date)
  const cands = version ? templateBlocksFor(t, version, day) : []
  return judgeCands(cands, day, timing, day.plan.some((b) => isOfTemplate(b, day.date, t.id)))
}

/**
 * Blocks to bring into a day (a template's – `judgeApply`, a week's copies – `weekCopy.ts`, T2940) judged against its plan: one not in the
 * plan, not moved away from the day nor begun is missing; what each missing one overlaps at the hours `timing` gives (a block beside another
 * at its group's time – T2951). A block of the plan of the block's own group is no collision (T2950): the group's limit is judged when the
 * blocks come in (`takeIn`, T2958). `ofTemplate` – the day has blocks of this template already (it fills the gaps without asking).
 */
export function judgeCands(cands: readonly PlanBlock[], day: ApplyDay, timing: ApplyTiming | null, ofTemplate: boolean): ApplyJudged {
  const inPlan = new Set(day.plan.map((b) => b.id))
  // Moved to another day: the block is there, not here – not brought back. Begun and then removed (D336) – not brought back either.
  const movedTo = dayRaw(day.raw, day.date).movedTo
  const away = new Set(isRaw(movedTo) ? Object.keys(movedTo) : [])
  const shown = asTheDayHasThem(cands, day)
  const { blocks: missingBlocks, done, moved, left, beside } = timed(
    shown,
    shown.filter((b) => !inPlan.has(b.id) && !away.has(b.id) && !day.begun.has(b.id)),
    day,
    timing
  )
  const standing = day.plan.filter((p) => !day.off?.has(p.id))
  const spans = spansOf([...day.plan, ...missingBlocks])
  const linked = new Map([...day.plan, ...missingBlocks].map((b) => [b.id, b]))
  const missing = missingBlocks.map((block) => {
    const s = spans.get(block.id)
    const asDone = done.has(block.id)
    const group = rootIn(linked, block.id)
    const x = { block, done: asDone, moved: moved.has(block.id), span: s ?? null, bg: inBackground(block, day.snapshot) }
    if (!s || inBackground(block, day.snapshot)) return { ...x, clash: [] }
    const clash = standing.filter((p) => {
      const q = spans.get(p.id)
      return !!q && !inBackground(p, day.snapshot) && !(asDone && day.begun.has(p.id)) && rootIn(linked, p.id) !== group && q.start < s.end && s.start < q.end
    })
    return { ...x, clash }
  })
  // A block that „Nadpisz plan” would leave out anyway – on another one gone by (`takeIn`), beside a first block that does not come in, beyond
  // its group's limit – asks nothing: either answer leaves it out (T1957, T2956, T2958).
  const o = takeIn(missing, day, 'overwrite')
  const doomed = new Set([...o.ran, ...o.beside, ...o.full])
  return { date: day.date, ofTemplate, missing: missing.map((x) => ({ ...x, doomed: doomed.has(x.block.id) })), total: cands.length, left, beside }
}

/** The day asks „Uzupełnij luki czy nadpisz plan?” (D541): it has no blocks of the template and one of them collides. */
export const asksMode = (j: ApplyJudged): boolean => !j.ofTemplate && j.missing.some((m) => m.clash.length > 0 && !m.doomed)

export interface Applied {
  raw: Raw
  /** Blocks brought into the plan. */
  added: number
  /** Blocks of the day that left the plan („Nadpisz”): the colliding ones and what is anchored to them. */
  cancelled: number
  /** Template blocks left out: collide with the plan (fill) or with a block never cancelled (overwrite), or anchored to one left out. */
  skipped: number
  /** Template blocks left out before the plan was asked (`ApplyJudged.left`). */
  left: LeftCount
  /** Blocks beside a first block of their group left out (T2956): „obok pominiętego”. */
  beside: number
  /** Blocks beyond the limit of their group (`parallelMax`, D476, T2958): „grupa pełna”. */
  full: number
  /** The blocks brought in gone by, as done (D547): their facts (`templateDoneDrafts`) go with the file, in one step of the main process. */
  done: string[]
  /** The blocks brought into the plan (their ids). */
  taken: string[]
}

/**
 * Which of the missing blocks go in in `mode` – one rule for the file (`applyTemplate`) and for the question (`judgeApply`): those that fit,
 * in „Nadpisz” also those whose every colliding block may leave (neither it nor what is anchored to it has begun or is of the day's own
 * layers – `leaving`); a block anchored to one that will not be in the plan is left out too; of the blocks gone by that go in, one on another
 * taken before it (`takeGoneBy`, D547 – a block of its own group is none) stays out with what is anchored to it (`ran`). A block beside a first
 * block that does not come in stays out (`beside`, T2956) – unless its group stands in the plan; then each group takes no more than its limit,
 * its blocks of the plan counted as `parallelDrop` counts them (also taken off by the log), the first block first (`full`, T2958) – a block
 * of its own group is never cancelled for it.
 */
function takeIn(missing: ApplyJudged['missing'], day: ApplyDay, mode: ApplyMode): { take: Set<string>; ran: Set<string>; beside: Set<string>; full: Set<string>; leaving: Map<string, PlanBlock[]> } {
  const leaving = new Map<string, PlanBlock[]>()
  const mayCancel = (c: PlanBlock): boolean => {
    if (!leaving.has(c.id)) leaving.set(c.id, [c, ...anchoredTo(day.plan, c.id)])
    return leaving.get(c.id)!.every((b) => !day.begun.has(b.id) && !layerKept(b))
  }
  const take = new Set<string>()
  for (const x of missing) if (!x.clash.length || (mode === 'overwrite' && x.clash.every(mayCancel))) take.add(x.block.id)
  const byId = new Set(missing.map((x) => x.block.id))
  const inPlan = new Set(day.plan.map((b) => b.id))
  const blocks = missing.map((x) => x.block)
  const linked = new Map([...day.plan, ...blocks].map((b) => [b.id, b]))
  const gone = [...missing.filter((x) => !take.has(x.block.id)).map((x) => x.block.id), ...blocks.flatMap((b) => (b.anchor && !byId.has(b.anchor) && !inPlan.has(b.anchor) ? [b.anchor] : []))]
  for (const id of anchoredClosure(blocks, gone)) take.delete(id)
  const goneBy = missing.flatMap((x): GoneByBlock[] => (x.done && x.span && take.has(x.block.id) ? [{ id: x.block.id, ...x.span, bg: x.bg, anchor: x.block.anchor, group: rootIn(linked, x.block.id) }] : []))
  const ran = new Set<string>()
  for (const id of anchoredClosure(blocks, takeGoneBy(goneBy, day.runs ?? []).ran)) if (take.delete(id)) ran.add(id)
  // Beside a first block that does not come in (T2956): out „obok pominiętego”, with what is anchored to it – unless the group stands in the plan.
  const standingRoot = (root: string): boolean => (inPlan.has(root) && !day.off?.has(root)) || groupStands(day, linked, root)
  const beside = new Set<string>()
  for (let grew = true, depth = 0; grew && depth < 20; depth++) {
    grew = false
    const out = blocks.filter((b) => take.has(b.id) && groupRootOf(linked, b.id) != null && !take.has(rootIn(linked, b.id)) && !standingRoot(rootIn(linked, b.id))).map((b) => b.id)
    for (const id of anchoredClosure(blocks, out)) {
      if (!take.delete(id)) continue
      beside.add(id)
      grew = true
    }
  }
  // The group's limit (D476, T2958): its blocks of the plan (all of them, as a drop counts them), then the ones that come in – its first first.
  const max = day.parallelMax ?? DEFAULT_GENERAL.parallelMax
  const count = new Map<string, number>()
  for (const p of day.plan) count.set(rootIn(linked, p.id), (count.get(rootIn(linked, p.id)) ?? 0) + 1)
  const ordered = [...blocks].sort((a, b) => Number(groupRootOf(linked, a.id) != null) - Number(groupRootOf(linked, b.id) != null))
  const over: string[] = []
  for (const b of ordered) {
    if (!take.has(b.id)) continue
    const root = rootIn(linked, b.id)
    const n = (count.get(root) ?? 0) + 1
    count.set(root, n)
    if (n > max) over.push(b.id)
  }
  const full = new Set<string>()
  for (const id of anchoredClosure(blocks, over)) if (take.delete(id)) full.add(id)
  return { take, ran, beside, full, leaving }
}

/**
 * The day's file after „Zastosuj” in `mode` (a day that does not ask – `asksMode` false – is always `fill`). A block of the snapshot the
 * file cancelled or answered „nie” to comes back by taking that back – as the day had it; it is written into the file only when „od teraz”
 * gave it another hour. A block the snapshot does not have (a copy) is written into the file.
 */
export function applyTemplate(t: Template, day: ApplyDay, mode: ApplyMode, judged = judgeApply(t, day)): Applied {
  return applyJudged(day, mode, judged)
}

/**
 * The day's file after the blocks `judged` (`judgeCands`) are brought in in `mode` – the one rule of „Zastosuj” and of the copy of a week (T2940).
 * A block beside another is written as it is (its `alongside` – `groupRootOf` finds its group, T1166), at its group's start (T2951).
 */
export function applyJudged(day: ApplyDay, mode: ApplyMode, judged: ApplyJudged): Applied {
  const asSnap = new Set(day.snapshot.blocks.map((b) => b.id))
  const m = asksMode(judged) ? mode : 'fill'
  const { take, ran, beside, full, leaving } = takeIn(judged.missing, day, m)
  const byId = new Map(judged.missing.map((x) => [x.block.id, x]))
  const left = { ...judged.left, ran: judged.left.ran + ran.size }
  // Cancelled only for what is taken in the end.
  const cancel = new Set<string>()
  const off = new Set<string>()
  for (const id of take) for (const c of byId.get(id)!.clash) if (!cancel.has(c.id)) {
    cancel.add(c.id)
    for (const b of leaving.get(c.id) ?? [c]) off.add(b.id)
  }
  let raw = dayRaw(day.raw, day.date)
  for (const id of cancel) raw = setCancelled(raw, id, true)
  for (const id of take) {
    const { block: found, moved, span } = byId.get(id)!
    const b = found.alongside != null && found.startMin != null && span ? { ...found, startMin: span.start } : found
    // Cancelled before (a block of the snapshot, or a copy „Nadpisz” / „Odwołaj” left in the file), a session answered „nie”: back as
    // the day had it – only then is `cancelled` written.
    raw = backInFile(raw, b)
    if (!asSnap.has(b.id) || moved) raw = putBlock(raw, b)
  }
  const done = judged.missing.filter((x) => x.done && take.has(x.block.id)).map((x) => x.block.id)
  return {
    raw,
    added: take.size,
    cancelled: off.size,
    skipped: judged.missing.length - take.size - ran.size - beside.size - full.size,
    left,
    beside: judged.beside + beside.size,
    full: full.size,
    done,
    taken: [...take]
  }
}

/** Why a block asked to be done was not (D547): over a run, begun or taken off, not gone by now, not in the plan. */
export type DoneSkipWhy = 'ran' | 'begun' | 'notPast' | 'notInPlan'

/** Why the facts of „Dodaj jako zrealizowane” or their „Cofnij” are refused (the day's log said otherwise). */
export const DONE_TEXT = {
  future: 'ten dzień jeszcze się nie zaczął',
  gone: 'tych zdarzeń nie ma już w logu dnia',
  foreign: 'to nie są zdarzenia tego szablonu'
} as const

/**
 * The facts of the template's blocks brought in as done (D547), judged on the day as it is with the file of the change (the main process,
 * in one step with the file): a block of the plan, not begun nor taken off, gone by (its planned end on the axis of the plan – `dayPlan`, as
 * the window judged it – not after now; every block of a day gone by), taken by `takeGoneBy` against the day's runs in the foreground. As
 * „Odbyło się” of the ritual: `block.start` `how: 'plan'` at its planned start (no sample, no note – T500) and `block.end` done at its
 * planned end. `taken` – the blocks written, `skipped` – the others with why.
 */
export function templateDoneDrafts(
  ctx: Pick<DayContext, 'date' | 'plan'>,
  state: Pick<DayState, 'blocks' | 'facts'>,
  ids: readonly string[],
  at: number
): { drafts: TimerDraft[]; taken: string[]; skipped: Array<{ id: string; why: DoneSkipWhy }> } {
  const date = ctx.date
  const nowMin = date < logicalDayOf(at) ? Number.POSITIVE_INFINITY : logicalMinuteOf(date, at)
  const spans = spansOf(ctx.plan)
  const infos = new Map(state.blocks.map((b) => [b.id, b]))
  const plan = new Map(ctx.plan.map((b) => [b.id, b]))
  const skipped: Array<{ id: string; why: DoneSkipWhy }> = []
  const cands: GoneByBlock[] = []
  for (const id of new Set(ids)) {
    const info = infos.get(id)
    const s = spans.get(id)
    const f = state.facts.blocks.get(id)
    const why: DoneSkipWhy | null = !info?.inPlan || !s ? 'notInPlan' : f?.startedAt != null || f?.parkedAt != null || f?.cancelledAt != null ? 'begun' : s.end > nowMin ? 'notPast' : null
    if (why) skipped.push({ id, why })
    else cands.push({ id, ...s!, bg: info!.bg, anchor: plan.get(id)?.anchor ?? null, group: groupRootOf(plan, id) ?? id })
  }
  const t = takeGoneBy(cands, foregroundRuns(state.facts, date))
  for (const id of t.ran) skipped.push({ id, why: 'ran' })
  const drafts: TimerDraft[] = []
  for (const id of t.taken) {
    const info = infos.get(id)!
    const s = spans.get(id)!
    drafts.push(
      { k: 'block.start', block: id, at: placeLogical(date, s.start), bg: info.bg, planned: startPlanned(info, ctx.plan), confirmUntil: null, how: 'plan' },
      { k: 'block.end', block: id, at: placeLogical(date, s.end), done: true, rule: null }
    )
  }
  return { drafts, taken: t.taken, skipped }
}

type Logged = AnyEvent & { block?: unknown; how?: unknown; done?: unknown; rule?: unknown }

/**
 * „Cofnij” of the facts `templateDoneDrafts` wrote (`ids` – what the step answered): only its own – for every block a start „według
 * planu” and a done end without a rule, both of `computer`, one right after the other (its numbers); anything else – `foreign`, an id not
 * in the day's log – `gone`. A block with another event since (a correction, „Przedłuż”, a start again, anything not undone) stays as it is
 * (`kept`, D313); the others get an `undo` of each fact not undone yet (`undone` – those blocks).
 */
export function templateDoneUndo(
  facts: Pick<DayFacts, 'undone'>,
  events: readonly AnyEvent[],
  ids: readonly string[],
  computer: string,
  at: number
): { drafts: TimerDraft[]; undone: string[]; kept: string[] } | string {
  const byId = new Map<string, Logged>()
  for (const e of events) if (isKnown(e)) byId.set(e.id, e as Logged)
  const found = [...new Set(ids)].map((id) => byId.get(id))
  if (found.some((e) => !e)) return DONE_TEXT.gone
  const pairs = new Map<string, { start?: Logged; end?: Logged }>()
  for (const e of found as Logged[]) {
    const block = typeof e.block === 'string' ? e.block : null
    const p = block ? (pairs.get(block) ?? {}) : null
    if (!p || e.c !== computer) return DONE_TEXT.foreign
    if (e.k === 'block.start' && e.how === 'plan' && !p.start) p.start = e
    else if (e.k === 'block.end' && e.done === true && e.rule == null && !p.end) p.end = e
    else return DONE_TEXT.foreign
    pairs.set(block!, p)
  }
  for (const p of pairs.values()) if (!p.start || !p.end || p.end.n !== p.start.n + 1) return DONE_TEXT.foreign
  const undone = facts.undone
  const drafts: TimerDraft[] = []
  const out = { undone: [] as string[], kept: [] as string[] }
  for (const [block, p] of pairs) {
    const own = [p.start!, p.end!]
    // Only what came after its start, in the log's order (`compareEvents` – a cancel or an undone start of before is no change since).
    const later = events.some((e) => isKnown(e) && (e as Logged).block === block && e.k !== 'undo' && !own.includes(e as Logged) && !undone.has(e.id) && compareEvents(e, p.start!) > 0)
    if (later) {
      out.kept.push(block)
      continue
    }
    const left = own.filter((e) => !undone.has(e.id))
    if (!left.length) continue
    drafts.push(...left.map((e): TimerDraft => ({ k: 'undo', at, target: e.id, reason: 'user' })))
    out.undone.push(block)
  }
  return { drafts, ...out }
}

export interface Revoked {
  raw: Raw
  /** Blocks of the template taken out of the plan. */
  removed: number
  /** Blocks of the template left because they (or a block anchored to them) have begun. */
  begun: number
}

/** The ids of the day file's own blocks. */
const fileIds = (raw: Raw): Set<string> => new Set(dayBlocks(raw).filter(isRaw).map((b) => String(b.id)))

/**
 * „Odwołaj ten szablon w…” (D543): every block of the template on the day – the day's own template's or a copy's – leaves the plan
 * (`cancelled`) unless it has begun; the sessions of its entries leave by „nie” – only when the day's own template is this one or the
 * session's block is the file's (a copy brought it), never a session of another template, of the layer or one a „tak” brought back.
 */
export function revokeTemplate(t: Template, day: ApplyDay): Revoked {
  const sessionIds = entrySessionIds(t)
  const own = day.snapshot.templateId === t.id
  let raw = dayRaw(day.raw, day.date)
  const inFile = fileIds(raw)
  let removed = 0
  let begun = 0
  // A block a begun block or a block of the day's layers is anchored to stays (it would take that one out of the plan with it, D336).
  const holds = (b: PlanBlock): boolean => anchoredTo(day.plan, b.id).some((x) => day.begun.has(x.id) || (layerKept(x) && !isOfTemplate(x, day.date, t.id)))
  for (const b of day.plan) {
    const ofT = isOfTemplate(b, day.date, t.id)
    const session = b.origin === 'session' && !!b.sourceId && sessionIds.has(b.sourceId) && b.id === sessionBlockId(day.date, b.sourceId) && (own || inFile.has(b.id))
    if (!ofT && !session) continue
    if (day.begun.has(b.id) || holds(b)) {
      begun++
      continue
    }
    removed++
    raw = session ? setSessionAnswer(raw, b.sourceId!, 'no') : setCancelled(raw, b.id, true)
  }
  return { raw, removed, begun }
}
