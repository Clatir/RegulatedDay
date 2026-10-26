/** The colours of day types in the calendar (D295) – from the palette the contrast test checks. */
import type { DayTypeId } from '@shared/model/settings'

export const DAY_TYPE_COLORS: Record<DayTypeId, string> = {
  zwykly: '#F2B66D',
  weekend: '#79AFAB',
  'zjazd-stacjonarny': '#D49A97',
  'zjazd-zdalny': '#B49FCC',
  regeneracyjny: '#A3C49A',
  wolne: '#8FB3D9'
}
