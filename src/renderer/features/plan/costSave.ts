/**
 * The cost of a block changed in the window of its tile (D501) – one path for „Dziś”, „3 dni” and „Tydzień”. A block of a series asks its
 * scope first, with the question and the code of the panel's fields (`seriesFirst`). Then, in the turn of the window's saves, the day as it
 * is at that moment decides (never what the view knew when the window opened):
 * - a block not begun – its own cost (null: the category's again) in the day's file, over the block as the file holds it then
 *   (`patchedBlock`; a block of the template never written to the file is put in with it);
 * - a block begun and not ended – `energy.cost` in the day's log (the window's events, `logEvents`): the engine counts the new cost from that
 *   minute to the block's end, the minutes gone by stay counted by the old one (the start's costs never change);
 * - a block ended, a day gone by, a block taken off (parked, cancelled) or gone from the plan – refused, the toast says why (`costEditable`).
 * „To i następne” and „Cała seria” change the series (its blocks to come; today's occurrence while it has not begun); a begun occurrence
 * costs so from now on too. The day is read without counting it (`plannedDay`: its plan and the facts of its log).
 */
import { dayRaw } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { costEditable } from '@shared/engine/costChange'
import type { Costs } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import type { RawRecord } from '@shared/api'
import { editOf, logEvents, saveAnswer, trySaveWith, useData, type SaveAnswer, type SendState } from '../../store/data'
import { plannedDay } from '../../store/day'
import { toast } from '../../store/ui'
import { MOVE_GONE_TEXT } from '../../store/weekPush'
import { seriesFirst } from '../series/seriesScope'
import { patchedBlock } from '../today/dayActions'
import { moveUncountedText, moveUnreadableText } from '../week/weekMove'
import { blockName, type Names } from './blockView'

/** Why the cost of a block is not changed any more – said after „Nie zapisano: ”. */
export const COST_DAY_GONE_TEXT = 'ten dzień już minął'
export const COST_ENDED_TEXT = 'ten blok już się skończył'
export const COST_TAKEN_OFF_TEXT = 'ten blok jest zaparkowany albo odwołany'

/** The block whose cost changes: its day, its id, and what names it (the question of a series says its name). */
export interface CostTarget {
  date: string
  blockId: string
  names: Names
  /** The view says it is a block of a series (`origin`): the day is read before the question, so the question knows the block as it is. */
  ofSeries: boolean
}

/** The block as its day is now: in the plan (null – begun outside it), begun or not, and the day's file the edit is made on. */
interface Now {
  block: PlanBlock | null
  begun: boolean
  file: RawRecord | null
}

/** The day read now and what it says of the block; a string – why its cost may not be changed. */
async function blockNowOf(date: string, id: string, at = Date.now()): Promise<Now | string> {
  if (date < logicalDayOf(at)) return COST_DAY_GONE_TEXT
  const files = await window.rd.dayFiles([date])
  if (!(date in files)) return moveUnreadableText(date)
  const file = files[date] ?? null
  const day = await plannedDay(date, file, at)
  if (!day) return moveUncountedText(date)
  const block = day.ctx.plan.find((b) => b.id === id) ?? null
  const f = day.facts.blocks.get(id)
  const begun = f?.startedAt != null
  if (!begun && !block) return MOVE_GONE_TEXT
  if (!costEditable(f, false, false)) return begun ? COST_ENDED_TEXT : COST_TAKEN_OFF_TEXT
  return { block, begun, file }
}

/**
 * In the turn: a begun block – the event; one not begun – its own cost in the plan (`plan` false: the series already wrote it – nothing).
 * `plan` false never refuses aloud (the series' change is what was asked).
 */
async function writeCost(t: CostTarget, costs: Costs | null, at: number | undefined, plan: boolean): Promise<SaveAnswer> {
  const state: SendState = { afterSend: false }
  let logged: boolean | null = null
  const out = await trySaveWith(async () => {
    const now = await blockNowOf(t.date, t.blockId, at)
    if (typeof now === 'string') {
      if (!plan) return []
      throw new Error(now)
    }
    if (now.begun) {
      // D501: from this minute to the block's end – the main process stamps the instant (its clock, as every event of the window).
      logged = await logEvents([{ k: 'energy.cost', day: t.date, block: t.blockId, costs }])
      return []
    }
    if (!plan) return []
    return [editOf(paths.day(t.date), now.file, patchedBlock(dayRaw(now.file, t.date), t.date, now.block!, { costs }))]
  }, state)
  if (logged != null) return logged
  return plan ? saveAnswer(out, state) : out != null
}

/** `at` – the instant the day is judged at (tests); left out – the clock at each read (the question may take its time). */
export async function saveTileCosts(t: CostTarget, costs: Costs | null, at?: number): Promise<SaveAnswer> {
  if (t.ofSeries) {
    const seen = await blockNowOf(t.date, t.blockId, at)
    if (typeof seen === 'string') {
      toast(`Nie zapisano: ${seen}`, 'error', 8000)
      return false
    }
    if (seen.block) {
      const first = await seriesFirst({ series: useData.getState().series, block: seen.block, date: t.date, today: logicalDayOf(at ?? Date.now()), name: blockName(seen.block, t.names), patch: { costs } })
      if (first !== 'only') {
        if (first === false) return false
        // The series changed; an occurrence that has begun keeps its plan – it costs so from now on (its event).
        const now = await writeCost(t, costs, at, false)
        return now === false ? false : first
      }
    }
  }
  return writeCost(t, costs, at, true)
}
