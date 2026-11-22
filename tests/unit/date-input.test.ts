/** Dates typed into the window of days (D544, D565 P24): DD.MM.RRRR, the same typing as every date field – dots, dashes, slashes, eight digits, „3.01”. */
import { describe, expect, it } from 'vitest'
import { daysFromTo, dmy, parseDmy, typedDmy } from '@shared/dateInput'

const TODAY = '2026-11-21'

describe('DD.MM.RRRR w oknie dni', () => {
  it('z kropkami, myślnikami, ukośnikami i jednocyfrowe', () => {
    expect(parseDmy('19.11.2026', TODAY)).toBe('2026-11-19')
    expect(parseDmy('19-11-2026', TODAY)).toBe('2026-11-19')
    expect(parseDmy('3/1/2027', TODAY)).toBe('2027-01-03')
    expect(parseDmy(' 03-01-2027 ', TODAY)).toBe('2027-01-03')
  })

  it('„3.01” – najbliższa taka data od dziś, jak w każdym polu daty', () => {
    expect(parseDmy('3.01', TODAY)).toBe('2027-01-03')
    expect(parseDmy('25.11', TODAY)).toBe('2026-11-25')
    expect(parseDmy('3-01', TODAY)).toBe('2027-01-03')
    expect(parseDmy('21.11', TODAY)).toBe('2026-11-21')
  })

  it('osiem cyfr bez znaków rozdzielenia', () => {
    expect(parseDmy('19112026', TODAY)).toBe('2026-11-19')
    expect(typedDmy('19112026')).toBe('19.11.2026')
    expect(typedDmy('1911202')).toBe('1911202')
    expect(typedDmy('19.11.2026')).toBe('19.11.2026')
  })

  it('tylko prawdziwe daty', () => {
    expect(parseDmy('31-11-2026', TODAY)).toBeNull()
    expect(parseDmy('31.02', TODAY)).toBeNull()
    expect(parseDmy('29022027', TODAY)).toBeNull()
    expect(parseDmy('29022028', TODAY)).toBe('2028-02-29')
    expect(typedDmy('31112026')).toBe('31112026')
    expect(parseDmy('', TODAY)).toBeNull()
    expect(parseDmy('jutro', TODAY)).toBeNull()
  })

  it('zapis i zakres dni', () => {
    expect(dmy('2026-11-19')).toBe('19.11.2026')
    expect(daysFromTo('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    expect(daysFromTo('2026-12-02', '2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    // Zmiana czasu (25.10.2026) nie gubi ani nie dubluje dnia.
    expect(daysFromTo('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})
