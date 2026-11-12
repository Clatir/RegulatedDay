/**
 * The strip of all-day events (D405, D406) without the screen: the rows of its bars for „Dziś” and for a week, „+N więcej”
 * folded and unfolded, the days a drag took, the question „Wolne” in words, the card's problems and when it asks, the month
 * grid's label, and the window's lines „Cofnij” with their 15 minutes on a slow clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { UNDO_LINE_MS } from '@shared/widget'
import { cardProblems } from '@renderer/features/allday/AllDayCard'
import { barTitle, monthLabel } from '@renderer/features/allday/allDayText'
import { allDayLayout, asksFreeAfter, dragDates, freeAskDays, freeAskText, freeLineText, pendingCard } from '@renderer/features/allday/allDayView'
import { freeAnswerSettled } from '@renderer/features/allday/freeDays'
import { allDayLineLeft, dropAllDayLine, linesOf, showAllDayLine, useAllDayLines } from '@renderer/store/allDayLine'
import { columnAt } from '@renderer/features/week/weekLayout'

const ev = (id: string, startDate: string, endDate = startDate, title = id): AllDayEvent => ({ ...allDayDraft(id, startDate, endDate), title })
// Monday 16.11.2026 – Sunday 22.11.2026.
const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

describe('pas całodniowy – układ', () => {
  it('pusty pas to jedna linia, bez „+N więcej”', () => {
    const l = allDayLayout([], WEEK, false)
    expect(l.rows).toBe(1)
    expect(l.moreRow).toBeNull()
    expect(l.lanes.bars).toEqual([])
  })

  it('„Dziś”: jedna kolumna, trzy rzędy, czwarte wydarzenie to „+1 więcej”; rozwinięte – cztery rzędy i „Zwiń” w tej samej kolumnie', () => {
    const day = '2026-11-18'
    const events = ['a', 'b', 'c', 'd'].map((id) => ev(id, day))
    const folded = allDayLayout(events, [day], false)
    expect(folded.lanes.bars.map((b) => [b.event.id, b.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2]
    ])
    expect(folded.more).toEqual([1])
    expect(folded.rows).toBe(4)
    expect(folded.moreRow).toBe(4)
    const open = allDayLayout(events, [day], true)
    expect(open.lanes.bars.map((b) => b.lane)).toEqual([0, 1, 2, 3])
    expect(open.rows).toBe(5)
    expect(open.moreRow).toBe(5)
    expect(open.more).toEqual([1])
  })

  it('tydzień: wielodniowe jedną belką przez kolumny, nakładające się w kolejnych rzędach, krawędzie ‹ ›', () => {
    const l = allDayLayout([ev('k', '2026-11-18', '2026-11-20', 'Konferencja'), ev('u', '2026-11-19', '2026-11-19'), ev('d', '2026-11-12', '2026-11-17', 'Długie'), ev('e', '2026-11-22', '2026-11-25', 'Za tydzień')], WEEK, false)
    const by = Object.fromEntries(l.lanes.bars.map((b) => [b.event.id, b]))
    expect([by.k!.fromCol, by.k!.toCol, by.k!.lane]).toEqual([2, 4, 0])
    expect(by.u!.lane).toBe(1)
    expect([by.d!.fromCol, by.d!.toCol, by.d!.cutLeft, by.d!.cutRight]).toEqual([0, 1, true, false])
    expect([by.e!.fromCol, by.e!.toCol, by.e!.cutLeft, by.e!.cutRight]).toEqual([6, 6, false, true])
    expect(l.moreRow).toBeNull()
  })

  it('tydzień: „+N więcej” liczy się w każdej kolumnie wydarzenia ukrytego', () => {
    const events = [ev('a', WEEK[0]!, WEEK[6]!), ev('b', WEEK[0]!, WEEK[6]!), ev('c', WEEK[0]!, WEEK[6]!), ev('d', WEEK[1]!, WEEK[2]!)]
    const l = allDayLayout(events, WEEK, false)
    expect(l.lanes.bars.map((b) => b.event.id)).toEqual(['a', 'b', 'c'])
    expect(l.more).toEqual([0, 1, 1, 0, 0, 0, 0])
    expect(l.rows).toBe(4)
    // Unfolded: the fourth row is there, the button stays (as „Zwiń”) in the two columns.
    const open = allDayLayout(events, WEEK, true)
    expect(open.lanes.bars.find((b) => b.event.id === 'd')).toMatchObject({ lane: 3, fromCol: 1, toCol: 2 })
    expect(open.more).toEqual([0, 1, 1, 0, 0, 0, 0])
  })
})

describe('pas – zawsze jeden wolny rząd pod belkami (klik = nowe wydarzenie)', () => {
  it('jedno wydarzenie w „Dziś”: belka i pod nią wolny rząd, w który da się kliknąć', () => {
    const day = '2026-11-18'
    const l = allDayLayout([ev('a', day)], [day], false)
    expect(l.lanes.bars.map((b) => b.lane)).toEqual([0])
    expect(l.rows).toBe(2)
    expect(l.moreRow).toBeNull()
  })

  it('trzy rzędy belek bez ukrytych: czwarty rząd wolny; tydzień – rzędy belek plus jeden', () => {
    const day = '2026-11-18'
    expect(allDayLayout(['a', 'b', 'c'].map((id) => ev(id, day)), [day], false).rows).toBe(4)
    const week = allDayLayout([ev('k', WEEK[2]!, WEEK[4]!), ev('u', WEEK[3]!)], WEEK, false)
    expect(week.lanes.lanes).toBe(2)
    expect(week.rows).toBe(3)
  })

  it('„+N więcej” stoi w tym wolnym rzędzie (nie w dodatkowym): rzędów belek + 1, także rozwinięte', () => {
    const day = '2026-11-18'
    const events = ['a', 'b', 'c', 'd'].map((id) => ev(id, day))
    const folded = allDayLayout(events, [day], false)
    expect([folded.rows, folded.moreRow]).toEqual([4, 4])
    const open = allDayLayout(events, [day], true)
    expect([open.rows, open.moreRow]).toEqual([5, 5])
    expect(open.lanes.lanes).toBe(4)
  })
})

describe('pytanie „Wolne” – kiedy karta pyta (D405: raz)', () => {
  const base = { ...ev('u', '2026-11-18', '2026-11-20'), free: true }
  it('pyta po zapisie nowego wydarzenia „To wolne” i po włączeniu „To wolne”', () => {
    expect(asksFreeAfter(null, base)).toBe(true)
    expect(asksFreeAfter({ ...base, free: false }, base)).toBe(true)
  })

  it('pyta po zmianie dat wydarzenia „To wolne”', () => {
    expect(asksFreeAfter(base, { ...base, endDate: '2026-11-22' })).toBe(true)
    expect(asksFreeAfter(base, { ...base, startDate: '2026-11-17' })).toBe(true)
  })

  it('nie pyta po poprawce tytułu, koloru, notatki ani gdy „To wolne” wyłączone', () => {
    expect(asksFreeAfter(base, { ...base, title: 'Urlop w górach' })).toBe(false)
    expect(asksFreeAfter(base, { ...base, color: 'rose', note: 'x' })).toBe(false)
    expect(asksFreeAfter(null, { ...base, free: false })).toBe(false)
    expect(asksFreeAfter(base, { ...base, free: false })).toBe(false)
  })
})

describe('odpowiedź „Tak” – kiedy pytanie się zamyka', () => {
  const none = { saved: true, asked: false, change: null, duringDay: null, unreadable: [] as string[] }
  it('zapis się nie udał – pytanie zostaje', () => {
    expect(freeAnswerSettled({ ...none, saved: false })).toBe(false)
  })

  it('nic nie zapisano, bo dni są nieczytelne – pytanie zostaje (komunikat był)', () => {
    expect(freeAnswerSettled({ ...none, unreadable: ['2026-11-19'] })).toBe(false)
  })

  it('zapis spotkał zmianę z innego komputera i stał się pytaniem u góry okna – pytanie „Wolne” się zamyka (bez drugiego „Tak”)', () => {
    expect(freeAnswerSettled({ ...none, saved: false, asked: true })).toBe(true)
  })

  it('zapisano część albo dziś czeka na okno albo nie ma już o co pytać – zamyka się', () => {
    expect(freeAnswerSettled({ ...none, change: { days: [] }, unreadable: ['2026-11-19'] })).toBe(true)
    expect(freeAnswerSettled({ ...none, duringDay: '2026-11-18' })).toBe(true)
    expect(freeAnswerSettled(none)).toBe(true)
  })
})

describe('Ctrl K na wydarzeniu – karta czeka na pas tygodnia, nigdy nie otwiera się później sama', () => {
  const k = ev('k1', '2026-11-18', '2026-11-19')

  it('czeka, póki wydarzenie jest i tydzień jest tygodniem jego pierwszego dnia', () => {
    expect(pendingCard('k1', '2026-11-16', [k])).toBe('k1')
    expect(pendingCard(null, '2026-11-16', [k])).toBeNull()
  })

  it('wydarzenie zniknęło, zanim policzono tydzień – nie czeka', () => {
    expect(pendingCard('k1', '2026-11-16', [])).toBeNull()
    expect(pendingCard('k1', '2026-11-16', [ev('k2', '2026-11-18')])).toBeNull()
  })

  it('tydzień zmieniony strzałkami (inny niż tydzień pierwszego dnia) – nie czeka', () => {
    expect(pendingCard('k1', '2026-11-23', [k])).toBeNull()
    expect(pendingCard('k1', '2026-11-09', [k])).toBeNull()
  })
})

describe('pas – przeciągnięcie przez kilka dni', () => {
  it('zakres od kolumny startu do kolumny pod wskaźnikiem, w obie strony', () => {
    expect(dragDates(WEEK, 2, 4)).toEqual({ startDate: '2026-11-18', endDate: '2026-11-20' })
    expect(dragDates(WEEK, 4, 2)).toEqual({ startDate: '2026-11-18', endDate: '2026-11-20' })
    expect(dragDates(WEEK, 3, 3)).toEqual({ startDate: '2026-11-19', endDate: '2026-11-19' })
  })

  it('kolumna pod wskaźnikiem z prostokątów komórek (poza siatką – najbliższa)', () => {
    const cols = [0, 1, 2].map((i) => ({ left: i * 100, right: i * 100 + 96 }))
    expect(columnAt(150, cols)).toBe(1)
    expect(columnAt(-40, cols)).toBe(0)
    expect(columnAt(500, cols)).toBe(2)
  })
})

describe('pytanie „Wolne” – słowa', () => {
  it('dni po polsku: ciąg przez „–”, osobne dni po przecinku', () => {
    expect(freeAskDays(['2026-11-18', '2026-11-19', '2026-11-20'])).toBe('śr 18.11 – pt 20.11')
    expect(freeAskDays(['2026-11-19'])).toBe('cz 19.11')
    expect(freeAskDays(['2026-11-16', '2026-11-18', '2026-11-19'])).toBe('pn 16.11, śr 18.11 – cz 19.11')
    expect(freeAskDays(['2026-12-31', '2027-01-01'])).toBe('cz 31.12 – pt 1.01')
    expect(freeAskText(['2026-11-18', '2026-11-19', '2026-11-20'])).toBe('Ustawić typ dnia „Wolne” na śr 18.11 – pt 20.11?')
  })

  it('linia po „Tak”: „na 1 dniu”, „na 3 dniach”', () => {
    expect(freeLineText(1)).toBe('Typ dnia „Wolne” na 1 dniu')
    expect(freeLineText(3)).toBe('Typ dnia „Wolne” na 3 dniach')
  })
})

describe('karta – komunikaty pod polami', () => {
  it('tytuł wymagany; „do” przed „od” – komunikat przy datach', () => {
    expect(cardProblems({ title: '  ', startDate: '2026-11-18', endDate: '2026-11-18' })).toEqual({ title: 'Wpisz tytuł wydarzenia.', dates: null })
    expect(cardProblems({ title: 'Urlop', startDate: '2026-11-20', endDate: '2026-11-18' })).toEqual({ title: null, dates: 'Data „do” nie może być przed datą „od”.' })
    expect(cardProblems({ title: 'Urlop', startDate: '2026-11-18', endDate: '2026-11-20' })).toEqual({ title: null, dates: null })
  })
})

describe('teksty pasa i miesiąca', () => {
  it('belka: pełny tytuł i daty w podpowiedzi', () => {
    expect(barTitle(ev('k', '2026-11-18', '2026-11-20', 'Konferencja'))).toBe('Konferencja · 18–20.11')
    expect(barTitle({ ...ev('w', '2026-11-18'), free: true })).toBe('w · 18.11 · wolne')
  })

  it('komórka miesiąca: pierwsze wydarzenie i „+N”, pełna lista w podpowiedzi', () => {
    expect(monthLabel([])).toBeNull()
    const m = monthLabel([ev('a', '2026-11-18', '2026-11-18', 'Konferencja'), ev('b', '2026-11-18', '2026-11-18', 'Obiad'), ev('c', '2026-11-18', '2026-11-18', 'Kino')])!
    expect([m.first.title, m.more]).toEqual(['Konferencja', 2])
    expect(m.title).toBe('Konferencja · 18.11\nObiad · 18.11\nKino · 18.11')
  })
})

describe('linie „Cofnij” w oknie (D406) – 15 minut', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAllDayLines.setState({ lines: [] })
  })
  afterEach(() => vi.useRealTimers())
  const removed = { kind: 'removed', title: 'Urlop', raw: { id: 'u1' } } as const

  it('stoi 15 minut od zapisu na stronie, na której usunięto – nie na drugiej', () => {
    const t0 = Date.now()
    showAllDayLine('today', removed, t0)
    const line = useAllDayLines.getState().lines[0]!
    expect(line.until).toBe(t0 + UNDO_LINE_MS)
    expect(linesOf(useAllDayLines.getState().lines, 'today', t0 + UNDO_LINE_MS - 1)).toHaveLength(1)
    expect(linesOf(useAllDayLines.getState().lines, 'today', t0 + UNDO_LINE_MS)).toHaveLength(0)
    expect(linesOf(useAllDayLines.getState().lines, 'week', t0)).toHaveLength(0)
    expect(allDayLineLeft(line, t0 + 60_000)).toBe(UNDO_LINE_MS - 60_000)
  })

  it('sam znika po 15 minutach; kolejne linie nie zastępują poprzednich', () => {
    showAllDayLine('week', removed)
    vi.advanceTimersByTime(5 * 60_000)
    showAllDayLine('week', { kind: 'free', change: { days: [] } })
    expect(useAllDayLines.getState().lines.map((l) => l.kind)).toEqual(['removed', 'free'])
    vi.advanceTimersByTime(10 * 60_000)
    expect(useAllDayLines.getState().lines.map((l) => l.kind)).toEqual(['free'])
    vi.advanceTimersByTime(5 * 60_000)
    expect(useAllDayLines.getState().lines).toEqual([])
  })

  it('„Cofnij” zdejmuje linię od razu (i jej czasomierz)', () => {
    const which = showAllDayLine('today', removed)
    dropAllDayLine(which)
    expect(useAllDayLines.getState().lines).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
