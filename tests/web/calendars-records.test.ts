/**
 * Kalendarze nazwane jak wszystko w pytaniach kolejki, historii i kopii (spec „widok pokazuje nazwy pól i wartości tak jak w
 * interfejsie, nigdy klucze”): pole „kalendarz” kategorii i wydarzenia z nazwą kalendarza, wpisy listy `calendars`.
 */
import { describe, expect, it } from 'vitest'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { rdFrom } from '@shared/model/rd'

const n = { rd: rdFrom({ calendars: [{ id: 'praca', name: 'Praca', order: 1 }], categories: { analiza: { name: 'Analiza' } } }) }

describe('kalendarze w tekstach rekordów', () => {
  it('pola listy kalendarzy: nazwa kalendarza z ustawień, pole po polsku; sama lista – „kalendarze”', () => {
    expect(fieldText('rd.json', ['calendars'], n)).toBe('kalendarze')
    expect(fieldText('rd.json', ['calendars', '#praca'], n)).toBe('kalendarz Praca')
    expect(fieldText('rd.json', ['calendars', '#praca', 'name'], n)).toBe('kalendarz Praca: nazwa')
    expect(fieldText('rd.json', ['calendars', '#praca', 'color'], n)).toBe('kalendarz Praca: kolor')
    expect(fieldText('rd.json', ['calendars', '#praca', 'order'], n)).toBe('kalendarz Praca: kolejność')
    expect(fieldText('rd.json', ['calendars', '#moje', 'name'], n)).toBe('kalendarz Moje: nazwa')
    // Kalendarz, którego już nie ma: bez nazwy, nigdy samo id.
    expect(fieldText('rd.json', ['calendars', '#zniknal', 'name'], n)).toBe('kalendarz: nazwa')
  })

  it('kalendarz kategorii: „kategoria <nazwa>: kalendarz”, wartość nazwą kalendarza (nie id)', () => {
    expect(fieldText('rd.json', ['categories', 'analiza', 'calendar'], n)).toBe('kategoria Analiza: kalendarz')
    expect(valueText('calendar', 'praca', n)).toBe('Praca')
    expect(valueText('calendar', 'moje', n)).toBe('Moje')
    expect(valueText('calendar', 'zniknal', n)).toBe('kalendarz usunięty')
    expect(valueText('calendar', undefined, n)).toBe('—')
  })

  it('kalendarz wydarzenia całodniowego: pole „kalendarz”, wartość nazwą; brak (null) – „—”', () => {
    expect(fieldText('allday/k1.json', ['calendarId'], n)).toBe('kalendarz')
    expect(valueText('calendarId', 'praca', n)).toBe('Praca')
    expect(valueText('calendarId', null, n)).toBe('—')
  })
})
