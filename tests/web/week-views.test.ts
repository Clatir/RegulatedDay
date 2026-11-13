// @vitest-environment jsdom
/**
 * The views of „Tydzień” (SNT1, D417, D418, D422): the switch and what the computer remembers of it (T936), the title of „3 dni”,
 * where a block dragged over the columns would land (D305 in many columns, a day gone by refused), the lines of „Agenda”, and
 * what a day of the month shows – the bars, „+N”, the dot of the load with its sentence.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agendaOf, type MonthDay } from '@shared/engine/calendarViews'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { emptyMonthDay, loadTitle, monthCellView } from '@renderer/features/calendar/monthCellView'
import { THREE_DAYS_PPM, WEEK_PPM, axisHeight, axisY, blockSpan } from '@renderer/features/week/weekLayout'
import { AGENDA_EMPTY, agendaHeading, agendaRow, dropOn, dropStart, dropStays, lastWeekMode, parseWeekMode, rememberWeekMode, sameDrop, threeDaysTitle, WEEK_MODES } from '@renderer/features/week/weekViews'

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const named = (categoryId: string) => ({ categoryId, variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null })
const block = (id: string, startMin: number, endMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named: named('inne'), categoryId: 'inne', startMin, endMin, state: 'planned', outsidePlan: false, background: false, ...o })
const day = (date: string, blocks: HorizonBlock[], o: Partial<HorizonDay> = {}): HorizonDay => ({
  date,
  when: 'future',
  read: 'full',
  dayType: 'roboczy',
  templateId: null,
  frozen: false,
  blocks,
  wakeMin: null,
  bedtimeMin: null,
  boundary: null,
  extensionMin: 0,
  regen: null,
  studyMin: 0,
  sessions: { clean: 0, extended: 0, outsidePlan: 0 },
  energy: null,
  budget: null,
  ...o
})
const event = (id: string, title: string, startDate: string, endDate = startDate): AllDayEvent => ({ ...allDayDraft(id, startDate, endDate), title })

describe('przełącznik widoków (T936)', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  it('trzy widoki po kolei: Tydzień, 3 dni, Agenda', () => {
    expect(WEEK_MODES.map((m) => m.label)).toEqual(['Tydzień', '3 dni', 'Agenda'])
  })
  it('nieznana albo brakująca wartość – Tydzień', () => {
    expect(parseWeekMode(null)).toBe('week')
    expect(parseWeekMode('')).toBe('week')
    expect(parseWeekMode('miesiac')).toBe('week')
    expect(parseWeekMode('3days')).toBe('3days')
    expect(parseWeekMode('agenda')).toBe('agenda')
  })
  it('zapamiętany na tym komputerze', () => {
    expect(lastWeekMode()).toBe('week')
    rememberWeekMode('3days')
    expect(lastWeekMode()).toBe('3days')
    rememberWeekMode('agenda')
    expect(lastWeekMode()).toBe('agenda')
  })
  it('pamięć, której nie da się czytać ani pisać, nie jest błędem', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('brak pamięci')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('brak pamięci')
    })
    expect(lastWeekMode()).toBe('week')
    expect(() => rememberWeekMode('agenda')).not.toThrow()
  })
})

describe('skala „3 dni” i „Tygodnia” (D417)', () => {
  it('3 dni są większe niż tydzień; bez skali – jak dotąd', () => {
    expect(THREE_DAYS_PPM).toBeGreaterThan(WEEK_PPM)
    expect(axisHeight(360, 1320)).toBe(Math.round(960 * WEEK_PPM))
    expect(axisHeight(360, 1320, THREE_DAYS_PPM)).toBe(Math.round(960 * THREE_DAYS_PPM))
    expect(axisY(420, 360)).toBe(48)
    expect(axisY(420, 360, THREE_DAYS_PPM)).toBe(72)
    expect(blockSpan({ startMin: 420, endMin: 480 }, 360, THREE_DAYS_PPM)).toEqual({ top: 72, height: 71 })
  })
  it('tytuł: trzy dni od–do, rok na końcu (na przełomie lat przy obu końcach)', () => {
    expect(threeDaysTitle(['2026-11-17', '2026-11-18', '2026-11-19'])).toBe('wt 17.11 – cz 19.11.2026')
    expect(threeDaysTitle(['2026-12-31', '2027-01-01', '2027-01-02'])).toBe('cz 31.12.2026 – sb 2.01.2027')
    expect(threeDaysTitle([])).toBe('')
  })
})

describe('gdzie spadnie przeciągany blok (D305, D417)', () => {
  const o = { colTop: 100, grabPx: 10, ppm: 0.8, lo: 360, hi: 1320, durationMin: 60 }
  it('od wskaźnika bez miejsca chwytu, krok 5 min', () => {
    // 80 px below the top of the block as it was grabbed: 100 minutes under the axis top.
    expect(dropStart({ ...o, pointerY: 100 + 10 + 80 })).toBe(460)
    expect(dropStart({ ...o, pointerY: 100 + 10 + 81 })).toBe(460)
    expect(dropStart({ ...o, pointerY: 100 + 10 + 83 })).toBe(465)
  })
  it('nigdy przed osią ani z końcem za nią', () => {
    expect(dropStart({ ...o, pointerY: 0 })).toBe(360)
    expect(dropStart({ ...o, pointerY: 5000 })).toBe(1260)
    // The block longer than the axis stays at its top.
    expect(dropStart({ ...o, pointerY: 5000, durationMin: 2000 })).toBe(360)
  })
  it('koniec na osi także dla długości spoza kroku', () => {
    expect(dropStart({ ...o, pointerY: 5000, durationMin: 62 })).toBe(1255)
  })
  it('skala 3 dni: ta sama godzina przy innej wysokości', () => {
    expect(dropStart({ ...o, ppm: THREE_DAYS_PPM, pointerY: 100 + 10 + 120 })).toBe(460)
  })
  it('dzień minął – odmowa; dziś i dni przyszłe – dozwolone (D417)', () => {
    expect(dropOn(0, 600, '2026-11-18', '2026-11-17', '2026-11-18').denied).toBe(true)
    expect(dropOn(1, 600, '2026-11-18', '2026-11-18', '2026-11-18').denied).toBe(false)
    expect(dropOn(2, 600, '2026-11-18', '2026-11-19', '2026-11-18').denied).toBe(false)
    // Never from a day gone by either.
    expect(dropOn(2, 600, '2026-11-17', '2026-11-19', '2026-11-18').denied).toBe(true)
    // No today known (the data not read): nothing is allowed.
    expect(dropOn(2, 600, '2026-11-18', '2026-11-19', '').denied).toBe(true)
  })
  it('to samo upuszczenie nie rysuje się od nowa; ta sama kolumna i godzina nic nie zmienia', () => {
    expect(sameDrop(dropOn(1, 600, 'a', 'a', ''), dropOn(1, 600, 'a', 'a', ''))).toBe(true)
    expect(sameDrop(dropOn(1, 600, '2026-11-18', '2026-11-18', '2026-11-18'), dropOn(1, 605, '2026-11-18', '2026-11-18', '2026-11-18'))).toBe(false)
    expect(sameDrop(null, null)).toBe(true)
    expect(sameDrop(null, dropOn(0, 600, 'a', 'a', ''))).toBe(false)
    expect(dropStays('2026-11-18', '2026-11-18', 600, 600)).toBe(true)
    expect(dropStays('2026-11-18', '2026-11-19', 600, 600)).toBe(false)
    expect(dropStays('2026-11-18', '2026-11-18', 600, 605)).toBe(false)
  })
})

describe('„Agenda” (D418)', () => {
  it('nagłówek dnia: dziś i jutro z nazwą, dalej sam dzień', () => {
    expect(agendaHeading('2026-11-18', '2026-11-18')).toBe('Dziś · środa 18.11')
    expect(agendaHeading('2026-11-19', '2026-11-18')).toBe('Jutro · czwartek 19.11')
    expect(agendaHeading('2026-11-20', '2026-11-18')).toBe('piątek 20.11')
  })
  it('wiersz bloku: nazwa, długość, kategoria; poza planem z plusem', () => {
    const [d] = agendaOf([day('2026-11-18', [block('a', 600, 690, { categoryId: 'nauka', named: named('nauka') }), block('b', 700, 720, { outsidePlan: true })])], [])
    expect(agendaRow(d!.blocks[0]!, names)).toEqual({ name: 'Nauka (NotebookLM)', length: '1 h 30 min', category: 'Nauka (NotebookLM)' })
    expect(agendaRow(d!.blocks[1]!, names).name).toBe('+ Inne obowiązki')
  })
  it('dzień bez niczego jest jedną linią „nic”', () => {
    expect(AGENDA_EMPTY).toBe('nic')
    const [d] = agendaOf([day('2026-11-18', [])], [])
    expect(d!.blocks).toEqual([])
    expect(d!.allDay).toEqual([])
  })
})

describe('komórka miesiąca (D418, D422)', () => {
  const m = (blocks: HorizonBlock[], o: Partial<MonthDay> = {}): MonthDay => ({
    date: '2026-11-18',
    when: 'future',
    read: 'full',
    dayType: 'roboczy',
    fixed: blocks.filter((b) => b.fixed),
    blockCount: blocks.length,
    load: 'low',
    workMin: 310,
    limitMin: 360,
    ...o
  })
  it('do trzech pasków: najpierw wydarzenia całodniowe, potem stałe bloki; reszta jako „+N”', () => {
    const fixed = [1, 2, 3].map((i) => block(`f${i}`, 600 + i * 60, 660 + i * 60, { fixed: true }))
    const flexible = block('x', 900, 930)
    const v = monthCellView(m([...fixed, flexible]), [event('e1', 'Konferencja', '2026-11-18')], names, 1)
    expect(v.bars.map((b) => b.label)).toEqual(['Konferencja', 'Inne obowiązki', 'Inne obowiązki'])
    expect(v.bars[0]!.key).toBe('allday-e1')
    // One event + four blocks, two blocks have no bar: „+N” counts them all (D422).
    expect(v.more).toBe(2)
  })
  it('dzień bez pasków i bez „+N”', () => {
    const v = monthCellView(m([]), [], names, 1)
    expect(v.bars).toEqual([])
    expect(v.more).toBe(0)
  })
  it('elastyczne bloki i sesje to „+N”, nie paski', () => {
    const v = monthCellView(m([block('a', 600, 660), block('b', 700, 760, { session: true })]), [], names, 1)
    expect(v.bars).toEqual([])
    expect(v.more).toBe(2)
  })
  it('kropka obciążenia ma zdanie z pracą i budżetem; bez obciążenia – bez kropki', () => {
    expect(monthCellView(m([]), [], names, 1).load).toEqual({ level: 'low', title: 'Praca 5 h 10 min z 6 h' })
    expect(loadTitle(0, 480)).toBe('Praca 0 min z 8 h')
    expect(monthCellView(m([], { load: null, workMin: null, limitMin: null }), [], names, 1).load).toBeNull()
    expect(monthCellView(m([], { load: 'high', workMin: 500, limitMin: 360 }), [], names, 1).load?.level).toBe('high')
  })
  it('dzień sąsiedniego miesiąca (niepoliczony) – tylko wydarzenia całodniowe', () => {
    const v = monthCellView(emptyMonthDay('2026-12-01'), [event('e1', 'A', '2026-12-01'), event('e2', 'B', '2026-12-01'), event('e3', 'C', '2026-12-01'), event('e4', 'D', '2026-12-01')], names, 1)
    expect(v.bars.map((b) => b.label)).toEqual(['A', 'B', 'C'])
    expect(v.more).toBe(1)
    expect(v.load).toBeNull()
  })
})
