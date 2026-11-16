/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” (D540–D545): a template's blocks copied into the plans of chosen days, or
 * taken out of them. Without a DOM, on the raw day files (`dayEdits.ts` – unknown fields stay).
 *
 * A copy (D540) is the template's version in force on the day (the first one for a day before it): each block with the id the day's own
 * template would give it (`templateBlockId` – the same on every computer, so a day of this template and a copy into it are one set of
 * blocks), `origin: 'template'`, at the template's hours; anchors to the template's blocks get the day's ids, a block anchored to a session
 * goes with that session's block of the day (none – it is not copied, as in `createDay`). The template's sessions (D511) come as the
 * sessions of the day: their block from the entry (`entryDef` → `sessionBlock`), a „nie” the day answered taken back. Nothing about the
 * day's type, budget or wake changes.
 *
 * Collision (D541) = an overlap in time on the axis of the plan with a block of the day; blocks in the background never collide. A day
 * with blocks of this template already, or without collisions, takes the blocks that fit („Uzupełnij luki”) without asking; otherwise
 * the window asks: „Uzupełnij luki” or „Nadpisz plan”. „Nadpisz” cancels the day's colliding blocks (a block of the snapshot – `cancelled`,
 * your own – out of the file); a block that has begun and a block of the day's own layers (session, lecture, zjazd – `layerKept`) are
 * never cancelled – a template block colliding with one of them is left out in both modes. Past days are days like the others (D542).
 */
