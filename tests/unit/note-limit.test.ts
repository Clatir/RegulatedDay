/**
 * The limit of a block's note (D388, T664): 10 000 characters for days and templates alike, the warning for a computer
 * with an older version (it cuts the note at 2000), the check of a link before the browser opens it (T663).
 */
import { describe, expect, it } from 'vitest'
import { LONG_NOTE_FROM, NOTE_MAX, NOTE_OLD_MAX, longNoteWarning, olderComputers } from '@shared/model/note'
import { planBlockFrom, templateFrom } from '@shared/model/plan'
import { safeLinkUrl } from '@shared/noteLink'

const block = (note: string) => ({ id: 'a', categoryId: 'inne', startMin: 540, durationMin: 30, note })

describe('limit notatki bloku', () => {
  it('stałe: 10 000, a starsza wersja tnie na 2000', () => {
    expect(NOTE_MAX).toBe(10_000)
    expect(NOTE_OLD_MAX).toBe(2000)
  })
  it('plik dnia: notatka 10 000 zostaje, dłuższa jest cięta do 10 000', () => {
    expect(planBlockFrom(block('x'.repeat(2500)))!.note).toHaveLength(2500)
    expect(planBlockFrom(block('x'.repeat(10_000)))!.note).toHaveLength(10_000)
    expect(planBlockFrom(block('x'.repeat(10_500)))!.note).toHaveLength(10_000)
  })
  it('szablon czyta bloki tą samą funkcją – ten sam limit', () => {
    const t = templateFrom({ id: 't', dayType: 'zwykly', versions: { '2026-01-01': { blocks: [{ ...block('y'.repeat(4000)), origin: 'template' }] } } })
    expect(t!.versions[0]!.blocks[0]!.note).toHaveLength(4000)
  })
})

describe('ostrzeżenie przed starszą wersją (D388)', () => {
  const pc = (name: string, appVersion?: string) => ({ id: name, name, appVersion })
  it('starsza wersja niż pierwsza z limitem 10 000 – komputer jest na liście', () => {
    const older = olderComputers([pc('Dom', LONG_NOTE_FROM), pc('Biuro', '1.5.0'), pc('Laptop', '0.9.9')])
    expect(older).toEqual(['Biuro', 'Laptop'])
  })
  it('ta sama i nowsza wersja, komputer bez znanej wersji ani z nieczytelną – nie ostrzega', () => {
    expect(olderComputers([pc('A', LONG_NOTE_FROM), pc('B', '9.0.0'), pc('C'), pc('D', 'abc')])).toEqual([])
  })
  it('wersja próbna tej samej liczby jest starsza (kanał beta)', () => {
    expect(olderComputers([pc('A', `${LONG_NOTE_FROM}-beta.1`)])).toEqual(['A'])
  })
  it('tekst: nazwa komputera, tylko gdy notatka ma ponad 2000 znaków', () => {
    expect(longNoteWarning(['Biuro'], 2000)).toBeNull()
    expect(longNoteWarning([], 5000)).toBeNull()
    expect(longNoteWarning(['Biuro'], 2001)).toBe('Notatka ma ponad 2000 znaków – na komputerze Biuro ze starszą wersją aplikacji zostanie obcięta.')
  })
  it('kilka komputerów – liczba mnoga', () => {
    expect(longNoteWarning(['Biuro', 'Laptop'], 3000)).toBe('Notatka ma ponad 2000 znaków – na komputerach Biuro, Laptop ze starszą wersją aplikacji zostanie obcięta.')
  })
})

describe('adres linku (T663)', () => {
  it('http i https przechodzą, adres jest znormalizowany przez URL', () => {
    expect(safeLinkUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeLinkUrl('http://example.com')).toBe('http://example.com/')
    expect(safeLinkUrl('  HTTPS://Example.com  ')).toBe('https://example.com/')
  })
  it('inne protokoły i nieadresy – nic', () => {
    for (const u of ['javascript:alert(1)', 'file:///C:/x', 'ftp://a.b', 'mailto:a@b.c', 'data:text/html,x', 'vbscript:x', '//example.com', '/x', 'example.com', '', 'https:/', 'ms-settings:']) expect(safeLinkUrl(u), u).toBeNull()
  })
  it('protokół musi być dokładnie http: albo https: (nie tylko zaczynać się tak)', () => {
    expect(safeLinkUrl('httpx://a.b')).toBeNull()
    expect(safeLinkUrl('https-evil://a.b')).toBeNull()
    expect(safeLinkUrl('java\nscript:alert(1)')).toBeNull()
  })
})
