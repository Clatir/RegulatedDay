/**
 * A sprawa put on the axis of a day from the window (D384): from the panel beside „Dziś” (a drop or „Zaplanuj”) and from
 * the page „Sprawy”. The block is counted once to say what it pushes apart (D367, as „Dodaj” in the panel of a block does),
 * `planCase` writes the day's file and the record in one edit with the pushed starts, and the answer is the toast „Cofnij”
 * (and the bar's „Przesunięto N bloków · Cofnij” when something was pushed). Without a DOM (tests in `tests/web`).
 */
import { paths } from '@shared/data/paths'
import { caseBlock } from '@shared/engine/cases'
import { logicalClock } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import type { RequestRecord } from '@shared/model/requests'
import { planCase, undoCase, type CaseResult } from '../../store/cases'
import { editOf } from '../../store/data'
import type { DayModel } from '../../store/day'
import { undoToast } from '../../store/ui'
import { addChange, pushedStarts } from '../today/dayPush'

/** What puts a sprawa on the axis: the block it would make (for the preview and the push) and the pushed blocks. */
export function planningOf(model: DayModel, today: string, r: RequestRecord, startMin: number) {
  const block = caseBlock(r, startMin, model.state.settings.categories)
  // D367: a day to come pushes the flexible blocks after the new one apart (a day gone is history).
  const change = addChange(model, block, model.date >= today)
  return { block, pushed: pushedStarts(model.ctx.plan, change) }
}

/** What the toast says after the sprawa was put on the axis. */
export const plannedText = (title: string, block: Pick<PlanBlock, 'startMin'>): string => (block.startMin != null ? `Zaplanowano „${title}” na ${logicalClock(block.startMin)}` : `Zaplanowano „${title}”`)

/**
 * The sprawa `r` on the axis of `model`'s day at `startMin`. `begun`: a block of the day shown that has run stays where it
 * ran; the day's file as the window knows it is the fallback for one not readable now. Returns whether it was saved.
 */
export async function planOnAxis(model: DayModel, today: string, r: RequestRecord, title: string, startMin: number): Promise<CaseResult & { block: PlanBlock | null }> {
  const { pushed } = planningOf(model, today, r, startMin)
  const res = await planCase(r.id, model.date, startMin, {
    begun: (date, block) => (date === model.date ? model.state.facts.blocks.get(block)?.startedAt != null : date <= today),
    pushed,
    seen: (date) => (date === model.date ? model.data.dayFile : undefined)
  })
  if (!res.saved || !res.block) return res
  if (pushed.length) {
    // The pushed blocks' bar line „Przesunięto N bloków · Cofnij” takes the day's edit back (the sprawa then reads as not
    // „zaplanowane” by itself – its block is gone, T752).
    const u = res.undo.find((x) => x.rel === paths.day(model.date))
    const entry = u ? editOf(u.rel, u.before, u.after) : null
    if (entry) await window.rd.planPushed(model.date, pushed.length, entry, entry.create ? u!.after : null).catch(() => undefined)
  }
  undoToast(plannedText(title, res.block), () => void undoCase(res.undo))
  return res
}
