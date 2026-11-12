/**
 * „To wolne (urlop, wyjazd)” of an all-day event (D405): which of its days the bar offers „Wolne” for (from today, not
 * „Wolne” already, not closed – `freeDaysToAsk`), and „Tak” – the type „Wolne” for those days by the same rules as a change
 * of type anywhere else, as one write with one „Cofnij”. A day to come takes the type in its file as in „Kalendarz”
 * (`zjazdTypeRaw`); today before the day is made – as in „Dziś” before the day is made (`TypeChangeDialog`: the file's
 * type, the weekday's own one as none). Today once made is the change during the day (`planTypeChange` with its
 * proposals and its events in the log, without a „Cofnij”): it is not in this write – the answer names it (`duringDay`),
 * the window opens its own change of type for it.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { dayRaw, setDayField } from '@shared/data/dayEdits'
import { editStands, inverseEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { defaultDayType } from '@shared/engine/createDay'
import { plDateWithWeekday } from '@shared/format'
import { zjazdTypeRaw } from '@shared/import/zjazdDay'
import { ALL_DAY_MAX_DAYS, freeDaysToAsk, type AllDayEvent, type FreeDayInfo } from '@shared/model/allDay'
import { dayFileFrom } from '@shared/model/plan'
import { settingsOn } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'
import { editOf, isSaved, trySaveWith, useData } from '../../store/data'
import { countDay, dayTypeNow, dayUsable } from '../../store/day'
import { toast } from '../../store/ui'

/** A day for the proposal: its type now, closed, and – today – made already (its type changes during the day). */
export interface FreeDay extends FreeDayInfo {
  duringDay: boolean
}

/** Today as „Dziś” counts it now (null: it cannot be read now). */
async function todayDay(today: string): Promise<FreeDay | null> {
  try {
    const data = await window.rd.dayData(today)
    if (!dayUsable(data)) return null
    const { rd, templates, lectures, view } = useData.getState()
    const m = countDay(today, data, { changes: rd.settings, templates, lectures }, Date.now(), rd.general.modules.energy, view?.calibration === true)
    return { type: dayTypeNow(m), closed: m.state.facts.closed != null, duringDay: m.fromLog }
  } catch {
    return null
  }
}

/** A day to come: the type of its file, or its weekday's by the settings of its date. */
function comingDay(raw: RawRecord | null, date: string): FreeDay {
  const own = raw ? dayFileFrom(raw, date).dayType : null
  return { type: own ?? defaultDayType(date, settingsOn(useData.getState().rd.settings, date)), closed: false, duringDay: false }
}

/** The days from today among `dates` as they are now; a day that cannot be read now is not there. */
export async function freeDayInfos(dates: readonly string[], today: string): Promise<Record<string, FreeDay>> {
  const out: Record<string, FreeDay> = {}
  const coming = [...new Set(dates)].filter((d) => d > today)
  try {
    const files = coming.length ? await window.rd.dayFiles(coming) : {}
    for (const d of coming) if (d in files) out[d] = comingDay(files[d] ?? null, d)
  } catch {
    /* the days to come not known now: none of them is offered */
  }
  if (dates.includes(today)) {
    const t = await todayDay(today)
    if (t) out[today] = t
  }
  return out
}

/** The days to offer „Wolne” for after `e` was saved (none when it is not „To wolne”). */
export async function askFreeDays(e: AllDayEvent, today: string): Promise<string[]> {
  if (!e.free || e.endDate < today) return []
  const dates: string[] = []
  for (let d = e.startDate > today ? e.startDate : today; d <= e.endDate && dates.length < ALL_DAY_MAX_DAYS; d = addDays(d, 1)) dates.push(d)
  const info = await freeDayInfos(dates, today)
  return freeDaysToAsk(e, today, (d) => info[d] ?? null)
}

/** What „Tak” wrote: each day's one edit of its file and the file it created – for the one „Cofnij”. */
export interface FreeDaysChange {
  days: Array<{ date: string; entry: EditEntry; made: RawRecord | null }>
}

export interface FreeDaysResult {
  /** Every edit sent went through (written, or waiting for the folder). */
  saved: boolean
  /** The days written (null: none). */
  change: FreeDaysChange | null
  /** Today, made already: its change of type is the one during the day – not done here. */
  duringDay: string | null
}