import { dayRaw, putBlock, setCancelled, takeBlock, type Raw } from '../data/dayEdits'
import { isSessionEntry, layerKept, sessionIdOf, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import { dayAnswer, entryDef, sessionEntries } from '../model/templateSessions'
import { SESSION_ANCHOR, sessionBlock, sessionBlockId, templateBlockId } from './createDay'
import type { DaySnapshot } from '../model/events'

/** A day as the apply reads it: its plan as the day shows it (`dayPlan`), its snapshot, its file and the blocks that have begun. */
export interface ApplyDay {
  date: string
  plan: readonly PlanBlock[]
  snapshot: DaySnapshot
  raw: Raw | null
  /** The ids of the day's blocks that have begun (a run in its log) – never cancelled. */
  begun: ReadonlySet<string>
}

export type ApplyMode = 'fill' | 'overwrite'

/** What the template brings to a day, judged against its plan. */
export interface ApplyJudged {
  date: string
  /** The day has blocks of this template already: „Zastosuj” fills the gaps without asking (D541). */
  ofTemplate: boolean
  /** The template's blocks not in the day's plan: each with the day's blocks it overlaps (empty – it fits). */
  missing: Array<{ block: PlanBlock; clash: PlanBlock[] }>
  /** How many of the template's blocks the plan has already. */
  present: number
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
 * The template's blocks as the day would have them (`createDay`'s rule, at the template's hours): the sessions of its entries the day of
 * the week does not answer „nie” to, then the other blocks. A block anchored to a session neither the template nor the day has – none.
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
  const entries = new Map(version.blocks.filter(isSessionEntry).map((b) => [b.id, sessionIdOf(b)]))
  const ids = new Map(version.blocks.map((b) => [b.id, templateBlockId(date, t.id, b.id)]))
  for (const b of version.blocks) {
    if (entries.has(b.id)) continue
    let anchor: string | null = null
    if (b.anchor) {
      const session = b.anchor.startsWith(SESSION_ANCHOR) ? b.anchor.slice(SESSION_ANCHOR.length) : (entries.get(b.anchor) ?? null)
      anchor = session != null ? (sessions.get(session) ?? null) : (ids.get(b.anchor) ?? null)
      if (!anchor) continue
    }
    out.push({ ...b, id: ids.get(b.id)!, anchor, startMin: anchor ? null : b.startMin, origin: 'template', sourceId: b.id })
  }
  return out
}

/** Start and end of each block on the axis of the plan (anchored – after the end of its anchor); null – no place. */
function spansOf(blocks: readonly PlanBlock[]): Map<string, { start: number; end: number } | null> {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const memo = new Map<string, { start: number; end: number } | null>()
  const span = (b: PlanBlock, depth: number): { start: number; end: number } | null => {
    if (memo.has(b.id)) return memo.get(b.id)!
    let start: number | null = b.startMin
    if (start == null && b.anchor && depth < 20) {
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

/** The template's blocks judged against a day's plan: which are there, which are missing, what each missing one overlaps. */
export function judgeApply(t: Template, day: ApplyDay): ApplyJudged {
  const version = versionForDay(t, day.date)
  const cands = version ? templateBlocksFor(t, version, day) : []
  const inPlan = new Set(day.plan.map((b) => b.id))
  // Moved to another day: the block is there, not here – not brought back.
  const moved = dayRaw(day.raw, day.date).movedTo
  const movedAway = new Set(isRawMap(moved) ? Object.keys(moved) : [])
  const missingBlocks = cands.filter((b) => !inPlan.has(b.id) && !movedAway.has(b.id))
  const spans = spansOf([...day.plan, ...missingBlocks])
  const missing = missingBlocks.map((block) => {
    const s = spans.get(block.id)
    if (!s || inBackground(block, day.snapshot)) return { block, clash: [] }
    const clash = day.plan.filter((p) => {
      const q = spans.get(p.id)
      return !!q && !inBackground(p, day.snapshot) && q.start < s.end && s.start < q.end
    })
    return { block, clash }
  })
  return {
    date: day.date,
    ofTemplate: day.plan.some((b) => isOfTemplate(b, day.date, t.id)),
    missing,
    present: cands.length - missingBlocks.length
  }
}

/** The day asks „Uzupełnij luki czy nadpisz plan?” (D541): it has no blocks of the template and one of them collides. */
export const asksMode = (j: ApplyJudged): boolean => !j.ofTemplate && j.missing.some((m) => m.clash.length > 0)

/** Whether „Nadpisz” may cancel a day's block: not begun, not of the day's own layers. */
const cancellable = (b: PlanBlock, day: ApplyDay): boolean => !day.begun.has(b.id) && !layerKept(b)

export interface Applied {
  raw: Raw
  /** Blocks brought into the plan. */
  added: number
  /** Blocks of the day cancelled („Nadpisz”). */
  cancelled: number
  /** Template blocks left out: collide with the plan (fill) or with a block never cancelled (overwrite), or anchored to one left out. */
  skipped: number
}

/** The ids of the snapshot's blocks: those leave by `cancelled`, the file's own ones by being taken out. */
const snapshotIds = (s: DaySnapshot): Set<string> => new Set(s.blocks.map((b) => b.id))

/** Takes a block out of the day's plan: a snapshot's – cancelled, a file's – out of it. */
function withoutBlock(raw: Raw, id: string, inSnapshot: ReadonlySet<string>): Raw {
  return inSnapshot.has(id) ? setCancelled(raw, id, true) : takeBlock(raw, id)
}

/**
 * The day's file after „Zastosuj” in `mode` (a day that does not ask – `asksMode` false – is always `fill`). A block the day's file
 * cancelled or answered „nie” to is brought back (its entry removed); one the snapshot does not have is written into the file.
 */
export function applyTemplate(t: Template, day: ApplyDay, mode: ApplyMode, judged = judgeApply(t, day)): Applied {
  const asSnap = snapshotIds(day.snapshot)
  const m = asksMode(judged) ? mode : 'fill'
  let raw = dayRaw(day.raw, day.date)
  const take = new Set<string>()
  const cancel = new Set<string>()
  for (const x of judged.missing) {
    if (!x.clash.length) take.add(x.block.id)
    else if (m === 'overwrite' && x.clash.every((c) => cancellable(c, day) || cancel.has(c.id))) {
      take.add(x.block.id)
      for (const c of x.clash) cancel.add(c.id)
    }
  }
  // A block anchored to a template block left out is left out too (it has no place without it).
  const byId = new Map(judged.missing.map((x) => [x.block.id, x.block]))
  for (let changed = true; changed; ) {
    changed = false
    for (const id of take) {
      const a = byId.get(id)?.anchor
      if (a && byId.has(a) && !take.has(a)) {
        take.delete(id)
        changed = true
      }
    }
  }
  for (const id of cancel) raw = withoutBlock(raw, id, asSnap)
  const answers = isRawMap(raw.sessions) ? { ...raw.sessions } : {}
  for (const x of judged.missing) {
    if (!take.has(x.block.id)) continue
    const b = x.block
    if (b.origin === 'session' && b.sourceId && answers[b.sourceId] === 'no') delete answers[b.sourceId]
    // A block of the snapshot comes back as the day had it (your change of it stays); another one is written into the file.
    raw = asSnap.has(b.id) ? setCancelled(raw, b.id, false) : putBlock(raw, b)
  }
  if (isRawMap(raw.sessions) || Object.keys(answers).length) raw = { ...raw, sessions: answers }
  return { raw, added: take.size, cancelled: cancel.size, skipped: judged.missing.length - take.size }
}

const isRawMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export interface Revoked {
  raw: Raw
  /** Blocks of the template taken out of the plan. */
  removed: number
  /** Blocks of the template left because they have begun. */
  begun: number
}

/**
 * „Odwołaj ten szablon w…” (D543): every block of the template on the day – the day's own template's or a copy's – leaves the plan
 * unless it has begun; the sessions of its entries leave by „nie” – only when the day's own template is this one or the session's block
 * is the file's (a copy brought it), never a session of another template or of the layer.
 */
export function revokeTemplate(t: Template, day: ApplyDay): Revoked {
  const asSnap = snapshotIds(day.snapshot)
  const sessionIds = entrySessionIds(t)
  const own = day.snapshot.templateId === t.id
  let raw = dayRaw(day.raw, day.date)
  let removed = 0
  let begun = 0
  const answers = isRawMap(raw.sessions) ? { ...raw.sessions } : {}
  let answered = false
  for (const b of day.plan) {
    const ofT = isOfTemplate(b, day.date, t.id)
    const session = b.origin === 'session' && !!b.sourceId && sessionIds.has(b.sourceId) && b.id === sessionBlockId(day.date, b.sourceId) && (own || !asSnap.has(b.id))
    if (!ofT && !session) continue
    if (day.begun.has(b.id)) {
      begun++
      continue
    }
    removed++
    if (session) {
      answers[b.sourceId!] = 'no'
      answered = true
    } else raw = withoutBlock(raw, b.id, asSnap)
  }
  if (answered) raw = { ...raw, sessions: answers }
  return { raw, removed, begun }
}
