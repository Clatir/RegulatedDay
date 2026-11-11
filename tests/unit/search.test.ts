/**
 * The global search (SNT6, D387, T650): matching without diacritics and case, every typed word at the beginning of some
 * word, no typos; highlight ranges in the original text; the order of blocks (today, then coming, then past); groups of
 * five with the rest counted; the last chosen results.
 */
import { describe, expect, it } from 'vitest'
import {
  compareDays,
  fold,
  GROUP_SIZE,
  highlightRanges,
  hitView,
  matchesQuery,
  parseRecents,
  queryWords,
  recordKey,
  rememberRecent,
  search,
  snippetOf,
  visibleHits,
  type SearchRecord
} from '@shared/search'

const block = (date: string, id: string, title: string, text = ''): SearchRecord => ({ kind: 'block', id, date, title, text })
const cut = (text: string, ranges: Array<[number, number]>) => ranges.map(([a, b]) => text.slice(a, b))

describe('normalizacja', () => {
  it('małe litery, bez ogonków, ł i Ł też (ł nie rozkłada się w NFD)', () => {
    expect(fold('Żółw').text).toBe('zolw')
    expect(fold('Łódź').text).toBe('lodz')
    expect(fold('ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż').text).toBe('acelnoszz acelnoszz')
  })

  it('znaki łączące już w tekście (rozłożone ogonki) znikają, a zakres obejmuje je w oryginale', () => {
    const decomposed = 'Zółw' // o + combining acute
    const f = fold(decomposed)
    expect(f.text).toBe('zolw')
    // „ó” (two code units) is output char 1: from 1 to 3.
    expect([f.from[1], f.to[1]]).toEqual([1, 3])
  })

  it('słowa zapytania: podział po spacjach i znakach nie-liter, puste zapytanie nie ma słów', () => {
    expect(queryWords('  telefon,  Kowalski ')).toEqual(['telefon', 'kowalski'])
    expect(queryWords('Łódź-Żółw 12:30')).toEqual(['lodz', 'zolw', '12', '30'])
    expect(queryWords('   ')).toEqual([])
    expect(queryWords('')).toEqual([])
  })
})

describe('dopasowanie (D387)', () => {
  const rec = (title: string, text = ''): SearchRecord => ({ kind: 'request', id: 'x', title, text })

  it('„zolw” trafia „Żółw”, „lodz” trafia „Łódź”, a zapytanie z ogonkami trafia tekst bez ogonków', () => {
    expect(matchesQuery(queryWords('zolw'), rec('Żółw'))).toBe(true)
    expect(matchesQuery(queryWords('lodz'), rec('Spotkanie w Łodzi'))).toBe(true)
    expect(matchesQuery(queryWords('ŻÓŁW'), rec('zolw'))).toBe(true)
  })

  it('wielkość liter nie ma znaczenia', () => {
    expect(matchesQuery(queryWords('TRADING'), rec('sesja trading'))).toBe(true)
  })

  it('wpisane słowo trafia w początek słowa, nie w środek ani koniec', () => {
    expect(matchesQuery(queryWords('kow'), rec('Kowalski'))).toBe(true)
    expect(matchesQuery(queryWords('owal'), rec('Kowalski'))).toBe(false)
    expect(matchesQuery(queryWords('ski'), rec('Kowalski'))).toBe(false)
  })

  it('bez tolerancji literówek', () => {
    expect(matchesQuery(queryWords('kowlaski'), rec('Kowalski'))).toBe(false)
    expect(matchesQuery(queryWords('kowalsky'), rec('Kowalski'))).toBe(false)
  })

  it('dwa słowa w różnych miejscach rekordu: oba muszą trafić (tytuł i notatka razem, dowolna kolejność)', () => {
    const r = rec('Spotkanie', 'Kowalski podał numer, telefon 600 100 200')
    expect(matchesQuery(queryWords('telefon kowalski'), r)).toBe(true)
    expect(matchesQuery(queryWords('spot telefon'), r)).toBe(true)
    expect(matchesQuery(queryWords('telefon nowak'), r)).toBe(false)
  })

  it('słowa dodatkowe (keys) też są przeszukiwane, ale nie pokazywane', () => {
    const r: SearchRecord = { kind: 'command', id: 'newBlock', title: 'Nowy blok', keys: 'nowe' }
    expect(matchesQuery(queryWords('nowe'), r)).toBe(true)
  })

  it('puste zapytanie nic nie dopasowuje', () => {
    expect(matchesQuery([], rec('Żółw'))).toBe(false)
    expect(search([rec('Żółw')], '  ', '2026-11-10')).toEqual([])
  })
})

