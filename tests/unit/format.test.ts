import { describe, expect, it } from 'vitest'
import {
  NBSP,
  clock,
  countLabel,
  durationLabel,
  formatNumber,
  logicalClock,
  ofLabel,
  parseDate,
  parseDuration,
  parseInteger,
  parseLogicalTime,
  plDate,
  plural
} from '@shared/format'

const value = <T>(r: { ok: true; value: T } | { ok: false; message: string }): T | string => (r.ok ? r.value : `!${r.message}`)

describe('formaty polskie (Wygląd i nazwy)', () => {
  it('data „21.10.2026”, czas 24-godzinny', () => {
    expect(plDate('2026-10-21')).toBe('21.10.2026')
    expect(clock(0)).toBe('00:00')
    expect(clock(13 * 60 + 5)).toBe('13:05')
    expect(clock(1440 + 30)).toBe('00:30')
  })

  it('tysiące oddzielone spacją i przecinek dziesiętny', () => {
    expect(formatNumber(1234567)).toBe(`1${NBSP}234${NBSP}567`)
    expect(formatNumber(1234.5, 1)).toBe(`1${NBSP}234,5`)
    expect(formatNumber(-15)).toBe('−15')
    expect(formatNumber(-0.04, 1)).toBe('0,0')
  })

  it('polskie formy liczby mnogiej', () => {
    const blok = (n: number) => countLabel(n, 'blok', 'bloki', 'bloków')
    expect([1, 2, 4, 5, 12, 14, 22, 25, 112, 122].map(blok)).toEqual([
      '1 blok',
      '2 bloki',
      '4 bloki',
      '5 bloków',
      '12 bloków',
      '14 bloków',
      '22 bloki',
      '25 bloków',
      '112 bloków',
      '122 bloki'
    ])
    expect(plural(2.5, 'godzina', 'godziny', 'godzin')).toBe('godziny')
    expect(plural(0, 'blok', 'bloki', 'bloków')).toBe('bloków')
  })

  it('liczniki w jednym formacie „x z y”', () => {
    expect(ofLabel(3, 12)).toBe('3 z 12')
    expect(ofLabel(1200, 3000)).toBe(`1${NBSP}200 z 3${NBSP}000`)
  })

  it('długość do pokazania', () => {
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(60)).toBe('1 h')
    expect(durationLabel(90)).toBe('1 h 30 min')
    expect(durationLabel(725)).toBe('12 h 05 min')
  })
})

describe('Czas i długość (Konwencje interfejsu)', () => {
  it('długość jako „90”, „1:30” albo „1h30”', () => {
    expect(value(parseDuration('90'))).toBe(90)
    expect(value(parseDuration('1:30'))).toBe(90)
    expect(value(parseDuration('1h30'))).toBe(90)
    expect(value(parseDuration(' 1 h 30 min '))).toBe(90)
    expect(value(parseDuration('2h'))).toBe(120)
    expect(value(parseDuration('45 min'))).toBe(45)
    expect(value(parseDuration('45m'))).toBe(45)
  })

  it('błędna długość jest odrzucana z komunikatem', () => {
    for (const bad of ['', '1,5', '1.30', '1:75', 'abc', '0', '25h', '1h75']) {
      const r = parseDuration(bad)
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.message.length).toBeGreaterThan(5)
    }
  })

  it('godzina 00:00–03:59 dnia logicznego ma oznaczenie „+1”', () => {
    expect(logicalClock(23 * 60 + 59)).toBe('23:59')
    expect(logicalClock(1440)).toBe('00:00 +1')
    expect(logicalClock(1440 + 3 * 60 + 59)).toBe('03:59 +1')
    expect(value(parseLogicalTime('1:30'))).toBe(1440 + 90)
    expect(value(parseLogicalTime('01:30 +1'))).toBe(1440 + 90)
    expect(value(parseLogicalTime('4:00'))).toBe(240)
    expect(value(parseLogicalTime('705'))).toBe(7 * 60 + 5)
    expect(value(parseLogicalTime('7'))).toBe(7 * 60)
    expect(parseLogicalTime('24:00').ok).toBe(false)
    expect(parseLogicalTime('7:60').ok).toBe(false)
  })

  it('data bez roku („3.01”) to najbliższa przyszła taka data', () => {
    expect(value(parseDate('3.01', '2026-10-25'))).toBe('2027-01-03')
    expect(value(parseDate('30.10', '2026-10-25'))).toBe('2026-10-30')
    expect(value(parseDate('25.10', '2026-10-25'))).toBe('2026-10-25')
    expect(value(parseDate('24.10', '2026-10-25'))).toBe('2027-10-24')
    expect(value(parseDate('29.02', '2026-10-25'))).toBe('2028-02-29')
    expect(value(parseDate('21.10.2026', '2030-01-01'))).toBe('2026-10-21')
    expect(value(parseDate('2026-10-21', '2030-01-01'))).toBe('2026-10-21')
    expect(parseDate('31.02', '2026-10-25').ok).toBe(false)
    expect(parseDate('31.02.2027', '2026-10-25').ok).toBe(false)
    expect(parseDate('jutro', '2026-10-25').ok).toBe(false)
  })

  it('data bez roku w zakresie przeszłych dni (eksport CSV) to najbliższa taka data do dziś', () => {
    expect(value(parseDate('1.10', '2026-10-28', { past: true }))).toBe('2026-10-01')
    expect(value(parseDate('28.10', '2026-10-28', { past: true }))).toBe('2026-10-28')
    expect(value(parseDate('29.10', '2026-10-28', { past: true }))).toBe('2025-10-29')
    expect(value(parseDate('29.02', '2026-10-28', { past: true }))).toBe('2024-02-29')
    expect(value(parseDate('15.10.2027', '2026-10-28', { past: true }))).toBe('2027-10-15')
  })

  it('pola liczb całkowitych odrzucają ułamki', () => {
    expect(value(parseInteger('12', 0, 100))).toBe(12)
    expect(value(parseInteger(`1${NBSP}200`, 0, 5000))).toBe(1200)
    expect(parseInteger('1,5', 0, 100).ok).toBe(false)
    expect(parseInteger('2.0', 0, 100).ok).toBe(false)
    expect(parseInteger('101', 0, 100).ok).toBe(false)
    expect(parseInteger('x', 0, 100).ok).toBe(false)
    const r = parseInteger('1,5', 0, 100)
    expect(r.ok ? '' : r.message).toContain('całkowitą')
  })
})
