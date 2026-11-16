/**
 * „Cofnij” of the calendar's line after a change of the type of days (D529): each day's edit taken back – its fields (the type, and what
 * a type that is no „zjazd” took away with it) to their values before – only while the day still stands as the change left it (the one rule
 * of the lines of „Tydzień” and of the free days, `takeBackDays`); a day changed since, here or on another computer, stays as it is and is said.
 */
import { keptText } from '@shared/groupText'
import { isSaved, readDayFiles, trySaveWith } from '../../store/data'
import { takeBackDays, type DayEdit } from '../../store/dayUndo'

/**
 * The days back as before the change. The words about the days that stayed (none – nothing to say). Throws when the write did not go
 * through or a day cannot be read now (nothing is written then) – the line stays for another try.
 */
export async function undoDayEdits(days: readonly DayEdit[]): Promise<string | void> {
  let kept = 0
  let unreadable = false
  const out = await trySaveWith(async () => {
    const t = takeBackDays(days, await readDayFiles(days.map((d) => d.date)))
    kept = t.changed.length
    unreadable = t.unreadable.length > 0
    // A day the folder cannot be read for now is not „changed since”: nothing is written and the line waits.
    return unreadable ? [] : t.back.map((x) => x.edit)
  })
  if (unreadable || !isSaved(out)) throw new Error('not saved')
  return kept ? keptText(kept, 'day') : undefined
}