describe('podświetlenie w oryginalnym tekście', () => {
  it('indeksy dotyczą tekstu z ogonkami, nie znormalizowanego', () => {
    const text = 'Zadzwoń do Żółwia w Łodzi'
    expect(cut(text, highlightRanges(text, queryWords('zol')))).toEqual(['Żół'])
    expect(cut(text, highlightRanges(text, queryWords('lodz')))).toEqual(['Łodz'])
    expect(cut(text, highlightRanges(text, queryWords('zadzwon')))).toEqual(['Zadzwoń'])
  })

  it('kilka trafień; słowo trafione dwoma słowami zapytania ma jedną, dłuższą zakładkę', () => {
    const text = 'Kowalski i kowal'
    expect(cut(text, highlightRanges(text, queryWords('kow')))).toEqual(['Kow', 'kow'])
    expect(cut(text, highlightRanges(text, queryWords('kow kowal')))).toEqual(['Kowal', 'kowal'])
  })

  it('brak trafienia: brak zakresów', () => {
    expect(highlightRanges('Plan dnia', queryWords('zolw'))).toEqual([])
  })
})

describe('fragment notatki', () => {
  it('krótka notatka: cały tekst z podświetloną frazą', () => {
    const s = snippetOf('Numer do Kowalskiego: 600 100 200', queryWords('kowal'))!
    expect(s.text).toBe('Numer do Kowalskiego: 600 100 200')
    expect(cut(s.text, s.ranges)).toEqual(['Kowal'])
  })

  it('długa notatka: okno wokół pierwszego trafienia, wielokropki, zakresy względem okna', () => {
    const note = `${'Wstęp bez znaczenia '.repeat(12)}telefon do Żółwia: 600 100 200 ${'dalszy ciąg notatki '.repeat(12)}`
    const s = snippetOf(note, queryWords('telefon zol'))!
    expect(s.text.startsWith('…')).toBe(true)
    expect(s.text.endsWith('…')).toBe(true)
    expect(s.text.length).toBeLessThan(110)
    expect(cut(s.text, s.ranges)).toEqual(['telefon', 'Żół'])
  })

  it('trafienie na samym początku: bez wielokropka z przodu', () => {
    const note = `Telefon ${'abc '.repeat(60)}`
    const s = snippetOf(note, queryWords('tele'))!
    expect(s.text.startsWith('…')).toBe(false)
    expect(s.text.endsWith('…')).toBe(true)
    expect(cut(s.text, s.ranges)).toEqual(['Tele'])
  })

  it('bez trafienia w notatce: null', () => {
    expect(snippetOf('nic tu nie ma', queryWords('zolw'))).toBeNull()
    expect(snippetOf('', queryWords('zolw'))).toBeNull()
  })
})

describe('kolejność dni bloków', () => {
  const TODAY = '2026-11-10'
  it('dziś, potem przyszłe od najbliższych, potem minione od najnowszych', () => {
    const dates = ['2026-10-01', '2026-11-12', '2026-11-10', '2026-11-30', '2026-11-09', '2026-01-05', '2026-11-11']
    expect([...dates].sort((a, b) => compareDays(a, b, TODAY))).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-30', '2026-11-09', '2026-10-01', '2026-01-05'])
  })

  it('wyniki bloków w grupie idą w tej kolejności, w obrębie dnia najpierw trafienie w tytule', () => {
    const records = [
      block('2026-10-01', 'a', 'Spotkanie'),
      block('2026-11-12', 'b', 'Spotkanie'),
      block('2026-11-10', 'c', 'Inny', 'notatka ze spotkania'),
      block('2026-11-10', 'd', 'Spotkanie'),
      block('2026-11-09', 'e', 'Spotkanie')
    ]
    const groups = search(records, 'spot', TODAY)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.hits.map((h) => h.record.id)).toEqual(['d', 'c', 'b', 'e', 'a'])
  })
})

