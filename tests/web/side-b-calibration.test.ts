/**
 * „Strona B tygodnia” as a table and the review of the calibration in the window (D322, spec „Plan poranny”,
 * „Kalibracja”): the rows with neutral arrows and „brak pomiaru”, the proposals in words, a template's new version and
 * the change of costs they make.
 */
import { describe, expect, it } from 'vitest'
import type { WeekTotals } from '@shared/engine/sideB'
import { planBlock, type Template } from '@shared/model/plan'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { costPatch, templateWithTimes } from '@renderer/features/calibration/apply'
import { costLine, costTitle, feltLine, timeLines, timeTitle } from '@renderer/features/calibration/calibrationText'
import { sideBRows } from '@renderer/features/today/sideBRows'

const week = (p: Partial<WeekTotals> = {}): WeekTotals => ({
  days: 7,
  disconnects: 3,
  signals: { value: 4, missing: 0 },
  boundaries: { kept: 5, of: 6 },
  projectsMin: { value: 300, missing: 0 },
  asProjectMin: { value: 60, missing: 0 },
  bedtimeShiftMin: 30,
  afterWorkUseMin: 95,
  projectsAfterBedMin: { value: 0, missing: 0 },
  usedAfterBed: { days: 2, latestMin: 45 },
  regenMin: 600,
  requestsByPerson: { mama: 70, '?': 15 },
  requestsMissing: 0,
  ...p
})
const rd = { people: [{ id: 'mama', name: 'Mama', archived: false }], categories: { analiza: { name: 'Analiza', color: null, archived: false }, regeneracja: { name: 'Regeneracja', color: null, archived: false } } }

describe('„Strona B tygodnia” jako tabela', () => {
  it('ten i poprzedni tydzień z neutralną strzałką; bez oceny – bez strzałki', () => {
    const rows = sideBRows(week(), week({ disconnects: 1, boundaries: { kept: 3, of: 6 }, projectsMin: { value: 300, missing: 0 }, afterWorkUseMin: 10 }), rd)
    const row = (label: string) => rows.find((r) => r.label === label)!
    expect(row('„Odcinam się”')).toEqual({ label: '„Odcinam się”', now: '3', before: '1', arrow: '↑' })
    expect(row('Dotrzymane granice')).toMatchObject({ now: '5 z 6', before: '3 z 6', arrow: '↑' })
    expect(row('Projekty')).toMatchObject({ now: '5 h', arrow: '→' })
    expect(row('Komputer po końcu pracy poza blokami')).toMatchObject({ now: '1 h 35 min', before: '10 min', arrow: '' })
    expect(row('Komputer po porze snu').now).toBe('2 dni · najpóźniej 45 min po porze snu')
    expect(row('Prośby według osób').now).toBe('Mama 1 h 10 min · osoba: ? 15 min')
  })

  it('miara z dni z wyłączonym modułem: „brak pomiaru” zamiast zera; bez poprzedniego tygodnia – kreska, bez strzałki', () => {
    const rows = sideBRows(week({ signals: { value: 0, missing: 7 }, projectsMin: { value: 120, missing: 2 }, requestsMissing: 3 }), null, rd)
    expect(rows.find((r) => r.label === 'Sygnały przeciążenia')).toMatchObject({ now: 'brak pomiaru', before: '—', arrow: '' })
    expect(rows.find((r) => r.label === 'Projekty')!.now).toBe('2 h · brak pomiaru: 2 dni')
    expect(rows.find((r) => r.label === 'Prośby według osób')!.now).toBe('Mama 1 h 10 min · osoba: ? 15 min · brak pomiaru: 3 dni')
  })

  it('tydzień bez żadnego zmierzonego dnia: wszędzie „brak pomiaru”, żadnych zer ani strzałek (z przeglądu)', () => {
    const empty = week({ days: 0, disconnects: 0, signals: { value: 0, missing: 0 }, boundaries: { kept: 0, of: 0 }, projectsMin: { value: 0, missing: 0 }, requestsByPerson: {}, requestsMissing: 0 })
    const rows = sideBRows(empty, week(), rd)
    expect(rows.every((r) => r.now === 'brak pomiaru')).toBe(true)
    expect(rows.every((r) => r.arrow === '')).toBe(true)
    expect(rows.find((r) => r.label === '„Odcinam się”')!.before).toBe('3')
  })
})