const unreadableText = (dates: readonly string[]): string =>
  dates.length === 1 ? `Typ dnia ${plDateWithWeekday(dates[0]!)} się nie zmienił – plik tego dnia jest teraz nieczytelny.` : `Typ dni ${dates.map(plDateWithWeekday).join(', ')} się nie zmienił – ich pliki są teraz nieczytelne.`

/**
 * „Tak”: the type „Wolne” for `dates` (the days from today on; earlier ones are left), all in one write in its turn, each
 * day from its file as it is then. A day that cannot be read now is left with a word why; today once made is left for the
 * change during the day (`duringDay`).
 */
export async function setFreeDays(dates: readonly string[], today: string): Promise<FreeDaysResult> {
  const list = [...new Set(dates)].filter((d) => d >= today).sort()
  const sent: FreeDaysChange['days'] = []
  const unreadable: string[] = []
  let duringDay: string | null = null
  const out = await trySaveWith(async () => {
    const coming = list.filter((d) => d > today)
    const files = coming.length ? await window.rd.dayFiles(coming) : {}
    for (const d of list) {
      let raw: RawRecord | null
      let after: RawRecord
      if (d === today) {
        const t = await todayDay(today)
        if (!t) {
          unreadable.push(d)
          continue
        }
        if (t.duringDay) {
          duringDay = d
          continue
        }
        raw = (await window.rd.dayFiles([d]))[d] ?? null
        const weekdayType = defaultDayType(d, settingsOn(useData.getState().rd.settings, d))
        after = setDayField(dayRaw(raw, d), 'dayType', weekdayType === 'wolne' ? null : 'wolne')
      } else {
        if (!(d in files)) {
          unreadable.push(d)
          continue
        }
        raw = files[d] ?? null
        after = zjazdTypeRaw(dayRaw(raw, d), d, 'wolne')
      }
      const entry = editOf(paths.day(d), raw, after)
      if (entry) sent.push({ date: d, entry, made: entry.create ? after : null })
    }
    return sent.map((x) => x.entry)
  })
  if (unreadable.length) toast(unreadableText(unreadable), 'error', 8000)
  const days = out ? sent.filter((_, i) => out[i]?.status === 'applied' || out[i]?.status === 'waiting') : []
  return { saved: isSaved(out), change: days.length ? { days } : null, duringDay }
}

export interface FreeDaysUndone {
  saved: boolean
  /** The days given their type back. */
  undone: string[]
  /** The days changed since (also elsewhere): they stay as they are now. */
  changed: string[]
  /** The days whose file cannot be read now (their „Cofnij” is still to be done). */
  unreadable: string[]
}

/**
 * The one „Cofnij” of „Tak”: every day that still stands as it left it gets its file back (a file it created goes) in one
 * write; a day changed since stays as it is now, with a word.
 */
export async function undoFreeDays(change: FreeDaysChange): Promise<FreeDaysUndone> {
  const r: FreeDaysUndone = { saved: false, undone: [], changed: [], unreadable: [] }
  const back: string[] = []
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles(change.days.map((d) => d.date))
    const edits: EditEntry[] = []
    for (const d of change.days) {
      if (!(d.date in files)) {
        r.unreadable.push(d.date)
        continue
      }
      const now = files[d.date] ?? null
      const edit = editStands(d.entry, now, d.made) ? inverseEdit(d.entry, now, d.made) : null
      if (edit) {
        edits.push(edit)
        back.push(d.date)
      } else r.changed.push(d.date)
    }
    return edits
  })
  out?.forEach((o, i) => {
    if (o.status === 'applied' || o.status === 'waiting') r.undone.push(back[i]!)
  })
  r.saved = isSaved(out)
  if (!r.saved) return r
  if (r.changed.length) toast('Część dni zmieniła się od ustawienia „Wolne” – zostaje tak, jak jest teraz.', 'info', 6000)
  if (r.unreadable.length) toast(`Nie cofnięto typu: ${r.unreadable.map(plDateWithWeekday).join(', ')} – plik jest teraz nieczytelny. Spróbuj za chwilę.`, 'error', 6000)
  return r
}
