/**
 * Kalendarze jako grupy kategorii (SNT2, D419): lista w rd.json, kategoria należy do jednego kalendarza (domyślnie
 * „Moje”), blok trafia do kalendarza przez swoją kategorię, odznaczenie kalendarza ukrywa jego bloki i liczy je do
 * „ukryte: N”. Stare dane (bez kalendarzy) czytają się jako jeden kalendarz „Moje” ze wszystkimi kategoriami.
 */
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_NAME_MAX,
  DEFAULT_CALENDAR_ID,
  MAX_CALENDARS,
  addCalendarRaw,
  calendarOfBlock,
  calendarOfCategory,
  calendarsFrom,
  filterBlocks,
  hiddenBlockCount,
  newCalendar,
  removeCalendarRaw,
  restoreCalendarRaw,
  setCategoryCalendarRaw,
  updateCalendarRaw,
  visibleBlocks
} from '@shared/model/calendars'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'

const rdWith = (extra: Record<string, unknown>) => rdFrom({ schema: 1, ...extra })
const block = (categoryId: string) => ({ id: `b-${categoryId}`, categoryId })

describe('odczyt kalendarzy (migracja bez przepisywania)', () => {
  it('stare dane bez kalendarzy: jeden kalendarz „Moje”, wszystkie kategorie w nim', () => {
    const rd = rdFrom(undefined)
    expect(rd.calendars).toEqual([{ id: DEFAULT_CALENDAR_ID, name: 'Moje', color: CATEGORY_COLORS[0] }])
    for (const c of DEFAULT_CATEGORIES) expect(calendarOfCategory(rd, c.id)).toBe('moje')
    // rd.json z 1.0: kategorie bez pola kalendarza – nadal „Moje”, a kategoria nie dostaje pola.
    const old = rdWith({ categories: { sesja: { name: 'Sesja', color: null, archived: false } } })
    expect(calendarOfCategory(old, 'sesja')).toBe('moje')
    expect(old.categories.sesja).not.toHaveProperty('calendar')
  })

  it('kalendarz z pliku: nazwa, kolor, kolejność z tablicy; „Moje” zawsze pierwszy', () => {
    const rd = rdWith({
      calendars: [
        { id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] },
        { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }
      ]
    })
    expect(rd.calendars.map((c) => [c.id, c.name, c.color])).toEqual([
      ['moje', 'Moje', CATEGORY_COLORS[0]],
      ['praca', 'Praca', CATEGORY_COLORS[2]],
      ['dom', 'Dom', CATEGORY_COLORS[4]]
    ])
  })

  it('„Moje” można przemianować i przekolorować, ale nie znika (wpis w pliku zmienia tylko nazwę i kolor)', () => {
    const rd = rdWith({ calendars: [{ id: 'moje', name: 'Prywatne', color: CATEGORY_COLORS[3] }] })
    expect(rd.calendars).toEqual([{ id: 'moje', name: 'Prywatne', color: CATEGORY_COLORS[3] }])
    // Wpis „Moje” po innych – i tak pierwszy.
    const later = rdWith({ calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[1] }, { id: 'moje', name: 'Moje 2', color: CATEGORY_COLORS[1] }] })
    expect(later.calendars.map((c) => c.id)).toEqual(['moje', 'praca'])
  })

  it('zły wpis: bez nazwy odpada, powtórzony id – pierwszy, zły kolor – z palety, nazwa przycięta', () => {
    const rd = rdWith({
      calendars: [
        { id: 'a', name: '  Praca  ', color: 'czerwony' },
        { id: 'a', name: 'Drugi' },
        { id: 'b', name: '   ' },
        { id: '', name: 'Bez id' },
        'tekst',
        { id: 'c', name: 'x'.repeat(100), color: CATEGORY_COLORS[5] }
      ]
    })
    expect(rd.calendars.map((c) => c.id)).toEqual(['moje', 'a', 'c'])
    expect(rd.calendars[1]!.name).toBe('Praca')
    expect(CATEGORY_COLORS as readonly string[]).toContain(rd.calendars[1]!.color)
    expect(rd.calendars[2]!.name).toHaveLength(CALENDAR_NAME_MAX)
    expect(calendarsFrom('nie lista')).toEqual(rdFrom(undefined).calendars)
  })

  it('kategoria w kalendarzu: pole przy kategorii; kalendarz, którego już nie ma (usunięty na drugim komputerze) – „Moje”', () => {
    const rd = rdWith({
      calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] }],
      categories: { analiza: { name: 'Analiza', calendar: 'praca' }, nauka: { name: 'Nauka', calendar: 'zniknal' }, inne: { name: 'Inne', calendar: 7 } }
    })
    expect(calendarOfCategory(rd, 'analiza')).toBe('praca')
    expect(calendarOfCategory(rd, 'nauka')).toBe('moje')
    expect(calendarOfCategory(rd, 'inne')).toBe('moje')
    expect(calendarOfCategory(rd, 'sesja')).toBe('moje')
    // Kategoria, której nie ma w ustawieniach (usunięta): „Moje”, nigdy wyjątek.
    expect(calendarOfCategory(rd, 'nie-ma-takiej')).toBe('moje')
  })

  it('pole kalendarza przy kategorii przeżywa ponowne odczytanie (ten sam rd z drugiego odczytu)', () => {
    const rd = rdWith({ calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] }], categories: { analiza: { name: 'Analiza', calendar: 'praca' } } })
    expect(rd.categories.analiza!.calendar).toBe('praca')
  })
})

