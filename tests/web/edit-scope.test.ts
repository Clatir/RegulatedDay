/**
 * How many blocks a quick edit from a block's panel changes (D514, T1325): the blocks of the days' files from today on, the templates' and the
 * series' – a change of cost only reaches blocks without a cost of their own (and, for a subcategory, without a variant that has one).
 */
import { describe, expect, it } from 'vitest'
import { countScope, reaches, SCOPE_DAYS, scopeDates, scopeDetail, scopeText } from '@renderer/features/plan/editScope'
import { categoryChange, routineChange, variantChange } from '@renderer/features/plan/editChanges'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { planBlock, templateFrom, type PlanBlock } from '@shared/model/plan'
import { seriesFrom } from '@shared/model/series'

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

  it('tekst: odmiana i skład liczby', () => {
    const c = { days: 1, templates: 1, series: 1, total: 3, unread: 2 }
    expect(scopeText(c)).toBe('Zmieni 3 bloki od dziś')
    expect(scopeText({ ...c, total: 1 })).toBe('Zmieni 1 blok od dziś')
    expect(scopeText({ ...c, total: 5 })).toBe('Zmieni 5 bloków od dziś')
    expect(scopeDetail(c)).toContain('w dniach: 1 · w szablonach: 1 · w seriach: 1')
    expect(scopeDetail(c)).toContain('Nie policzono 2 nieczytelnych dni')
    expect(scopeDetail({ ...c, unread: 0 })).not.toContain('Nie policzono')
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
})
