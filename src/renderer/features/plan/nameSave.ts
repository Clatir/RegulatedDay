/**
 * The name of a day's block changed in place on a tile of „Tydzień” or „3 dni” (N9, D430): the field `name` of the block in the day's file (`null` – no
 * name of its own, the block is named as before), over the block as the file holds it in its turn (`patchedBlock`) – the path of the panel's „Nazwa” in
 * „Dziś” (`patchDayBlock`), only this day: a block of a series asks no scope (a name changed in one day changes that day alone). A name is the file's
 * data: a block the day's file holds is renamed without reading the day's log (an unreadable log does not stop it, as in „Dziś”). Only a block the file
 * does not hold yet (one of the template or of a series, never written to the file), or a day the first read left out (it could not be read then), needs the
 * day's plan, read in the same turn (`plannedDay`) – it is put into the file with its name, the edit made over the file that read gives (`day.file`, as
 * `costSave` does), never over the first one; a block gone from the plan is refused with the toast.
 */
import { dayRaw } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { dayFileFrom } from '@shared/model/plan'
import { editOf, readDayFiles, saveAnswer, trySaveWith, type SaveAnswer, type SendState } from '../../store/data'
import { plannedDay } from '../../store/day'
import { MOVE_GONE_TEXT } from '../../store/weekPush'
import { moveUncountedText, moveUnreadableText } from '../week/weekMove'
import { patchedBlock } from '../today/dayActions'

export async function renameDayBlock(date: string, blockId: string, name: string | null): Promise<SaveAnswer> {
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    // A day the read left out cannot be read now – never taken for a day without a file.
    const files = await readDayFiles([date])
    if (date in files) {
      const before = files[date] ?? null
      const raw = dayRaw(before, date)
      const own = dayFileFrom(raw, date).blocks.find((b) => b.id === blockId)
      if (own) return [editOf(paths.day(date), before, patchedBlock(raw, date, own, { name }))]
    }
    const day = await plannedDay(date)
    if (day === 'file') throw new Error(moveUnreadableText(date))
    if (day === 'log') throw new Error(moveUncountedText(date))
    const block = day.ctx.plan.find((b) => b.id === blockId)
    if (!block) throw new Error(MOVE_GONE_TEXT)
    return [editOf(paths.day(date), day.file, patchedBlock(dayRaw(day.file, date), date, block, { name }))]
  }, state)
  return saveAnswer(out, state)
}
