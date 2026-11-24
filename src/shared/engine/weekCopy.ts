/**
 * „Skopiuj tydzień do…” (N16, D630–D634): the blocks of a week – all of them from the heading of „Tydzień”, the ones selected from the menu of
 * the selection – copied to the same weekday of other weeks. Without a DOM, on the raw day files; the judgement and the file are the rule of
 * „Zastosuj do…” (`judgeCands`, `applyJudged` – T2940).
 *
 * A day D of the source goes to D + 7k, k the number of weeks from the week of the earliest source day to the week chosen (never 0): Monday to
 * Monday, also for a selection of „3 dni” across two weeks. A target before today is left (D633); today the blocks gone by stay out.
 *
 * What is copied (D630, D631): your blocks and the template's still in the plan (not taken off it before they began – cancelled, parked),
 * begun and done ones as plan at their planned hours; never the day's layers (sessions, lectures, classes of a „zjazd” – the target has its
 * own), a series' occurrence (its series puts it where it falls) nor a buffer of decompression (counted again after the copy). A copy is
 * yours (`copiedDay` – `asCopy`): its name, note, costs, variant, routine and steps (not ticked) stay; no sprawa, no requests, no attachments
 * (they are by the block's id). Its id is computed from its target, its source day and its block (`weekCopyId`, T2941): the same copy twice
 * is one, on any computer. Anchors and groups go with the copies; a block anchored to one not copied gets its own hour.
 *
 * A block the target has already (D632) – the same subcategory, variant and name at the same hours (a block of the same template, the same
 * block of yours, an earlier copy) – is not copied and asks nothing; a copy anchored to or beside such a block goes with the target's. One
 * the target's log took off (cancelled, parked – the same block, or an earlier copy by its id, even taken out of the file since) is left
 * out („odwołane lub zaparkowane w tym dniu”, T2953) with the copies anchored to it („zakotwiczone do odwołanych”) and beside it („obok
 * pominiętego”, T2956) – never brought back. A copy put into the file takes
 * none of the ticks and the routine's list a copy of its id left there with no block (T2952, T2959).
 */
import { derivedId } from '../model/ids'
import type { PlanBlock } from '../model/plan'
import { weekStart } from '../time/day'
import { addDays, daysBetween } from '../time/zone'
import { copiedDay } from './planEdit'
import { setRoutineSteps, setStepsDone, type Raw } from '../data/dayEdits'
import { dayBlocks, isRaw } from '../data/dayEdits'
import { groupRootOf } from './parallel'
import { anchoredClosure, applyJudged, judgeCands, spansOf, type Applied, type ApplyDay, type ApplyJudged, type ApplyMode, type ApplyTiming } from './templateApply'

/** The id of the copy of the block `id` of the day `source` in the day `target` (T2941). */
export const weekCopyId = (target: string, source: string, id: string): string => derivedId(target, 'wcp', source, id)

/** A day of the source as the copy reads it: its plan (without buffers), the blocks the log took off it before they began, the ones selected. */
export interface CopySource {
  date: string
  plan: readonly PlanBlock[]
  off: ReadonlySet<string>
  /** Only these blocks (the menu of the selection); left out – every block of the day. */
  only?: ReadonlySet<string>
}

/** A day the copy goes to: its source day and whether it is before today (left as it is). */
export interface CopyTarget {
  source: string
  date: string
  past: boolean
}

/**
 * The days of the copy: each source day to the same weekday of every week chosen (`weeks` – any day of each; D + 7k, k ≠ 0), the weeks in
 * their order, the source days in theirs.
 */
export function copyTargets(sources: readonly string[], weeks: readonly string[], today: string): CopyTarget[] {
  const days = [...new Set(sources)].sort()
  if (!days.length) return []
  const from = weekStart(days[0]!)
  const ks = [...new Set(weeks.map((w) => daysBetween(from, weekStart(w)) / 7))].filter((k) => k !== 0).sort((a, b) => a - b)
  return ks.flatMap((k) =>
    days.map((source) => {
      const date = addDays(source, 7 * k)
      return { source, date, past: date < today }
    })
  )
}

/** The copies of a source day's blocks in `target` (D630, D631). */
export function copiesFor(src: CopySource, target: string): PlanBlock[] {
  const take = (b: PlanBlock): boolean => !src.off.has(b.id) && (!src.only || src.only.has(b.id))
  return copiedDay(src.plan, { take, idOf: (b) => weekCopyId(target, src.date, b.id) }).map((b) => ({ ...b, task: null }))
}

