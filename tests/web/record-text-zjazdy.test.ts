/**
 * The fields of the import of „zjazdy” in the questions of the queue and the history (D357, spec „widok pokazuje nazwy
 * pól i wartości tak jak w interfejsie, nigdy klucze”): a block's own name („Ekonomia · ćwiczenia”), the record of the
 * import in a day's file.
 */
import { describe, expect, it } from 'vitest'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { rdFrom } from '@shared/model/rd'

const n = { rd: rdFrom({}), blockName: (id: string) => (id === 'k1' ? 'Ekonomia · ćwiczenia' : null) }
const day = 'days/2030/2030-10-12.json'

describe('pola importu zjazdów w pytaniach i historii', () => {
  it('nazwa bloku: pole „nazwa”, wartość – sama nazwa', () => {
    expect(fieldText(day, ['blocks', '#k1', 'name'], n)).toBe('Ekonomia · ćwiczenia: nazwa')
    expect(valueText('name', 'Ekonomia · ćwiczenia', n)).toBe('Ekonomia · ćwiczenia')
  })

  it('blok zajęć jako całość: jego nazwa, nie kategoria', () => {
    expect(valueText(undefined, { id: 'k1', categoryId: 'dojazd', variantId: 'zajecia', startMin: 585, durationMin: 90, name: 'Ekonomia · ćwiczenia' }, n)).toBe('Ekonomia · ćwiczenia 09:45, 1 h 30 min')
  })

  it('zapis importu w pliku dnia: „import zjazdów”', () => {
    expect(fieldText(day, ['classImport'], n)).toBe('import zjazdów')
    expect(fieldText(day, ['classImport', 'changed', 'x', 'after'], n)).toBe('import zjazdów')
  })
})
