import { describe, expect, it } from 'vitest'
import { endOf, forecastEndText, lengthTo, nextDayNote, parseEnd } from '@shared/blockEnd'

const end = (text: string, start: number) => {
  const r = parseEnd(text, start)
  return r.ok ? r.value : `!${r.message}`
}
const h = (hours: number, min = 0) => hours * 60 + min

describe('godzina końca bloku (D464)', () => {
  it('koniec = początek + długość; długość z końca: początek zostaje', () => {
    expect(endOf(h(9), 90)).toBe(h(10, 30))
    expect(lengthTo(h(9), h(10, 30))).toBe(90)
    expect(end('10:30', h(9))).toBe(h(10, 30))
  })

  it('koniec nie później niż początek to następna doba: 22:00 → 9:00 = 11 h, nie 0', () => {
    expect(lengthTo(h(22), h(9))).toBe(h(11))
    expect(end('9:00', h(22))).toBe(h(22) + h(11))
    // Równy początkowi – pełna doba.
    expect(lengthTo(h(10), h(10))).toBe(1440)
    expect(end('10:00', h(10))).toBe(h(10) + 1440)
  })

  it('noc po dacie (0:00–3:59) to „+1” jak w każdym polu godziny; jawne „+1” też', () => {
    expect(end('1:00', h(22))).toBe(h(25))
    expect(end('1:00 +1', h(22))).toBe(h(25))
    expect(end('22:00 +1', h(22))).toBe(h(22) + 1440)
    expect(end('23:00 +1', h(22))).toBe('!Najdłużej 24 h.')
  })

  it('krótszy niż 5 min albo dłuższy niż doba: odrzucony z komunikatem', () => {
    expect(end('9:03', h(9))).toBe('!Blok trwa najkrócej 5 min.')
    expect(end('9:05', h(9))).toBe(h(9, 5))
    expect(end('9:x', h(9))).toMatch(/^!Nie rozumiem/)
  })

  it('dopisek „+1 dzień”, gdy koniec wypada po północy dnia początku', () => {
    expect(nextDayNote(h(22), h(25))).toBe('+1 dzień')
    expect(nextDayNote(h(23), 1440)).toBe('+1 dzień')
    expect(nextDayNote(h(9), h(10))).toBeNull()
    // Początek już po północy (01:00 +1): koniec tej samej nocy bez dopisku.
    expect(nextDayNote(h(25), h(26))).toBeNull()
  })

  it('blok „po bloku”: koniec to „ok. HH:MM” z prognozy; bez prognozy – nic', () => {
    expect(forecastEndText(h(14, 30))).toBe('ok. 14:30')
    expect(forecastEndText(h(25))).toBe('ok. 01:00 +1')
    expect(forecastEndText(null)).toBeNull()
  })
})
