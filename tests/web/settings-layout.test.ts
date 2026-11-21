/**
 * Ustawienia jako jedna strona ze spisem (UX14, E1, E2, E6, D565 P22): sześć grup w kolejności z odpowiedzi, każda sekcja
 * w jednej grupie, znacznik „od razu” tylko przy sekcjach bez daty, pasek „od jutra” nad ciągiem sekcji z datą, kopie
 * zapasowe w jednym miejscu (w „Dane i kopie”), tolerancja trafności we własnej sekcji.
 */
import { describe, expect, it } from 'vitest'
import { FIELD_GROUP_NAMES, NUMBER_FIELDS, fieldByKey } from '@shared/model/fields'
import { SETTINGS_GROUPS, datedRange, fieldGroupWhen, settingsItems, sectionOf } from '@renderer/features/settings/settingsLayout'

const ids = SETTINGS_GROUPS.flatMap((g) => g.sections.map((s) => s.id))

describe('grupy Ustawień (P22)', () => {
  it('sześć grup w kolejności z odpowiedzi D565', () => {
    expect(SETTINGS_GROUPS.map((g) => g.title)).toEqual(['Dzień i energia', 'Kategorie i kalendarze', 'Sprawy i szablony', 'Pasek i powiadomienia', 'Dane i kopie', 'O aplikacji'])
  })

  it('każda sekcja jest w dokładnie jednej grupie', () => {
    expect(new Set(ids).size).toBe(ids.length)
    for (const want of ['settings-modules', 'settings-daytypes', 'settings-accuracy', 'settings-categories', 'settings-calendars', 'settings-cases', 'settings-bar', 'settings-notices', 'settings-machine', 'settings-data', 'settings-computers', 'settings-updates', 'settings-info']) {
      expect(ids).toContain(want)
    }
    expect(ids).not.toContain('settings-sessions')
  })

  it('kopie zapasowe i folder danych w „Dane i kopie”, wersja i logi w „O aplikacji”', () => {
    const group = (id: string) => SETTINGS_GROUPS.find((g) => g.sections.some((s) => s.id === id))!.title
    expect(group('settings-data')).toBe('Dane i kopie')
    expect(group('settings-computers')).toBe('Dane i kopie')
    expect(group('settings-info')).toBe('O aplikacji')
    expect(group('settings-updates')).toBe('O aplikacji')
  })

  it('tytuły sekcji z grup pól są nazwami grup pól', () => {
    for (const g of ['sleep', 'boundary', 'plan', 'energy', 'reminders', 'timer', 'care', 'cases', 'accuracy'] as const) {
      expect(sectionOf(`settings-${g}`)?.title).toBe(FIELD_GROUP_NAMES[g])
    }
  })
})

describe('E6: tolerancja trafności we własnej sekcji', () => {
  it('pole „Tolerancja trafności” nie jest już w „Pytaniach w ciągu dnia”', () => {
    expect(fieldByKey('accuracyTolerancePct')?.group).toBe('accuracy')
    expect(NUMBER_FIELDS.filter((f) => f.group === 'timer').map((f) => f.key)).not.toContain('accuracyTolerancePct')
    expect(FIELD_GROUP_NAMES.accuracy).toBe('Trafność planu')
  })
})

describe('E2: co ma datę, co działa od razu', () => {
  it('grupa pól: tylko pola z datą → dated, tylko wspólne bez daty → now', () => {
    expect(fieldGroupWhen('energy')).toBe('dated')
    expect(fieldGroupWhen('timer')).toBe('dated')
    expect(fieldGroupWhen('reminders')).toBe('dated')
    expect(fieldGroupWhen('plan')).toBe('now')
    expect(fieldGroupWhen('care')).toBe('now')
    expect(fieldGroupWhen('cases')).toBe('now')
  })

  it('`when` sekcji z grup pól zgadza się z polami, a moduły, kalendarze i ten komputer działają od razu', () => {
    for (const g of ['sleep', 'boundary', 'plan', 'energy', 'reminders', 'timer', 'care', 'cases', 'accuracy'] as const) {
      expect(sectionOf(`settings-${g}`)?.when).toBe(fieldGroupWhen(g))
    }
    for (const id of ['settings-modules', 'settings-calendars', 'settings-bar', 'settings-notices', 'settings-machine']) expect(sectionOf(id)?.when).toBe('now')
    expect(sectionOf('settings-daytypes')?.when).toBe('dated')
    expect(sectionOf('settings-categories')?.when).toBe('mixed')
    expect(sectionOf('settings-calibration')?.when).toBe('review')
  })

  it('pasek „od jutra” obejmuje ciąg od pierwszej do ostatniej sekcji z datą (z grupami między nimi)', () => {
    const items = settingsItems(true)
    const range = datedRange(items)!
    const first = items[range[0]]!
    const last = items[range[1]]!
    expect(first).toMatchObject({ type: 'section', section: { id: 'settings-daytypes' } })
    expect(last).toMatchObject({ type: 'section', section: { id: 'settings-categories' } })
    // Przed paskiem tylko „Moduły” (i nagłówek grupy), po nim nic z datą.
    expect(items.slice(0, range[0]).flatMap((i) => (i.type === 'section' ? [i.section.id] : []))).toEqual(['settings-modules'])
    expect(items.slice(range[1] + 1).some((i) => i.type === 'section' && (i.section.when === 'dated' || i.section.when === 'mixed'))).toBe(false)
  })

  it('bez otwartego folderu: bez sekcji, które go potrzebują, i bez pustych grup; paska z datą nie ma', () => {
    const items = settingsItems(false)
    const shown = items.flatMap((i) => (i.type === 'section' ? [i.section.id] : []))
    expect(shown).toEqual(['settings-bar', 'settings-notices', 'settings-machine', 'settings-data', 'settings-updates', 'settings-info', 'settings-shortcuts'])
    expect(items.filter((i) => i.type === 'group').map((i) => (i.type === 'group' ? i.group.title : ''))).toEqual(['Pasek i powiadomienia', 'Dane i kopie', 'O aplikacji'])
    expect(datedRange(items)).toBeNull()
  })
})
