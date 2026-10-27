/**
 * The variants of a change of the plan (spec „Warianty zmiany planu”, D22, D79, T32, T49): when the forecast end of work
 * before the second shift falls after the approved boundary, or a pool of energy came down to the reserve – checked at
 * a trigger (a request, a block 2 min past 0, a fixed block over a flexible one, a descent) – the bar shows the marker of
 * variants once for that cause; its panel has 2–3 variants, computed deterministically. For missing
 * time they shorten or move flexible work blocks – first from the same gap between fixed blocks, then the latest
 * planned; for missing energy they swap the most expensive block in the exhausted pool and add regeneration. They never
 * touch protected blocks; without candidates there are fewer variants. Every variant is judged by counting the day again
 * with its changes (the end of work, the extension, the regeneration). Pure: the bar shows them, a click applies one.
 */
import { dayRaw, putBlock, type Raw } from '../data/dayEdits'
import { logicalClock } from '../format'
import { REGEN_CATEGORY, costsOf, type Pool } from '../model/categories'
import type { PlanBlock } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { isBoundaryWork, plannedSpan, type BlockInfo } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import type { EnergyState } from './energy'
import { OPEN, type BlockFact } from './facts'
import { atOf } from './grid'
import { moveBetweenDays, newUserBlock } from './planEdit'
import { suggestRegen } from './reserve'

/** A block is never shortened below this. */
export const MIN_BLOCK_MIN = 15
/** The regeneration a variant of energy adds now. */
export const REGEN_VARIANT_MIN = 20

/** The marker appears only at its trigger (spec „Sprawdzają go …”): within this long after it (a log from another computer comes late). */
export const VARIANT_CHECK_MIN = 5
/** A block whose countdown came to 0 triggers the check after this long without a reaction. */
export const OVERRUN_CHECK_MIN = 2

/** What triggered the check of the marker (`at` – ms): a request, a block past 0, a flexible block hit by a fixed one, a descent. */
export interface VariantTrigger {
  id: string
  at: number
}

export type VariantCause = ({ kind: 'time'; minutes: number } | { kind: 'energy'; pool: Pool }) & { id: string; at: number }

export type VariantChange =
  | { k: 'shorten'; block: string; toMin: number }
  | { k: 'tomorrow'; block: string }
  | { k: 'regen'; startMin: number; durationMin: number; variantId: string | null }

export interface Variant {
  id: string
  label: string
  changes: VariantChange[]
  /** What the day looks like with it: the forecast end of work (logical minute), extension minutes, regeneration. */
  effect: { workEndMin: number | null; extensionMin: number; regenMin: number; withinBoundary: boolean }
}

const lmOf = (s: DayState, idx: number) => logicalMinuteOf(s.grid.date, atOf(s.grid, idx))

/**
 * The instant (index) a started block's countdown comes to 0 and stays there: a fixed block at its planned end, a
 * flexible one when its running time reaches its length – each moved by the „Przedłuż” clicked before 2 min past it.
 */
function zeroOf(state: DayState, info: BlockInfo, f: BlockFact, byId: Map<string, BlockInfo>): number | null {
  if (f.startedAt == null) return null
  const span = info.fixed ? plannedSpan(info, byId) : null
  const planned = f.planned?.durationMin ?? info.durationMin
  let ext = 0
  for (;;) {
    let z: number | null = null
    if (span) z = Math.max(span.end, f.startedAt) + ext
    else {
      let ran = 0
      for (const r of f.runs) {
        const end = r.to === OPEN ? state.now : r.to
        if (ran + (end - r.from) >= planned + ext) {
          z = r.from + planned + ext - ran
          break
        }
        ran += end - r.from
      }
    }
    if (z == null) return null
    const more = f.extends.filter((x) => x.at < z! + OVERRUN_CHECK_MIN).reduce((s, x) => s + x.minutes, 0)
    if (more === ext) return z
    ext = more
  }
}

/**
 * The triggers of the check (spec „Warianty zmiany planu”): a request (its start, its end – or when it was written in),
 * a block of the foreground running 2 min past 0 without a reaction („Przedłuż” moves its 0, „Dalej” ends it), a fixed
 * block that started over a running flexible one, a descent of a pool to the reserve.
 */
