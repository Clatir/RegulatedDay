/**
 * „Ostatnio usunięte” in „Historia” (N24): the words of the list – each removed thing by its name as the rest of the window
 * names it (a block as its day's plan, a sprawa by its title or its person, a series by its block), never an id; the line under
 * it (the block's day and hours, when it was removed) and why „Przywróć” is off (a frozen day, a block that stood after one
 * gone from the plan).
 */
import type { RemovedItem } from '@shared/api'
import { blockName, type Names } from '@shared/blockName'
import { logicalClock, plDate, plDateTime } from '@shared/format'
import { allDayFrom } from '@shared/model/allDay'
import { planBlockFrom, templateFrom } from '@shared/model/plan'
import { personName, type RdFile } from '@shared/model/rd'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import { seriesFrom } from '@shared/model/series'
import { settingsOn } from '@shared/model/settings'
import { SERIES_MARK } from '@shared/seriesText'
import { seriesBlockOf } from '../series/seriesForm'

/** The groups of the list, in this order, by their names in the interface. */
export const REMOVED_KIND_NAMES: Record<RemovedItem['kind'], string> = { block: 'Bloki', request: 'Sprawy', routine: 'Rutyny', template: 'Szablony', series: 'Serie', allDay: 'Wydarzenia' }
export const REMOVED_KIND_ORDER = Object.keys(REMOVED_KIND_NAMES) as Array<RemovedItem['kind']>

export const FROZEN_TEXT = 'Dzień zamrożony – nie można zmienić'
export const ANCHOR_GONE_TEXT = 'Ten blok stał zaraz po innym, którego nie ma już w planie tego dnia – przywróć albo przenieś z powrotem najpierw tamten'
export const ATTACHMENTS_UNKNOWN_TEXT = 'Nie udało się teraz odczytać załączników – spróbuj za chwilę'
export const REMOVED_EMPTY_TEXT = 'Nic nie zostało usunięte w ostatnich 30 dniach.'
export const REMOVED_PARTIAL_TEXT = 'Części danych nie da się teraz odczytać – lista może być niepełna.'
export const REMOVED_ABOUT_TEXT =
  'Usunięte w ostatnich 30 dniach: bloki, sprawy, rutyny, szablony, serie i wydarzenia. „Przywróć” odkłada je na dawne miejsce – blok na te same godziny swojego dnia, bez przesuwania innych.'

/** What the names come from: the window's data now (the settings of the block's day name its category). */
export interface RemovedNames {
  rd: RdFile
  routines: readonly Routine[]
  requests: readonly RequestRecord[]
  today: string
}

/** The name a removed thing has in the interface (from the record as it was, never an id). */
export function removedName(item: RemovedItem, n: RemovedNames): string {
  const v = item.value
  const names = (date: string): Names => ({ rd: n.rd, settings: settingsOn(n.rd.settings, date), routines: n.routines, requests: n.requests })
  switch (item.kind) {
    case 'block': {
      const b = planBlockFrom(v)
      return b ? blockName(b, names(item.date ?? n.today)) : 'Blok'
    }
    case 'request': {
      const q = requestFrom(v)
      if (!q) return 'Sprawa'
      return q.kind === 'task' ? `Zadanie: ${q.title}` : `Prośba: ${personName(n.rd, q.person)}${q.note ? ` – ${q.note}` : ''}`
    }
    case 'routine':
      return routineFrom(v)?.name || 'Rutyna'
    case 'template':
      return templateFrom(v)?.name || 'Szablon'
    case 'allDay':
      return allDayFrom(v)?.title || 'Wydarzenie'
    case 'series': {
      const s = seriesFrom(v)
      return s && s.versions.length ? `${SERIES_MARK} ${blockName(seriesBlockOf(s, n.today), names(n.today))}` : 'Seria'
    }
  }
}

/** The line under the name: a block's day and hours, then when it was removed („usunięto 23.11.2026 10:05”). */
export function removedLine(item: RemovedItem): string {
  const parts: string[] = []
  if (item.kind === 'block' && item.date) {
    // Where it would start put back (`startMin` – also one that starts after another), else its own hour.
    const b = planBlockFrom(item.value)
    const start = item.startMin ?? b?.startMin ?? null
    parts.push(b && start != null ? `${plDate(item.date)} · ${logicalClock(start)}–${logicalClock(start + b.durationMin)}` : plDate(item.date))
  }
  parts.push(`usunięto ${plDateTime(item.removedAt)}`)
  return parts.join(' · ')
}

/** Why „Przywróć” is off for this one; null – it is on. */
export function restoreOff(item: RemovedItem): string | null {
  if (item.attachmentsUnknown) return ATTACHMENTS_UNKNOWN_TEXT
  if (item.kind !== 'block') return null
  if (item.frozen) return FROZEN_TEXT
  if (item.anchorGone) return ANCHOR_GONE_TEXT
  return null
}
