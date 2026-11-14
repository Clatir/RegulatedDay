/**
 * The cost of a block of a day of „3 dni” or „Tydzień” changed in the window of its tile (D501): the block's own cost – or null, the
 * category's again – written to the day as the field of the block's panel is, in its turn, over the block as the day's plan has it now
 * (a block of the template that was never written to the file is put in with it). The scope of a series is not asked here: the change is
 * this day's alone („Tylko to” of the panel). Says whether it was saved (`SaveAnswer`, as the panel's fields).
 */
import { dayRaw, putBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { Costs } from '@shared/model/categories'
import { editOf, saveAnswer, trySaveWith, type SaveAnswer, type SendState } from '../../store/data'
import { countedDay } from '../../store/day'
import { MOVE_GONE_TEXT } from '../../store/weekPush'
import { blockNow } from '../today/dayActions'
import { moveUncountedText, moveUnreadableText } from './weekMove'

export async function saveWeekCosts(date: string, blockId: string, costs: Costs | null, at = Date.now()): Promise<SaveAnswer> {
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([date])
    if (!(date in files)) throw new Error(moveUnreadableText(date))
    const file = files[date] ?? null
    const day = await countedDay(date, file, at)
    if (!day) throw new Error(moveUncountedText(date))
    const was = day.ctx.plan.find((b) => b.id === blockId)
    if (!was) throw new Error(MOVE_GONE_TEXT)
    const after = putBlock(dayRaw(file, date), { ...blockNow(dayRaw(file, date), date, was), costs })
    return [editOf(paths.day(date), file, after)]
  }, state)
  return saveAnswer(out, state)
}
