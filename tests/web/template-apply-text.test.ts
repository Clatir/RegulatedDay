/** The words of „Zastosuj do…” / „Odwołaj w…” (D540–D545): the line, the corner's „why nothing”, Polish numerals. */
import { describe, expect, it } from 'vitest'
import { appliedText, nothingAppliedText, nothingRevokedText, revokedText, type DaysDone } from '../../src/renderer/features/templates/applyDays'

const done = (o: Partial<DaysDone>): DaysDone => ({ edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, empty: 0, unreadable: [], waiting: 0, refused: 0, ...o })

describe('teksty szablonu w dniach', () => {
  it('linia po „Zastosuj” i po „Odwołaj”', () => {
    expect(appliedText('Trening', done({ days: 5, blocks: 12, cancelled: 2, skipped: 3 }))).toBe('„Trening” – 5 dni: dodano 12 bloków · odwołano 2 · pominięto 3 (kolizja)')
    expect(appliedText('Trening', done({ days: 1, blocks: 1, waiting: 1 }))).toBe('„Trening” – 1 dzień: dodano 1 blok · 1 dzień czeka na odpowiedź')
    expect(revokedText('Trening', done({ days: 2, blocks: 4, begun: 3 }))).toBe('„Trening” odwołany – 2 dni: 4 bloki · 3 zostały – już trwają')
    expect(revokedText('Trening', done({ days: 1, blocks: 1, begun: 1 }))).toBe('„Trening” odwołany – 1 dzień: 1 blok · 1 został – już trwa')
  })

  it('„nic” mówi prawdziwy powód', () => {
    expect(nothingAppliedText(done({ unreadable: ['2026-11-16'] }), 1)).toBe('Nie da się teraz odczytać tego dnia · nie odczytano: 16.11.2026')
    expect(nothingAppliedText(done({ empty: 2 }), 2)).toBe('Szablon nie ma bloków')
    expect(nothingAppliedText(done({ skipped: 2 }), 1)).toBe('Nic nie dodano – bloki szablonu kolidują z planem (2)')
    expect(nothingAppliedText(done({}), 1)).toBe('Ten dzień ma już cały szablon')
    expect(nothingRevokedText(done({ begun: 2 }), 2)).toBe('Nic nie odwołano – bloki szablonu już trwają (2)')
    expect(nothingRevokedText(done({}), 3)).toBe('W tych dniach nie ma bloków tego szablonu')
  })
})
