/**
 * The cost of a block changed in the window of its tile (D501) – one path for „Dziś”, „3 dni” and „Tydzień”. A block of a series not begun
 * asks its scope with the question and the code of the panel's fields (`changeScope`) – once a window: the scope picked by its first change
 * is used by the next ones until it closes (`CostAsk`); a begun one is changed alone, from now on, without a question (the series stays).
 * Then, in the turn of the window's saves, the day as it is at that moment decides (never what the view knew when the window opened):
 * - a block not begun – its own cost (null: the category's again) in the day's file, over the block as the file holds it then
 *   (`patchedBlock`; a block of the template never written to the file is put in with it);
 * - a block begun and not ended – `block.cost` in the day's log (the window's events, `logEvents`): the engine counts the new cost from
 *   that minute to the block's end, the minutes gone by stay counted by the old one (the start's costs never change);
 * - a block ended, a day gone by, a block whose time passed by the clock, one taken off (parked, cancelled) or gone from the plan –
 *   refused, the toast says why (`costEditable`).
 * „To i następne” and „Cała seria” change the series (its blocks to come and today's occurrence, not begun). The day is read once a check,
 * without counting it (`plannedDay`: its plan, the facts of its log and its file).
 */
import { dayRaw } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { blockInfos } from '@shared/engine/blocks'
import { COST_DAY_GONE_TEXT, COST_ENDED_TEXT, COST_PASSED_TEXT, COST_TAKEN_OFF_TEXT, costEditable, windowPassed } from '@shared/engine/costChange'
import { routineCostsIn } from '@shared/engine/day'
import { idxOf } from '@shared/engine/grid'
import type { SeriesScope } from '@shared/api'
import type { Costs } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import type { RawRecord } from '@shared/api'
import { editOf, logEvents, saveAnswer, trySaveWith, useData, type SaveAnswer, type SendState } from '../../store/data'
import { plannedDay, type PlannedDay } from '../../store/day'
import { toast } from '../../store/ui'
import { MOVE_GONE_TEXT } from '../../store/weekPush'
import { changeInSeries, changeScope } from '../series/seriesScope'
import { patchedBlock } from '../today/dayActions'
import { moveUncountedText, moveUnreadableText } from '../week/weekMove'
import { blockName, type Names } from './blockView'

/** Why the cost of a block is not changed any more – said after „Nie zapisano: ” (one text with the bar's „Koszt ▸”, `costChange.ts`). */
export { COST_DAY_GONE_TEXT, COST_ENDED_TEXT, COST_PASSED_TEXT, COST_TAKEN_OFF_TEXT }

/** The block whose cost changes: its day, its id, and what names it (the question of a series says its name). */
export interface CostTarget {
  date: string
  blockId: string
  names: Names
  /** The view says it is a block of a series (`origin`): the day is read before the question, so the question knows the block as it is. */
  ofSeries: boolean
}

/** What one open window of a tile remembers (D501): the scope of its series picked by its first change (null – not asked yet). */
export interface CostAsk {
  scope: SeriesScope | null
}

/** The block as its day is now: in the plan (null – begun outside it), begun or not, and the day's file the edit is made on. */
interface Now {
  block: PlanBlock | null
  begun: boolean
  file: RawRecord | null
}

/** A block of today not begun whose time passed by the clock (`windowPassed` – as the forecast drops it). */
function passedNow(day: PlannedDay, id: string, at: number): boolean {
  const g = day.facts.grid
  const infos = blockInfos(g, day.ctx.plan, day.facts, day.ctx.snapshot.settings, routineCostsIn(day.ctx))
  const byId = new Map(infos.map((b) => [b.id, b]))
  const b = byId.get(id)
  return b != null && windowPassed(b, byId, idxOf(g, at))
}

/** The day read now and what it says of the block; a string – why its cost may not be changed. */
async function blockNowOf(date: string, id: string, at = Date.now()): Promise<Now | string> {
  const today = logicalDayOf(at)
  if (date < today) return COST_DAY_GONE_TEXT
  const day = await plannedDay(date, at)
  if (day === 'file') return moveUnreadableText(date)
  if (day === 'log') return moveUncountedText(date)
  const block = day.ctx.plan.find((b) => b.id === id) ?? null
  const f = day.facts.blocks.get(id)
  const begun = f?.startedAt != null
  if (!begun && !block) return MOVE_GONE_TEXT
  const passed = !begun && date === today && passedNow(day, id, at)
  if (!costEditable(f, false, passed)) return begun ? COST_ENDED_TEXT : passed ? COST_PASSED_TEXT : COST_TAKEN_OFF_TEXT
  return { block, begun, file: day.file }
}

/** In the turn: a begun block – the event; one not begun – its own cost in the plan. */
async function writeCost(t: CostTarget, costs: Costs | null, at: number | undefined): Promise<SaveAnswer> {
  const state: SendState = { afterSend: false }
  let logged: boolean | null = null
  const out = await trySaveWith(async () => {
    const now = await blockNowOf(t.date, t.blockId, at)
    if (typeof now === 'string') throw new Error(now)
    if (now.begun) {
      // D501: from this minute to the block's end – the main process stamps the instant (its clock, as every event of the window).
      logged = await logEvents([{ k: 'block.cost', day: t.date, block: t.blockId, costs }])
      return []
    }
    return [editOf(paths.day(t.date), now.file, patchedBlock(dayRaw(now.file, t.date), t.date, now.block!, { costs }))]
  }, state)
  return logged ?? saveAnswer(out, state)
}

/**
 * `ask` – the window's memory of the scope (one object for as long as the window is open); `at` – the instant the day is judged at
 * (tests); left out – the clock at each read (the question may take its time).
 */
export async function saveTileCosts(t: CostTarget, costs: Costs | null, o: { ask?: CostAsk; at?: number } = {}): Promise<SaveAnswer> {
  if (t.ofSeries) {
    const seen = await blockNowOf(t.date, t.blockId, o.at)
    if (typeof seen === 'string') {
      toast(`Nie zapisano: ${seen}`, 'error', 8000)
      return false
    }
    // A begun block of a series changes alone, from now on (no question, the series as it was).
    if (seen.block && !seen.begun) {
      const patch = { costs }
      const scope = await changeScope({ series: useData.getState().series, block: seen.block, date: t.date, today: logicalDayOf(o.at ?? Date.now()), name: blockName(seen.block, t.names), patch, picked: o.ask?.scope ?? null })
      if (!scope) return false
      if (o.ask) o.ask.scope = scope
      if (scope !== 'only') return changeInSeries(t.date, t.blockId, scope, patch)
    }
  }
  return writeCost(t, costs, o.at)
}
