/**
 * How many blocks a quick edit from a block's panel changes (D514, T1325): the blocks of the days' files from today on, the templates' and the
 * series' – a change of cost only reaches blocks without a cost of their own (and, for a subcategory, without a variant that has one).
 */
import { describe, expect, it } from 'vitest'
import { begunToday, countScope, overriddenFrom, reaches, SCOPE_DAYS, scopeDates, scopeDetail, scopeText } from '@renderer/features/plan/editScope'
import { computeDay } from '@shared/engine/day'
import { categoryChange, routineChange, variantChange } from '@renderer/features/plan/editChanges'
import { DEFAULT_SETTINGS, type SettingsChange } from '@shared/model/settings'
import { planBlock, templateFrom, type PlanBlock } from '@shared/model/plan'
import { seriesFrom } from '@shared/model/series'
import { Scenario } from '../unit/engine/dsl'

const categories = DEFAULT_SETTINGS.categories
const b = (p: Partial<PlanBlock> & { id: string }): PlanBlock => planBlock({ categoryId: 'projekty', startMin: 600, durationMin: 30, origin: 'user', ...p })
const day = (date: string, blocks: PlanBlock[], extra: Record<string, unknown> = {}) => ({ schema: 1, date, blocks: blocks.map((x) => ({ ...x })), ...extra })
const costs = { head: 2, emotions: 2, senses: 2 }

describe('reaches', () => {
  it('koszt podkategorii: tylko bloki bez własnego kosztu i bez wariantu z własnym kosztem; inne pola – wszystkie bloki podkategorii', () => {
    const t = { kind: 'category', id: 'regeneracja' } as const
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja' }), t, 'costs', categories)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', costs }), t, 'costs', categories)).toBe(false)
    // „spacer” has a cost of its own: the subcategory's cost does not reach it.
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', variantId: 'spacer' }), t, 'costs', categories)).toBe(false)
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', variantId: 'spacer', costs }), t, 'all', categories)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'projekty' }), t, 'all', categories)).toBe(false)
  })
  it('wariant i rutyna', () => {
    const v = { kind: 'variant', categoryId: 'regeneracja', id: 'spacer' } as const
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', variantId: 'spacer' }), v, 'costs', categories)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', variantId: 'spacer', costs }), v, 'costs', categories)).toBe(false)
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', variantId: 'spacer', costs }), v, 'all', categories)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'regeneracja', variantId: 'cisza' }), v, 'all', categories)).toBe(false)
    expect(reaches(b({ id: 'x', routine: 'r1' }), { kind: 'routine', id: 'r1' }, 'all', categories)).toBe(true)
    expect(reaches(b({ id: 'x', routine: 'r2' }), { kind: 'routine', id: 'r1' }, 'all', categories)).toBe(false)
  })
  it('koszt rutyny (D512, T1398): bloki z tą rutyną bez własnego kosztu, tylko w kategorii rodzaju „rutyna”; inne pola – wszystkie bloki z rutyną', () => {
    const r = { kind: 'routine', id: 'r1' } as const
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r1' }), r, 'costs', categories)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r1', costs }), r, 'costs', categories)).toBe(false)
    // A routine left on a block of another kind costs nothing (T1371): its cost does not reach it.
    expect(reaches(b({ id: 'x', categoryId: 'projekty', routine: 'r1' }), r, 'costs', categories)).toBe(false)
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r2' }), r, 'costs', categories)).toBe(false)
    expect(reaches(b({ id: 'x', categoryId: 'projekty', routine: 'r1', costs }), r, 'all', categories)).toBe(true)
  })
  it('kolejność blok → rutyna → wariant → podkategoria: koszt podkategorii i wariantu nie sięga bloku, którego rutyna ma własny koszt (T1398)', () => {
    const routines = { r1: costs, r3: 'unknown' } as const
    const rutyny = { kind: 'category', id: 'rutyny' } as const
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r1' }), rutyny, 'costs', categories, routines)).toBe(false)
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r1' }), rutyny, 'all', categories, routines)).toBe(true)
    // The routine without a cost, or not known now (it costs as none, T1372): the subcategory's cost reaches the block.
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r2' }), rutyny, 'costs', categories, routines)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', routine: 'r3' }), rutyny, 'costs', categories, routines)).toBe(true)
    // A routine left on a block of another kind costs nothing (T1371): the subcategory's cost reaches it.
    expect(reaches(b({ id: 'x', categoryId: 'projekty', routine: 'r1' }), { kind: 'category', id: 'projekty' }, 'costs', categories, routines)).toBe(true)
    const withVariant = { ...categories, rutyny: { ...categories.rutyny!, variants: [{ id: 'krotka', name: 'Krótka', costs: { head: 0, emotions: 0, senses: 0 } }] } }
    const krotka = { kind: 'variant', categoryId: 'rutyny', id: 'krotka' } as const
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', variantId: 'krotka', routine: 'r1' }), krotka, 'costs', withVariant, routines)).toBe(false)
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', variantId: 'krotka', routine: 'r2' }), krotka, 'costs', withVariant, routines)).toBe(true)
    expect(reaches(b({ id: 'x', categoryId: 'rutyny', variantId: 'krotka', routine: 'r1' }), krotka, 'all', withVariant, routines)).toBe(true)
  })
})