describe('przegląd kalibracji w oknie', () => {
  const template: Template = {
    id: 't1',
    name: 'Dzień zwykły',
    dayType: 'zwykly',
    weekdays: [],
    archived: false,
    versions: [{ from: '2026-09-01', blocks: [planBlock({ id: 'a', categoryId: 'analiza', startMin: 600, durationMin: 60 }), planBlock({ id: 'b', categoryId: 'inne', startMin: 720, durationMin: 30 })], budgetMin: null, maxMin: null }]
  }

  it('propozycja czasu słowami; szablon dostaje wersję od dnia przeglądu z nową długością, starsza zostaje', () => {
    const p = { category: 'analiza', samples: 8, multiplier: 1.25, blocks: [{ template: 't1', block: 'a', fromMin: 60, toMin: 75 }] }
    expect(timeTitle(p, rd)).toBe('Analiza: realny czas to ×1,25 planowanego (8 bloków)')
    expect(timeLines(p, [template])).toEqual(['Dzień zwykły: 1 h → 1 h 15 min'])
    const next = templateWithTimes(template, [{ block: 'a', fromMin: 60, toMin: 75 }], '2026-11-02')
    expect(next.versions.map((v) => v.from)).toEqual(['2026-09-01', '2026-11-02'])
    expect(next.versions[1]!.blocks.map((b) => [b.id, b.durationMin])).toEqual([
      ['a', 75],
      ['b', 30]
    ])
    expect(next.versions[0]!.blocks[0]!.durationMin).toBe(60)
  })

  it('wersja szablonu od jutra (zrobiona rano) też dostaje nową długość, chyba że blok zmieniono ręcznie (z przeglądu)', () => {
    const later: Template = {
      ...template,
      versions: [
        ...template.versions,
        { from: '2026-11-03', blocks: [planBlock({ id: 'a', categoryId: 'analiza', startMin: 600, durationMin: 60 }), planBlock({ id: 'b', categoryId: 'inne', startMin: 720, durationMin: 45 })], budgetMin: null, maxMin: null }
      ]
    }
    const next = templateWithTimes(later, [{ block: 'a', fromMin: 60, toMin: 75 }, { block: 'b', fromMin: 30, toMin: 40 }], '2026-11-02')
    expect(next.versions.map((v) => v.from)).toEqual(['2026-09-01', '2026-11-02', '2026-11-03'])
    // Tomorrow's version: „a” untouched – the new length; „b” changed by hand to 45 – it keeps it.
    expect(next.versions[2]!.blocks.map((b) => [b.id, b.durationMin])).toEqual([
      ['a', 75],
      ['b', 45]
    ])
  })

  it('propozycja wariantu, którego już nie ma, nie zapisuje się na całą kategorię (z przeglądu)', () => {
    const p = { category: 'regeneracja', variant: 'nie-ma', days: 6, hours: 9, from: { head: 0, emotions: 0, senses: 0 }, to: { head: 1, emotions: 0, senses: 0 } }
    expect(costPatch(DEFAULT_SETTINGS, p)).toBeNull()
    expect(costPatch(DEFAULT_SETTINGS, { ...p, category: 'nie-ma', variant: null })).toBeNull()
    expect(feltLine({ regeneracja: { lighter: 1, usual: 0, heavier: 0 } }, 'regeneracja', true)).toBe('odczuwany w rytuale (cała kategoria): lżej 1 · jak zwykle 0 · ciężej 0')
  })

  it('propozycja kosztu: zmiana kategorii albo jej wariantu (lista w całości), odczuwany koszt obok', () => {
    const p = { category: 'analiza', variant: null, days: 6, hours: 9, from: { head: 2, emotions: 1, senses: 0 }, to: { head: 3, emotions: 1, senses: 1 } }
    expect(costTitle(p, rd, DEFAULT_SETTINGS)).toBe('Analiza: koszt na godzinę (6 dni, 9 h)')
    expect(costLine(p)).toBe('głowa 2 → 3 · emocje 1 · bodźce 0 → 1')
    expect(costPatch(DEFAULT_SETTINGS, p)).toEqual({ categories: { analiza: { costs: { head: 3, emotions: 1, senses: 1 } } } })
    const regen = DEFAULT_SETTINGS.categories.regeneracja!
    const variant = regen.variants[0]!
    const vp = { ...p, category: 'regeneracja', variant: variant.id }
    const patch = costPatch(DEFAULT_SETTINGS, vp) as { categories: { regeneracja: { variants: Array<{ id: string; costs?: unknown }> } } }
    expect(patch.categories.regeneracja.variants).toHaveLength(regen.variants.length)
    expect(patch.categories.regeneracja.variants.find((v) => v.id === variant.id)!.costs).toEqual(vp.to)
    expect(feltLine({ analiza: { lighter: 1, usual: 4, heavier: 2 } }, 'analiza')).toBe('odczuwany w rytuale: lżej 1 · jak zwykle 4 · ciężej 2')
    expect(feltLine({}, 'analiza')).toBeNull()
  })
})
