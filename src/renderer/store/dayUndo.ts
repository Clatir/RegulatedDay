/**
 * One „Cofnij” of edits of days (D400, D406, D529): from the days' files as they are now, each day that still stands as its edit left it gets
 * the inverse edit (`editStands` / `inverseEdit`), a day changed since (here or on another computer) is left as it is, a day whose file cannot
 * be read now is listed (its „Cofnij” is still to be done). Used by the lines of „Tydzień” (`undoWeekPush`), of the free days (`undoFreeDays`)
 * and of the calendar (`undoDayEdits`) – one rule, read the files with `readDayFiles` (in portions).
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { editStands, inverseEdit } from '@shared/data/merge'

/** A day's edit as it was made: the entry and the file it created (null – the file was there). */
export interface DayEdit {
  date: string
  entry: EditEntry
  made: RawRecord | null
}

export interface TakenBack {
  /** The inverse edits, in the order of the days, with the day each belongs to. */
  back: Array<{ date: string; edit: EditEntry }>
  /** The days changed since: they stay as they are. */
  changed: string[]
  /** The days whose file is missing from `files` (cannot be read now). */
  unreadable: string[]
}

/** `files`: the days as `readDayFiles` gives them (a day missing from it cannot be read now – never „no file”, that is null). */
export function takeBackDays(days: readonly DayEdit[], files: Readonly<Record<string, RawRecord | null>>): TakenBack {
  const r: TakenBack = { back: [], changed: [], unreadable: [] }
  for (const d of days) {
    if (!(d.date in files)) {
      r.unreadable.push(d.date)
      continue
    }
    const now = files[d.date] ?? null
    const edit = editStands(d.entry, now, d.made) ? inverseEdit(d.entry, now, d.made) : null
    if (edit) r.back.push({ date: d.date, edit })
    else r.changed.push(d.date)
  }
  return r
}