export function variantTriggers(state: DayState, energy: EnergyState | null): { time: VariantTrigger[]; energy: Array<VariantTrigger & { pool: Pool }> } {
  const at = (idx: number) => atOf(state.grid, idx)
  const time: VariantTrigger[] = []
  for (const r of state.facts.requests) {
    if (r.mode !== 'after') time.push({ id: `request:${r.id}:start`, at: Math.max(at(r.from), r.startT) })
    if (r.to !== OPEN) time.push({ id: `request:${r.id}:end`, at: Math.max(at(r.to), r.endT ?? 0) })
  }
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  for (const f of state.facts.blocks.values()) {
    const info = byId.get(f.id)
    if (!info || info.bg) continue
    const z = zeroOf(state, info, f, byId)
    const check = z == null ? null : z + OVERRUN_CHECK_MIN
    if (check != null && check <= state.now && f.runs.some((r) => !r.bg && r.from <= z! && (r.to === OPEN ? state.now : r.to) >= check)) time.push({ id: `overrun:${f.id}:${z}`, at: at(check) })
    // A fixed (or waiting) block started while a flexible block ran in the foreground: it paused or ended that block.
    if ((info.fixed || info.waits) && f.startedAt != null) {
      const s = f.startedAt
      const hit = [...state.facts.blocks.values()].find((o) => {
        const oi = byId.get(o.id)
        return o.id !== f.id && oi && !oi.fixed && !oi.waits && !oi.bg && o.runs.some((r) => !r.bg && r.from < s && r.to === s)
      })
      if (hit) time.push({ id: `fixed:${f.id}:${hit.id}`, at: at(s) })
    }
  }
  const pools: Array<VariantTrigger & { pool: Pool }> = []
  if (energy?.known && energy.enabled && energy.variants) for (const d of energy.descents) pools.push({ id: `energy:${d.pool}:${d.at}`, at: at(d.at), pool: d.pool })
  return { time: time.sort((a, b) => a.at - b.at), energy: pools }
}

/**
 * The causes of variants now, one for each trigger (the latest last): the forecast end of work before the second shift
 * after the approved boundary; a pool still at the reserve after its descent (not in calibration – `energy.variants`).
 */
export function variantCauses(state: DayState, energy: EnergyState | null): VariantCause[] {
  const out: VariantCause[] = []
  const date = state.grid.date
  const tr = variantTriggers(state, energy)
  const end = state.lastWorkForecast
  const boundary = state.boundary.approved
  if (boundary != null && end != null && end > boundary) for (const t of tr.time) out.push({ kind: 'time', id: `variants:${date}:${t.id}`, at: t.at, minutes: end - boundary })
  // A pool's last descent only: the earlier ones were followed by a rise above the reserve.
  const last = new Map(tr.energy.map((t) => [t.pool, t]))
  for (const t of last.values()) if (energy!.atReserve[t.pool]) out.push({ kind: 'energy', id: `variants:${date}:${t.id}`, at: t.at, pool: t.pool })
  return out.sort((a, b) => a.at - b.at)
}

/** Flexible blocks still to come (not begun, not parked), in the plan, never protected: the candidates of a variant. */
function candidates(state: DayState, filter: (b: BlockInfo) => boolean): Array<{ info: BlockInfo; from: number; to: number }> {
  const out: Array<{ info: BlockInfo; from: number; to: number }> = []
  for (const p of state.forecast) {
    const b = p.block
    if (p.running || p.bg || !b.inPlan || b.fixed || b.waits || b.protectedLife || b.rules.protected) continue
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) continue
    if (p.from < state.now || !filter(b)) continue
    out.push({ info: b, from: p.from, to: p.to })
  }
  return out
}

/** The gap between fixed blocks of the foreground that now falls in (start, end), indexes. */
function gapOfNow(state: DayState): { from: number; to: number } {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const spans = state.blocks
    .filter((b) => (b.fixed || b.waits) && !b.bg && b.inPlan)
    .map((b) => plannedSpan(b, byId))
    .filter((s): s is { start: number; end: number } => s != null)
    .sort((a, b) => a.start - b.start)
  let from = 0
  for (const s of spans) {
    if (s.end <= state.now) {
      from = Math.max(from, s.end)
      continue
    }
    if (s.start > state.now) return { from, to: s.start }
  }
  return { from, to: Number.POSITIVE_INFINITY }
}