/** Two blocks are the same block of a plan: the same subcategory, variant and name at the same hours. */
const sameBlock = (a: PlanBlock, b: PlanBlock, sa: { start: number; end: number } | null | undefined, sb: { start: number; end: number } | null | undefined): boolean =>
  !!sa && !!sb && a.categoryId === b.categoryId && a.variantId === b.variantId && (a.name ?? null) === (b.name ?? null) && sa.start === sb.start && sa.end === sb.end

/** What the copy brings to a day: as `judgeApply`, and how many of its blocks the day has already (D632 – the same block, or an earlier copy). */
export interface CopyJudged extends ApplyJudged {
  already: number
  /** Copies left out because the day's log took that block off (cancelled, parked – T2953). */
  offDay: number
  /** Copies anchored to one of those, left out with it (T2953). */
  offAnchored: number
}

/**
 * The copies of a source day judged against a target day (`judgeCands`): those the day has already (D632) leave first – a copy anchored to
 * or beside one of them goes with the day's block; `timing` – today and its minute (D633: the blocks gone by stay out).
 */
export function judgeCopy(src: CopySource, day: ApplyDay, timing: ApplyTiming | null = null): CopyJudged {
  const all = copiesFor(src, day.date)
  const inPlan = new Set(day.plan.map((b) => b.id))
  const isOff = (id: string): boolean => day.off?.has(id) ?? false
  const spans = spansOf([...day.plan, ...all])
  const twin = new Map<string, string>()
  const used = new Set<string>()
  const offSeeds: string[] = []
  let earlier = 0
  for (const c of all) {
    // The log took this copy off (cancelled, parked – also one taken out of the file since): never brought back.
    if (isOff(c.id)) {
      offSeeds.push(c.id)
      continue
    }
    // An earlier copy is in the plan by its id: the judgement leaves it as present.
    if (inPlan.has(c.id)) {
      earlier++
      continue
    }
    const p = day.plan.find((x) => !used.has(x.id) && sameBlock(x, c, spans.get(x.id), spans.get(c.id)))
    if (!p) continue
    used.add(p.id)
    // The same block the log took off: left out as it, not copied back as yours.
    if (isOff(p.id)) offSeeds.push(c.id)
    else twin.set(c.id, p.id)
  }
  // What leaves with them: the copies anchored to them, only through copies the day has not (a block it has stays – T2956).
  const own = all.filter((c) => !twin.has(c.id) && !inPlan.has(c.id))
  const dropped = anchoredClosure(own, offSeeds)
  const seeds = new Set(offSeeds)
  // Beside one of them: out „obok pominiętego” with what is anchored to it (T2956) – unless its group stands in the plan of the day.
  const linked = new Map([...day.plan, ...own].map((b) => [b.id, b]))
  const rootOf = (id: string): string => groupRootOf(linked, id) ?? id
  const stands = (root: string): boolean => day.plan.some((p) => !isOff(p.id) && p.id !== root && rootOf(p.id) === root)
  const besideOff = anchoredClosure(own, own.filter((c) => !dropped.has(c.id) && c.alongside != null && dropped.has(rootOf(c.id)) && !stands(rootOf(c.id))).map((c) => c.id))
  // Beside the day's block: beside the first block of that one's group – a group is written flat (T2950); anchored – after that very block.
  const planMap = new Map(day.plan.map((b) => [b.id, b]))
  const besideTwin = (id: string): string => groupRootOf(planMap, twin.get(id)!) ?? twin.get(id)!
  const cands = own
    .filter((c) => !dropped.has(c.id) && !besideOff.has(c.id))
    .map((c) => ({ ...c, anchor: c.anchor ? (twin.get(c.anchor) ?? c.anchor) : null, alongside: c.alongside ? (twin.has(c.alongside) ? besideTwin(c.alongside) : c.alongside) : null }))
  const j = judgeCands(cands, day, timing, false)
  return { ...j, total: all.length, already: twin.size + earlier, offDay: seeds.size, offAnchored: dropped.size - seeds.size, beside: j.beside + besideOff.size }
}

/**
 * The target day's file after the copy in `mode` (a day that does not ask – `asksMode` false – always fills the gaps); a copy put in takes
 * none of the ticks (`stepsDone`) and the routine's list (`routineSteps`) the file kept for its id (T2952).
 */
export function applyCopy(day: ApplyDay, mode: ApplyMode, judged: CopyJudged): Applied {
  const r = applyJudged(day, mode, judged)
  // Only an id the file has no block of (T2959): a copy cancelled in the file and brought back keeps its own ticks.
  const inFile = new Set(dayBlocks(day.raw ?? {}).filter(isRaw).map((b) => String(b.id)))
  const raw = r.taken.filter((id) => !inFile.has(id)).reduce((x: Raw, id) => setRoutineSteps(setStepsDone(x, id, []), id, null), r.raw)
  return { ...r, raw }
}
