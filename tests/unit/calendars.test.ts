/**
 * Kalendarze jako grupy kategorii (SNT2, D419): lista w rd.json, kategoria należy do jednego kalendarza (domyślnie
 * „Moje”), blok trafia do kalendarza przez swoją kategorię, odznaczenie kalendarza ukrywa jego bloki i liczy je do
 * „ukryte: N”. Stare dane (bez kalendarzy) czytają się jako jeden kalendarz „Moje” ze wszystkimi kategoriami.
 */
import { describe, expect, it } from 'vitest'
import { deepEqual, editStands, inverseEdit, recordEdit, setAt, valueAt } from '@shared/data/merge'
import {
  CALENDAR_NAME_MAX,
  DEFAULT_CALENDAR_ID,
  MAX_CALENDARS,
  addCalendarRaw,
  calendarOfBlock,
  calendarOfCategory,
  calendarOfEvent,
  calendarsFrom,
  filterAllDay,
  filterBlocks,
  newCalendar,
  removeCalendarRaw,
  setCategoryCalendarRaw,
  updateCalendarRaw
} from '@shared/model/calendars'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'

const rdWith = (extra: Record<string, unknown>) => rdFrom({ schema: 1, ...extra })
const block = (categoryId: string) => ({ id: `b-${categoryId}`, categoryId })

