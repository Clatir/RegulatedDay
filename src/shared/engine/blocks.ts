/**
 * What the engine needs to know of each block of a day (spec „Bloki”, „Klasy bloków”): its category's rules, where it is
 * planned, whether it waits for „Zacznij” (a fixed session – by its category only, D467), whether it is a block of the
 * plan of lectures or a „zjazd” (never an extension), whether it counts after the end of work as a project (D195) and
 * whether it has the mark „po pracy” (D209). Built from the plan and, for blocks started outside the plan, from their
 * start events.
 */
import { REGEN_CATEGORY, type CategoryRules, type Costs } from '../model/categories'
import type { PlanBlock } from '../model/plan'
import type { RulesSettings } from '../model/settings'
import type { BlockFact, DayFacts } from './facts'
import { idxOfLogical, type Grid } from './grid'
import { groupRootOf, placedAfter } from './parallel'

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
  /**
   * The block of the plan it runs beside (D476, D492, T1161): the first block of its group – its start is that block's, its
   * length its own (`plannedSpan`, the forecast); null – none, or the block it names is not in the plan (a block of its own).
   */
  alongside: string | null
  durationMin: number
  /** A fixed block of a category of the kind „sesja”: starts only after „Zacznij”, up to its planned end (D192, D467). */
  waits: boolean
  /** From the plan of lectures or a „zjazd” (commute, class, a class imported from the PDF): work, but never an extension (spec). */
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
  /** The mark „po pracy” (D209): planned at least 30 min after the last other work block. */
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

/** The types of a day of „zjazd”: on them a remote class is a block of the „zjazd” (D359). */
export const ZJAZD_DAY_TYPES: ReadonlySet<string> = new Set(['zjazd-stacjonarny', 'zjazd-zdalny'])

/** A remote class on a day of `dayType` is a block of the „zjazd” (D359): on a day of „zjazd” only. */
export const zjazdRemoteClass = (rules: Pick<CategoryRules, 'kind'>, dayType: string): boolean => rules.kind === 'remoteClass' && ZJAZD_DAY_TYPES.has(dayType)

/**
 * The blocks of a day: the plan's, then the ones that only the log knows (with what their start said). `typeAt`: the
 * day's type in force at a minute (index) – a day switched in its course has its snapshots of type.
 */
export function blockInfos(grid: Grid, plan: readonly PlanBlock[], facts: DayFacts, settings: RulesSettings, typeAt: (k: number) => string = () => ''): BlockInfo[] {
  const rulesOf = (id: string) => settings.categories[id] ?? (id === REGEN_CATEGORY ? { ...CAT_FALLBACK, cls: 'free' as const, kind: 'regen' as const } : CAT_FALLBACK)
  const out: BlockInfo[] = []
  const make = (p: PlanBlock, inPlan: boolean): BlockInfo => {
    const rules = rulesOf(p.categoryId)
    const start = p.anchor ? null : p.startMin != null ? idxOfLogical(grid, p.startMin) : null
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
      alongside: null,
      durationMin: p.durationMin,
      // A mark an older version wrote („druga zmiana”, „analiza tygodniowa”) is never read: the category decides (D467).
      waits: rules.kind === 'session' && p.fixed,
      // A class imported from the PDF of „zjazdy” (D357) is a block of a „zjazd” too, a remote one as well.
      lectureOrCommute: p.origin === 'lecture' || p.origin === 'zjazd' || rules.kind === 'commute' || rules.kind === 'lecture',
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
          costs: null,
          bgCostPct: null,
          note: '',
          name: null,
          origin: 'user',
          sourceId: null,
          recorder: null,
          moves: 0,
          requests: [],
          task: null,
          routine: null,
          steps: [],
          movedFrom: null,
          byVariant: false,
          alongside: null
        },
        false
      )
    )
  }
  const byId = new Map(out.map((b) => [b.id, b]))
  // D492 (T1161): a block beside another block of the plan starts with the first block of its group.
  const planned = new Map(plan.map((p) => [p.id, p]))
  for (const b of out) {
    const root = b.inPlan ? groupRootOf(planned, b.id) : null
    // A group's block whose own start waits for this one (a file of another computer: anchored after it) – no group, no cycle.
    if (root == null || placedAfter(planned, root, b.id)) continue
    b.alongside = root
    b.start = byId.get(root)!.start
    b.anchor = null
  }
  // D359: a remote class on a day of „zjazd” – of the import, of the template, added by you – is a block of the „zjazd”
  // (it moves the maximum, never an extension), by the type in force at its planned start (begun outside the plan: its
  // first run); on other days as before.
  for (const b of out) {
    if (b.lectureOrCommute || b.rules.kind !== 'remoteClass') continue
    const at = plannedSpan(b, byId)?.start ?? facts.blocks.get(b.id)?.runs[0]?.from ?? 0
    if (zjazdRemoteClass(b.rules, typeAt(at))) b.lectureOrCommute = true
  }
  // The approval in force (not opened again since): the plan it names (T321); one that names none – the plan as it is.
  const last = facts.approvals.at(-1)
  const inForce = last && last.undoneAt == null ? last : null
  markAfterWork(out, byId, inForce?.plan ? new Set(inForce.plan) : null)
  return out
}

