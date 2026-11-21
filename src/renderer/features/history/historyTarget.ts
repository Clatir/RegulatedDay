/**
 * Whose history „Historia” in the panel of a block opens (UX18, E7): a day's block – the plan of that day; a block of a template – the
 * template; the block of a series – the series. A panel that knows none (a block not placed anywhere) has no button.
 */
import { paths } from '@shared/data/paths'
import type { BlockPlace } from '@shared/model/attachment'

/** The file of the record a block's panel shows the history of (`place` first, else the day of the panel); null – none. */
export function blockHistoryRel(place: BlockPlace | undefined, day: string | undefined): string | null {
  if (place?.scope === 'day') return paths.day(place.date)
  if (place?.scope === 'template') return paths.record('template', place.templateId)
  if (place?.scope === 'series') return paths.record('series', place.root)
  return day ? paths.day(day) : null
}
