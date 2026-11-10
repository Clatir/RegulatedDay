/**
 * What „Tydzień” writes (D366): a block added to a day of the week from the small window of a new block.
 */
import { plDate } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { weekday } from '@shared/time/zone'
import { isSaved } from '../../store/data'
import { toast } from '../../store/ui'
import { putDayBlock } from '../today/dayActions'
import { WEEKDAY_FULL } from './weekText'

/**
 * `b` put into the plan of `date` – the day's own file as it is now (made when the day has none yet, as „Dodaj” in „Dziś”
 * does for another day). A day whose file cannot be read now is not written over: its edit would go on a file never seen –
 * the toast names the day (D371: several days are added one after another, the others stay saved).
 * True when saved (written or waiting for the folder).
 */
export async function addWeekBlock(date: string, b: PlanBlock): Promise<boolean> {
  const files = await window.rd.dayFiles([date])
  if (!(date in files)) {
    toast(`Plik dnia ${WEEKDAY_FULL[weekday(date) - 1]} ${plDate(date)} jest teraz nieczytelny – bloku w tym dniu nie dodano, spróbuj za chwilę.`, 'error', 6000)
    return false
  }
  return isSaved(await putDayBlock(date, files[date] ?? null, b))
}