describe('odczyt kalendarzy (migracja bez przepisywania)', () => {
  it('stare dane bez kalendarzy: jeden kalendarz „Moje”, wszystkie kategorie w nim', () => {
    const rd = rdFrom(undefined)
    expect(rd.calendars).toEqual([{ id: DEFAULT_CALENDAR_ID, name: 'Moje', color: CATEGORY_COLORS[0], order: 0 }])
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
    expect(rd.calendars).toEqual([{ id: 'moje', name: 'Prywatne', color: CATEGORY_COLORS[3], order: 0 }])
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


describe('kolejność kalendarzy (pole order, nie miejsce w tablicy)', () => {
  it('kalendarze idą według order, nie według miejsca w pliku; brak order – po tych, które go mają, w kolejności tablicy', () => {
    const rd = rdWith({
      calendars: [
        { id: 'c', name: 'C', color: CATEGORY_COLORS[1], order: 3 },
        { id: 'x', name: 'X', color: CATEGORY_COLORS[1] },
        { id: 'a', name: 'A', color: CATEGORY_COLORS[1], order: 1 },
        { id: 'b', name: 'B', color: CATEGORY_COLORS[1], order: 2 },
        { id: 'y', name: 'Y', color: CATEGORY_COLORS[1], order: 'zły' }
      ]
    })
    expect(rd.calendars.map((c) => c.id)).toEqual(['moje', 'a', 'b', 'c', 'x', 'y'])
    expect(new Set(rd.calendars.map((c) => c.order)).size).toBe(rd.calendars.length)
  })

  it('nowy kalendarz dostaje kolejny numer', () => {
    const first = newCalendar(rdFrom(undefined).calendars, 'A')!
    const raw = addCalendarRaw({ schema: 1 }, first)
    const second = newCalendar(rdFrom(raw).calendars, 'B')!
    expect(first.order).toBe(1)
    expect(second.order).toBe(2)
  })
})

describe('blok i wydarzenie w kalendarzu; ukrywanie', () => {
  const rd = rdWith({
    calendars: [
      { id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2], order: 1 },
      { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4], order: 2 }
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
    const one = filterBlocks(blocks, ['praca'], rd)
    expect(one.shown.map((b) => b.id)).toEqual(['b-sprawy', 'b-regeneracja', 'b-sprawy'])
    expect(one.hiddenCount).toBe(2)
    expect(filterBlocks(blocks, ['praca', 'dom'], rd)).toEqual({ shown: [block('regeneracja')], hiddenCount: 4 })
  })

  it('nic nie odznaczone: wszystkie bloki, ta sama tablica, licznik 0; nieistniejący kalendarz na liście ukrytych nie ukrywa niczego', () => {
    expect(filterBlocks(blocks, [], rd).shown).toBe(blocks)
    expect(filterBlocks(blocks, ['zniknal'], rd)).toEqual({ shown: blocks, hiddenCount: 0 })
    // Zapamiętane ukryte i znane razem: ukrywa tylko znany.
    expect(filterBlocks(blocks, ['zniknal', 'dom'], rd).hiddenCount).toBe(2)
  })

  it('D425: przy jednym kalendarzu (nie ma żetonów) zapamiętane ukrycie nic nie ukrywa – także „Moje”', () => {
    const one = rdWith({ categories: { analiza: { name: 'Analiza' } } })
    expect(filterBlocks(blocks, ['moje', 'praca'], one)).toEqual({ shown: blocks, hiddenCount: 0 })
    // Kalendarz usunięty po odznaczeniu: został jeden – wszystko wraca.
    const two = { schema: 1, calendars: [{ id: 'praca', name: 'Praca', order: 1 }, { id: 'dom', name: 'Dom', order: 2 }] }
    const gone = removeCalendarRaw(removeCalendarRaw(two, 'praca'), 'dom')
    expect(filterBlocks(blocks, ['praca', 'moje'], rdFrom(gone)).hiddenCount).toBe(0)
  })

  it('„Moje” też można odznaczyć (przy dwóch kalendarzach): ukrywa bloki kategorii bez kalendarza', () => {
    expect(filterBlocks(blocks, ['moje'], rd).shown.map((b) => b.id)).toEqual(['b-analiza', 'b-sprawy', 'b-sesja', 'b-sprawy'])
  })

  it('D425: wydarzenie całodniowe jest w swoim kalendarzu (null i nieznany – „Moje”) i chowa się z nim', () => {
    const ev = (id: string, calendarId: string | null) => ({ id, calendarId })
    const events = [ev('a', null), ev('b', 'praca'), ev('c', 'dom'), ev('d', 'zniknal'), ev('e', 'praca')]
    expect(calendarOfEvent(rd, events[0]!)).toBe('moje')
    expect(calendarOfEvent(rd, events[1]!)).toBe('praca')
    expect(calendarOfEvent(rd, events[3]!)).toBe('moje')
    expect(filterAllDay(events, ['praca'], rd)).toEqual({ shown: [events[0], events[2], events[3]], hiddenCount: 2 })
    expect(filterAllDay(events, ['moje'], rd).shown.map((e) => e.id)).toEqual(['b', 'c', 'e'])
    expect(filterAllDay(events, [], rd).shown).toBe(events)
    expect(filterAllDay(events, ['praca'], rdFrom(undefined))).toEqual({ shown: events, hiddenCount: 0 })
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
    expect(newCalendar(rd.calendars, 'x'.repeat(100))!.name).toHaveLength(CALENDAR_NAME_MAX)
  })

  it('limit kalendarzy: dalszy nie powstaje', () => {
    let raw: Record<string, unknown> = base
    for (let i = 0; i < MAX_CALENDARS + 3; i++) {
      const cal = newCalendar(rdFrom(raw).calendars, `K${i}`)
      if (cal) raw = addCalendarRaw(raw, cal)
    }
    expect(rdFrom(raw).calendars).toHaveLength(MAX_CALENDARS)
  })

  it('zmiana nazwy i koloru; „Moje” dostaje wpis w pliku dopiero przy zmianie – tylko ze zmienionym polem', () => {
    const cal = newCalendar(rdFrom(base).calendars, 'Praca')!
    let raw = addCalendarRaw(base, cal)
    raw = updateCalendarRaw(raw, cal.id, { name: 'Firma', color: CATEGORY_COLORS[6] })
    expect(rdFrom(raw).calendars[1]).toEqual({ id: cal.id, name: 'Firma', color: CATEGORY_COLORS[6], order: 1 })
    expect(base).not.toHaveProperty('calendars')
    raw = updateCalendarRaw(raw, 'moje', { name: 'Prywatne' })
    expect(rdFrom(raw).calendars.map((c) => c.name)).toEqual(['Prywatne', 'Firma'])
    // W pliku tylko to, co zmieniono (kolor „Moje” zostaje domyślny, nie zapisany).
    expect((raw.calendars as Array<Record<string, unknown>>).find((x) => x.id === 'moje')).toEqual({ id: 'moje', name: 'Prywatne' })
    // Nic do zmiany (pusta nazwa, zły kolor): rekord ten sam.
    expect(updateCalendarRaw(base, 'moje', { name: '  ', color: 'nie-kolor' })).toBe(base)
    expect(updateCalendarRaw(base, 'nie-ma', { name: 'X' })).toBe(base)
  })

  it('kategoria przechodzi do kalendarza; do „Moje” – znika samo pole, wpis kategorii zostaje', () => {
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
    // Do „Moje” kategorii, której plik nie zna: nic się nie zmienia.
    expect(setCategoryCalendarRaw({ schema: 1 }, 'sesja', 'moje')).toEqual({ schema: 1 })
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
    for (const m of Object.values(after.categories as Record<string, Record<string, unknown>>)) expect(m.calendar).not.toBe(a.id)
  })

  it('„Moje” nie da się usunąć', () => {
    const raw = addCalendarRaw(base, newCalendar(rdFrom(base).calendars, 'Praca')!)
    expect(removeCalendarRaw(raw, 'moje')).toEqual(raw)
    expect(rdFrom(removeCalendarRaw(raw, 'moje')).calendars.map((c) => c.id)).toContain('moje')
  })

  it('pola, których ta wersja nie zna, zostają przy kalendarzu i kategorii po zmianie; elementy listy, które nie są wpisami, też', () => {
    const raw = {
      schema: 1,
      futureTop: { x: 1 },
      calendars: ['zapomniany tekst', 7, { id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2], order: 1, przyszle: 'tak' }],
      categories: { analiza: { name: 'Analiza', calendar: 'praca', przyszle: 5 } }
    }
    const out = updateCalendarRaw(setCategoryCalendarRaw(raw, 'analiza', 'moje'), 'praca', { name: 'Firma' })
    expect(out.futureTop).toEqual({ x: 1 })
    expect(out.calendars).toEqual(['zapomniany tekst', 7, { id: 'praca', name: 'Firma', color: CATEGORY_COLORS[2], order: 1, przyszle: 'tak' }])
    expect((out.categories as Record<string, Record<string, unknown>>).analiza!.przyszle).toBe(5)
    const removed = removeCalendarRaw(raw, 'praca')
    expect(removed.calendars).toEqual(['zapomniany tekst', 7])
    expect(addCalendarRaw(raw, { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[1], order: 2 }).calendars).toHaveLength(4)
  })
})

/** Reguła kolejki dla jednego wpisu położonego na plik: pole, którego baza nie jest tym, co ma plik, to konflikt (valueAt / setAt jak editQueue). */
function lay(file: Record<string, unknown>, entry: ReturnType<typeof recordEdit>) {
  let value: unknown = file
  const conflicts: string[][] = []
  for (const f of entry!.edits) {
    const now = valueAt(value, f.path)
    if (deepEqual(now, f.value)) continue
    if (deepEqual(now, f.base)) value = setAt(value, f.path, f.value)
    else conflicts.push([...f.path])
  }
  return { file: value as Record<string, unknown>, conflicts }
}
const OLD = { schema: 1, categories: { analiza: { name: 'Analiza', color: null, archived: false } } }

describe('zapis kalendarzy przez kolejkę (diff pole po polu)', () => {
  it('T940: pierwszy kalendarz w starym folderze to zapis jego pól – dwa komputery dodające pierwszy kalendarz zachowują oba, bez pytania', () => {
    const a = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    const b = newCalendar(rdFrom(OLD).calendars, 'Dom')!
    const ea = recordEdit('rd.json', OLD, addCalendarRaw(OLD, a))!
    const eb = recordEdit('rd.json', OLD, addCalendarRaw(OLD, b))!
    // Żadna zmiana nie jest edycją całej listy.
    expect(ea.edits.some((f) => f.path.length === 1 && f.path[0] === 'calendars')).toBe(false)
    expect(ea.edits[0]!.path).toEqual(['calendars', `#${a.id}`, 'id'])
    const first = lay(OLD, ea)
    const second = lay(first.file, eb)
    expect(first.conflicts).toEqual([])
    expect(second.conflicts).toEqual([])
    expect(rdFrom(second.file).calendars.map((c) => c.name)).toEqual(['Moje', 'Praca', 'Dom'])
  })

  it('pierwsza zmiana „Moje”: dwie różne zmiany (nazwa, kolor) na dwóch komputerach zostają obie, bez pytania', () => {
    const ea = recordEdit('rd.json', OLD, updateCalendarRaw(OLD, 'moje', { name: 'Prywatne' }))!
    const eb = recordEdit('rd.json', OLD, updateCalendarRaw(OLD, 'moje', { color: CATEGORY_COLORS[5] }))!
    const r = lay(lay(OLD, ea).file, eb)
    expect(r.conflicts).toEqual([])
    expect(rdFrom(r.file).calendars[0]).toEqual({ id: 'moje', name: 'Prywatne', color: CATEGORY_COLORS[5], order: 0 })
  })

  it('kategoria wraca do „Moje” zmianą samego pola; kolor zmieniony w tym czasie gdzie indziej to nie konflikt', () => {
    const cal = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    const before = setCategoryCalendarRaw(addCalendarRaw(OLD, cal), 'analiza', cal.id)
    const e = recordEdit('rd.json', before, setCategoryCalendarRaw(before, 'analiza', 'moje'))!
    expect(e.edits.map((f) => f.path)).toEqual([['categories', 'analiza', 'calendar']])
    const elsewhere = { ...before, categories: { analiza: { ...(before.categories as Record<string, Record<string, unknown>>).analiza, color: CATEGORY_COLORS[3] } } }
    const r = lay(elsewhere, e)
    expect(r.conflicts).toEqual([])
    expect((r.file.categories as Record<string, Record<string, unknown>>).analiza).toMatchObject({ color: CATEGORY_COLORS[3] })
    expect(calendarOfCategory(rdFrom(r.file), 'analiza')).toBe('moje')
  })

  it('„Cofnij” usunięcia (odwrócona edycja) przywraca kalendarz na jego miejsce mimo że kolejka dokleja go na koniec tablicy', () => {
    let raw: Record<string, unknown> = OLD
    const cals = ['A', 'B', 'C'].map((n) => {
      const c = newCalendar(rdFrom(raw).calendars, n)!
      raw = addCalendarRaw(raw, c)
      return c
    })
    raw = setCategoryCalendarRaw(setCategoryCalendarRaw(raw, 'analiza', cals[1]!.id), 'sesja', cals[1]!.id)
    const removal = recordEdit('rd.json', raw, removeCalendarRaw({ ...raw }, cals[1]!.id))!
    const removed = lay(raw, removal).file
    expect(rdFrom(removed).calendars.map((c) => c.name)).toEqual(['Moje', 'A', 'C'])
    expect(calendarOfCategory(rdFrom(removed), 'analiza')).toBe('moje')
    // Cofnięcie jest możliwe, dopóki plik stoi tak, jak usunięcie go zostawiło.
    expect(editStands(removal, removed, null)).toBe(true)
    const back = lay(removed, inverseEdit(removal, removed, null)).file
    expect((back.calendars as Array<{ id: string }>).map((x) => x.id)).toEqual([cals[0]!.id, cals[2]!.id, cals[1]!.id])
    expect(rdFrom(back).calendars.map((c) => c.name)).toEqual(['Moje', 'A', 'B', 'C'])
    expect(calendarOfCategory(rdFrom(back), 'analiza')).toBe(cals[1]!.id)
    expect(calendarOfCategory(rdFrom(back), 'sesja')).toBe(cals[1]!.id)
  })

  it('„Cofnij” zachowuje to, czego ta wersja nie zna, i nie nadpisuje późniejszej zmiany kategorii (pytanie zamiast tego)', () => {
    const raw = {
      ...OLD,
      calendars: [{ id: 'k', name: 'Praca', color: '#kolor-nowszej-wersji', order: 1, przyszle: [1, 2] }],
      categories: { analiza: { ...OLD.categories.analiza, calendar: 'k' } }
    }
    const removal = recordEdit('rd.json', raw, removeCalendarRaw({ ...raw }, 'k'))!
    const removed = lay(raw, removal).file
    const back = lay(removed, inverseEdit(removal, removed, null)).file
    expect((back.calendars as Array<Record<string, unknown>>)[0]).toEqual({ id: 'k', name: 'Praca', color: '#kolor-nowszej-wersji', order: 1, przyszle: [1, 2] })
    // Kategoria przypisana w tym czasie do innego kalendarza: cofnięcie już nie „stoi”, a gdyby poszło – byłoby pytaniem.
    const moved = { ...removed, categories: { analiza: { ...OLD.categories.analiza, calendar: 'inny' } } }
    expect(editStands(removal, moved, null)).toBe(false)
    expect(lay(moved, inverseEdit(removal, moved, null)).conflicts).toEqual([['categories', 'analiza', 'calendar']])
  })
})
