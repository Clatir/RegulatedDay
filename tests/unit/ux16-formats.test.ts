/** UX16 (D565 P24): one date format and one typing of dates, one set of weekday abbreviations, one counter „x z y”. */
import { describe, expect, it } from 'vitest'
import { dayOfText, type AllDayEvent } from '@shared/model/allDay'
import { ofLabel, parseDate, plDate, plDateTime, WEEKDAY_SHORT } from '@shared/format'
import { stepsProgress } from '@shared/model/steps'

const TODAY = '2026-11-21'
const value = (text: string): string | null => {
  const r = parseDate(text, TODAY)
  return r.ok ? r.value : null
}

describe('wpisywanie daty w każdym polu (F1)', () => {
  it('kropki, myślniki, ukośniki, jednocyfrowe', () => {
    for (const t of ['3.01.2027', '3-01-2027', '3/1/2027', '03.01.2027.']) expect(value(t)).toBe('2027-01-03')
  })

  it('osiem cyfr: DDMMRRRR', () => {
    expect(value('03012027')).toBe('2027-01-03')
    expect(value('29022027')).toBeNull()
    expect(value('29022028')).toBe('2028-02-29')
  })

  it('bez roku: „3.01”, „3-01”, „3/1” – najbliższa taka data od dziś', () => {
    for (const t of ['3.01', '3-01', '3/1']) expect(value(t)).toBe('2027-01-03')
    expect(value('21.11')).toBe(TODAY)
  })

  it('ISO nadal przechodzi; bzdura nie', () => {
    expect(value('2026-11-25')).toBe('2026-11-25')
    expect(value('31.02')).toBeNull()
    expect(value('jutro')).toBeNull()
    expect(value('1234567')).toBeNull()
  })

  it('Od–Do w ISO: rok czterocyfrowy na początku nie bywa dniem', () => {
    expect(value('2026-11-5')).toBe('2026-11-05')
  })
})

describe('jeden zapis daty i godziny (F1)', () => {
  it('„21.11.2026 14:30” w strefie Warszawy, z zerami', () => {
    expect(plDateTime(Date.UTC(2026, 10, 21, 13, 30))).toBe('21.11.2026 14:30')
    expect(plDateTime(Date.UTC(2026, 5, 3, 7, 5))).toBe('03.06.2026 09:05')
    expect(plDate('2026-06-03')).toBe('03.06.2026')
  })

  it('jeden zestaw skrótów dni tygodnia', () => {
    expect(WEEKDAY_SHORT).toEqual(['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'])
  })
})

describe('licznik „x z y” (F2)', () => {
  it('kroki w panelu i w Sprawach: „✓ 1 z 3”; bez kroków – nic', () => {
    expect(stepsProgress([{ done: true }, { done: false }, { done: false }])).toBe('✓ 1 z 3')
    expect(stepsProgress([])).toBeNull()
    expect(stepsProgress(undefined)).toBeNull()
  })

  it('dzień wydarzenia wielodniowego: „(2 z 3)”', () => {
    const e = { id: 'k', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20' } as AllDayEvent
    expect(dayOfText(e, '2026-11-19')).toBe('(2 z 3)')
    expect(ofLabel(2, 3)).toBe('2 z 3')
  })
})
