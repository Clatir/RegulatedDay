/**
 * „Zastosuj do…” / „Odwołaj w…” in the window (D540–D545, T1908): the words of the line and of „nic”, Polish numerals, the count of only
 * the days that stand (a question and a refusal never go to „Cofnij”), and when the window may close.
 */
import { describe, expect, it } from 'vitest'
import type { EditEntry, EditOutcome } from '@shared/api'
import { appliedText, asksTiming, nothingAppliedText, nothingRevokedText, revokedText, tallyDays, tell, timingTitle, type DayRow, type DaysDone } from '../../src/renderer/features/templates/applyDays'

const done = (o: Partial<DaysDone>): DaysDone => ({ edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, empty: 0, unreadable: [], read: 1, waiting: 0, refused: 0, asDone: 0, left: { past: 0, ran: 0, outOfDay: 0 }, doneDays: [], facts: [], unscored: [], closedDays: [], ...o })

describe('teksty szablonu w dniach', () => {
  it('linia po „Zastosuj” i po „Odwołaj”', () => {
    expect(appliedText('Trening', done({ days: 5, blocks: 12, cancelled: 2, skipped: 3 }))).toBe('„Trening” – 5 dni: dodano 12 bloków · odwołano 2 · pominięto 3 (kolizja)')
    expect(appliedText('Trening', done({ days: 1, blocks: 1, waiting: 1 }))).toBe('„Trening” – 1 dzień: dodano 1 blok · 1 dzień czeka na odpowiedź')
    expect(revokedText('Trening', done({ days: 2, blocks: 4, begun: 3 }))).toBe('„Trening” odwołany – 2 dni: 4 bloki · 3 zostały – już trwają')
    expect(revokedText('Trening', done({ days: 1, blocks: 1, begun: 1 }))).toBe('„Trening” odwołany – 1 dzień: 1 blok · 1 został – już trwa')
  })

  it('„nic” mówi prawdziwy powód – o dniach odczytanych', () => {
    expect(nothingAppliedText(done({ read: 0, unreadable: ['2026-11-16'] }))).toBe('Nie da się teraz odczytać tego dnia · nie odczytano: 16.11.2026')
    expect(nothingAppliedText(done({ read: 2, empty: 2 }))).toBe('Szablon nie ma bloków na te dni')
    expect(nothingAppliedText(done({ skipped: 2 }))).toBe('Nic nie dodano – bloki szablonu kolidują z planem (2)')
    // Jeden dzień odczytany, drugi nie: zdanie mówi o odczytanym, nie o obu.
    expect(nothingAppliedText(done({ read: 1, unreadable: ['2026-11-16'] }))).toBe('Ten dzień ma już cały szablon · nie odczytano: 16.11.2026')
    expect(nothingRevokedText(done({ read: 2, begun: 2 }))).toBe('Nic nie odwołano – bloki szablonu już trwają (2)')
    expect(nothingRevokedText(done({ read: 3 }))).toBe('W tych dniach nie ma bloków tego szablonu')
  })
})

describe('tylko dni, które stoją (T1908)', () => {
  const entry = (date: string): EditEntry => ({ rel: `days/${date.slice(0, 4)}/${date}.json`, create: false, fields: [] }) as unknown as EditEntry
  const row = (date: string, r: Partial<DayRow['r']>, withEdit = true): DayRow => ({ edit: withEdit ? { date, entry: entry(date), made: null } : null, r: { raw: {}, blocks: 0, ...r } })
  const outcome = (status: string): EditOutcome => ({ status }) as unknown as EditOutcome

  it('dzień z pytaniem i odrzucony – nie w „Cofnij” ani w liczbach bloków, tylko w dopisku', () => {
    const rows = [row('2026-11-17', { blocks: 2, skipped: 1 }), row('2026-11-18', { blocks: 3, skipped: 2 }), row('2026-11-19', { blocks: 1 }), row('2026-11-20', { blocks: 0, skipped: 4 }, false)]
    const d = tallyDays(rows, [outcome('applied'), outcome('conflict'), outcome('error')], [])
    expect(d.edits.map((e) => e.date)).toEqual(['2026-11-17'])
    expect(d).toMatchObject({ days: 1, blocks: 2, skipped: 5, waiting: 1, refused: 1, read: 4 })
  })

  it('okno zamyka się przy pytaniu (bez drugiego wysłania), zostaje przy odmowie', () => {
    expect(tell(done({ waiting: 1 }), () => '', () => 'x')).toBe(true)
    expect(tell(done({ refused: 1 }), () => '', () => 'x')).toBe(false)
    expect(tell({ ...done({}), unknown: true }, () => '', () => 'x')).toBe(true)
    expect(tell(null, () => '', () => 'x')).toBe(false)
  })
})

