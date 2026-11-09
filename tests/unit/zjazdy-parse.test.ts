/**
 * Reading the schedule of „zjazdy” from the text of a PDF (D357, 1.1.0): the dates („DD.MM.RRRR (sobota)”), the rows
 * „H:MM-HH:MM <sala> <forma> <przedmiot> <prowadzący>” in columns told by the header row, the kind of a day (TEAMS –
 * remote; a room in the building on any row – stationary), and warnings for what could not be read. The text items here
 * are made up in the layout of the real schedule (centred cells, items not in reading order, a lecturer on two lines,
 * a day across two pages); no names nor subjects of the real file.
 */
import { describe, expect, it } from 'vitest'
import { classTitle, isRemoteRoom, parseZjazdy, subjectMax, zjazdDayFrom, zjazdKindOf, type PdfTextItem } from '@shared/import/zjazdy'
import { BLOCK_NAME_MAX, planBlockFrom } from '@shared/model/plan'

/** The centres of the columns of the schedule (x, points). */
const COL = { time: 92, room: 160, form: 232, subject: 372, teacher: 595, notes: 752 } as const
type Col = keyof typeof COL

const cell = (page: number, y: number, col: Col | number, str: string): PdfTextItem => {
  const w = str.length * 4.8
  const cx = typeof col === 'number' ? col : COL[col]
  return { str, x: cx - w / 2, y, w, h: 11, page }
}
/** What pdfjs gives besides the text: blank items between the cells and empty ones at the ends of lines. */
const noise = (page: number, y: number): PdfTextItem[] => [
  { str: '', x: 60, y, w: 0, h: 0, page },
  { str: ' ', x: 120, y, w: 30, h: 0, page }
]
const header = (page: number, y: number): PdfTextItem[] => [
  cell(page, y, 'time', 'Godziny'),
  cell(page, y, 'room', 'Sala'),
  cell(page, y, 'form', 'Forma zajęć'),
  cell(page, y, 'subject', 'Przedmiot'),
  cell(page, y, 'teacher', 'Prowadzący'),
  cell(page, y, 'notes', 'Uwagi')
]
const date = (page: number, y: number, text: string): PdfTextItem[] => [cell(page, y, 421, text)]
const row = (page: number, y: number, time: string, room: string, form: string, subject: string, teacher = 'dr Jan Testowy'): PdfTextItem[] =>
  [cell(page, y, 'time', time), room && cell(page, y, 'room', room), form && cell(page, y, 'form', form), subject && cell(page, y, 'subject', subject), teacher && cell(page, y, 'teacher', teacher), ...noise(page, y)].filter(
    (x): x is PdfTextItem => !!x
  )

const m = (hhmm: string) => {
  const [h, mm] = hhmm.split(':').map(Number)
  return h! * 60 + mm!
}

