/**
 * Whose history „Historia” in the panel of a block opens (UX18, E7): a day's block – the plan of that day. A template's block – none
 * here (the editor of the template has its own „Historia”); a series' – the screen says it with `historyOf` (the part of the series
 * edited: a series split in two has a file for each, and the root is only the first one's id). A panel that knows none has no button.
 */
import { paths } from '@shared/data/paths'
import type { BlockPlace } from '@shared/model/attachment'

/** The file of the record a block's panel shows the history of (`place` first, else the day of the panel); null – none. */
export function blockHistoryRel(place: BlockPlace | undefined, day: string | undefined): string | null {
  if (place?.scope === 'day') return paths.day(place.date)
  if (place) return null
  return day ? paths.day(day) : null
}
