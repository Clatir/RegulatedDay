/**
 * Saving a change of the calendars (D419): rd.json changed by a function of the record as it is in the turn of the save
 * (T517), as the edits of the fields that differ – and, when a category's entry held only its calendar and is empty now, the
 * removal of that entry as a second edit that goes only after the first (`EditEntry.after`, T923): the first one is a change of
 * the one field (a colour changed meanwhile elsewhere is no conflict), the second leaves no empty entry behind (T971).
 * „Cofnij” turns the entries over, last first.
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { editStands, inverseEdit } from '@shared/data/merge'
import { dropCategoriesRaw, emptiedCategoriesRaw } from '@shared/model/calendars'
import { editOf, rawRecord, trySaveWith, type SendState } from '../../store/data'

/** The entries that turn `before` into `after` (none: no change). */
export function calendarEntries(before: RawRecord | null, after: RawRecord): EditEntry[] {
  const first = editOf('rd.json', before, after)
  if (!first) return []
  const emptied = before ? emptiedCategoriesRaw(before, after) : []
  if (!emptied.length) return [first]
  const second = editOf('rd.json', after, dropCategoriesRaw(after, emptied))
  return second ? [first, { ...second, after: [0] }] : [first]
}

/** rd.json changed by `fn`, in its turn; `entries` are what was sent (for „Cofnij”), empty when nothing changed. */
export async function saveCalendars(fn: (raw: RawRecord) => RawRecord, state?: SendState): Promise<{ out: EditOutcome[] | null; entries: EditEntry[] }> {
  let entries: EditEntry[] = []
  const out = await trySaveWith(() => {
    const before = rawRecord('rd.json')
    entries = calendarEntries(before, fn(before ? { ...before } : { schema: 1 }))
    return entries
  }, state)
  return { out, entries }
}

/** What „Cofnij” sends for `entries` made earlier: null – rd.json changed since in a field they set (nothing is sent). */
export function undoEntries(entries: readonly EditEntry[], now: RawRecord | null): EditEntry[] | null {
  if (!now || !entries.every((e) => editStands(e, now, null))) return null
  const back = [...entries].reverse().map((e) => inverseEdit(e, now, null))
  if (back.some((e) => !e)) return null
  // The entries that went after another go after it again (in the reverse order the first is last).
  return (back as EditEntry[]).map((e, i) => (i === 0 ? e : { ...e, after: [i - 1] }))
}