describe('odczyt harmonogramu zjazdów (D357)', () => {
  it('dzień zdalny: wiersze z salą TEAMS, godziny, forma i przedmiot; tytuł strony pominięty', () => {
    const items = [
      cell(1, 529, 421, 'HARMONOGRAM ZAJĘĆ'),
      cell(1, 513, 421, 'semestr zimowy rok akademicki 2030/2031'),
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'),
      ...row(1, 402, '9:45-11:15', 'TEAMS', 'wykład', 'Statystyka opisowa')
    ]
    const r = parseZjazdy(items)
    expect(r.warnings).toEqual([])
    expect(r.days).toEqual([
      {
        date: '2030-10-12',
        kind: 'zdalny',
        classes: [
          { startMin: m('8:00'), endMin: m('9:30'), room: 'TEAMS', form: 'wykład', subject: 'Ekonomia' },
          { startMin: m('9:45'), endMin: m('11:15'), room: 'TEAMS', form: 'wykład', subject: 'Statystyka opisowa' }
        ]
      }
    ])
  })

  it('dzień stacjonarny i mieszany: choć jedna sala w budynku – stacjonarny; sala zostaje przy wierszu', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '9:45-11:15', '19H', 'ćwiczenia', 'Ekonomia'),
      ...date(1, 386, '13.10.2030 (niedziela)'),
      ...header(1, 370),
      ...row(1, 354, '8:00-9:30', 'TEAMS', 'wykład', 'Prawo gospodarcze'),
      ...row(1, 338, '11:30-13:00', '210H', 'ćw. komp.', 'Technologie informacyjne')
    ]
    const r = parseZjazdy(items)
    expect(r.warnings).toEqual([])
    expect(r.days.map((d) => [d.date, d.kind])).toEqual([
      ['2030-10-12', 'stacjonarny'],
      ['2030-10-13', 'stacjonarny']
    ])
    expect(r.days[1]!.classes.map((c) => c.room)).toEqual(['TEAMS', '210H'])
    expect(r.days[1]!.classes[1]!.form).toBe('ćw. komp.')
  })

  it('wiersz bez formy (wydarzenie): forma pusta, nazwa bloku to sam przedmiot', () => {
    const r = parseZjazdy([...date(1, 450, '12.10.2030 (sobota)'), ...header(1, 434), ...row(1, 418, '9:00-12:30', 'TEAMS', '', 'Dzień adaptacyjny', '')])
    expect(r.warnings).toEqual([])
    expect(r.days[0]!.classes).toEqual([{ startMin: m('9:00'), endMin: m('12:30'), room: 'TEAMS', form: '', subject: 'Dzień adaptacyjny' }])
    expect(classTitle(r.days[0]!.classes[0]!)).toBe('Dzień adaptacyjny')
  })

  it('prowadzący i przedmiot w dwóch linijkach komórki (nad i pod linią godzin): bez ostrzeżeń, przedmiot sklejony', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      // The cell is two lines high: the time sits in its middle, the lecturer and the subject above and below it.
      cell(1, 424, 'teacher', 'prof. dr hab. Jan Przykładowy,'),
      cell(1, 424, 'subject', 'Zarządzanie'),
      ...row(1, 418, '9:45-11:15', '12B', 'ćwiczenia', '', ''),
      cell(1, 412, 'teacher', 'prof. UXX'),
      cell(1, 412, 'subject', 'przestrzenią miejską'),
      ...row(1, 396, '11:30-13:00', '12B', 'ćwiczenia', 'Ekonomia', 'dr Anna Zmyślona,'),
      cell(1, 386, 'teacher', 'prof. UXX')
    ]
    const r = parseZjazdy(items)
    expect(r.warnings).toEqual([])
    expect(r.days[0]!.classes.map((c) => c.subject)).toEqual(['Zarządzanie przestrzenią miejską', 'Ekonomia'])
  })

  it('dzień na granicy stron: data i nagłówek na dole strony, wiersze na następnej (z tytułem nad nimi)', () => {
    const items = [
      ...date(1, 100, '19.10.2030 (sobota)'),
      ...header(1, 84),
      cell(2, 560, 421, 'HARMONOGRAM ZAJĘĆ'),
      ...header(2, 529),
      ...row(2, 513, '8:00-9:30', '7B', 'ćwiczenia', 'Ekonomia'),
      ...row(2, 497, '9:45-11:15', '7B', 'ćwiczenia', 'Ekonomia'),
      ...date(2, 465, '20.10.2030 (niedziela)'),
      ...header(2, 449),
      ...row(2, 433, '8:00-9:30', 'TEAMS', 'wykład', 'Finanse')
    ]
    const r = parseZjazdy(items)
    expect(r.warnings).toEqual([])
    expect(r.days.map((d) => [d.date, d.kind, d.classes.length])).toEqual([
      ['2030-10-19', 'stacjonarny', 2],
      ['2030-10-20', 'zdalny', 1]
    ])
  })

  it('kolejność elementów w pliku nie ma znaczenia (daty bywają na końcu strumienia)', () => {
    const items = [...date(1, 450, '12.10.2030 (sobota)'), ...header(1, 434), ...row(1, 418, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'), ...row(1, 402, '9:45-11:15', '19H', 'ćwiczenia', 'Prawo')]
    const shuffled = [...items.slice(6), ...items.slice(0, 6)].reverse()
    expect(parseZjazdy(shuffled)).toEqual(parseZjazdy(items))
  })

  it('wiersz nierozpoznany w dniu i linia bez godzin daleko od wierszy: ostrzeżenia, reszta dnia zostaje', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'),
      ...row(1, 402, 'ok. 10:00', 'TEAMS', 'wykład', 'Konsultacje'),
      ...row(1, 386, '11:30-13:00', 'TEAMS', 'wykład', 'Prawo'),
      // A line without hours, as far from the rows as a row is: not a part of a cell.
      cell(1, 370, 'subject', 'Zajęcia przeniesione'),
      ...row(1, 354, '13:15-14:45', 'TEAMS', 'wykład', 'Finanse')
    ]
    const r = parseZjazdy(items)
    expect(r.days[0]!.classes.map((c) => c.subject)).toEqual(['Ekonomia', 'Prawo', 'Finanse'])
    expect(r.warnings.map((w) => [w.kind, w.date, w.page])).toEqual([
      ['row', '2030-10-12', 1],
      ['row', '2030-10-12', 1]
    ])
    expect(r.warnings[0]!.text).toContain('ok. 10:00')
    expect(r.warnings[1]!.text).toBe('Zajęcia przeniesione')
    expect(r.warnings[0]!.message).toMatch(/nierozpoznany/)
  })

  it('godziny odwrócone: wiersz pominięty z ostrzeżeniem; nakładające się zajęcia – ostrzeżenie, oba zostają', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '13:00-11:30', 'TEAMS', 'wykład', 'Ekonomia'),
      ...row(1, 402, '8:00-9:30', 'TEAMS', 'wykład', 'Prawo'),
      ...row(1, 386, '9:00-10:30', 'TEAMS', 'wykład', 'Finanse')
    ]
    const r = parseZjazdy(items)
    expect(r.days[0]!.classes.map((c) => c.subject)).toEqual(['Prawo', 'Finanse'])
    expect(r.warnings.map((w) => w.kind)).toEqual(['reversed', 'overlap'])
    expect(r.warnings[1]!.date).toBe('2030-10-12')
  })

  it('dzień tygodnia niezgodny z datą: ostrzeżenie (data z pliku zostaje); wiersz przed pierwszą datą: ostrzeżenie', () => {
    const items = [...header(1, 466), ...row(1, 450, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'), ...date(1, 418, '12.10.2030 (niedziela)'), ...header(1, 402), ...row(1, 386, '8:00-9:30', 'TEAMS', 'wykład', 'Prawo')]
    const r = parseZjazdy(items)
    expect(r.days.map((d) => d.date)).toEqual(['2030-10-12'])
    expect(r.warnings.map((w) => w.kind)).toEqual(['noDate', 'weekday'])
  })

  it('ta sama data drugi raz (powtórzona na następnej stronie): jeden dzień; dzień bez zajęć – ostrzeżenie, bez dnia', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'),
      ...date(2, 529, '12.10.2030 (sobota)'),
      ...header(2, 513),
      ...row(2, 497, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'),
      ...row(2, 481, '9:45-11:15', 'TEAMS', 'wykład', 'Prawo'),
      ...date(2, 449, '13.10.2030 (niedziela)'),
      ...header(2, 433)
    ]
    const r = parseZjazdy(items)
    expect(r.days.map((d) => [d.date, d.classes.length])).toEqual([['2030-10-12', 2]])
    expect(r.warnings.map((w) => [w.kind, w.date])).toEqual([['empty', '2030-10-13']])
  })

  it('data, której nie ma (31.02): ostrzeżenie, a wiersze pod nią nie trafiają do poprzedniego dnia – każdy z ostrzeżeniem', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia'),
      ...date(1, 386, '31.02.2030 (sobota)'),
      ...header(1, 370),
      ...row(1, 354, '8:00-9:30', '12B', 'wykład', 'Prawo'),
      ...row(1, 338, '9:45-11:15', '12B', 'wykład', 'Finanse'),
      ...date(1, 306, '13.10.2030 (niedziela)'),
      ...header(1, 290),
      ...row(1, 274, '8:00-9:30', 'TEAMS', 'wykład', 'Statystyka')
    ]
    const r = parseZjazdy(items)
    expect(r.days.map((d) => [d.date, d.classes.map((c) => c.subject)])).toEqual([
      ['2030-10-12', ['Ekonomia']],
      ['2030-10-13', ['Statystyka']]
    ])
    expect(r.warnings.map((w) => [w.kind, w.date])).toEqual([
      ['row', null],
      ['noDate', null],
      ['noDate', null]
    ])
    expect(r.warnings[1]!.message).toContain('31.02.2030')
  })

  it('data w komórce „Uwagi” (druga linijka komórki) to treść wiersza, nie nowy dzień; sama data w kolumnie poza wierszem – ostrzeżenie', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '8:00-9:30', '12B', 'wykład', 'Ekonomia'),
      cell(1, 418, 'notes', 'odrobienie'),
      cell(1, 408, 'notes', '19.10.2030'),
      ...row(1, 392, '9:45-11:15', '12B', 'wykład', 'Prawo'),
      // A date alone in the column of the lecturers, as far from the rows as a row is.
      cell(1, 376, 'teacher', '26.10.2030 (sobota)'),
      ...row(1, 360, '11:30-13:00', '12B', 'wykład', 'Finanse')
    ]
    const r = parseZjazdy(items)
    expect(r.days.map((d) => [d.date, d.classes.map((c) => c.subject)])).toEqual([['2030-10-12', ['Ekonomia', 'Prawo', 'Finanse']]])
    expect(r.warnings.map((w) => [w.kind, w.text])).toEqual([['row', '26.10.2030 (sobota)']])
  })

  it('nakładanie sprawdzane każdy z każdym: długie zajęcia z dwoma krótkimi w środku – dwa ostrzeżenia', () => {
    const items = [
      ...date(1, 450, '12.10.2030 (sobota)'),
      ...header(1, 434),
      ...row(1, 418, '8:00-12:00', 'TEAMS', 'wykład', 'Ekonomia'),
      ...row(1, 402, '9:00-9:30', 'TEAMS', 'wykład', 'Prawo'),
      ...row(1, 386, '10:00-11:00', 'TEAMS', 'wykład', 'Finanse')
    ]
    const r = parseZjazdy(items)
    expect(r.warnings.map((w) => [w.kind, w.text])).toEqual([
      ['overlap', '08:00–12:00 i 09:00–09:30'],
      ['overlap', '08:00–12:00 i 10:00–11:00']
    ])
  })

  it('ponad 30 zajęć w dniu: ostrzeżenie (zostaje pierwsze 30), nie ciche obcięcie', () => {
    const rows = Array.from({ length: 32 }, (_, i) => row(1, 418 - i * 12, `${8 + Math.floor(i / 4)}:${String((i % 4) * 15).padStart(2, '0')}-${8 + Math.floor(i / 4)}:${String((i % 4) * 15 + 10).padStart(2, '0')}`, 'TEAMS', 'wykład', `Przedmiot ${i}`, ''))
    const r = parseZjazdy([...date(1, 450, '12.10.2030 (sobota)'), ...header(1, 434), ...rows.flat()])
    expect(r.days[0]!.classes.length).toBe(30)
    expect(r.warnings.map((w) => w.kind)).toEqual(['tooMany'])
    expect(r.warnings[0]!.message).toMatch(/32/)
  })

  it('bez dat – pusta lista dni (komunikat o braku dat daje proces główny)', () => {
    expect(parseZjazdy([cell(1, 500, 300, 'Faktura nr 12/2030'), cell(1, 480, 300, '8:00-9:30')]).days).toEqual([])
    expect(parseZjazdy([]).days).toEqual([])
  })

  it('bez wiersza nagłówków: kolumny jak w harmonogramie uczelni', () => {
    const r = parseZjazdy([...date(1, 450, '12.10.2030 (sobota)'), ...row(1, 418, '8:00-9:30', '19H', 'wykład', 'Ekonomia')])
    expect(r.days[0]!.classes).toEqual([{ startMin: m('8:00'), endMin: m('9:30'), room: '19H', form: 'wykład', subject: 'Ekonomia' }])
  })
})

