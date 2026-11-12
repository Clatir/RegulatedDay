/**
 * All-day and multi-day events (D405, HKU1): the record read leniently (a bad one is left out, unknown fields stay when
 * it is written), the events of a day and of a range in their order, the bars of a week packed into at most three rows
 * with „+N” for the rest and ‹ › where an event goes on outside the week, the dates as „18–20.11”, the day „(2/3)”, and
 * the days „Wolne” is asked for – from today, not free already, not closed. Their files: allday/<id>.json, conflict copies
 * known like any record's.
 */
import { describe, expect, it } from 'vitest'
import { classify, paths } from '@shared/data/paths'
import {
  ALL_DAY_COLORS,
  allDayFrom,
  allDayJson,
  allDayProblem,
  dayIndexOf,
  dayOfText,
  eventsInRange,
  eventsOn,
  freeDaysToAsk,
  rangeText,
  weekLanes,
  type AllDayEvent
} from '@shared/model/allDay'
import { ALL_DAY_COLOR_HEX, contrastPairs } from '@shared/theme'

const ev = (id: string, startDate: string, endDate = startDate, more: Partial<AllDayEvent> = {}): AllDayEvent => ({
  id,
  title: id.toUpperCase(),
  startDate,
  endDate,
  calendarId: null,
  color: ALL_DAY_COLORS[0],
  note: '',
  free: false,
  ...more
})

