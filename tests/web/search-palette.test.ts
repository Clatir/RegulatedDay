/**
 * The palette of the global search without a DOM (SNT6, D387, T652): the records it searches (named, never by id), the
 * rows of the results (five and the rest), the arrows, what Enter does with each kind of result, the last chosen results
 * of this computer (a broken or missing storage is no memory, a record gone is left out), and Ctrl K's guards.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rdFrom } from '@shared/model/rd'
import { requestFrom, requestStateOrder, type RequestRecord } from '@shared/model/requests'
import { templateFrom, type Template } from '@shared/model/plan'
import type { Routine } from '@shared/model/routines'
import { recordKey, search, type SearchRecord } from '@shared/search'
import { PAGE_LABEL, pageKeys } from '@renderer/app/pages'
import { onModal } from '@renderer/lib/escape'
import { choose, loadRecents, recentRecords, rowsOf, saveRecent, selectable, stepIndex, todayOf } from '@renderer/features/search/paletteLogic'
import { COMMANDS, searchRecords, SETTING_SECTIONS } from '@renderer/features/search/records'
import { openSearch, useSearch } from '@renderer/features/search/searchStore'
import { useData } from '@renderer/store/data'
import { useWizard } from '@renderer/features/wizard/wizardStore'
import { logicalDayOf } from '@shared/time/day'
import { useUi } from '@renderer/store/ui'
import type { Series, SeriesPlan } from '@shared/model/series'

const TODAY = '2026-11-10'
const rd = { ...rdFrom(undefined), people: [{ id: 'p1', name: 'Żółw Kowalski', archived: false }] }
const block = (id: string, extra: Record<string, unknown> = {}) => ({ id, categoryId: 'analiza', startMin: 600, durationMin: 60, fixed: false, ...extra })
const template: Template = templateFrom({
  schema: 1,
  id: 't1',
  name: 'Dzień zwykły',
  dayType: 'zwykly',
  weekdays: [],
  versions: [{ from: '2026-01-01', blocks: [block('tb1', { note: 'zacznij od wody' }), block('tb2', { routine: 'rano' })] }]
})!
const routine: Routine = { id: 'rano', name: 'Poranna rutyna', normal: [{ id: 's1', name: 'woda', min: 5 }, { id: 's2', name: 'prysznic', min: 10 }], worse: [{ id: 's3', name: 'tylko woda', min: 5 }], archived: false }
const req = (id: string, state: 'queued' | 'done', note: string): RequestRecord => requestFrom({ id, person: 'p1', estimateMin: 15, note, createdAt: 1, state, day: null, block: null })!
const input = (blocks: Array<{ date: string; id: string; title: string; note: string }> = []) => ({
  today: TODAY,
  rd,
  templates: [template],
  requests: [req('r1', 'queued', 'telefon'), req('r2', 'done', 'zwrot książki'), requestFrom({ id: 't1', kind: 'task', title: 'Filtr w ekspresie', note: 'Brita', createdAt: 2, state: 'done', list: 'done', doneAt: Date.parse('2026-09-01T10:00:00Z') })!],
  routines: [routine],
  series: [] as SeriesPlan[],
  blocks,
  pageLabel: PAGE_LABEL,
  pageKeys
})

const stubStorage = (store: Record<string, string> | 'broken') => {
  const broken = () => {
    throw new Error('no storage')
  }
  Object.assign(globalThis, {
    localStorage: store === 'broken' ? { getItem: broken, setItem: broken } : { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) }
  })
}

beforeEach(() => {
  Object.assign(globalThis, { document: { activeElement: null }, HTMLElement: class {}, HTMLInputElement: class {}, HTMLTextAreaElement: class {} })
  useUi.setState({ page: 'calendar', day: null, focus: null, pick: null })
  useSearch.setState({ open: false })
})
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
})

const allDayEvents = [
  { id: 'ev1', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20', calendarId: null, color: 'teal' as const, note: 'Kraków, hotel przy rynku', free: false },
  { id: 'ev2', title: 'Urlop', startDate: '2026-12-24', endDate: '2026-12-24', calendarId: null, color: 'amber' as const, note: '', free: true }
]

describe('wydarzenia całodniowe w wyszukiwarce (D405)', () => {
  const found = (q: string) => search(searchRecords({ ...input(), allDay: allDayEvents }), q, TODAY)

  it('rekord: tytuł, notatka jako tekst, daty jako podpowiedź („18–20.11”, „24.12”), nazwą, nigdy id', () => {
    const recs = searchRecords({ ...input(), allDay: allDayEvents }).filter((r) => r.kind === 'allDay')
    expect(recs).toEqual([
      { kind: 'allDay', id: 'ev1', title: 'Konferencja', text: 'Kraków, hotel przy rynku', hint: '18–20.11' },
      { kind: 'allDay', id: 'ev2', title: 'Urlop', text: '', hint: '24.12' }
    ])
  })

  it('znajdowane po tytule i po słowie z notatki, w grupie „Wydarzenia”', () => {
    for (const q of ['konf', 'rynku', 'krakow']) {
      const g = found(q).find((x) => x.id === 'allDay')
      expect(g?.label).toBe('Wydarzenia')
      expect(g?.hits.map((h) => h.record.id)).toEqual(['ev1'])
    }
  })

  it('bez wydarzeń w danych nie ma rekordów ani grupy', () => {
    expect(searchRecords(input()).some((r) => r.kind === 'allDay')).toBe(false)
    expect(search(searchRecords(input()), 'konf', TODAY).some((g) => g.id === 'allDay')).toBe(false)
  })
})

describe('rekordy wyszukiwarki', () => {
  it('ekrany, polecenia, ustawienia, kategorie, szablony z blokami, sprawy (także zrobione dawno), rutyny z krokami i bloki dni', () => {
    const rs = searchRecords(input([{ date: '2026-11-09', id: 'a', title: 'Analiza', note: 'Kowalski podał numer' }]))
    const kinds = (k: string) => rs.filter((r) => r.kind === k)
    expect(kinds('screen').map((r) => r.title)).toContain('Tydzień')
    expect(kinds('screen').find((r) => r.id === 'week')!.hint).toBe('Ctrl 3')
    expect(kinds('command').map((r) => r.title)).toEqual(['Nowy blok', 'Nowa prośba', 'Jutro', 'Wczoraj', 'Rytuał'])
    expect(kinds('setting')).toHaveLength(SETTING_SECTIONS.length)
    expect(kinds('category').map((r) => r.title)).toContain('Analiza')
    expect(kinds('template').map((r) => r.title)).toEqual(['Dzień zwykły'])
    // D383, D402: the tasks and the requests, in the order of the lists; „Zrobione” older than 7 days too.
    expect(kinds('request').map((r) => [r.id, r.title, r.hint])).toEqual([
      ['r1', 'Żółw Kowalski', 'prośba · Skrzynka'],
      ['t1', 'Filtr w ekspresie', 'zadanie · Zrobione'],
      ['r2', 'Żółw Kowalski', 'prośba · Zrobione']
    ])
    expect(search(rs, 'brita', TODAY).flatMap((g) => g.hits.map((h) => [g.label, h.record.id]))).toEqual([['Sprawy', 't1']])
    expect(['dropped', 'done', 'queued', 'planned'].sort((a, b) => requestStateOrder(a as 'done') - requestStateOrder(b as 'done'))).toEqual(['queued', 'planned', 'done', 'dropped'])
    expect(kinds('routine')[0]!.text).toBe('woda · prysznic · tylko woda')
    expect(kinds('block')[0]).toMatchObject({ id: 'a', date: '2026-11-09', hint: '09.11.2026 · poniedziałek', text: 'Kowalski podał numer' })
  })

  it('moduł próśb wyłączony: prośby nie do znalezienia (strona ich nie pokaże), zadania tak (T763)', () => {
    const off = { ...rd, general: { ...rd.general, modules: { ...rd.general.modules, requests: false } } }
    const found = searchRecords({ ...input(), rd: off }).filter((r) => r.kind === 'request')
    expect(found.map((r) => r.id)).toEqual(['t1'])
    expect(search(searchRecords({ ...input(), rd: off }), 'telefon', TODAY)).toEqual([])
  })

  it('bloki szablonu mają nazwy (rutyna, kategoria), nigdy id, i wskazują szablon', () => {
    const tb = searchRecords(input()).filter((r) => r.kind === 'templateBlock')
    expect(tb.map((r) => r.title)).toEqual(['Analiza', 'Poranna rutyna'])
    expect(tb.every((r) => r.parent === 't1' && r.hint === 'szablon: Dzień zwykły')).toBe(true)
    expect(tb[0]!.text).toBe('zacznij od wody')
  })

  it('seria to jeden rekord (nazwa i reguła, D401): części po „To i następne” – jedna, usunięta – żadna; Enter otwiera „Szablony”', () => {
    const block = { categoryId: 'inne', variantId: null, startMin: 1020, durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjoterapeuta', routine: null, steps: [] }
    const part = (id: string, start: string, until: string | null, archived = false): Series => ({ id, root: 'fizjo', start, until, count: null, versions: [{ from: start, block, rule: { kind: 'weekly', every: 2, days: [4], anchor: start }, special: 'ask' }], archived })
    const plan = (x: Series, last: string | null = x.until) => ({ series: x, last })
    const rs = searchRecords({ ...input(), series: [plan(part('fizjo', '2026-10-01', '2026-11-04')), plan(part('fizjo2', '2026-11-05', null)), plan({ ...part('gone', '2026-10-01', '2026-11-09', true), root: 'gone' })] })
    const found = rs.filter((r) => r.kind === 'series')
    expect(found.map((r) => [r.id, r.title, r.text, r.hint])).toEqual([['fizjo2', 'Fizjoterapeuta', 'co 2 tygodnie w czwartek', 'seria']])
    // Ended by its count (the last day from the plan, no date of its own): ended, as the list of „Szablony” says.
    const counted = { ...part('ang', '2026-10-01', null), root: 'ang', count: 3 }
    const ended = searchRecords({ ...input(), series: [plan(counted, '2026-10-29')] }).filter((r) => r.kind === 'series')
    expect(ended.map((r) => [r.id, r.text, r.hint])).toEqual([['ang', 'co 2 tygodnie w czwartek, 3 razy', 'seria zakończona']])
    expect(search(rs, 'fizjo', TODAY)[0]!.label).toBe('Szablony')
    choose(found[0]!, TODAY)
    expect(useUi.getState()).toMatchObject({ page: 'templates', pick: { kind: 'series', id: 'fizjo2' } })
  })

  it('dzisiejszy blok ma w dacie „dziś”', () => {
    const b = searchRecords(input([{ date: TODAY, id: 'x', title: 'Nauka', note: '' }])).find((r) => r.kind === 'block')!
    expect(b.hint?.startsWith('dziś · 10.11.2026')).toBe(true)
  })

  it('przykłady D387 na danych okna: „zolw” trafia osobę z prośby, „lodz” – nazwę bloku, „nowe” – oba polecenia', () => {
    const rs = searchRecords(input([{ date: '2026-02-01', id: 'l', title: 'Spotkanie w Łodzi', note: '' }]))
    expect(search(rs, 'zolw', TODAY).flatMap((g) => g.hits.map((h) => h.record.kind))).toContain('request')
    expect(search(rs, 'lodz', TODAY)[0]!.hits[0]!.record.title).toBe('Spotkanie w Łodzi')
    expect(search(rs, 'nowe', TODAY)[0]!.hits.map((h) => h.record.id)).toEqual(['newBlock', 'newRequest'])
    expect(search(rs, 'woda kroki', TODAY)).toEqual([])
    expect(search(rs, 'woda prysz', TODAY).map((g) => g.id)).toEqual(['routine'])
  })
})

describe('wiersze wyników i strzałki', () => {
  const many = Array.from({ length: 8 }, (_, i): SearchRecord => ({ kind: 'request', id: `q${i}`, title: `Osoba ${i}` }))
  const groups = search([...many, { kind: 'routine', id: 'r', title: 'Osoba rutyna' }], 'osoba', TODAY)

  it('grupa: nagłówek, pięć wyników i „jeszcze N”; po rozwinięciu wszystkie', () => {
    const rows = rowsOf(groups, new Set())
    expect(rows.map((r) => r.type)).toEqual(['head', 'hit', 'hit', 'hit', 'hit', 'hit', 'more', 'head', 'hit'])
    expect(rows[6]).toEqual({ type: 'more', group: 'request', rest: 3 })
    const all = rowsOf(groups, new Set(['request']))
    expect(all.filter((r) => r.type === 'hit')).toHaveLength(9)
    expect(all.some((r) => r.type === 'more')).toBe(false)
  })

  it('klawisze zatrzymują się na wynikach i „jeszcze”, nie na nagłówkach', () => {
    expect(selectable(rowsOf(groups, new Set()))).toEqual([1, 2, 3, 4, 5, 6, 8])
  })

  it('góra/dół zawijają na końcach; bez wierszy nic nie jest wybrane', () => {
    expect(stepIndex(0, 3, 1)).toBe(1)
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(-1, 3, 1)).toBe(0)
    expect(stepIndex(0, 0, 1)).toBe(-1)
  })
})

describe('Enter na wyniku (T653)', () => {
  const ui = () => useUi.getState()
  const rec = (kind: SearchRecord['kind'], id: string, more: Partial<SearchRecord> = {}): SearchRecord => ({ kind, id, title: 'x', ...more })

  it('blok minionego dnia: „Dziś” na jego dniu z wyborem bloku; blok dzisiejszy: dzień „dziś” (null)', () => {
    choose(rec('block', 'a', { date: '2026-03-02' }), TODAY)
    expect([ui().page, ui().day, ui().pick]).toEqual(['today', '2026-03-02', { kind: 'block', id: 'a', date: '2026-03-02' }])
    choose(rec('block', 'b', { date: TODAY }), TODAY)
    expect(ui().day).toBeNull()
  })

  it('szablon, blok szablonu, prośba, rutyna, kategoria i ustawienie – swój ekran i wybór', () => {
    const go = (r: SearchRecord) => {
      choose(r, TODAY)
      return [ui().page, ui().pick]
    }
    expect(go(rec('template', 't1'))).toEqual(['templates', { kind: 'template', id: 't1' }])
    expect(go(rec('templateBlock', 'tb', { parent: 't1' }))).toEqual(['templates', { kind: 'templateBlock', id: 'tb', parent: 't1' }])
    expect(go(rec('request', 'r1'))).toEqual(['requests', { kind: 'request', id: 'r1' }])
    expect(go(rec('routine', 'rano'))).toEqual(['routines', { kind: 'routine', id: 'rano' }])
    expect(go(rec('category', 'analiza'))).toEqual(['settings', { kind: 'category', id: 'analiza' }])
    expect(go(rec('setting', 'settings-data'))).toEqual(['settings', { kind: 'setting', id: 'settings-data' }])
  })

  it('wydarzenie całodniowe: „Tydzień” z wyborem tego wydarzenia (jak inne rodzaje, D405) – to karta bierze go raz', () => {
    choose(rec('allDay', 'ev1'), TODAY)
    expect([ui().page, ui().pick]).toEqual(['week', { kind: 'allDay', id: 'ev1' }])
    expect(Object.keys(ui())).not.toContain('openAllDay')
  })

  it('ekran: przejście bez wyboru', () => {
    choose(rec('screen', 'stats'), TODAY)
    expect([ui().page, ui().pick]).toEqual(['stats', null])
  })

  it('polecenia: Nowy blok (Ctrl N w „Dziś”), Nowa prośba, Jutro, Wczoraj, Rytuał – tylko nawigacja', () => {
    const cmd = (id: string) => choose(COMMANDS.find((c) => c.id === id)!, TODAY)
    cmd('newBlock')
    expect([ui().page, ui().day, ui().pick]).toEqual(['today', null, { kind: 'command', id: 'newBlock' }])
    cmd('newRequest')
    expect([ui().page, ui().pick]).toEqual(['requests', { kind: 'command', id: 'newRequest' }])
    cmd('tomorrow')
    expect([ui().page, ui().day, ui().pick]).toEqual(['today', '2026-11-11', null])
    cmd('yesterday')
    expect(ui().day).toBe('2026-11-09')
    cmd('ritual')
    expect([ui().page, ui().day, ui().focus]).toEqual(['today', null, 'ritual'])
  })
})

describe('ostatnio wybrane (pamięć tego komputera)', () => {
  const a = { kind: 'request', id: 'r1', title: 'x' } as SearchRecord
  const b = { kind: 'block', id: 'b1', date: '2026-03-02', title: 'y' } as SearchRecord

  it('najnowszy pierwszy, bez powtórzeń, najwyżej 5 – i wraca po ponownym otwarciu', () => {
    const store: Record<string, string> = {}
    stubStorage(store)
    for (let i = 0; i < 7; i++) saveRecent({ kind: 'routine', id: `r${i}`, title: '' })
    saveRecent(a)
    saveRecent(b)
    saveRecent(a)
    expect(loadRecents()).toEqual([recordKey(a), recordKey(b), 'routine:::r6', 'routine:::r5', 'routine:::r4'])
  })

  it('brak pamięci albo uszkodzony wpis: puste, bez błędu', () => {
    stubStorage('broken')
    expect(loadRecents()).toEqual([])
    expect(() => saveRecent(a)).not.toThrow()
    stubStorage({ 'rd.searchRecent': '{uszkodzone' })
    expect(loadRecents()).toEqual([])
  })

  it('rekord, którego już nie ma, jest pomijany, reszta zostaje w kolejności', () => {
    expect(recentRecords([recordKey(b), 'request::::gone', recordKey(a)], [a, b])).toEqual([b, a])
  })
})

describe('Ctrl K: otwarcie', () => {
  const view = (status: string) => useData.setState({ view: { status } as never })

  it('otwiera paletę; przy otwartym oknie dialogowym nic nie robi (jak Ctrl 1…9)', () => {
    view('open')
    expect(openSearch()).toBe(true)
    expect(useSearch.getState().open).toBe(true)
    useSearch.setState({ open: false })
    const modal = onModal()
    expect(openSearch()).toBe(false)
    expect(useSearch.getState().open).toBe(false)
    modal.off()
  })

  it('nad kreatorem (folder danych nie ustawiony) nic nie robi; po „Później” albo z folderem – działa', () => {
    useWizard.setState({ open: true, asked: false })
    view('none')
    expect(openSearch()).toBe(false)
    expect(useSearch.getState().open).toBe(false)
    // A folder that did not open: the wizard only when asked for.
    view('failed')
    expect(openSearch()).toBe(true)
    useSearch.setState({ open: false })
    useWizard.setState({ asked: true })
    expect(openSearch()).toBe(false)
    useWizard.setState({ open: false })
    view('none')
    expect(openSearch()).toBe(true)
  })
})

describe('dzisiaj palety bez widoku danych', () => {
  it('bez widoku dzień z zegara komputera, nigdy pusta data', () => {
    const at = Date.UTC(2026, 10, 10, 12, 0)
    expect(todayOf(null, at)).toBe(logicalDayOf(at))
    expect(todayOf('', at)).toBe(logicalDayOf(at))
    expect(todayOf('2026-11-03', at)).toBe('2026-11-03')
  })

  it('„Jutro” i „Wczoraj” bez dnia nie otwierają daty z 1899', () => {
    const before = useUi.getState().day
    choose(COMMANDS.find((c) => c.id === 'tomorrow')!, '')
    choose(COMMANDS.find((c) => c.id === 'yesterday')!, '')
    expect(useUi.getState().day).toBe(before)
  })
})
