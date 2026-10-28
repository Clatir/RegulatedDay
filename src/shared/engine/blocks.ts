/**
 * What the engine needs to know of each block of a day (spec „Bloki”, „Klasy bloków”): its category's rules, where it is
 * planned, whether it waits for „Zacznij”, whether it is the second shift, a block of the plan of lectures or a „zjazd”
 * (never an extension), whether it counts after the end of work as a project (D195) and whether it has the mark „po
 * pracy” (D209). Built from the plan and, for blocks started outside the plan, from their start events.
 */
import { REGEN_CATEGORY, type CategoryRules, type Costs } from '../model/categories'
import type { PlanBlock } from '../model/plan'
import type { RulesSettings } from '../model/settings'
import type { DayFacts } from './facts'
import { idxOfLogical, type Grid } from './grid'

export interface BlockInfo {
  id: string
  categoryId: string
  variantId: string | null
  rules: CategoryRules
  /** In the plan (false: started outside it, e.g. „Pracuję” or a project begun by hand). */
  inPlan: boolean
  fixed: boolean
  /** Planned in the background. */
  bg: boolean
  /** Planned start (index), null when anchored. */
  start: number | null
  anchor: string | null
  durationMin: number
  /** A session, the second shift or a weekly analysis: starts only after „Zacznij” (D192, D212). */
  waits: boolean
  /** The second shift, or a template block anchored to it (it carries the mark). */
  secondShift: boolean
  weeklyAnalysis: boolean
  /** The latest a waiting block may start (its window's end), index. */
  waitUntil: number | null
  /** From the plan of lectures or a „zjazd” (commute, class): work, but never an extension (spec). */
  lectureOrCommute: boolean
  /** A lecture recorded on a computer (it runs on in „Odcinam się”). */
  recorded: boolean
  origin: PlanBlock['origin']
  sourceId: string | null
  isWork: boolean
  isLife: boolean
  isRegen: boolean
  isProject: boolean
  isRequestCat: boolean
  /** The mark „po pracy” (D209): planned at least 30 min after the last other work block before the second shift. */
  afterWorkMark: boolean
  protectedLife: boolean
  /** The block's own costs and share of them in the background (null: the category's, the setting). */
  costs: Costs | null
  bgCostPct: number | null
}

const CAT_FALLBACK: CategoryRules = {
  cls: 'work',
  kind: 'other',
  place: 'computer',
  background: false,
  startsInBackground: false,
  protected: false,
  noMoveTomorrow: false,
  noSleep: false,
  contact: false,
  classMode: false,
  keepsRegen: false,
  afterWorkAsProject: false,
  costs: { head: 0, emotions: 0, senses: 0 },
  variants: []
}

/** The blocks of a day: the plan's, then the ones that only the log knows (with what their start said). */
export function blockInfos(grid: Grid, plan: readonly PlanBlock[], facts: DayFacts, settings: RulesSettings): BlockInfo[] {
  const rulesOf = (id: string) => settings.categories[id] ?? (id === REGEN_CATEGORY ? { ...CAT_FALLBACK, cls: 'free' as const, kind: 'regen' as const } : CAT_FALLBACK)
  const out: BlockInfo[] = []
  const make = (p: PlanBlock, inPlan: boolean): BlockInfo => {
    const rules = rulesOf(p.categoryId)
    const start = p.anchor ? null : p.startMin != null ? idxOfLogical(grid, p.startMin) : null
    const waits = rules.kind === 'session' || p.tag === 'secondShift' || p.tag === 'weeklyAnalysis'
    return {
      id: p.id,
      categoryId: p.categoryId,
      variantId: p.variantId,
      rules,
      inPlan,
      fixed: p.fixed,
      bg: p.background ?? rules.startsInBackground,
      start,
      anchor: p.anchor,
      durationMin: p.durationMin,
      waits: waits && (p.fixed || p.tag != null),
      secondShift: p.tag === 'secondShift',
      weeklyAnalysis: p.tag === 'weeklyAnalysis',
      waitUntil: p.waitUntilMin != null ? idxOfLogical(grid, p.waitUntilMin) : null,
      lectureOrCommute: p.origin === 'lecture' || rules.kind === 'commute' || rules.kind === 'lecture',
      recorded: p.recorder != null,
      origin: p.origin,
      sourceId: p.sourceId,
      isWork: rules.cls === 'work',
      isLife: rules.cls === 'life',
      isRegen: rules.kind === 'regen',
      isProject: rules.kind === 'project',
      isRequestCat: rules.kind === 'request',
      afterWorkMark: false,
      protectedLife: rules.cls === 'life' && rules.protected,
      costs: p.costs,
      bgCostPct: p.bgCostPct
    }
  }
  const ids = new Set<string>()
  for (const p of plan) {
    out.push(make(p, true))
    ids.add(p.id)
  }
  for (const [id, f] of facts.blocks) {
    if (ids.has(id) || !f.planned) continue
    out.push(
      make(
        {
          id,
          categoryId: f.planned.categoryId,
          variantId: f.planned.variantId,
          startMin: null,
          anchor: null,
          durationMin: f.planned.durationMin,
          fixed: f.planned.fixed,
          background: f.runs[0]?.bg ?? null,
          tag: f.planned.tag,
          waitUntilMin: null,
          costs: null,
          bgCostPct: null,
          note: '',
          origin: 'user',
          sourceId: null,
          recorder: null,
          moves: 0,
          requests: [],
          routine: null,
          movedFrom: null,
          byVariant: false
        },
        false
      )
    )
  }
  // A template block anchored to the second shift carries its mark (spec „Druga zmiana”).
  const byId = new Map(out.map((b) => [b.id, b]))
  for (let changed = true; changed; ) {
    changed = false
    for (const b of out) {
      const a = b.anchor ? byId.get(b.anchor) : undefined
      if (a?.secondShift && !b.secondShift && b.origin === 'template') {
        b.secondShift = true
        b.waits = true
        changed = true
      }
    }
  }
  // The approval in force (not opened again since): the plan it names (T321); one that names none – the plan as it is.
  const last = facts.approvals.at(-1)
  const inForce = last && last.undoneAt == null ? last : null
  markAfterWork(out, byId, inForce?.plan ? new Set(inForce.plan) : null)
  return out
}

