/**
 * The new block of „Tydzień” over several days (D371): the column under the pointer, the days of a drag, how the heading and
 * the warning of the days gone by word them, the category the window starts with.
 */
import { describe, expect, it } from 'vitest'
import { lastNewBlockCategory, rememberNewBlockCategory, startCategory } from '@renderer/features/plan/lastCategory'
import { columnAt, dayIndexes, sameDrag } from '@renderer/features/week/weekLayout'
import { unknownText, unreadableText, weekAdds } from '@renderer/features/week/weekActions'
import { daysLabel, pastWarning } from '@renderer/features/week/weekText'

// The rectangles the columns really have (the gaps between them are not columns): 136 px wide, 4 px apart, from x = 148.
const COLS = Array.from({ length: 7 }, (_, i) => ({ left: 148 + i * 140, right: 148 + i * 140 + 136 }))

describe('kolumna pod wskaźnikiem (D371)', () => {
  it('trafia w prostokąt kolumny', () => {
    expect(columnAt(149, COLS)).toBe(0)
    expect(columnAt(148 + 135, COLS)).toBe(0)
    expect(columnAt(148 + 140 + 1, COLS)).toBe(1)
    expect(columnAt(148 + 3 * 140 + 70, COLS)).toBe(3)
    expect(columnAt(148 + 6 * 140 + 135, COLS)).toBe(6)
  })
  it('w odstępie – najbliższa kolumna', () => {
    expect(columnAt(148 + 137, COLS)).toBe(0)
    expect(columnAt(148 + 139, COLS)).toBe(1)
  })
  it('bez prostokątów (siatki nie ma na ekranie) – kolumna zapasowa, nie wyjątek', () => {
    expect(columnAt(300, [], 4)).toBe(4)
    expect(columnAt(300, [])).toBe(0)
  })
  it('poza siatką – pierwsza lub ostatnia kolumna', () => {
    expect(columnAt(10, COLS)).toBe(0)
    expect(columnAt(120, COLS)).toBe(0)
    expect(columnAt(5000, COLS)).toBe(6)
  })
  it('kolumny o innej szerokości niż założona (okno węższe, przewinięta strona) – liczą się ich prostokąty', () => {
    const narrow = [
      { left: 60, right: 100 },
      { left: 108, right: 150 },
      { left: 160, right: 200 }
    ]
    expect(columnAt(104, narrow)).toBe(0)
    expect(columnAt(109, narrow)).toBe(1)
    expect(columnAt(185, narrow)).toBe(2)
  })
})

describe('przeciągnięcie, które się nie zmieniło, nie rysuje się od nowa (D371)', () => {
  const drag = (from: number, to: number, startMin = 600, endMin = 660) => ({ from, to, range: { startMin, endMin } })
  it('te same kolumny i godziny – to samo', () => {
    expect(sameDrag(drag(1, 3), drag(1, 3))).toBe(true)
    expect(sameDrag(null, null)).toBe(true)
  })
  it('inna kolumna pod wskaźnikiem albo inne godziny – zmiana', () => {
    expect(sameDrag(drag(1, 3), drag(1, 2))).toBe(false)
    expect(sameDrag(drag(1, 3), drag(1, 3, 600, 665))).toBe(false)
    expect(sameDrag(drag(1, 3), drag(1, 3, 605, 660))).toBe(false)
    expect(sameDrag(null, drag(1, 1))).toBe(false)
    expect(sameDrag(drag(1, 1), null)).toBe(false)
  })
})

describe('dni przeciągnięcia (D371)', () => {
  it('od kolumny startu do kolumny pod wskaźnikiem, w obie strony', () => {
    expect(dayIndexes(1, 3)).toEqual([1, 2, 3])
    expect(dayIndexes(3, 1)).toEqual([1, 2, 3])
    expect(dayIndexes(4, 4)).toEqual([4])
  })
})

describe('nagłówek okienka i ostrzeżenie o dniach minionych (D371)', () => {
  // 2026-11-09 is a Monday.
  const mon = '2026-11-09'
  const tue = '2026-11-10'
  const wed = '2026-11-11'
  const thu = '2026-11-12'
  it('jeden dzień – pełna nazwa, kilka po kolei – od–do, inaczej lista', () => {
    expect(daysLabel([tue])).toBe('wtorek')
    expect(daysLabel([tue, wed, thu])).toBe('wt–cz')
    expect(daysLabel([tue, wed])).toBe('wt–śr')
    expect(daysLabel([tue, thu])).toBe('wt, cz')
  })
  it('bez dnia minionego – bez ostrzeżenia; dziś nie jest minione', () => {
    expect(pastWarning([wed], wed)).toBeNull()
    expect(pastWarning([wed, thu], wed)).toBeNull()
  })
  it('jeden dzień minął – „Ten dzień już minął.”', () => {
    expect(pastWarning([mon], wed)).toBe('Ten dzień już minął.')
  })
  it('w zakresie – nazwa dnia, liczba i rodzaj zgodne', () => {
    expect(pastWarning([tue, wed, thu], wed)).toBe('Wtorek już minął.')
    expect(pastWarning([tue, wed, thu], thu)).toBe('Wtorek i środa już minęły.')
    expect(pastWarning([mon, tue, wed, thu], '2026-11-13')).toBe('Poniedziałek, wtorek, środa i czwartek już minęły.')
    expect(pastWarning([wed, thu], '2026-11-12')).toBe('Środa już minęła.')
  })
})