describe('blok w kalendarzu przez kategorię; ukrywanie', () => {
  const rd = rdWith({
    calendars: [
      { id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] },
      { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }
    ],
    categories: { analiza: { name: 'Analiza', calendar: 'praca' }, sesja: { name: 'Sesja', calendar: 'praca' }, sprawy: { name: 'Sprawy', calendar: 'dom' } }
  })
  const blocks = [block('analiza'), block('sprawy'), block('sesja'), block('regeneracja'), block('sprawy')]

  it('calendarOfBlock: kalendarz kategorii bloku', () => {
    expect(calendarOfBlock(rd, block('analiza'))).toBe('praca')
    expect(calendarOfBlock(rd, block('sprawy'))).toBe('dom')
    expect(calendarOfBlock(rd, block('regeneracja'))).toBe('moje')
  })

  it('odznaczony kalendarz ukrywa tylko swoje bloki, reszta zostaje w kolejności; licznik „ukryte: N”', () => {
    expect(visibleBlocks(blocks, ['praca'], rd).map((b) => b.id)).toEqual(['b-sprawy', 'b-regeneracja', 'b-sprawy'])
    expect(hiddenBlockCount(blocks, ['praca'], rd)).toBe(2)
    expect(filterBlocks(blocks, ['praca', 'dom'], rd)).toEqual({ shown: [block('regeneracja')], hiddenCount: 4 })
  })

  it('nic nie odznaczone: wszystkie bloki, ta sama tablica, licznik 0; nieznany kalendarz na liście ukrytych nie ukrywa niczego', () => {
    expect(visibleBlocks(blocks, [], rd)).toBe(blocks)
    expect(hiddenBlockCount(blocks, [], rd)).toBe(0)
    expect(filterBlocks(blocks, ['zniknal'], rd)).toEqual({ shown: blocks, hiddenCount: 0 })
  })

  it('„Moje” też można odznaczyć: ukrywa bloki kategorii bez kalendarza', () => {
    expect(visibleBlocks(blocks, ['moje'], rd).map((b) => b.id)).toEqual(['b-analiza', 'b-sprawy', 'b-sesja', 'b-sprawy'])
  })
})