/** Planned end by the plan's own times (anchors follow their anchor's planned end). */
export function plannedSpan(b: BlockInfo, byId: Map<string, BlockInfo>, depth = 0): { start: number; end: number } | null {
  if (b.start != null) return { start: b.start, end: b.start + b.durationMin }
  if (!b.anchor || depth > 20) return null
  const a = byId.get(b.anchor)
  const s = a ? plannedSpan(a, byId, depth + 1) : null
  return s ? { start: s.end, end: s.end + b.durationMin } : null
}

/**
 * What a block's start writes of its plan (spec „Zdarzenie startu bloku zapisuje planowaną długość, kategorię, koszty i
 * miejsce z tej chwili”): the plan's entry (`plan`) wins over the block's info.
 */
export function startPlanned(info: BlockInfo, plan: readonly PlanBlock[] = []): Record<string, unknown> {
  const p = plan.find((b) => b.id === info.id)
  return {
    categoryId: info.categoryId,
    variantId: info.variantId,
    durationMin: p?.durationMin ?? info.durationMin,
    tag: p?.tag ?? (info.secondShift ? 'secondShift' : info.weeklyAnalysis ? 'weeklyAnalysis' : null),
    fixed: info.fixed,
    costs: info.costs,
    bgCostPct: info.bgCostPct
  }
}

/** Counts for the boundary, the end of work and its forecast (spec: no „nie przerywa regeneracji”, no „po pracy”). */
export const isBoundaryWork = (b: BlockInfo): boolean => b.isWork && !b.rules.keepsRegen && !b.afterWorkMark && !b.secondShift

/**
 * The mark „po pracy” (D209), from the planned hours: a block of a category „po końcu pracy jak projekt” planned at
 * least 30 min after the planned end of the last other work block before the second shift; never one anchored to a
 * work block. Other blocks with the mark are no work for this rule (spec: „blok pracy” has no mark), so two evening
 * blocks keep it both – the largest set of marks that holds, whatever the order of the plan: every candidate starts
 * marked, one too close to unmarked work loses it (which can only take marks away from others), and while no unmarked
 * work is left at all the earliest candidate is the day's work. A block of the plan approved with the boundary is judged
 * by the blocks of that plan (T321: set at the approval – a block added later never takes its mark away).
 */
function markAfterWork(blocks: BlockInfo[], byId: Map<string, BlockInfo>, approvedPlan: ReadonlySet<string> | null): void {
  const second = blocks.filter((b) => b.secondShift && b.start != null).map((b) => b.start!)
  const secondStart = second.length ? Math.min(...second) : Number.POSITIVE_INFINITY
  const candidates: Array<{ b: BlockInfo; start: number }> = []
  for (const b of blocks) {
    if (!b.rules.afterWorkAsProject || !b.inPlan) continue
    const anchor = b.anchor ? byId.get(b.anchor) : undefined
    if (anchor?.isWork) continue
    const own = plannedSpan(b, byId)
    if (!own || own.start >= secondStart) continue
    candidates.push({ b, start: own.start })
    b.afterWorkMark = true
  }
  candidates.sort((x, y) => x.start - y.start || (x.b.id < y.b.id ? -1 : 1))
  const work = (o: BlockInfo) => o.isWork && !o.rules.keepsRegen && !o.secondShift && o.inPlan && !o.afterWorkMark && (plannedSpan(o, byId)?.start ?? secondStart) < secondStart
  const settle = (mine: typeof candidates, pool: readonly BlockInfo[]) => {
    for (;;) {
      for (let changed = true; changed; ) {
        changed = false
        for (const { b, start } of mine) {
          if (!b.afterWorkMark) continue
          let lastEnd = Number.NEGATIVE_INFINITY
          for (const o of pool) if (o !== b && work(o)) lastEnd = Math.max(lastEnd, plannedSpan(o, byId)!.end)
          if (start < lastEnd + 30) {
            b.afterWorkMark = false
            changed = true
          }
        }
      }
      if (pool.some(work)) return
      const first = mine.find((x) => x.b.afterWorkMark)
      if (!first) return
      first.b.afterWorkMark = false
    }
  }
  // The blocks of the approved plan as they were judged then, among themselves; the rest against the whole plan.
  if (approvedPlan) settle(candidates.filter((x) => approvedPlan.has(x.b.id)), blocks.filter((o) => approvedPlan.has(o.id)))
  settle(candidates.filter((x) => !approvedPlan?.has(x.b.id)), blocks)
}
