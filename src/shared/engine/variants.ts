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
import { endShiftOf, OPEN, type BlockFact } from './facts'
import { atOf } from './grid'
import { moveBetweenDays, newUserBlock } from './planEdit'
import { suggestRegen } from './reserve'
import { secondShiftStart } from './timer'

/** A variant never shortens a block below this (the shortest block a drag leaves is `MIN_BLOCK_MIN` of `model/plan`). */
export const VARIANT_MIN_BLOCK_MIN = 15
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

/** The most steps `zeroOf` takes (a bound for safety: a block's end changes a few times a day). */
const ZERO_STEPS = 32

/**
 * The instant (index) a started block's countdown comes to 0 and stays there: a fixed block at its planned end, a
 * flexible one when its running time reaches its length – each moved by the „Przedłuż” (and the shortenings dragged on
 * the axis, D365) clicked before 2 min past it. A length not reached yet takes every change so far (a shortening may
 * bring its 0 to now). A shortening can move the 0 back before a change, so the changes taken are no longer only
 * growing: the search stops after a bounded number of steps.
 */
function zeroOf(state: DayState, info: BlockInfo, f: BlockFact, byId: Map<string, BlockInfo>): number | null {
  if (f.startedAt == null) return null
  const span = info.fixed ? plannedSpan(info, byId) : null
  const planned = f.planned?.durationMin ?? info.durationMin
  let ext = 0
  for (let step = 0; ; step++) {
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
    const until = z ?? Number.POSITIVE_INFINITY
    const more = endShiftOf(f, until + OVERRUN_CHECK_MIN)
    if (more === ext || step >= ZERO_STEPS) return z
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
 * `pushes` – triggers of the time the day's log does not hold: blocks pushed apart in the main window (D367, „Przesunięto
 * N bloków”), known to the bar of the computer that pushed them.
 */
export function variantCauses(state: DayState, energy: EnergyState | null, pushes: readonly VariantTrigger[] = []): VariantCause[] {
  const out: VariantCause[] = []
  const date = state.grid.date
  const tr = variantTriggers(state, energy)
  const end = state.lastWorkForecast
  const boundary = state.boundary.approved
  const time = pushes.length ? [...tr.time, ...pushes].sort((a, b) => a.at - b.at) : tr.time
  if (boundary != null && end != null && end > boundary) for (const t of time) out.push({ kind: 'time', id: `variants:${date}:${t.id}`, at: t.at, minutes: end - boundary })
  // A pool's last descent only: the earlier ones were followed by a rise above the reserve.
  const last = new Map(tr.energy.map((t) => [t.pool, t]))
  for (const t of last.values()) if (energy!.atReserve[t.pool]) out.push({ kind: 'energy', id: `variants:${date}:${t.id}`, at: t.at, pool: t.pool })
  return out.sort((a, b) => a.at - b.at)
}

/**
 * „Przestaw plan” without the marker (spec „Przestaw plan otwiera go także bez znacznika”): the cause there is now, as
 * `variantCauses` judges it – the forecast end of work after the approved boundary, else a pool at the reserve outside
 * the calibration (`energy.variants`); null – the plan fits.
 */
export function planCause(state: DayState, energy: EnergyState | null, now: number): VariantCause | null {
  const id = `variants:${state.grid.date}:plan:${now}`
  const end = state.lastWorkForecast
  const boundary = state.boundary.approved
  if (boundary != null && end != null && end > boundary) return { kind: 'time', minutes: end - boundary, id, at: now }
  const pool = energy?.known && energy.enabled && energy.variants ? (Object.keys(energy.atReserve) as Pool[]).find((p) => energy.atReserve[p]) : undefined
  return pool ? { kind: 'energy', pool, id, at: now } : null
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

/** A variant's changes counted: the effect and the day they leave. */
interface Judged {
  effect: Variant['effect']
  after: DayState
}

/** The day counted again with the changes. */
function judgeDay(ctx: DayContext, before: DayState, changes: readonly VariantChange[]): Judged {
  const after = changes.length ? computeDay({ ...ctx, plan: planWith(ctx, changes) }) : before
  const end = after.lastWorkForecast
  const boundary = before.boundary.approved ?? before.boundary.proposal
  // Extension: the forecast's minutes of work after the boundary, as the exchange counts them.
  let ext = 0
  if (boundary != null) for (const p of after.forecast) if (isBoundaryWork(p.block) && !p.block.lectureOrCommute) ext += Math.max(0, p.to - Math.max(p.from, boundary))
  return { effect: { workEndMin: end != null ? lmOf(after, end) : null, extensionMin: ext, regenMin: after.regen.towardMinMin, withinBoundary: boundary == null || end == null || end <= boundary }, after }
}

/**
 * How many times a variantsFor counts the day again at most (D340): the forecast moves a flexible block that does not fit
 * before a fixed one whole behind it, so a cut or a move is not linear in the end of work – each is judged, and the
 * search for one that fits has this many tries, half for the shortening and half for the move to tomorrow.
 */
export const MAX_DAY_COUNTS = 8

/** Whether `a` brings the end of work nearer the boundary than `b`: one that fits first, then the earlier end. */
const nearer = (a: Variant['effect'], b: Variant['effect']): boolean => (a.withinBoundary !== b.withinBoundary ? a.withinBoundary : (a.workEndMin ?? Number.NEGATIVE_INFINITY) < (b.workEndMin ?? Number.NEGATIVE_INFINITY))

/** The variants for a cause (2–3, fewer without candidates), each judged by the day counted again. */
export function variantsFor(ctx: DayContext, state: DayState, cause: VariantCause, names: (b: BlockInfo) => string): Variant[] {
  const out: Variant[] = []
  // The days counted again so far (computeDay is the cost of a variant): the searches stop at MAX_DAY_COUNTS.
  let counts = 0
  // The same changes (in any order) are counted once: the first step of a search is often the linear try already judged.
  const judged = new Map<string, Judged>()
  const judge = (changes: readonly VariantChange[]): Judged => {
    if (!changes.length) return judgeDay(ctx, state, changes)
    const key = changes.map((c) => JSON.stringify(c)).sort().join('|')
    let j = judged.get(key)
    if (!j) {
      counts++
      j = judgeDay(ctx, state, changes)
      judged.set(key, j)
    }
    return j
  }
  const add = (id: string, label: (e: Variant['effect']) => string, changes: VariantChange[], judged: Judged = judge(changes)) => {
    out.push({ id, label: label(judged.effect), changes, effect: judged.effect })
  }
  if (cause.kind === 'time') {
    const gap = gapOfNow(state)
    // Only the work before the second shift: the end of work (`lastWorkForecast`) leaves the rest out.
    const second = secondShiftStart(state)
    const all = candidates(state, (b) => isBoundaryWork(b) && !b.lectureOrCommute).filter((c) => c.from < second)
    // First the blocks of the same gap between fixed blocks (the latest first), then the latest planned of the rest.
    const inGap = all.filter((c) => c.from >= gap.from && c.from < gap.to).sort((a, b) => b.from - a.from)
    const rest = all.filter((c) => !inGap.includes(c)).sort((a, b) => b.from - a.from)
    const ordered = [...inGap, ...rest]
    const byId = new Map(all.map((c) => [c.info.id, c.info]))
    const half = Math.floor(MAX_DAY_COUNTS / 2)
    const boundary = state.boundary.approved ?? state.boundary.proposal
    // The minutes the end of work is past the boundary in a judged day (0: it fits).
    const over = (j: Judged) => (boundary == null || j.effect.workEndMin == null ? 0 : Math.max(0, j.effect.workEndMin - lmOf(state, boundary)))
    /** The candidate placed latest in a judged day, from the ones `ok` lets through: the one that makes the end of work. */
    const latest = (j: Judged, ok: (id: string) => boolean): string | null => {
      let pick: { id: string; to: number } | null = null
      for (const p of j.after.forecast) if (byId.has(p.block.id) && ok(p.block.id) && (pick == null || p.to > pick.to)) pick = { id: p.block.id, to: p.to }
      return pick?.id ?? null
    }
    /**
     * The search from the end of work: from the day as it is, one change at a time (`take`, for the block that makes the end,
     * with the minutes it is past the boundary; it returns how to take it back), the day counted again after each, until the
     * end fits or the counts reach `limit`. A step after which the end of work did not come nearer is taken back (and its
     * block left alone) – it stays in no variant. null: no step stayed.
     */
    const fromLatest = (limit: number, canTake: (id: string) => boolean, take: (id: string, over: number) => () => void, changes: () => VariantChange[]): Judged | null => {
      let day = judgeDay(ctx, state, [])
      let took = false
      const skipped = new Set<string>()
      while (!day.effect.withinBoundary && counts < limit) {
        // The end of work made by a block that is no candidate (a fixed or a running one): no cut or move helps – stop at once.
        const end = day.after.lastWorkForecast
        if (end == null || !day.after.forecast.some((p) => byId.has(p.block.id) && p.to >= end)) break
        const id = latest(day, (x) => !skipped.has(x) && canTake(x))
        if (id == null) break
        const back = take(id, over(day))
        const next = judge(changes())
        if ((next.effect.workEndMin ?? Number.NEGATIVE_INFINITY) < (day.effect.workEndMin ?? Number.POSITIVE_INFINITY)) {
          day = next
          took = true
        } else {
          back()
          skipped.add(id)
        }
      }
      return took ? day : null
    }

    // Shortening. First by the order above, the minutes asked for; a cut is judged, and when the end of work still does not
    // fit (the cut block is not the one that makes it, or the block behind a fixed one still does not fit before it) the
    // cut goes where the end is made, as far as the blocks can go (not below VARIANT_MIN_BLOCK_MIN), judged again each time.
    const cutsOf = (cuts: ReadonlyMap<string, number>): VariantChange[] => [...cuts].map(([block, toMin]) => ({ k: 'shorten', block, toMin }))
    const lengthIn = (cuts: ReadonlyMap<string, number>, id: string) => cuts.get(id) ?? byId.get(id)!.durationMin
    let need = cause.minutes
    let cuts = new Map<string, number>()
    for (const c of ordered) {
      if (need <= 0) break
      const can = c.info.durationMin - VARIANT_MIN_BLOCK_MIN
      if (can <= 0) continue
      const cut = Math.min(can, need)
      cuts.set(c.info.id, c.info.durationMin - cut)
      need -= cut
    }
    if (cuts.size) {
      let best = judge(cutsOf(cuts))
      if (!best.effect.withinBoundary) {
        const tried = new Map<string, number>()
        const day = fromLatest(
          half,
          (x) => lengthIn(tried, x) - VARIANT_MIN_BLOCK_MIN > 0,
          (id, past) => {
            const was = tried.get(id)
            tried.set(id, lengthIn(tried, id) - Math.min(past, lengthIn(tried, id) - VARIANT_MIN_BLOCK_MIN))
            return () => (was == null ? tried.delete(id) : tried.set(id, was))
          },
          () => cutsOf(tried)
        )
        if (day && nearer(day.effect, best.effect)) {
          cuts = tried
          best = day
        }
      }
      const total = [...cuts].reduce((s, [id, toMin]) => s + byId.get(id)!.durationMin - toMin, 0)
      const firstName = names(byId.get(cuts.keys().next().value!)!)
      add('shorten', (e) => `Skróć ${firstName}${cuts.size > 1 ? ` i ${cuts.size - 1} inne` : ''} o ${total} min · koniec pracy ${e.workEndMin != null ? logicalClock(e.workEndMin) : '—'}`, cutsOf(cuts), best)
    }

    // Moving to tomorrow. The same: the blocks of the order above until their lengths cover the minutes asked for; when
    // the end of work still does not fit, the blocks that make it go, the latest first, one by one.
    let moved = 0
    let away: string[] = []
    // A category „nie przenosić na jutro” may be shortened, never moved (spec „Kategorie”).
    for (const c of ordered) {
      if (moved >= cause.minutes) break
      if (c.info.rules.noMoveTomorrow) continue
      away.push(c.info.id)
      moved += c.info.durationMin
    }
    if (away.length) {
      const movesOf = (ids: readonly string[]): VariantChange[] => ids.map((block) => ({ k: 'tomorrow', block }))
      let best = judge(movesOf(away))
      if (!best.effect.withinBoundary) {
        const tried: string[] = []
        const day = fromLatest(
          MAX_DAY_COUNTS,
          (x) => !tried.includes(x) && !byId.get(x)!.rules.noMoveTomorrow,
          (id) => {
            tried.push(id)
            return () => tried.pop()
          },
          () => movesOf(tried)
        )
        if (day && nearer(day.effect, best.effect)) {
          away = tried
          best = day
        }
      }
      const firstName = names(byId.get(away[0]!)!)
      add('tomorrow', (e) => `Przesuń ${firstName}${away.length > 1 ? ` i ${away.length - 1} inne` : ''} na jutro · koniec pracy ${e.workEndMin != null ? logicalClock(e.workEndMin) : '—'}`, movesOf(away), best)
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
  // A category „nie przenosić na jutro” may be shortened, never moved (spec „Kategorie”).
  const movable = costly != null && !costly.info.rules.noMoveTomorrow
  const shortenable = costly != null && costly.info.durationMin >= 2 * VARIANT_MIN_BLOCK_MIN
  if (movable) add('regenTomorrow', () => `${capital(regenName)} ${REGEN_VARIANT_MIN} min teraz · ${names(costly.info)} na jutro`, [regen, { k: 'tomorrow', block: costly.info.id }])
  if (shortenable) add('regenShorter', () => `${capital(regenName)} ${REGEN_VARIANT_MIN} min teraz · ${names(costly!.info)} krócej o połowę`, [regen, { k: 'shorten', block: costly!.info.id, toMin: Math.ceil(costly!.info.durationMin / 2) }])
  if (!movable && !shortenable) add('regen', () => `${capital(regenName)} ${REGEN_VARIANT_MIN} min teraz`, [regen])
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