describe('kategoria na starcie okienka (D371)', () => {
  const available = ['inne', 'nauka', 'trening']
  it('ostatnio dodana, jeśli nadal można ją wybrać', () => {
    expect(startCategory('trening', available)).toBe('trening')
  })
  it('za pierwszym razem albo po zarchiwizowaniu – „Inne”', () => {
    expect(startCategory(null, available)).toBe('inne')
    expect(startCategory('zniknela', available)).toBe('inne')
  })
  it('bez „Inne” – pierwsza z listy', () => {
    expect(startCategory(null, ['nauka', 'trening'])).toBe('nauka')
  })
  it('pamięć okna: brak magazynu to brak pamięci, nie błąd', () => {
    // No `localStorage` in this environment: reading gives nothing, writing is silent.
    expect(lastNewBlockCategory()).toBeNull()
    expect(() => rememberNewBlockCategory('trening')).not.toThrow()
  })
})

describe('komunikat o dniach z nieczytelnym plikiem (D371)', () => {
  it('nazywa dzień datą i dniem tygodnia, nie odmienia nazwy po „dnia”', () => {
    expect(unreadableText(['2026-11-11'])).toBe('Nie dodano bloku w dniu 11.11.2026 · środa – plik tego dnia jest teraz nieczytelny. Spróbuj za chwilę.')
  })
  it('kilka dni – lista, reszta zapisana', () => {
    expect(unreadableText(['2026-11-11', '2026-11-12'])).toBe('Nie dodano bloków w dniach: 11.11.2026 · środa, 12.11.2026 · czwartek – ich pliki są teraz nieczytelne. Spróbuj za chwilę.')
  })
})

describe('co się stało z dniami po „Dodaj” (D371)', () => {
  const D = ['2026-11-10', '2026-11-11', '2026-11-12']
  const ok = { status: 'applied' as const }
  it('wszystkie zapisane (też czekające na folder)', () => {
    expect(weekAdds(D, D, [ok, { status: 'waiting' as const }, ok], true)).toEqual({ saved: D, pending: [], failed: [], unknown: false })
  })
  it('dzień ze zmianą z innego komputera czeka na pytanie – nie zostaje do ponownego zapisu', () => {
    const r = weekAdds(D, D, [ok, { status: 'conflict' as const }, { status: 'changedElsewhere' as const }], true)
    expect(r).toEqual({ saved: [D[0]], pending: [D[1], D[2]], failed: [], unknown: false })
    expect(weekAdds(D, D, [{ status: 'removedElsewhere' as const }, ok, ok], true).pending).toEqual([D[0]])
  })
  it('plik uszkodzony albo nieczytelny – nic nie zapisano, dzień zostaje', () => {
    // The second day was never sent (its file could not be read).
    const r = weekAdds(D, [D[0]!, D[2]!], [ok, { status: 'broken' as const }], true)
    expect(r).toEqual({ saved: [D[0]], pending: [], failed: [D[1], D[2]], unknown: false })
  })
  it('błąd po wysłaniu edycji (nie wiadomo, czy zapisano) – dni nie wracają do ponownego zapisu', () => {
    const r = weekAdds(D, [D[0]!, D[2]!], null, true)
    expect(r).toEqual({ saved: [], pending: [D[0], D[2]], failed: [D[1]], unknown: true })
  })
  it('błąd przed wysłaniem – nic nie zapisano, wszystkie dni zostają', () => {
    expect(weekAdds(D, [], null, false)).toEqual({ saved: [], pending: [], failed: D, unknown: false })
  })
  it('komunikat o nieznanym wyniku nazywa dni', () => {
    expect(unknownText(['2026-11-11'])).toBe('Nie wiadomo, czy blok trafił do dnia: 11.11.2026 · środa. Sprawdź tydzień – nic nie zostanie dodane ponownie.')
    expect(unknownText(D.slice(0, 2))).toContain('do dni: 10.11.2026 · wtorek, 11.11.2026 · środa')
  })
})