/** The plan with the changes laid on (a block moved to tomorrow leaves today's plan; a regeneration comes in). */
export function planWith(ctx: DayContext, changes: readonly VariantChange[]): PlanBlock[] {
  let plan = [...ctx.plan]
  for (const c of changes) {
    if (c.k === 'shorten') plan = plan.map((b) => (b.id === c.block ? { ...b, durationMin: c.toMin } : b))
    else if (c.k === 'tomorrow') plan = plan.filter((b) => b.id !== c.block && b.anchor !== c.block)
    else plan.push(newUserBlock(REGEN_CATEGORY, c.startMin, c.durationMin, ctx.snapshot.settings.categories[REGEN_CATEGORY], { id: `variant-regen-${c.startMin}`, variantId: c.variantId }))
  }
  return plan
}

/** The day counted again with the changes. */
function judge(ctx: DayContext, before: DayState, changes: readonly VariantChange[]): Variant['effect'] {
  const after = changes.length ? computeDay({ ...ctx, plan: planWith(ctx, changes) }) : before
  const end = after.lastWorkForecast
  const boundary = before.boundary.approved ?? before.boundary.proposal
  // Extension: the forecast's minutes of work after the boundary, as the exchange counts them.
  let ext = 0
  if (boundary != null) for (const p of after.forecast) if (isBoundaryWork(p.block) && !p.block.lectureOrCommute) ext += Math.max(0, p.to - Math.max(p.from, boundary))
  return { workEndMin: end != null ? lmOf(after, end) : null, extensionMin: ext, regenMin: after.regen.towardMinMin, withinBoundary: boundary == null || end == null || end <= boundary }
}

/** The variants for a cause (2–3, fewer without candidates), each judged by the day counted again. */
export function variantsFor(ctx: DayContext, state: DayState, cause: VariantCause, names: (b: BlockInfo) => string): Variant[] {
  const out: Variant[] = []
  const add = (id: string, label: (e: Variant['effect']) => string, changes: VariantChange[]) => {
    const effect = judge(ctx, state, changes)
    out.push({ id, label: label(effect), changes, effect })
  }
  if (cause.kind === 'time') {
    const gap = gapOfNow(state)
    const all = candidates(state, (b) => isBoundaryWork(b) && !b.lectureOrCommute)
    // First the blocks of the same gap between fixed blocks (the latest first), then the latest planned of the rest.
    const inGap = all.filter((c) => c.from >= gap.from && c.from < gap.to).sort((a, b) => b.from - a.from)
    const rest = all.filter((c) => !inGap.includes(c)).sort((a, b) => b.from - a.from)
    const ordered = [...inGap, ...rest]
    let need = cause.minutes
    const shorten: VariantChange[] = []
    for (const c of ordered) {
      if (need <= 0) break
      const can = c.info.durationMin - MIN_BLOCK_MIN
      if (can <= 0) continue
      const cut = Math.min(can, need)
      shorten.push({ k: 'shorten', block: c.info.id, toMin: c.info.durationMin - cut })
      need -= cut
    }
    if (shorten.length) {
      const first = ordered.find((c) => c.info.id === (shorten[0] as { block: string }).block)!
      add('shorten', (e) => `Skróć ${names(first.info)}${shorten.length > 1 ? ` i ${shorten.length - 1} inne` : ''} o ${cause.minutes - Math.max(0, need)} min · koniec pracy ${e.workEndMin != null ? logicalClock(e.workEndMin) : '—'}`, shorten)
    }
    let moved = 0
    const tomorrow: VariantChange[] = []
    for (const c of ordered) {
      if (moved >= cause.minutes) break
      tomorrow.push({ k: 'tomorrow', block: c.info.id })
      moved += c.info.durationMin
    }
    if (tomorrow.length) {
      const first = ordered.find((c) => c.info.id === (tomorrow[0] as { block: string }).block)!
      add('tomorrow', (e) => `Przesuń ${names(first.info)}${tomorrow.length > 1 ? ` i ${tomorrow.length - 1} inne` : ''} na jutro · koniec pracy ${e.workEndMin != null ? logicalClock(e.workEndMin) : '—'}`, tomorrow)
    }
    add('keep', (e) => `Zostaw · przedłużenie ${e.extensionMin} min`, [])
    return out
  }
  // Missing energy: regeneration now by the way chosen for the pool, and the most expensive block in it moved or shortened.
  const way = suggestRegen(state.settings, cause.pool)
  const regenName = state.settings.categories[REGEN_CATEGORY]?.variants.find((v) => v.id === way)?.name ?? 'regeneracja'
  const nowMin = lmOf(state, state.now)
  const regen: VariantChange = { k: 'regen', startMin: nowMin, durationMin: REGEN_VARIANT_MIN, variantId: way }
  const costOf = (b: BlockInfo) => (b.costs ?? costsOf(b.rules, b.variantId))[cause.pool]
  const costly = candidates(state, (b) => costOf(b) > 0).sort((a, b) => costOf(b.info) - costOf(a.info) || a.from - b.from)[0]
  if (costly) {
    add('regenTomorrow', () => `${capital(regenName)} ${REGEN_VARIANT_MIN} min teraz · ${names(costly.info)} na jutro`, [regen, { k: 'tomorrow', block: costly.info.id }])
    if (costly.info.durationMin >= 2 * MIN_BLOCK_MIN)
      add('regenShorter', () => `${capital(regenName)} ${REGEN_VARIANT_MIN} min teraz · ${names(costly.info)} krócej o połowę`, [regen, { k: 'shorten', block: costly.info.id, toMin: Math.ceil(costly.info.durationMin / 2) }])
  } else add('regen', () => `${capital(regenName)} ${REGEN_VARIANT_MIN} min teraz`, [regen])
  add('keep', () => 'Zostaw plan', [])
  return out.slice(0, 3)
}

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/**
 * A chosen variant as the files of the days (the window writes them as edits): a shortened block with its new length; a
 * block to tomorrow moved with its id (a move of a variant does not count to its moves, spec „Przeniesienie”); a
 * regeneration added to today's plan from now – its id is returned so the bar starts it at once.
 */