describe('dziś i dni minione (D546–D549)', () => {
  const left = (o: Partial<DaysDone['left']>): DaysDone['left'] => ({ past: 0, ran: 0, outOfDay: 0, ...o })

  it('linia: zrealizowane w dodanych, pominięte według powodu', () => {
    expect(appliedText('Trening', done({ days: 1, blocks: 3, asDone: 2, skipped: 1, left: left({ past: 1, ran: 2, outOfDay: 1 }) }))).toBe(
      '„Trening” – 1 dzień: dodano 3 bloki (w tym 2 zrealizowane) · pominięto 1 (kolizja) · pominięto 1 (minione) · pominięto 2 (w tym czasie coś trwało) · pominięto 1 (poza dobą)'
    )
    expect(appliedText('Trening', done({ days: 1, blocks: 1, asDone: 1 }))).toBe('„Trening” – 1 dzień: dodano 1 blok (w tym 1 zrealizowany)')
    expect(appliedText('Trening', done({ days: 2, blocks: 5, asDone: 5 }))).toBe('„Trening” – 2 dni: dodano 5 bloków (w tym 5 zrealizowanych)')
  })

  it('„nic” mówi o minionych, biegach i dobie', () => {
    expect(nothingAppliedText(done({ left: left({ past: 3 }) }))).toBe('Nic nie dodano – bloki szablonu już minęły (3)')
    expect(nothingAppliedText(done({ skipped: 1, left: left({ ran: 2, outOfDay: 1 }) }))).toBe(
      'Nic nie dodano – bloki szablonu kolidują z planem (1) · w tym czasie trwały inne bloki (2) · od teraz nie mieszczą się w dobie (1)'
    )
  })

  it('okno potwierdzenia: tytuł i kiedy się pokazuje (dziś albo dzień miniony wśród wybranych)', () => {
    expect(timingTitle('Trening', ['2026-11-16'], '2026-11-16')).toBe('Zastosuj „Trening” do dziś')
    expect(timingTitle('Trening', ['2026-11-15', '2026-11-16', '2026-11-17'], '2026-11-16')).toBe('Zastosuj „Trening” do 3 dni')
    expect(timingTitle('Trening', ['2026-11-12'], '2026-11-16')).toBe('Zastosuj „Trening” do 12.11.2026')
    expect(asksTiming(['2026-11-17', '2026-11-18'], '2026-11-16')).toBe(false)
    expect(asksTiming(['2026-11-16'], '2026-11-16')).toBe(true)
    expect(asksTiming(['2026-11-10', '2026-11-20'], '2026-11-16')).toBe(true)
  })

  it('zrealizowane do zapisu faktów tylko z dni zapisanych; pominięte według powodu z dni, które stoją', () => {
    const entry = (date: string): EditEntry => ({ rel: `days/${date.slice(0, 4)}/${date}.json`, create: false, fields: [] }) as unknown as EditEntry
    const row = (date: string, r: Partial<DayRow['r']>): DayRow => ({ edit: { date, entry: entry(date), made: null }, r: { raw: {}, blocks: 0, ...r } })
    const rows = [row('2026-11-15', { blocks: 2, done: ['a', 'b'], left: left({ past: 1 }) }), row('2026-11-16', { blocks: 1, done: ['c'], left: left({ ran: 3 }) })]
    const d = tallyDays(rows, [{ status: 'applied' } as unknown as EditOutcome, { status: 'conflict' } as unknown as EditOutcome], [])
    expect(d.doneDays).toEqual([{ date: '2026-11-15', ids: ['a', 'b'] }])
    expect(d.left).toEqual(left({ past: 1 }))
  })
})

describe('runda 1 – „bez zaliczenia” i dni zamknięte (D547, D550)', () => {
  it('powody raz każdy, w kolejności; kilka dni zamkniętych', () => {
    const left = { past: 0, ran: 0, outOfDay: 0 }
    expect(appliedText('Trening', done({ days: 2, blocks: 4, asDone: 1, left, unscored: ['ran', 'notPast', 'ran'], closedDays: ['2026-11-10', '2026-11-11'] }))).toBe(
      '„Trening” – 2 dni: dodano 4 bloki (w tym 1 zrealizowany) · 3 bez zaliczenia (w tym czasie coś trwało, jeszcze trwa) · 2 dni były zamknięte – punkty przeliczono'
    )
  })
})

describe('runda 4 – okno dni zostaje, gdy dzień nie został zapisany', () => {
  it('linia dla zapisanych, ale okno wyboru dni zostaje otwarte (do ponownego „Zastosuj”)', () => {
    expect(tell(done({ days: 1, blocks: 2, notSaved: [{ date: '2026-11-19', why: 'changed' }] }), () => 'linia', () => 'nic')).toBe(false)
    expect(tell(done({ days: 1, blocks: 2 }), () => 'linia', () => 'nic')).toBe(true)
  })
})
