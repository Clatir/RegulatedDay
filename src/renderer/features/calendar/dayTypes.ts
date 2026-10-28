/** The colours of day types in the calendar (D295) – from the palette the contrast test checks; the holidays' marks. */
import { marketDay } from '@shared/calendar/holidays'
import type { DayTypeId } from '@shared/model/settings'

export const DAY_TYPE_COLORS: Record<DayTypeId, string> = {
  zwykly: '#F2B66D',
  weekend: '#79AFAB',
  'zjazd-stacjonarny': '#D49A97',
  'zjazd-zdalny': '#B49FCC',
  regeneracyjny: '#A3C49A',
  wolne: '#8FB3D9'
}

/**
 * A day's holidays in the calendar (D295, spec „kalendarz świąt USA, Wielkiej Brytanii i Polski”): a holiday is a day
 * with a holiday's name (a market closed on a weekend is not one); an early close where no market of its country is
 * closed. `names` – for the day's hint.
 */
export function holidayMarks(d: string): { marks: string[]; names: string[] } {
  const marks: string[] = []
  const pl = marketDay('PL', d)
  if (pl.closed && pl.names.length) marks.push('święto')
  const us = [marketDay('NYSE', d), marketDay('CME_FX', d)]
  if (us.some((h) => h.closed && h.names.length)) marks.push('święto USA')
  else if (us.some((h) => h.earlyClose)) marks.push('skrócona sesja')
  const uk = marketDay('UK', d)
  if (uk.closed && uk.names.length) marks.push('święto UK')
  else if (uk.earlyClose) marks.push('skrócona sesja UK')
  return { marks, names: [...new Set([...pl.names, ...us.flatMap((h) => h.names), ...uk.names])] }
}