describe('zmiany listy kalendarzy (rekord rd.json)', () => {
  const base = { schema: 1, categories: { analiza: { name: 'Analiza', color: null, archived: false } } }

  it('nowy kalendarz: kolor pierwszy nieużyty z palety, nazwa przycięta; dopisany na końcu listy', () => {
    const rd = rdFrom(base)
    const cal = newCalendar(rd.calendars, '  Praca  ')!
    expect(cal.name).toBe('Praca')
    expect(cal.color).toBe(CATEGORY_COLORS[1])
    const raw = addCalendarRaw(base, cal)
    expect(rdFrom(raw).calendars.map((c) => c.name)).toEqual(['Moje', 'Praca'])
    expect(newCalendar(rdFrom(raw).calendars, 'Dom')!.color).toBe(CATEGORY_COLORS[2])
    expect(newCalendar(rd.calendars, '   ')).toBeNull()
  })

  it('limit kalendarzy: dalszy nie powstaje', () => {
    let raw: Record<string, unknown> = base
    for (let i = 0; i < MAX_CALENDARS + 3; i++) {
      const cal = newCalendar(rdFrom(raw).calendars, `K${i}`)
      if (cal) raw = addCalendarRaw(raw, cal)
    }
    expect(rdFrom(raw).calendars).toHaveLength(MAX_CALENDARS)
  })

  it('zmiana nazwy i koloru; „Moje” dostaje wpis w pliku dopiero przy zmianie', () => {
    const cal = newCalendar(rdFrom(base).calendars, 'Praca')!
    let raw = addCalendarRaw(base, cal)
    raw = updateCalendarRaw(raw, cal.id, { name: 'Firma', color: CATEGORY_COLORS[6] })
    expect(rdFrom(raw).calendars[1]).toEqual({ id: cal.id, name: 'Firma', color: CATEGORY_COLORS[6] })
    expect(base).not.toHaveProperty('calendars')
    raw = updateCalendarRaw(raw, 'moje', { name: 'Prywatne' })
    expect(rdFrom(raw).calendars.map((c) => c.name)).toEqual(['Prywatne', 'Firma'])
  })

  it('kategoria przechodzi do kalendarza; do „Moje” – pole znika, nic poza nią się nie zmienia', () => {
    const cal = newCalendar(rdFrom(base).calendars, 'Praca')!
    let raw = setCategoryCalendarRaw(addCalendarRaw(base, cal), 'analiza', cal.id)
    expect(calendarOfCategory(rdFrom(raw), 'analiza')).toBe(cal.id)
    expect((raw.categories as Record<string, Record<string, unknown>>).analiza).toEqual({ name: 'Analiza', color: null, archived: false, calendar: cal.id })
    raw = setCategoryCalendarRaw(raw, 'analiza', 'moje')
    expect((raw.categories as Record<string, Record<string, unknown>>).analiza).toEqual({ name: 'Analiza', color: null, archived: false })
    // Kategoria domyślna, której plik jeszcze nie zna: wpis powstaje z samym kalendarzem, nazwa zostaje domyślna.
    const fresh = setCategoryCalendarRaw(addCalendarRaw({ schema: 1 }, cal), 'sesja', cal.id)
    expect(calendarOfCategory(rdFrom(fresh), 'sesja')).toBe(cal.id)
    expect(rdFrom(fresh).categories.sesja!.name).toBe('Sesja tradingowa')
  })

  it('usunięcie kalendarza przenosi jego kategorie do „Moje” i zostawia cudze', () => {
    const a = newCalendar(rdFrom(base).calendars, 'Praca')!
    let raw = addCalendarRaw(base, a)
    const b = newCalendar(rdFrom(raw).calendars, 'Dom')!
    raw = addCalendarRaw(raw, b)
    raw = setCategoryCalendarRaw(setCategoryCalendarRaw(setCategoryCalendarRaw(raw, 'analiza', a.id), 'sesja', a.id), 'sprawy', b.id)
    const after = removeCalendarRaw(raw, a.id)
    const rd = rdFrom(after)
    expect(rd.calendars.map((c) => c.id)).toEqual(['moje', b.id])
    expect(calendarOfCategory(rd, 'analiza')).toBe('moje')
    expect(calendarOfCategory(rd, 'sesja')).toBe('moje')
    expect(calendarOfCategory(rd, 'sprawy')).toBe(b.id)
    // Nie zostaje pole wskazujące na nieistniejący kalendarz.
    for (const m of Object.values(after.categories as Record<string, Record<string, unknown>>)) expect(m.calendar).not.toBe(a.id)
  })

  it('„Moje” nie da się usunąć', () => {
    const raw = addCalendarRaw(base, newCalendar(rdFrom(base).calendars, 'Praca')!)
    expect(removeCalendarRaw(raw, 'moje')).toEqual(raw)
    expect(rdFrom(removeCalendarRaw(raw, 'moje')).calendars.map((c) => c.id)).toContain('moje')
  })

  it('„Cofnij” usunięcia przywraca kalendarz na jego miejsce i jego kategorie', () => {
    const a = newCalendar(rdFrom(base).calendars, 'Praca')!
    let raw = addCalendarRaw(base, a)
    const b = newCalendar(rdFrom(raw).calendars, 'Dom')!
    raw = addCalendarRaw(raw, b)
    raw = setCategoryCalendarRaw(setCategoryCalendarRaw(raw, 'analiza', a.id), 'sesja', a.id)
    const removed = removeCalendarRaw(raw, a.id)
    const back = restoreCalendarRaw(removed, { id: a.id, name: a.name, color: a.color }, 0, ['analiza', 'sesja'])
    expect(rdFrom(back).calendars.map((c) => c.id)).toEqual(['moje', a.id, b.id])
    expect(calendarOfCategory(rdFrom(back), 'analiza')).toBe(a.id)
    expect(calendarOfCategory(rdFrom(back), 'sesja')).toBe(a.id)
  })

  it('pola, których ta wersja nie zna, zostają przy kalendarzu i kategorii po zmianie (starsza i nowsza wersja na jednym folderze)', () => {
    const raw = {
      schema: 1,
      futureTop: { x: 1 },
      calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2], przyszle: 'tak' }],
      categories: { analiza: { name: 'Analiza', calendar: 'praca', przyszle: 5 } }
    }
    const out = updateCalendarRaw(setCategoryCalendarRaw(raw, 'analiza', 'moje'), 'praca', { name: 'Firma' })
    expect(out.futureTop).toEqual({ x: 1 })
    expect((out.calendars as Array<Record<string, unknown>>)[0]).toEqual({ id: 'praca', name: 'Firma', color: CATEGORY_COLORS[2], przyszle: 'tak' })
    expect((out.categories as Record<string, Record<string, unknown>>).analiza!.przyszle).toBe(5)
  })
})