export function applyVariant(ctx: DayContext, today: Raw | null, tomorrow: Raw | null, v: Variant, tomorrowDate: string): { today: Raw; tomorrow: Raw | null; start: string | null } {
  let t = dayRaw(today, ctx.date)
  let next = tomorrow
  let start: string | null = null
  for (const c of v.changes) {
    const b = ctx.plan.find((x) => x.id === (c as { block?: string }).block)
    // A block a variant changed is marked: it gives no note for accuracy (the game).
    if (c.k === 'shorten' && b) t = putBlock(t, { ...b, durationMin: c.toMin, byVariant: true })
    else if (c.k === 'tomorrow' && b) {
      const moved = moveBetweenDays(t, next, { ...b, byVariant: true }, ctx.plan, ctx.date, tomorrowDate, false)
      t = moved.source
      next = moved.target
    } else if (c.k === 'regen') {
      const r = newUserBlock(REGEN_CATEGORY, c.startMin, c.durationMin, ctx.snapshot.settings.categories[REGEN_CATEGORY], { variantId: c.variantId })
      t = putBlock(t, r)
      start = r.id
    }
  }
  return { today: t, tomorrow: next, start }
}

export interface MarkerInput {
  /** Causes whose marker was in the bar: it stays while its cause holds (hidden in the session and class modes). */
  shown: ReadonlySet<string>
  /**
   * Causes closed, or shown and no longer holding – never again. The caller adds a shown cause when you close it or when
   * it leaves `causes` (not when a session hides the marker: it comes back after it).
   */
  done: ReadonlySet<string>
  /** The session or class mode is on: the marker waits for its end. */
  quiet: boolean
  /** The last session or class mode that ended (ms): a trigger in it is checked at its end. */
  lastQuiet: { from: number; to: number } | null
  now: number
}

/**
 * The marker of variants now (spec „Dla jednej przyczyny znacznik pojawia się raz”): the cause in the bar while it holds;
 * else the newest cause whose trigger came within VARIANT_CHECK_MIN – or whose trigger fell in the session or class
 * mode that ended within it.
 */
export function markerCause(causes: readonly VariantCause[], o: MarkerInput): VariantCause | null {
  if (o.quiet) return null
  const live = causes.filter((c) => !o.done.has(c.id))
  const kept = live.find((c) => o.shown.has(c.id))
  if (kept) return kept
  const checkedFrom = (c: VariantCause) => (o.lastQuiet && c.at >= o.lastQuiet.from && c.at < o.lastQuiet.to ? o.lastQuiet.to : c.at)
  return [...live].reverse().find((c) => c.at <= o.now && o.now - checkedFrom(c) <= VARIANT_CHECK_MIN * 60_000) ?? null
}