describe('grupy po 5 i licznik reszty', () => {
  const TODAY = '2026-11-10'
  const many = Array.from({ length: 12 }, (_, i) => block(`2026-11-${String(11 + (i % 9)).padStart(2, '0')}`, `b${i}`, `Blok ${i}`))

  it('pięć widocznych, reszta policzona, po rozwinięciu wszystkie', () => {
    const [g] = search(many, 'blok', TODAY)
    expect(g!.hits).toHaveLength(12)
    expect(visibleHits(g!, false)).toHaveLength(GROUP_SIZE)
    expect(g!.hits.length - visibleHits(g!, false).length).toBe(7)
    expect(visibleHits(g!, true)).toHaveLength(12)
  })

  it('grupa do pięciu wyników nie ma reszty', () => {
    const [g] = search(many.slice(0, 5), 'blok', TODAY)
    expect(visibleHits(g!, false)).toHaveLength(5)
  })

  it('grupy tylko z trafieniami, w stałej kolejności: polecenia, ekrany, kategorie, bloki, szablony, prośby, rutyny', () => {
    const records: SearchRecord[] = [
      { kind: 'routine', id: 'r', title: 'Rano' },
      { kind: 'request', id: 'q', title: 'Rano u Kowalskiego' },
      { kind: 'template', id: 't', title: 'Rano w domu' },
      { kind: 'templateBlock', id: 'tb', parent: 't', title: 'Rano: woda' },
      block('2026-11-10', 'b', 'Rano'),
      { kind: 'category', id: 'c', title: 'Rano w kolorze' },
      { kind: 'screen', id: 'today', title: 'Rano dziś' },
      { kind: 'setting', id: 's', title: 'Rano – przypomnienia' },
      { kind: 'command', id: 'ritual', title: 'Rano: rytuał' }
    ]
    const groups = search(records, 'ran', TODAY)
    expect(groups.map((g) => g.id)).toEqual(['command', 'screen', 'category', 'block', 'template', 'request', 'routine'])
    expect(groups.find((g) => g.id === 'screen')!.hits.map((h) => h.record.kind)).toEqual(['screen', 'setting'])
    expect(groups.find((g) => g.id === 'template')!.hits.map((h) => h.record.kind)).toEqual(['template', 'templateBlock'])
  })

  it('trafienie w tytule ma pierwszeństwo przed trafieniem tylko w tekście (poza blokami, tam rządzi dzień)', () => {
    const records: SearchRecord[] = [
      { kind: 'request', id: 'a', title: 'Nowak', text: 'telefon' },
      { kind: 'request', id: 'b', title: 'Telefon do banku' }
    ]
    expect(search(records, 'telefon', TODAY)[0]!.hits.map((h) => h.record.id)).toEqual(['b', 'a'])
  })

  it('wynik niesie podświetlenie tytułu i fragment notatki', () => {
    const [g] = search([block('2026-11-10', 'x', 'Spotkanie z Żółwiem', 'Numer: 600 100 200, telefon Kowalski')], 'zol telefon', TODAY)
    const r = g!.hits[0]!.record
    const v = hitView(r, queryWords('zol telefon'))
    expect(cut(r.title, v.title)).toEqual(['Żół'])
    expect(cut(v.snippet!.text, v.snippet!.ranges)).toEqual(['telefon'])
  })
})

describe('ostatnio wybrane', () => {
  it('klucz rekordu jest stały i różni bloki w różnych dniach', () => {
    expect(recordKey(block('2026-11-10', 'a', 'x'))).not.toBe(recordKey(block('2026-11-11', 'a', 'x')))
    expect(recordKey({ kind: 'templateBlock', id: 'b', parent: 't1', title: 'x' })).not.toBe(recordKey({ kind: 'templateBlock', id: 'b', parent: 't2', title: 'x' }))
  })

  it('najnowszy pierwszy, bez powtórzeń, najwyżej 5', () => {
    let list: string[] = []
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) list = rememberRecent(list, k)
    expect(list).toEqual(['f', 'e', 'd', 'c', 'b'])
    expect(rememberRecent(list, 'c')).toEqual(['c', 'f', 'e', 'd', 'b'])
  })

  it('uszkodzony albo brakujący wpis to pusta lista, zły element jest pomijany', () => {
    expect(parseRecents(null)).toEqual([])
    expect(parseRecents('{nie json')).toEqual([])
    expect(parseRecents('{"a":1}')).toEqual([])
    expect(parseRecents('["a", 3, null, "b", "a"]')).toEqual(['a', 'b'])
    expect(parseRecents(JSON.stringify(['1', '2', '3', '4', '5', '6', '7']))).toHaveLength(5)
  })
})
