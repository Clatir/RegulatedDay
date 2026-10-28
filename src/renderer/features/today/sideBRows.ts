/**
 * „Strona B tygodnia” as a table (D322, spec „Plan poranny”): the measure „czy to pomaga” of the week that ended beside
 * the week before, with a neutral arrow; then, without a judgement, the use of the computer after work and after the
 * bedtime; the regeneration and the requests by person. A measure of days with its module off says „brak pomiaru”, never
 * zero. Pure – the window's tests check it without a DOM.
 */
import type { Sum, WeekTotals } from '@shared/engine/sideB'
import { countLabel, durationLabel } from '@shared/format'
import { personName, type RdFile } from '@shared/model/rd'

export interface SideBRow {
  label: string
  now: string
  before: string
  /** ↑ ↓ → against the week before (neutral – never a colour), '' – nothing to compare or a row without a judgement. */
  arrow: '↑' | '↓' | '→' | ''
}

const NONE = 'brak pomiaru'

/** A sum over the week: „brak pomiaru” when no day had it (also a week without any measured day), the days without it beside the value. */
function sumText(s: Sum, days: number, fmt: (v: number) => string): string {
  if (days === 0 || s.missing >= days) return NONE
  return s.missing > 0 ? `${fmt(s.value)} · ${NONE}: ${countLabel(s.missing, 'dzień', 'dni', 'dni')}` : fmt(s.value)
}

const sumValue = (s: Sum, days: number): number | null => (days === 0 || s.missing >= days ? null : s.value)

function arrowOf(now: number | null, before: number | null): SideBRow['arrow'] {
  if (now == null || before == null) return ''
  return now > before ? '↑' : now < before ? '↓' : '→'
}

const minutes = (v: number) => (v > 0 ? durationLabel(v) : '0 min')

export function sideBRows(now: WeekTotals, before: WeekTotals | null, rd: Pick<RdFile, 'people'>): SideBRow[] {
  const rows: SideBRow[] = []
  // A week without a single measured day (no presence, the app started on its Monday) measures nothing: never zeros.
  const ofWeek = (t: WeekTotals, text: string) => (t.days === 0 ? NONE : text)
  const compared = (label: string, n: string, b: string | null, nv: number | null, bv: number | null) =>
    rows.push({ label, now: ofWeek(now, n), before: before ? ofWeek(before, b ?? '—') : '—', arrow: now.days && before?.days ? arrowOf(nv, bv) : '' })
  const plain = (label: string, n: string, b: string | null) => rows.push({ label, now: ofWeek(now, n), before: before ? ofWeek(before, b ?? '—') : '—', arrow: '' })
  compared('„Odcinam się”', String(now.disconnects), before && String(before.disconnects), now.disconnects, before?.disconnects ?? null)
  compared('Sygnały przeciążenia', sumText(now.signals, now.days, String), before && sumText(before.signals, before.days, String), sumValue(now.signals, now.days), before && sumValue(before.signals, before.days))
  const share = (t: WeekTotals) => (t.boundaries.of ? t.boundaries.kept / t.boundaries.of : null)
  compared('Dotrzymane granice', `${now.boundaries.kept} z ${now.boundaries.of}`, before && `${before.boundaries.kept} z ${before.boundaries.of}`, share(now), before && share(before))
  compared('Projekty', sumText(now.projectsMin, now.days, minutes), before && sumText(before.projectsMin, before.days, minutes), sumValue(now.projectsMin, now.days), before && sumValue(before.projectsMin, before.days))
  compared('Nauka i journaling jak projekt', sumText(now.asProjectMin, now.days, minutes), before && sumText(before.asProjectMin, before.days, minutes), sumValue(now.asProjectMin, now.days), before && sumValue(before.asProjectMin, before.days))
  compared('Przesunięcia pory snu', minutes(now.bedtimeShiftMin), before && minutes(before.bedtimeShiftMin), now.bedtimeShiftMin, before?.bedtimeShiftMin ?? null)
  // Without a judgement (spec „Bez oceny pokazuje też”).
  plain('Komputer po końcu pracy poza blokami', minutes(now.afterWorkUseMin), before && minutes(before.afterWorkUseMin))
  plain('Projekty po porze snu', sumText(now.projectsAfterBedMin, now.days, minutes), before && sumText(before.projectsAfterBedMin, before.days, minutes))
  const afterBed = (t: WeekTotals) => (t.usedAfterBed.days ? `${countLabel(t.usedAfterBed.days, 'dzień', 'dni', 'dni')} · najpóźniej ${minutes(t.usedAfterBed.latestMin ?? 0)} po porze snu` : 'ani razu')
  plain('Komputer po porze snu', afterBed(now), before && afterBed(before))
  plain('Regeneracja', minutes(now.regenMin), before && minutes(before.regenMin))
  const people = (t: WeekTotals) => {
    if (t.requestsMissing >= t.days) return NONE
    const list = Object.entries(t.requestsByPerson).sort((a, b) => b[1] - a[1])
    const text = list.length ? list.map(([p, m]) => `${personName(rd, p === '?' ? null : p)} ${minutes(m)}`).join(' · ') : 'żadnych'
    // Days with the requests module off are said, as with every other measure.
    return t.requestsMissing > 0 ? `${text} · ${NONE}: ${countLabel(t.requestsMissing, 'dzień', 'dni', 'dni')}` : text
  }
  plain('Prośby według osób', people(now), before && people(before))
  return rows
}
