/**
 * „Zastosuj do…” / „Odwołaj w…” in the window (D540–D545, T1908): the words of the line and of „nic”, Polish numerals, the count of only
 * the days that stand (a question and a refusal never go to „Cofnij”), and when the window may close.
 */
import { describe, expect, it } from 'vitest'
import type { EditEntry, EditOutcome } from '@shared/api'
import { appliedText, nothingAppliedText, nothingRevokedText, revokedText, tallyDays, tell, type DayRow, type DaysDone } from '../../src/renderer/features/templates/applyDays'

const done = (o: Partial<DaysDone>): DaysDone => ({ edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, empty: 0, unreadable: [], read: 1, waiting: 0, refused: 0, ...o })

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
