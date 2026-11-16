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
 * nor is a block one of them is anchored to – a template block colliding with one of them is left out in both modes. Past days are days
 * like the others (D542).
 */
import { dayBlocks, dayRaw, isRaw, putBlock, setCancelled, setSessionAnswer, type Raw } from '../data/dayEdits'
import type { DaySnapshot } from '../model/events'
import { layerKept, sessionIdOf, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import { dayAnswer, entryDef, sessionEntries } from '../model/templateSessions'
import { sessionBlock, sessionBlockId, templateBlockId, templateDayBlocks } from './createDay'

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
}

export type ApplyMode = 'fill' | 'overwrite'

/** What the template brings to a day, judged against its plan. */
export interface ApplyJudged {
  date: string
  /** The day has blocks of this template already: „Zastosuj” fills the gaps without asking (D541). */
  ofTemplate: boolean
  /** The template's blocks not in the day's plan: each with the day's blocks it overlaps (empty – it fits). */
  missing: Array<{ block: PlanBlock; clash: PlanBlock[] }>
  /** How many blocks the template's version has for the day (0 – nothing to apply). */
  total: number
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

/** The template's blocks judged against a day's plan: which are missing, what each missing one overlaps. */
export function judgeApply(t: Template, day: ApplyDay): ApplyJudged {
  const version = versionForDay(t, day.date)
  const cands = version ? templateBlocksFor(t, version, day) : []
  const inPlan = new Set(day.plan.map((b) => b.id))
  // Moved to another day: the block is there, not here – not brought back. Begun and then removed (D336) – not brought back either.
  const moved = dayRaw(day.raw, day.date).movedTo
  const away = new Set(isRaw(moved) ? Object.keys(moved) : [])
  const missingBlocks = cands.filter((b) => !inPlan.has(b.id) && !away.has(b.id) && !day.begun.has(b.id))
  const standing = day.plan.filter((p) => !day.off?.has(p.id))
  const spans = spansOf([...day.plan, ...missingBlocks])
  const missing = missingBlocks.map((block) => {
    const s = spans.get(block.id)
    if (!s || inBackground(block, day.snapshot)) return { block, clash: [] }
    const clash = standing.filter((p) => {
      const q = spans.get(p.id)
      return !!q && !inBackground(p, day.snapshot) && q.start < s.end && s.start < q.end
    })
    return { block, clash }
  })
  return { date: day.date, ofTemplate: day.plan.some((b) => isOfTemplate(b, day.date, t.id)), missing, total: cands.length }
}

/** The day asks „Uzupełnij luki czy nadpisz plan?” (D541): it has no blocks of the template and one of them collides. */
export const asksMode = (j: ApplyJudged): boolean => !j.ofTemplate && j.missing.some((m) => m.clash.length > 0)

/** The blocks of the plan anchored to `id`, also through others (they leave the plan with it – `dayPlan`). */
function anchoredTo(plan: readonly PlanBlock[], id: string): PlanBlock[] {
  const out: PlanBlock[] = []
  const seen = new Set([id])
  for (let i = 0, front = [id]; i < 20 && front.length; i++) {
    const next = plan.filter((b) => b.anchor != null && front.includes(b.anchor) && !seen.has(b.id))
    for (const b of next) seen.add(b.id)
    out.push(...next)
    front = next.map((b) => b.id)
  }
  return out
}

export interface Applied {
  raw: Raw
  /** Blocks brought into the plan. */
  added: number
  /** Blocks of the day that left the plan („Nadpisz”): the colliding ones and what is anchored to them. */
  cancelled: number
  /** Template blocks left out: collide with the plan (fill) or with a block never cancelled (overwrite), or anchored to one left out. */
  skipped: number
}

/**
 * The day's file after „Zastosuj” in `mode` (a day that does not ask – `asksMode` false – is always `fill`). A block the day's file
 * cancelled or answered „nie” to is brought back (its entry removed); one the snapshot does not have is written into the file.
 */
export function applyTemplate(t: Template, day: ApplyDay, mode: ApplyMode, judged = judgeApply(t, day)): Applied {
  const asSnap = new Set(day.snapshot.blocks.map((b) => b.id))
  const m = asksMode(judged) ? mode : 'fill'
  // A day's block „Nadpisz” may cancel: neither it nor anything anchored to it has begun or is of the day's own layers.
  const leaving = new Map<string, PlanBlock[]>()
  const mayCancel = (c: PlanBlock): boolean => {
    if (!leaving.has(c.id)) leaving.set(c.id, [c, ...anchoredTo(day.plan, c.id)])
    return leaving.get(c.id)!.every((b) => !day.begun.has(b.id) && !layerKept(b))
  }
  const take = new Set<string>()
  for (const x of judged.missing) if (!x.clash.length || (m === 'overwrite' && x.clash.every(mayCancel))) take.add(x.block.id)
  // A block anchored to a block that will not be in the plan – a template block left out, or one begun and then removed (D336) – is
  // left out too (it has no place without it).
  const byId = new Map(judged.missing.map((x) => [x.block.id, x]))
  const inPlan = new Set(day.plan.map((b) => b.id))
  for (let changed = true; changed; ) {
    changed = false
    for (const id of take) {
      const a = byId.get(id)?.block.anchor
      if (a && !take.has(a) && !inPlan.has(a)) {
        take.delete(id)
        changed = true
      }
    }
  }
  // Cancelled only for what is taken in the end.
  const cancel = new Set<string>()
  const gone = new Set<string>()
  for (const id of take) for (const c of byId.get(id)!.clash) if (!cancel.has(c.id)) {
    cancel.add(c.id)
    for (const b of leaving.get(c.id) ?? [c]) gone.add(b.id)
  }
  let raw = dayRaw(day.raw, day.date)
  for (const id of cancel) raw = setCancelled(raw, id, true)
  const cancelled = isRaw(raw.cancelled) ? raw.cancelled : Array.isArray(raw.cancelled) ? Object.fromEntries(raw.cancelled.map((x) => [String(x), true])) : {}
  for (const id of take) {
    const b = byId.get(id)!.block
    if (b.origin === 'session' && b.sourceId && isRaw(raw.sessions) && raw.sessions[b.sourceId] === 'no') raw = setSessionAnswer(raw, b.sourceId, null)
    // Cancelled before (a block of the snapshot, or a copy „Nadpisz” / „Odwołaj” left in the file): back – only then is `cancelled` written.
    // A block of the snapshot comes back as the day had it (your change of it stays); another one is written into the file.
    if (cancelled[b.id]) raw = setCancelled(raw, b.id, false)
    if (!asSnap.has(b.id)) raw = putBlock(raw, b)
  }
  return { raw, added: take.size, cancelled: gone.size, skipped: judged.missing.length - take.size }
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
