/**
 * The bottom edge of a running block on the axis of „Dziś” (D365): what the window shows while it is dragged, and the end
 * the click `resize` of the timer then writes (`timerAction`). Only a running block of its own hour (`ownHourBlock`) – not
 * a paused one, a session, a lecture, a class of a „zjazd” nor the second shift (they keep „Przedłuż” on the bar). Its end
 * goes on the 5-min grid, never before now rounded up to 5 min nor under 5 min of the block; later is „Przedłuż” (up to
 * the boundary at once, past it its cost and „Potwierdź”), earlier moves its planned end back. Pure: the window counts it
 * on its day; the day's warnings after the change are counted with the change laid over the day (as after a change of
 * „Długość” – nothing is blocked, D72).
 */
import { costText } from '../costText'
import { DRAG_STEP_MIN, MIN_BLOCK_MIN } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import { MINUTE } from '../time/zone'
import { ownHourBlock } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import { atOf, idxOfLogical } from './grid'
import { simEvents } from './sim'
import { timerAction, timerNow, type ActionCost, type TimerBlock } from './timer'

/** The bottom edge of a running block that can be dragged now (logical minutes). */
export interface RunningEdge {
  block: string
  /** The earliest end allowed now: now rounded up to 5 min, at least 5 min after the block's start. */
  earliestEnd: number
  /** Its planned end now (where its edge stands unless it ran past it – then the axis shows it up to now). */
  plannedEnd: number
}

/** What dragging the edge of a running block to an end does (logical minutes; `minutes` against its planned end now). */
export interface ResizePreview {
  block: string
  /** The end it gets: on the 5-min grid, not before `earliestEnd`, not after the day's end. */
  end: number
  /** The instant of that end (ms) – `to` of the click `resize`. */
  to: number
  earliestEnd: number
  plannedEnd: number
  /** > 0 – an extension („Przedłuż” by as much), < 0 – shorter, 0 – nothing changes. */
  minutes: number
  /** The cost of the extension past the boundary, as „Przedłuż” has it; null – none: the change is written at once. */
  cost: ActionCost | null
  /** That cost in the bar's words („Przedłuż +60: przedłużenie · −45 min puli”); null without a cost. */
  costText: string | null
  /** Why nothing would change (e.g. a fixed block 30 min past its planned end); null – it can. */
  refused: string | null
  /** The day's warnings the change brings (those not there now) – only words, nothing is blocked (D72). */
  warnings: string[]
}

const lmOf = (state: DayState, idx: number) => logicalMinuteOf(state.grid.date, atOf(state.grid, idx))

/** The running blocks of the timer now (foreground and background) – a paused one has no edge. */
function running(state: DayState): TimerBlock[] {
  const t = timerNow(state)
  return [t.fg, ...t.bg].filter((x): x is TimerBlock => x != null && ownHourBlock(x.info))
}

/** The earliest end (index): now rounded up to the 5-min grid, at least 5 min after its start (index 0 is 04:00 – a whole hour). */
function earliestIdx(state: DayState, tb: TimerBlock, at: number): number {
  const now = (at - state.grid.start) / MINUTE
  return Math.ceil(Math.max(now, tb.startedAt + MIN_BLOCK_MIN) / DRAG_STEP_MIN) * DRAG_STEP_MIN
}

/** The bottom edges of the running blocks that can be dragged at `at` (ms), by the block's id. */
export function runningEdges(state: DayState, at: number): Map<string, RunningEdge> {
  const out = new Map<string, RunningEdge>()
  for (const tb of running(state)) out.set(tb.info.id, { block: tb.info.id, earliestEnd: lmOf(state, earliestIdx(state, tb, at)), plannedEnd: lmOf(state, tb.plannedEnd) })
  return out
}

/**
 * The edge of the running block `id` dragged to the logical minute `endLm` at `at` (ms): null – it has no edge. Its cost
 * and refusal are those of the click itself (`timerAction` with `resize`, never written); its warnings – one count of the
 * day with the change (call it when the end on the grid changes, not on every move).
 */
export function resizePreview(ctx: DayContext, state: DayState, id: string, endLm: number, at: number): ResizePreview | null {
  const tb = running(state).find((x) => x.info.id === id)
  if (!tb) return null
  const g = state.grid
  const earliest = earliestIdx(state, tb, at)
  const snapped = Math.round(endLm / DRAG_STEP_MIN) * DRAG_STEP_MIN
  const end = Math.min(Math.max(earliest, idxOfLogical(g, snapped)), Math.max(g.length, tb.plannedEnd))
  const to = atOf(g, end)
  const minutes = end - tb.plannedEnd
  const r = timerAction(ctx, state, { a: 'resize', block: id, to }, at)
  const cost = r.ok ? null : r.confirm
  const refused = r.ok || cost ? null : r.why
  let events = r.ok ? r.events : []
  if (cost) {
    const confirmed = timerAction(ctx, state, { a: 'resize', block: id, to, confirm: true }, at)
    events = confirmed.ok ? confirmed.events : []
  }
  let warnings: string[] = []
  if (events.length) {
    const after = computeDay({ ...ctx, now: Math.max(ctx.now, at), events: [...ctx.events, ...simEvents(ctx, events, at)] })
    warnings = after.warnings.filter((w) => !state.warnings.includes(w))
  }
  return {
    block: id,
    end: lmOf(state, end),
    to,
    earliestEnd: lmOf(state, earliest),
    plannedEnd: lmOf(state, tb.plannedEnd),
    minutes,
    cost,
    costText: cost ? costText(`Przedłuż +${minutes}`, cost) : null,
    refused,
    warnings
  }
}
