/** Dates typed as DD-MM-RRRR and as eight digits (D544). */
import { describe, expect, it } from 'vitest'
import { daysFromTo, dmy, parseDmy, typedDmy } from '@shared/dateInput'

describe('DD-MM-RRRR', () => {
  it('z myślnikami, kropkami, ukośnikami i jednocyfrowe', () => {
    expect(parseDmy('19-11-2026')).toBe('2026-11-19')
    expect(parseDmy('19.11.2026')).toBe('2026-11-19')
    expect(parseDmy('3/1/2027')).toBe('2027-01-03')
    expect(parseDmy(' 03-01-2027 ')).toBe('2027-01-03')
  })

  it('osiem cyfr bez znaków rozdzielenia', () => {
    expect(parseDmy('19112026')).toBe('2026-11-19')
    expect(typedDmy('19112026')).toBe('19-11-2026')
    expect(typedDmy('1911202')).toBe('1911202')
    expect(typedDmy('19-11-2026')).toBe('19-11-2026')
  })

  it('tylko prawdziwe daty', () => {
    expect(parseDmy('31-11-2026')).toBeNull()
    expect(parseDmy('29022027')).toBeNull()
    expect(parseDmy('29022028')).toBe('2028-02-29')
    expect(typedDmy('31112026')).toBe('31112026')
    expect(parseDmy('2026-11-19')).toBeNull()
    expect(parseDmy('')).toBeNull()
  })

  it('zapis i zakres dni', () => {
    expect(dmy('2026-11-19')).toBe('19-11-2026')
    expect(daysFromTo('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    expect(daysFromTo('2026-12-02', '2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    // Zmiana czasu (25.10.2026) nie gubi ani nie dubluje dnia.
    expect(daysFromTo('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})