describe('rekord wydarzenia (allDayFrom, allDayJson)', () => {
  const raw = { schema: 1, id: 'k1', title: '  Konferencja  ', startDate: '2026-11-18', endDate: '2026-11-20', color: 'teal', note: 'Kraków', free: true, calendarId: null, updatedAt: 5, extra: { a: 1 } }

  it('czyta pola; tytuł przycięty', () => {
    expect(allDayFrom(raw)).toEqual({ id: 'k1', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20', color: 'teal', note: 'Kraków', free: true, calendarId: null })
  })

  it('zapis zostawia nieznane pola i zmienia tylko to, co zmieniono', () => {
    const e = allDayFrom(raw)!
    const out = allDayJson({ ...e, title: 'Konferencja PTE' }, raw)
    expect(out).toEqual({ ...raw, title: 'Konferencja PTE' })
  })

  it('wartość, której ta wersja nie zna (kolor nowszej wersji), zostaje, póki jej nie zmienisz', () => {
    const odd = { ...raw, color: 'purple', free: 'tak' }
    const e = allDayFrom(odd)!
    expect(e.color).toBe(ALL_DAY_COLORS[0])
    expect(e.free).toBe(false)
    expect(allDayJson({ ...e, note: 'inna' }, odd)).toEqual({ ...odd, note: 'inna' })
    expect(allDayJson({ ...e, color: 'rose' }, odd).color).toBe('rose')
  })

  it('nowy rekord: wszystkie pola i schemat', () => {
    expect(allDayJson(ev('n1', '2026-11-18'))).toEqual({ schema: 1, id: 'n1', title: 'N1', startDate: '2026-11-18', endDate: '2026-11-18', calendarId: null, color: ALL_DAY_COLORS[0], note: '', free: false })
  })

  it('zły rekord to null, nie wyjątek; brak daty „do” – jednodniowe', () => {
    for (const bad of [null, [], 'x', 5, {}, { id: '' }, { id: 'a' }, { id: 'a', startDate: '2026-13-01' }, { id: 'a', startDate: '2026-02-30' }, { id: 'a', startDate: '2026-11-20', endDate: '2026-11-19' }, { id: 'a', startDate: '2026-11-20', endDate: 'jutro' }])
      expect(allDayFrom(bad)).toBeNull()
    expect(allDayFrom({ id: 'a', startDate: '2026-11-20' })).toMatchObject({ endDate: '2026-11-20', title: 'Wydarzenie', note: '', free: false, calendarId: null })
  })

  it('calendarId z pliku zostaje (zarezerwowane dla kalendarzy), pusty – null', () => {
    expect(allDayFrom({ ...raw, calendarId: 'google-1' })!.calendarId).toBe('google-1')
    expect(allDayFrom({ ...raw, calendarId: '' })!.calendarId).toBeNull()
  })

  it('co okno odmawia zapisać: pusty tytuł, „do” przed „od”, dłużej niż rok', () => {
    expect(allDayProblem(ev('a', '2026-11-18'))).toBeNull()
    expect(allDayProblem(ev('a', '2026-11-18', '2026-11-18', { title: '   ' }))).toMatch(/tytuł/)
    expect(allDayProblem(ev('a', '2026-11-18', '2026-11-17'))).toMatch(/przed/)
    expect(allDayProblem(ev('a', '2026-11-18', '2027-11-18'))).toBeNull()
    expect(allDayProblem(ev('a', '2026-11-18', '2027-11-19'))).toMatch(/rok/)
  })
})

describe('wydarzenia dnia i zakresu', () => {
  const list = [ev('b', '2026-11-11'), ev('a', '2026-11-05', '2026-11-18'), ev('d', '2026-11-11', '2026-11-13'), ev('c', '2026-11-10', '2026-11-12'), ev('x', '2026-11-20')]

  it('kolejność: wcześniejszy start, potem dłuższe, potem tytuł', () => {
    expect(eventsOn(list, '2026-11-11').map((e) => e.id)).toEqual(['a', 'c', 'd', 'b'])
    expect(eventsInRange(list, '2026-11-12', '2026-11-20').map((e) => e.id)).toEqual(['a', 'c', 'd', 'x'])
    expect(eventsInRange(list, '2026-11-19', '2026-11-19')).toEqual([])
  })

  it('dzień wydarzenia „(2/3)”; jednodniowe i dzień poza nim – bez', () => {
    const k = ev('k', '2026-11-18', '2026-11-20')
    expect(dayIndexOf(k, '2026-11-19')).toEqual({ index: 2, count: 3 })
    expect(dayIndexOf(k, '2026-11-21')).toBeNull()
    expect(dayOfText(k, '2026-11-18')).toBe('(1/3)')
    expect(dayOfText(k, '2026-11-20')).toBe('(3/3)')
    expect(dayOfText(ev('j', '2026-11-18'), '2026-11-18')).toBe('')
    expect(dayOfText(k, '2026-11-17')).toBe('')
  })

  it('daty: jeden dzień, w miesiącu, przez miesiąc, przez rok', () => {
    expect(rangeText(ev('a', '2026-11-18'))).toBe('18.11')
    expect(rangeText(ev('a', '2026-11-18', '2026-11-20'))).toBe('18–20.11')
    expect(rangeText(ev('a', '2026-11-30', '2026-12-02'))).toBe('30.11–2.12')
    expect(rangeText(ev('a', '2026-12-30', '2027-01-02'))).toBe('30.12.2026–2.01.2027')
    expect(rangeText(ev('a', '2026-01-05'))).toBe('5.01')
  })
})

describe('belki tygodnia (weekLanes)', () => {
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']
  // A: through the whole week and beyond on both sides; on Wednesday five events at once.
  const list = [
    ev('a', '2026-11-05', '2026-11-18'),
    ev('c', '2026-11-10', '2026-11-12'),
    ev('d', '2026-11-11', '2026-11-13'),
    ev('e', '2026-11-11', '2026-11-11', { title: 'Egzamin' }),
    ev('b', '2026-11-11', '2026-11-11', { title: 'Bankiet' }),
    ev('f', '2026-11-14', '2026-11-15'),
    ev('poza', '2026-11-16', '2026-11-17')
  ]

  it('najwyżej 3 rzędy, reszta „+N” w swojej kolumnie; wolny rząd bierze kolejna belka', () => {
    const r = weekLanes(list, week)
    expect(r.bars.map((b) => [b.event.id, b.fromCol, b.toCol, b.lane])).toEqual([
      ['a', 0, 6, 0],
      ['c', 1, 3, 1],
      ['d', 2, 4, 2],
      ['f', 5, 6, 1]
    ])
    expect(r.hidden).toEqual([0, 0, 2, 0, 0, 0, 0])
    expect(r.lanes).toBe(3)
  })

  it('belka wychodząca poza tydzień ma ‹ i ›; mieszcząca się – nie', () => {
    const r = weekLanes(list, week)
    expect(r.bars.find((b) => b.event.id === 'a')).toMatchObject({ cutLeft: true, cutRight: true })
    expect(r.bars.find((b) => b.event.id === 'c')).toMatchObject({ cutLeft: false, cutRight: false })
    const next = weekLanes(list, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(next.bars.find((b) => b.event.id === 'a')).toMatchObject({ fromCol: 0, toCol: 2, cutLeft: true, cutRight: false })
  })

  it('rozwinięte („+N więcej”): wszystkie rzędy, te same miejsca pierwszych trzech', () => {
    const r = weekLanes(list, week, Number.POSITIVE_INFINITY)
    expect(r.bars.map((b) => [b.event.id, b.lane])).toEqual([
      ['a', 0],
      ['c', 1],
      ['d', 2],
      ['b', 3],
      ['e', 4],
      ['f', 1]
    ])
    expect(r.hidden).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(r.lanes).toBe(5)
  })

  it('jedna kolumna („Dziś”) i tydzień bez wydarzeń', () => {
    const one = weekLanes(list, ['2026-11-11'])
    expect(one.bars.map((b) => b.event.id)).toEqual(['a', 'c', 'd'])
    expect(one.hidden).toEqual([2])
    expect(weekLanes([], week)).toEqual({ bars: [], hidden: [0, 0, 0, 0, 0, 0, 0], lanes: 0 })
  })

  it('ten sam wynik dla innej kolejności wejścia (stabilne)', () => {
    expect(weekLanes([...list].reverse(), week)).toEqual(weekLanes(list, week))
  })
})

describe('propozycja „Wolne” (freeDaysToAsk)', () => {
  const today = '2026-11-12'
  const info: Record<string, { type: 'zwykly' | 'wolne' | 'weekend'; closed: boolean }> = {
    '2026-11-10': { type: 'zwykly', closed: false },
    '2026-11-11': { type: 'zwykly', closed: false },
    '2026-11-12': { type: 'zwykly', closed: true },
    '2026-11-13': { type: 'wolne', closed: false },
    '2026-11-14': { type: 'weekend', closed: false },
    '2026-11-15': { type: 'zwykly', closed: false }
  }
  const of = (d: string) => info[d] ?? null

  it('tylko dni od dziś, nie „Wolne” i nie zamknięte; dzień nieznany – bez pytania', () => {
    const e = ev('u', '2026-11-10', '2026-11-16', { free: true })
    expect(freeDaysToAsk(e, today, of)).toEqual(['2026-11-14', '2026-11-15'])
  })

  it('dziś otwarty – też; wydarzenie bez „To wolne” – nic', () => {
    const open = (d: string) => (d === today ? { type: 'zwykly' as const, closed: false } : of(d))
    expect(freeDaysToAsk(ev('u', '2026-11-12', '2026-11-13', { free: true }), today, open)).toEqual(['2026-11-12'])
    expect(freeDaysToAsk(ev('u', '2026-11-14', '2026-11-15'), today, of)).toEqual([])
  })

  it('wydarzenie, które już minęło – nic', () => {
    expect(freeDaysToAsk(ev('u', '2026-11-01', '2026-11-11', { free: true }), today, of)).toEqual([])
  })
})

describe('pliki i barwy wydarzeń', () => {
  it('allday/<id>.json; kopia konfliktowa OneDrive rozpoznana', () => {
    expect(paths.record('allDay', 'k1')).toBe('allday/k1.json')
    expect(classify('allday/k1.json')).toMatchObject({ kind: 'allDay', conflict: false, id: 'k1' })
    expect(classify('allday/k1-DESKTOP-ABC.json')).toMatchObject({ kind: 'allDay', conflict: true, canonical: 'allday/k1.json' })
    expect(classify('allday/k1 (1).json')).toMatchObject({ kind: 'allDay', conflict: true, canonical: 'allday/k1.json' })
  })

  it('6 stałych barw; tekst na tle każdej sprawdzany w teście kontrastu', () => {
    expect(ALL_DAY_COLORS).toHaveLength(6)
    const names = contrastPairs(1).map((p) => p.name)
    for (const c of ALL_DAY_COLORS) {
      expect(ALL_DAY_COLOR_HEX[c]).toMatch(/^#[0-9A-F]{6}$/i)
      expect(names).toContain(`tekst na wydarzeniu ${c}`)
    }
  })
})