describe('countScope', () => {
  const today = '2026-11-18'
  const template = templateFrom({
    schema: 1,
    id: 't1',
    name: 'Zwykły',
    dayType: 'zwykly',
    weekdays: [],
    versions: {
      '2026-01-01': { blocks: [b({ id: 'old' })].map((x) => ({ ...x })) },
      '2026-10-01': { blocks: [b({ id: 'n1' }), b({ id: 'n2', costs }), b({ id: 'n3', categoryId: 'analiza' })].map((x) => ({ ...x })) }
    }
  })!
  const seriesRaw = (id: string, extra: Record<string, unknown> = {}) => ({ schema: 1, id, start: '2026-11-01', versions: { '2026-11-01': { block: { categoryId: 'projekty', startMin: 600, durationMin: 30 }, rule: { kind: 'daily' } } }, ...extra })
  const plan = (raw: Record<string, unknown>, last: string | null = null) => ({ series: seriesFrom(raw)!, last })
  const nulls = () => Object.fromEntries(scopeDates(today).map((d) => [d, null])) as Record<string, Record<string, unknown> | null>

  it('liczy bloki plików dni od dziś, ostatnie wersje szablonów i serii – każdy blok raz', () => {
    const files = {
      ...nulls(),
      [today]: day(today, [b({ id: 'a' }), b({ id: 'c', costs }), b({ id: 'd', categoryId: 'analiza' })]),
      '2026-11-20': day('2026-11-20', [b({ id: 'e' }), b({ id: 'gone' }), b({ id: 'away' })], { cancelled: ['gone'], movedTo: { away: '2026-11-21' } })
    }
    const base = { today, files, templates: [template], series: [plan(seriesRaw('s1'))], target: { kind: 'category', id: 'projekty' } as const, categories }
    expect(countScope({ ...base, what: 'all' })).toMatchObject({ days: 3, templates: 2, series: 1, total: 6, unread: 0 })
    // A change of cost: not the blocks with a cost of their own.
    expect(countScope({ ...base, what: 'costs' })).toMatchObject({ days: 2, templates: 1, series: 1, total: 4, unread: 0 })
  })

  it('dzień, którego nie ma w odpowiedzi, to dzień nieczytelny – nie „brak”', () => {
    const files = nulls()
    delete files['2026-11-19']
    delete files['2026-11-25']
    expect(countScope({ today, files, templates: [], series: [], target: { kind: 'category', id: 'projekty' }, what: 'all', categories }).unread).toBe(2)
    expect(SCOPE_DAYS).toBe(62)
  })

  it('pomija archiwalne szablony, zakończone i usunięte serie oraz dni sprzed dziś', () => {
    const files = { ...nulls(), '2026-11-17': day('2026-11-17', [b({ id: 'past' })]) }
    const c = countScope({
      today,
      files,
      templates: [{ ...template, archived: true }],
      series: [plan(seriesRaw('s1'), '2026-11-10'), plan(seriesRaw('s2', { archived: true })), plan(seriesRaw('s3'), today)],
      target: { kind: 'category', id: 'projekty' },
      what: 'all',
      categories
    })
    expect(c).toMatchObject({ days: 0, templates: 0, series: 1, total: 1, unread: 0 })
  })

  it('z plików dni bez bloków warstw (sesja, wykład, zjazd) i bez zmienionych kopii bloków szablonu i serii liczonych już raz (T1333)', () => {
    const files = {
      ...nulls(),
      [today]: day(today, [
        b({ id: 'ses', origin: 'session' }),
        b({ id: 'lec', origin: 'lecture' }),
        b({ id: 'zj', origin: 'zjazd' }),
        // The template's „n1” and the series „s1” changed for this day: counted once, under the template and the series.
        b({ id: 'tpl-n1', origin: 'template', sourceId: 'n1' }),
        b({ id: 'ser-s1', origin: 'series', sourceId: 's1' }),
        // The template's „n3” is of „analiza” (not counted there); its copy of today was changed to „projekty” – a block of its own.
        b({ id: 'tpl-n3', origin: 'template', sourceId: 'n3' }),
        b({ id: 'own' })
      ])
    }
    const c = countScope({ today, files, templates: [template], series: [plan(seriesRaw('s1'))], target: { kind: 'category', id: 'projekty' }, what: 'all', categories })
    expect(c).toMatchObject({ days: 2, templates: 2, series: 1, total: 5 })
  })

  it('szablon i seria: wersja obowiązująca dziś i każda późniejsza, blok raz; wersja sprzed obowiązującej się nie liczy (T1334)', () => {
    const t = templateFrom({
      schema: 1,
      id: 't2',
      name: 'Zmiany',
      dayType: 'zwykly',
      weekdays: [],
      versions: {
        '2026-01-01': { blocks: [b({ id: 'old' })].map((x) => ({ ...x })) },
        '2026-10-01': { blocks: [b({ id: 'nA' }), b({ id: 'nB' })].map((x) => ({ ...x })) },
        '2026-12-01': { blocks: [b({ id: 'nB' }), b({ id: 'nC' })].map((x) => ({ ...x })) }
      }
    })!
    const block = (categoryId: string) => ({ block: { categoryId, startMin: 600, durationMin: 30 }, rule: { kind: 'daily' } })
    // Of „projekty” today, of „analiza” from 1.12: it reaches the blocks until then.
    const s1 = plan({ schema: 1, id: 's1', start: '2026-11-01', versions: { '2026-11-01': block('projekty'), '2026-12-01': block('analiza') } })
    // Of „projekty” until 10.11 only – the version in force today is of „analiza”.
    const s2 = plan({ schema: 1, id: 's2', start: '2026-10-01', versions: { '2026-10-01': block('projekty'), '2026-11-10': block('analiza') } })
    const c = countScope({ today, files: nulls(), templates: [t], series: [s1, s2], target: { kind: 'category', id: 'projekty' }, what: 'all', categories })
    expect(c).toMatchObject({ templates: 3, series: 1, total: 4 })
  })

  it('sam koszt: dzisiejszy blok skończony się nie liczy (minione minuty zostają, D501), zaczęty tak; inna zmiana liczy wszystkie (T1335)', () => {
    const files = { ...nulls(), [today]: day(today, [b({ id: 'done' }), b({ id: 'run' })]), '2026-11-19': day('2026-11-19', [b({ id: 'done' })]) }
    const base = { today, files, templates: [], series: [], target: { kind: 'category', id: 'projekty' } as const, categories, ended: new Set(['done']) }
    expect(countScope({ ...base, what: 'costs' }).days).toBe(2)
    expect(countScope({ ...base, what: 'all' }).days).toBe(3)
  })

  it('koszt rutyny: dziś bez skończonych, bez bloków z własnym kosztem i innego rodzaju; koszt podkategorii – bez bloków, których rutyna ma koszt (T1398)', () => {
    const rut = (p: Partial<PlanBlock> & { id: string }) => b({ categoryId: 'rutyny', routine: 'r1', ...p })
    const files = { ...nulls(), [today]: day(today, [rut({ id: 'run' }), rut({ id: 'done' }), rut({ id: 'own', costs }), b({ id: 'other', routine: 'r1' })]), '2026-11-19': day('2026-11-19', [rut({ id: 'next' })]) }
    const base = { today, files, templates: [], series: [], categories, ended: new Set(['done']) }
    expect(countScope({ ...base, target: { kind: 'routine', id: 'r1' }, what: 'costs' }).days).toBe(2)
    expect(countScope({ ...base, target: { kind: 'routine', id: 'r1' }, what: 'all' }).days).toBe(5)
    expect(countScope({ ...base, target: { kind: 'category', id: 'rutyny' }, what: 'costs', routineCosts: { r1: costs } }).days).toBe(0)
    expect(countScope({ ...base, target: { kind: 'category', id: 'rutyny' }, what: 'costs' }).days).toBe(2)
  })

  it('wpis z późniejszą datą, który nadpisuje ten sam klucz: liczy tylko dni przed nim (T1336)', () => {
    const files = { ...nulls(), [today]: day(today, [b({ id: 'a' })]), '2026-11-19': day('2026-11-19', [b({ id: 'b' })]), '2026-11-20': day('2026-11-20', [b({ id: 'c' })]) }
    const t = templateFrom({ schema: 1, id: 't3', name: 'Późny', dayType: 'zwykly', weekdays: [], versions: { '2026-10-01': { blocks: [b({ id: 'n1' })].map((x) => ({ ...x })) }, '2026-11-20': { blocks: [b({ id: 'n9' })].map((x) => ({ ...x })) } } })!
    const late = plan(seriesRaw('s-late', { start: '2026-11-25', versions: { '2026-11-25': { block: { categoryId: 'projekty', startMin: 600, durationMin: 30 }, rule: { kind: 'daily' } } } }))
    const c = countScope({ today, files, templates: [t], series: [plan(seriesRaw('s1')), late], target: { kind: 'category', id: 'projekty' }, what: 'costs', categories, until: '2026-11-20' })
    expect(c).toMatchObject({ days: 2, templates: 1, series: 1, total: 4, unread: 0, until: '2026-11-20' })
    expect(scopeDetail(c)).toContain('do 19.11.2026')
    expect(scopeDetail(c)).toContain('od 20.11.2026')
  })

  it('tekst: odmiana i skład liczby', () => {
    const c = { days: 1, templates: 1, series: 1, total: 3, unread: 2, until: null }
    expect(scopeText(c)).toBe('Zmieni 3 bloki od dziś')
    expect(scopeText({ ...c, total: 1 })).toBe('Zmieni 1 blok od dziś')
    expect(scopeText({ ...c, total: 5 })).toBe('Zmieni 5 bloków od dziś')
    expect(scopeDetail(c)).toContain('w dniach: 1 · w szablonach: 1 · w seriach: 1')
    expect(scopeDetail(c)).toContain('Nie policzono 2 nieczytelnych dni')
    expect(scopeDetail({ ...c, unread: 0 })).not.toContain('Nie policzono')
  })
})