/** Planned end by the plan's own times (anchors follow their anchor's planned end). */
export function plannedSpan(b: BlockInfo, byId: Map<string, BlockInfo>, depth = 0): { start: number; end: number } | null {
  // A block beside another (D492): from the start of its group's block (an anchored one too), as long as itself.
  const root = b.alongside != null && depth <= 20 ? byId.get(b.alongside) : undefined
  const along = root ? plannedSpan(root, byId, depth + 1) : null
  if (along) return { start: along.start, end: along.start + b.durationMin }
  if (b.start != null) return { start: b.start, end: b.start + b.durationMin }
  if (!b.anchor || depth > 20) return null
  const a = byId.get(b.anchor)
  const s = a ? plannedSpan(a, byId, depth + 1) : null
  return s ? { start: s.end, end: s.end + b.durationMin } : null
}

/**
 * What a block's start writes of its plan (spec „Zdarzenie startu bloku zapisuje planowaną długość, kategorię, koszty i
 * miejsce z tej chwili”): the plan's entry (`plan`) wins over the block's info; with it, also what names it (D431, T1024).
 */
export function startPlanned(info: BlockInfo, plan: readonly PlanBlock[] = []): Record<string, unknown> {
  const p = plan.find((b) => b.id === info.id)
  return {
    // D431, T1024: what names it at the start – its own name, task, routine, requests (a block taken out of the plan after it
    // keeps them); known only with the plan given.
    ...(p ? { name: p.name, task: p.task, routine: p.routine, requests: p.requests } : {}),
    categoryId: info.categoryId,
    variantId: info.variantId,
    durationMin: p?.durationMin ?? info.durationMin,
    fixed: info.fixed,
    costs: info.costs,
    bgCostPct: info.bgCostPct
  }
}

/**
 * A block of the plan with its own hour, as the axis drags it (D305, D365): not after another block, not a session, a
 * lecture nor a class imported from the PDF of „zjazdy” (D357) – those keep „Przedłuż” on the bar.
 * Before its start its place and length move (`dayItems` – `movable`, with „not begun” and „not passed”), once running
 * the end of its planned length (`engine/resize.ts`).
 */
export const ownHourBlock = (b: BlockInfo): boolean => b.anchor == null && b.start != null && draggableKind(b)

/** A block of the plan of a kind the axis drags (D305): not a session, a lecture nor a class of a „zjazd”. */
const draggableKind = (b: BlockInfo): boolean => b.inPlan && b.origin !== 'session' && b.origin !== 'lecture' && b.origin !== 'zjazd'

/**
 * A block of the plan the axis lets you drag to another place (D305; between the days of „Tydzień” and „3 dni” the same –
 * D417): not begun, not taken off the day (parked, cancelled), of its own hour (`ownHourBlock`), and not passed – it ends
 * after now (`endIdx` – where the axis shows its end; `nowIdx` null: a day to come). A day gone by is never edited by
 * dragging (its axis has no `onMove`): the caller says so.
 */
export function movableBlock(b: BlockInfo, f: Pick<BlockFact, 'startedAt' | 'parkedAt' | 'cancelledAt'> | undefined, endIdx: number, nowIdx: number | null): boolean {
  return f?.startedAt == null && f?.parkedAt == null && f?.cancelledAt == null && ownHourBlock(b) && (nowIdx == null || endIdx > nowIdx)
}

/** Counts for the boundary, the end of work and its forecast (spec: no „nie przerywa regeneracji”, no „po pracy”). */
export const isBoundaryWork = (b: BlockInfo): boolean => b.isWork && !b.rules.keepsRegen && !b.afterWorkMark

/**
 * Work that sets the end of work: boundary work not counted as a project (`projects`, D195) – a block of „po końcu pracy
 * jak projekt” begun before the end of work is work. The one rule of `day.ts` (its ends) and the timer (G1).
 */
export const setsWorkEndBlock = (b: BlockInfo | undefined, projects: ReadonlySet<string>): boolean => !!b && isBoundaryWork(b) && !projects.has(b.id)

/**
 * The mark „po pracy” (D209), from the planned hours: a block of a category „po końcu pracy jak projekt” planned at
 * least 30 min after the planned end of the last other work block; never one anchored to a
 * work block. Other blocks with the mark are no work for this rule (spec: „blok pracy” has no mark), so two evening
 * blocks keep it both – the largest set of marks that holds, whatever the order of the plan: every candidate starts
 * marked, one too close to unmarked work loses it (which can only take marks away from others), and while no unmarked
 * work is left at all the earliest candidate is the day's work. A block of the plan approved with the boundary is judged
 * by the blocks of that plan (T321: set at the approval – a block added later never takes its mark away).
 */
function markAfterWork(blocks: BlockInfo[], byId: Map<string, BlockInfo>, approvedPlan: ReadonlySet<string> | null): void {
  const candidates: Array<{ b: BlockInfo; start: number }> = []
  for (const b of blocks) {
    if (!b.rules.afterWorkAsProject || !b.inPlan) continue
    const anchor = b.anchor ? byId.get(b.anchor) : undefined
    if (anchor?.isWork) continue
    const own = plannedSpan(b, byId)
    if (!own) continue
    candidates.push({ b, start: own.start })
    b.afterWorkMark = true
  }
  candidates.sort((x, y) => x.start - y.start || (x.b.id < y.b.id ? -1 : 1))
  // Work of the plan with a planned place (an anchor that leads nowhere has none).
  const work = (o: BlockInfo) => o.isWork && !o.rules.keepsRegen && o.inPlan && !o.afterWorkMark && plannedSpan(o, byId) != null
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