describe('dzień zjazdu z okna (poprawiony w podglądzie)', () => {
  it('rodzaj dnia i sala', () => {
    expect(isRemoteRoom('TEAMS')).toBe(true)
    expect(isRemoteRoom(' ms teams ')).toBe(true)
    expect(isRemoteRoom('19H')).toBe(false)
    expect(isRemoteRoom('')).toBe(false)
    const c = (room: string) => ({ startMin: 480, endMin: 570, room, form: '', subject: 'X' })
    expect(zjazdKindOf([c('TEAMS'), c('TEAMS')])).toBe('zdalny')
    expect(zjazdKindOf([c('TEAMS'), c('12B')])).toBe('stacjonarny')
  })

  it('nazwa bloku razem z formą mieści się w nazwie bloku: długi przedmiot ucięty z „…”, forma zostaje cała', () => {
    const form = 'ćwiczenia laboratoryjne'
    const t = classTitle({ form, subject: 'Bardzo długi przedmiot '.repeat(10) })
    expect(t.length).toBeLessThanOrEqual(BLOCK_NAME_MAX)
    expect(t.endsWith(`… · ${form}`)).toBe(true)
    // Read as a day's file reads a block's name: nothing more is cut off.
    expect(planBlockFrom({ id: 'k', categoryId: 'inne', startMin: 600, durationMin: 30, name: t })!.name).toBe(t)
    expect(subjectMax(form)).toBe(BLOCK_NAME_MAX - form.length - 3)
    expect(subjectMax('')).toBe(BLOCK_NAME_MAX)
  })

  it('koniec „4:00” to koniec dnia logicznego (1680), nie jego początek', () => {
    const r = parseZjazdy([...date(1, 450, '12.10.2030 (sobota)'), ...header(1, 434), ...row(1, 418, '22:00-4:00', 'TEAMS', 'wykład', 'Nocne')])
    expect(r.warnings).toEqual([])
    expect(r.days[0]!.classes[0]).toMatchObject({ startMin: 22 * 60, endMin: 1680 })
  })

  it('nazwa bloku: „<przedmiot> · <forma>”', () => {
    expect(classTitle({ form: 'ćwiczenia', subject: 'Ekonomia' })).toBe('Ekonomia · ćwiczenia')
    expect(classTitle({ form: 'wykład', subject: '' })).toBe('wykład')
    expect(classTitle({ form: '  ', subject: ' Prawo  karne ' })).toBe('Prawo karne')
  })

  it('sprawdzenie dnia przysłanego z okna: zła data, odwrócone albo spoza dnia godziny, za długie teksty', () => {
    const ok = { date: '2030-10-12', kind: 'zdalny', classes: [{ startMin: 600, endMin: 690, room: 'TEAMS', form: 'wykład', subject: 'Ekonomia' }] }
    expect(zjazdDayFrom(ok)).toEqual(ok)
    expect(zjazdDayFrom({ ...ok, date: '2030-02-30' })).toBeNull()
    expect(zjazdDayFrom({ ...ok, kind: 'inny' })).toBeNull()
    expect(zjazdDayFrom({ ...ok, classes: [] })).toBeNull()
    expect(zjazdDayFrom({ ...ok, classes: [{ ...ok.classes[0], endMin: 600 }] })).toBeNull()
    expect(zjazdDayFrom({ ...ok, classes: [{ ...ok.classes[0], startMin: 100 }] })).toBeNull()
    const long = zjazdDayFrom({ ...ok, classes: [{ ...ok.classes[0], subject: 'x'.repeat(500), room: 7 }] })!
    expect(long.classes[0]!.subject.length).toBeLessThanOrEqual(120)
    expect(long.classes[0]!.room).toBe('')
    // Sorted by start, whatever order the window sent.
    const two = zjazdDayFrom({ ...ok, classes: [{ ...ok.classes[0], startMin: 800, endMin: 890 }, ok.classes[0]] })!
    expect(two.classes.map((c) => c.startMin)).toEqual([600, 800])
  })
})