describe('zaczęty dziś blok liczony jak silnik (begunToday, T1434)', () => {
  const today = '2026-11-18'
  const R = { head: 3, emotions: 1, senses: 1 }
  const nulls = () => Object.fromEntries(scopeDates(today).map((d) => [d, null])) as Record<string, Record<string, unknown> | null>
  const m = b({ id: 'm', categoryId: 'rutyny', routine: 'r1', startMin: 8 * 60, durationMin: 90 })
  const n = b({ id: 'n', categoryId: 'rutyny', routine: 'r1', startMin: 12 * 60 })
  const files = { ...nulls(), [today]: day(today, [m, n]) }
  /** Today at 08:30 as the window reads it (`plannedDay`): `now` – the routines' costs its files say now. */
  const begun = (s: Scenario, now: Record<string, typeof R>, plan?: PlanBlock[]) => {
    const t = s.at('08:30')
    const ctx = s.contextAt(t, { routineCosts: now, ...(plan ? { plan } : {}) })
    return begunToday(ctx, computeDay(ctx).facts, t)
  }
  const count = (target: Parameters<typeof countScope>[0]['target'], now: Record<string, typeof R>, b: ReadonlyMap<string, unknown>) =>
    countScope({ today, files, templates: [], series: [], target, what: 'costs', categories, routineCosts: now, begun: b as never }).days

  it('koszt rutyny ze startu, nie z rutyny teraz: start z kosztem rutyny – koszt podkategorii go nie sięga, choć rutyna teraz bez kosztu', () => {
    const s = new Scenario({ date: today, plan: [m, n], routineCosts: { r1: R } }).start('m', '08:00')
    expect(count({ kind: 'category', id: 'rutyny' }, {}, begun(s, {}))).toBe(1)
  })

  it('start starszej wersji (bez kosztu rutyny): koszt podkategorii go sięga, choć rutyna teraz ma koszt', () => {
    const s = new Scenario({ date: today, plan: [m, n] })
    s.write([{ k: 'block.start', block: 'm', at: s.at('08:00'), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null }, confirmUntil: null, how: 'click', v: 13 }], s.at('08:00'))
    expect(count({ kind: 'category', id: 'rutyny' }, { r1: R }, begun(s, { r1: R }))).toBe(1)
  })

  it('zmiana kosztu rutyny z logu (routine.cost) i własny koszt z kafelka (block.cost) – jak silnik teraz', () => {
    const s = new Scenario({ date: today, plan: [m, n], routineCosts: { r1: R } }).start('m', '08:00')
    s.write([{ k: 'routine.cost', routine: 'r1', at: s.at('08:10'), costs: null, was: R }], s.at('08:10'))
    // The routine has no cost from 08:10: the subcategory's cost reaches the begun block, the routine's too (no own cost).
    expect(count({ kind: 'category', id: 'rutyny' }, {}, begun(s, {}))).toBe(2)
    s.write([{ k: 'block.cost', block: 'm', at: s.at('08:20'), costs }], s.at('08:20'))
    // Its own cost from 08:20: neither the subcategory's nor the routine's reaches it.
    expect(count({ kind: 'category', id: 'rutyny' }, {}, begun(s, {}))).toBe(1)
    expect(count({ kind: 'routine', id: 'r1' }, {}, begun(s, {}))).toBe(1)
  })

  it('kategoria i rutyna ze startu: blok, któremu po starcie zmieniono w pliku rutynę, liczy się dla rutyny startu', () => {
    const s = new Scenario({ date: today, plan: [m, n] })
    s.write([{ k: 'block.start', block: 'm', at: s.at('08:00'), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null, routine: 'r1', routineCosts: null }, confirmUntil: null, how: 'click' }], s.at('08:00'))
    const plan = [{ ...m, routine: 'r2' }, n]
    const changed = { ...nulls(), [today]: day(today, plan) }
    const at = (id: string) => countScope({ today, files: changed, templates: [], series: [], target: { kind: 'routine', id }, what: 'costs', categories, begun: begun(s, {}, plan) }).days
    expect([at('r1'), at('r2')]).toEqual([2, 0])
  })
})

