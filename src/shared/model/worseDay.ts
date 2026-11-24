/**
 * The mark „Gorszy dzień” of a day's file (D570, D587, N4): written when you accept a worse day in the morning plan. It holds what the
 * acceptance changed, so its „Cofnij” – a moment later or hours later, on any computer – takes back only that: the routines' versions it
 * switched (each block's list before it, `routines`); the proposal of the boundary is earlier by `earlierMin` from `at` on (the engine
 * reads it – `DayContext.worseDays`). „Cofnij” never takes the mark away: it ends its period (`undoneAt`), so the minutes judged in it
 * stay as they were (T2543); a new acceptance the same day keeps the periods gone by in `past`. An older version keeps the field (edits of
 * a day go over its raw file) and counts the day without it.
 */
import { RANGES } from './settings'

/** The field of the day's file. */
export const WORSE_DAY_KEY = 'worseDay'

/** A period of a worse day (instants, ms UTC): from the acceptance `at` to its „Cofnij” (`until`; null – still in force). */
export interface WorsePeriod {
  at: number
  earlierMin: number
  until: number | null
}

export interface WorseDayMark {
  /** The instant of the acceptance (ms UTC): from its minute on the proposal of the boundary is earlier. */
  at: number
  /** How much earlier (min) – the setting „O ile wcześniej kończyć pracę w gorszy dzień” at the acceptance. */
  earlierMin: number
  /** The instant of its „Cofnij” (ms UTC); null – in force (the mark shows, the button does not). */
  undoneAt: number | null
  /** The blocks whose routine the acceptance switched to „na gorsze dni” (their lists before it stay in the raw file; none once undone). */
  routines: string[]
  /** The periods of the day's earlier acceptances, each taken back (`undoneAt`), in their order. */
  past: Array<{ at: number; earlierMin: number; undoneAt: number }>
  /**
   * The approval in force at the acceptance (T2533) – as the day counted then had it, also one approved by itself and not written yet
   * (`id` null): its boundary (ms) and kind; null – none. „Cofnij” puts it back while the acceptance's approval stands.
   */
  approvalBefore: { to: number; auto: boolean; id: string | null } | null
  /** The id of the approval the acceptance wrote to the log (it moved the approved boundary); null – none written. */
  approvalId: string | null
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const minutesFrom = (v: unknown): number | null => {
  const [lo, hi] = RANGES.worseDayEarlierMin
  return Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null
}

/** The boundary's floor is the minute of the acceptance rounded up to this step (the boundary stays on a grid of 5 min). */
export const WORSE_DAY_STEP_MIN = 5

/**
 * The floor (an index of the day's grid, from its 04:00 – a multiple of 5 min is one of the clock too): the acceptance's minute, rounded
 * up to a whole minute before (`acceptIdx` – `idxCeilOf`, never the minute before the click), rounded up to 5 min.
 */
export const worseFloorOf = (acceptIdx: number): number => Math.ceil(acceptIdx / WORSE_DAY_STEP_MIN) * WORSE_DAY_STEP_MIN

/**
 * A boundary (index) on a worse day (D587): earlier by `earlierMin`, never before the floor – „nie wcześniej niż teraz” – unless it
 * was before it already (then it stays). One rule for the engine's proposal and the window's approved boundary and its words.
 */
export const worseBoundary = (b: number, earlierMin: number, floor: number): number => Math.max(b - earlierMin, Math.min(b, floor))

/** The mark as a file holds it; null – none, or not one this version can read (the day then counts as without it). */
export function worseDayMarkFrom(v: unknown): WorseDayMark | null {
  if (!isPlain(v) || !finite(v.at)) return null
  const earlierMin = minutesFrom(v.earlierMin)
  if (earlierMin == null) return null
  const routines = isPlain(v.routines) ? Object.keys(v.routines) : []
  const past: WorseDayMark['past'] = []
  if (Array.isArray(v.past))
    for (const p of v.past) {
      const min = isPlain(p) ? minutesFrom(p.earlierMin) : null
      if (isPlain(p) && finite(p.at) && finite(p.undoneAt) && min != null) past.push({ at: p.at, earlierMin: min, undoneAt: p.undoneAt })
    }
  const b = v.approvalBefore
  const approvalBefore = isPlain(b) && finite(b.to) && typeof b.auto === 'boolean' ? { to: b.to, auto: b.auto, id: typeof b.id === 'string' && b.id ? b.id : null } : null
  const approvalId = typeof v.approvalId === 'string' && v.approvalId ? v.approvalId : null
  return { at: v.at, earlierMin, undoneAt: finite(v.undoneAt) ? v.undoneAt : null, routines, past, approvalBefore, approvalId }
}

/** The mark is in force: accepted and not taken back (the header shows the mark, the proposal does not come). */
export const worseDayActive = (m: WorseDayMark | null | undefined): boolean => !!m && m.undoneAt == null

/** The periods of a mark, in their order – what the engine counts the day with (`DayContext.worseDays`). */
export function worsePeriodsOf(m: WorseDayMark): WorsePeriod[] {
  return [...m.past.map((p) => ({ at: p.at, earlierMin: p.earlierMin, until: p.undoneAt })), { at: m.at, earlierMin: m.earlierMin, until: m.undoneAt }]
}
