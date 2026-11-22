// @vitest-environment jsdom
/**
 * Pola Ustawień w Ctrl K i w polu „Szukaj w ustawieniach” (UX14): spis pól po etykietach (jeden dla obu), każde pole w
 * sekcji ze spisu, „rezerwa” znajduje pole „Rezerwa energii” i energię na poziomie rezerwy, wynik prowadzi do pola
 * (`openPick` z identyfikatorem pola).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { NUMBER_FIELDS, TOGGLE_FIELDS } from '@shared/model/fields'
import { rdFrom } from '@shared/model/rd'
import { buildIndex, searchIndex } from '@shared/search'
import { SETTING_SECTIONS, searchRecords } from '@renderer/features/search/records'
import { choose } from '@renderer/features/search/paletteLogic'
import { SETTING_FIELDS, needsDataFolder, settingRecords } from '@renderer/features/settings/settingsIndex'
import { sectionOf } from '@renderer/features/settings/settingsLayout'
import { useUi } from '@renderer/store/ui'

const records = settingRecords()
const hits = (q: string) => searchIndex(buildIndex(records), q, '2026-11-21').flatMap((g) => g.hits.map((h) => h.record))

describe('spis pól Ustawień', () => {
  it('identyfikatory są jednoznaczne, a każde pole leży w sekcji ze spisu', () => {
    expect(new Set(SETTING_FIELDS.map((f) => f.id)).size).toBe(SETTING_FIELDS.length)
    for (const f of SETTING_FIELDS) {
      expect(f.id.startsWith('field-')).toBe(true)
      expect(sectionOf(f.section), f.id).toBeDefined()
    }
  })

  it('każde pole liczbowe i przełącznik z datą (poza tabelą typów dni) ma wpis o swojej etykiecie w swojej sekcji', () => {
    for (const f of [...NUMBER_FIELDS.filter((x) => x.group !== 'dayTypes'), ...TOGGLE_FIELDS]) {
      const e = SETTING_FIELDS.find((x) => x.id === `field-${f.key}`)
      expect(e?.title, f.key).toBe(f.label)
      expect(e?.section).toBe(`settings-${f.group}`)
    }
  })

  it('pola paska, kopii i wersji są w swoich sekcjach', () => {
    const where = (id: string) => SETTING_FIELDS.find((f) => f.id === id)?.section
    expect(where('field-bar-place')).toBe('settings-bar')
    expect(where('field-backup-extra')).toBe('settings-data')
    expect(where('field-data-folder')).toBe('settings-data')
    expect(where('field-version')).toBe('settings-info')
    expect(where('field-zoom')).toBe('settings-machine')
  })
})

describe('szukanie po etykietach', () => {
  it('„rezerwa” znajduje pole „Rezerwa energii” (tytuł) i powiadomienie o poziomie rezerwy', () => {
    const found = hits('rezerwa')
    expect(found[0]).toMatchObject({ kind: 'setting', id: 'field-reserve', title: 'Rezerwa energii' })
    expect(found.map((r) => r.id)).toContain('field-notices')
    expect(found.find((r) => r.id === 'field-reserve')?.hint).toBe('w ustawieniach · Energia')
  })

  it('„przypomnienia” znajduje sekcję przypomnień i przełącznik ich powiadomienia Windows (UX13, D565 P21)', () => {
    const found = hits('przypomnienia').map((r) => r.id)
    expect(found).toContain('settings-reminders')
    expect(found).toContain('field-notices')
    expect(hits('rytual').map((r) => r.id)).toContain('field-notices')
  })

  it('bez ogonków i po początku słowa: „tolerancja” → pole w „Trafność planu”, „folder” → folder danych', () => {
    expect(hits('toleran')[0]).toMatchObject({ id: 'field-accuracyTolerancePct', hint: 'w ustawieniach · Trafność planu' })
    expect(hits('folder').map((r) => r.id)).toContain('field-data-folder')
    expect(hits('kopie').map((r) => r.id)).toEqual(expect.arrayContaining(['settings-data', 'field-backups', 'field-backup-extra']))
  })

  it('sekcje też: „pasek” znajduje sekcję „Pasek pulpitu”', () => {
    expect(hits('pasek').map((r) => r.id)).toContain('settings-bar')
  })
})

describe('Ctrl K zna pola', () => {
  beforeEach(() => useUi.setState({ page: 'today', pick: null }))

  it('searchRecords zawiera sekcje i pola; SETTING_SECTIONS to dokładnie sekcje ze spisu', () => {
    const rd = rdFrom(undefined)
    const all = searchRecords({ today: '2026-11-21', rd, templates: [], requests: [], routines: [], series: [], blocks: [], pageLabel: {} as never, pageKeys: () => null })
    const ids = all.filter((r) => r.kind === 'setting').map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['settings-energy', 'field-reserve', 'field-bar-place']))
    expect(SETTING_SECTIONS.every((s) => ids.includes(s.id))).toBe(true)
  })

  it('Enter na polu otwiera Ustawienia z wyborem tego pola', () => {
    choose({ kind: 'setting', id: 'field-reserve', title: 'Rezerwa energii' }, '2026-11-21')
    expect(useUi.getState().page).toBe('settings')
    expect(useUi.getState().pick).toEqual({ kind: 'setting', id: 'field-reserve' })
  })
})

describe('needsDataFolder', () => {
  it('sekcja i pole z folderem danych – tak; pole sekcji bez folderu, id, którego nie ma – nie', () => {
    expect(needsDataFolder('settings-categories')).toBe(true)
    expect(needsDataFolder('field-reserve')).toBe(true)
    expect(needsDataFolder('field-backups')).toBe(true)
    expect(needsDataFolder('settings-bar')).toBe(false)
    expect(needsDataFolder('settings-data')).toBe(false)
    expect(needsDataFolder('field-nie-ma')).toBe(false)
    expect(needsDataFolder('settings-nie-ma')).toBe(false)
  })
})