describe('overriddenFrom (T1336)', () => {
  const today = '2026-11-18'
  const ch = (from: string, patch: Record<string, unknown>, at: number | null = null): SettingsChange => ({ id: `c-${from}`, from, at, patch })
  const head = { categories: { projekty: { costs: { head: 4 } } } }
  it('pierwsza późniejsza data, od której wpis nadpisuje ten sam klucz; inna pula, wpis wcześniejszy albo z dziś – nie', () => {
    expect(overriddenFrom([], today, head)).toBeNull()
    expect(overriddenFrom([ch('2026-12-10', { categories: { projekty: { costs: { head: 1 } } } }), ch('2026-11-25', { categories: { projekty: { costs: { head: 2 } } } })], today, head)).toBe('2026-11-25')
    expect(overriddenFrom([ch('2026-11-25', { categories: { projekty: { costs: { emotions: 2 } } } })], today, head)).toBeNull()
    expect(overriddenFrom([ch('2026-11-10', { categories: { projekty: { costs: { head: 2 } } } }), ch(today, { categories: { projekty: { costs: { head: 2 } } } }, 1)], today, head)).toBeNull()
    expect(overriddenFrom([ch('2026-11-25', { categories: { analiza: { costs: { head: 2 } } } })], today, head)).toBeNull()
  })
  it('kilka pól: data, od której nadpisane są wszystkie; lista wariantów – cała', () => {
    const two = { categories: { projekty: { cls: 'work', costs: { head: 4 } } } }
    expect(overriddenFrom([ch('2026-11-20', { categories: { projekty: { cls: 'life' } } })], today, two)).toBeNull()
    expect(overriddenFrom([ch('2026-11-20', { categories: { projekty: { cls: 'life' } } }), ch('2026-11-25', { categories: { projekty: { costs: { head: 1, emotions: 1 } } } })], today, two)).toBe('2026-11-25')
    const variants = { categories: { regeneracja: { variants: [] } } }
    expect(overriddenFrom([ch('2026-11-19', { categories: { regeneracja: { variants: [{ id: 'spacer', name: 'Spacer' }] } } })], today, variants)).toBe('2026-11-19')
    expect(overriddenFrom([ch('2026-11-19', { categories: { regeneracja: { costs: { head: 0 } } } })], today, variants)).toBeNull()
  })
})

