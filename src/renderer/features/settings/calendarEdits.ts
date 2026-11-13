/**
 * Saving a change of the calendars (D419): rd.json changed by a function of the record as it is in the turn of the save
 * (T517), as the edit of the fields that differ. An entry of a category left empty (`{}`) stays – it reads as the defaults
 * (T991). rd.json that cannot be read now is not written: nothing is sent and the toast says so (T994) – a record made from
 * nothing would be written over the one OneDrive has not delivered yet.
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { editOf, rawRecord, trySaveWith, type SendState } from '../../store/data'
import { toast } from '../../store/ui'

export const SETTINGS_UNREADABLE_TEXT = 'Ustawień nie da się teraz odczytać – zmiana nie została zapisana. Spróbuj za chwilę.'

/** rd.json changed by `fn`, in its turn; `entry` is what was sent (for „Cofnij”), null when nothing changed or nothing was sent. */
export async function saveCalendars(fn: (raw: RawRecord) => RawRecord, state?: SendState): Promise<{ out: EditOutcome[] | null; entry: EditEntry | null }> {
  let entry: EditEntry | null = null
  const out = await trySaveWith(() => {
    const before = rawRecord('rd.json')
    if (!before) {
      toast(SETTINGS_UNREADABLE_TEXT, 'error', 6000)
      return []
    }
    entry = editOf('rd.json', before, fn({ ...before }))
    return [entry]
  }, state)
  return { out, entry }
}