describe('zmiany z okna', () => {
  const was = { name: 'Projekty', group: 'g-wolne', cls: 'free', place: 'computer', color: null, calendar: 'default', costs: { head: 3, emotions: 0, senses: 1 }, flags: {} } as const
  it('podkategoria: pisze tylko pola, które się zmieniły; koszt tylko w puli, która się zmieniła', () => {
    expect(categoryChange(was, { ...was })).toMatchObject({ patch: null, meta: null, group: null, calendar: null, what: null })
    const c = categoryChange(was, { ...was, costs: { ...was.costs, head: 4 } })
    expect(c).toMatchObject({ patch: { costs: { head: 4 } }, what: 'costs' })
    // Name, colour, category, calendar are not dated – and reach every block.
    expect(categoryChange(was, { ...was, name: 'Moje projekty' })).toMatchObject({ patch: null, meta: { name: 'Moje projekty' }, what: 'all' })
    expect(categoryChange(was, { ...was, group: 'g-dom' })).toMatchObject({ group: 'g-dom', what: 'all' })
    expect(categoryChange(was, { ...was, cls: 'work', flags: { noSleep: true } })).toMatchObject({ patch: { cls: 'work', noSleep: true }, what: 'all' })
  })
  it('wariant: koszt „jak podkategoria” ↔ własny, miejsce', () => {
    const v = { name: 'Gra', same: false, costs: { head: -1, emotions: -1, senses: 0 }, place: 'computer' }
    expect(variantChange(v, { ...v })).toMatchObject({ patch: null, what: null })
    expect(variantChange(v, { ...v, same: true })).toMatchObject({ patch: { costs: null }, what: 'costs' })
    expect(variantChange(v, { ...v, costs: { ...v.costs, head: 0 } })).toMatchObject({ patch: { costs: { head: 0, emotions: -1, senses: 0 } }, what: 'costs' })
    expect(variantChange(v, { ...v, place: '-' })).toMatchObject({ patch: { place: null }, what: 'all' })
    expect(variantChange({ ...v, same: true }, { ...v, same: true, costs: { head: 5, emotions: 5, senses: 5 } })).toMatchObject({ patch: null, what: null })
  })
  it('rutyna: nazwa i kroki; kroki bez nazwy nie są zmianą', () => {
    const r = { name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [] }
    expect(routineChange(r, { ...r, normal: [...r.normal, { id: 's2', name: ' ', min: 5 }] })).toMatchObject({ patch: null, what: null })
    expect(routineChange(r, { ...r, name: 'Wieczorna' })).toMatchObject({ patch: { name: 'Wieczorna' }, what: 'all' })
    expect(routineChange(r, { ...r, worse: [{ id: 's3', name: 'Woda', min: 2 }] }).patch).toEqual({ worse: [{ id: 's3', name: 'Woda', min: 2 }] })
  })
  it('rutyna: koszt (D512) – sam koszt to „costs”, razem z nazwą albo krokami – „all”; „jak podkategoria” (null) ↔ własny', () => {
    const r = { name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], costs: null }
    expect(routineChange(r, { ...r })).toMatchObject({ patch: null, what: null })
    expect(routineChange(r, { ...r, costs })).toMatchObject({ patch: { costs }, what: 'costs' })
    expect(routineChange({ ...r, costs }, { ...r, costs: null })).toMatchObject({ patch: { costs: null }, what: 'costs' })
    expect(routineChange({ ...r, costs }, { ...r, costs: { ...costs, head: 3 } })).toMatchObject({ patch: { costs: { ...costs, head: 3 } }, what: 'costs' })
    expect(routineChange({ ...r, costs }, { ...r, costs: { ...costs } })).toMatchObject({ patch: null, what: null })
    expect(routineChange(r, { ...r, name: 'Wieczorna', costs })).toMatchObject({ patch: { name: 'Wieczorna', costs }, what: 'all' })
  })
})
