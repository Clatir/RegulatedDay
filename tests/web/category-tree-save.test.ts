// @vitest-environment jsdom
/**
 * Zapis drzewa kategorii z okna (D510): grupy i miejsce podkategorii – rd.json od razu (`saveTree`, „Cofnij” = `undoTree`), warianty
 * – zmiana ustawień z datą liczona w kolejce zapisu z rd.json z tej chwili (`saveVariants`). Każda zapisana zmiana pisze `tree.change`
 * do dzisiejszego logu (starsza wersja instaluje nową bez 24 h, T1313); nic niezmienione – nic nie idzie. Atrapa kolejki jak w
 * `calendars-settings.test.ts`: edycja kładzie się na rd.json pole po polu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditEntry } from '@shared/api'
import { costsOf } from '@shared/model/categories'
import { OTHER_GROUP, addGroupRaw, addVariant, changeVariant, groupOfCategory, removeGroupRaw, setCategoryGroupRaw } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'
import { saveTree, saveVariants, undoTree } from '@renderer/features/settings/categoryTreeEdits'
import { createCategory } from '@renderer/features/settings/categoryFields'
import { groupedCategoryOptions } from '@renderer/features/plan/blockView'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { useData } from '@renderer/store/data'

const fake = vi.hoisted(() => ({ file: { schema: 1 } as Record<string, unknown>, sent: 0, unreadable: false }))
vi.mock('@renderer/store/data', async (orig) => {
  const real = await orig<typeof import('@renderer/store/data')>()
  const { deepEqual, setAt, valueAt } = await import('@shared/data/merge')
  const { rdFrom: read } = await import('@shared/model/rd')
  const trySaveWith = async (make: () => Promise<ReadonlyArray<EditEntry | null>> | ReadonlyArray<EditEntry | null>) => {
    const list = (await make()).filter((e): e is EditEntry => !!e)
    if (!list.length) return []
    fake.sent++
    const statuses = list.map((e) => {
      let ok = true
      let value: unknown = fake.file
      for (const f of e.edits) {
        const now = valueAt(value, f.path)
        if (deepEqual(now, f.value)) continue
        if (deepEqual(now, f.base)) value = setAt(value, f.path, f.value)
        else ok = false
      }
      fake.file = value as Record<string, unknown>
      return ok ? ('applied' as const) : ('conflict' as const)
    })
    real.useData.setState({ rd: read(fake.file) })
    return statuses.map((status) => ({ id: 'x', status, fields: [] }))
  }
  const trySaveRd = (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => trySaveWith(() => [real.editOf('rd.json', fake.file, fn({ ...fake.file }))])
  return {
    ...real,
    rawRecord: (rel: string) => (rel === 'rd.json' && !fake.unreadable ? fake.file : null),
    trySaveWith,
    trySaveRd,
    saveRd: async (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => (await trySaveRd(fn)) ?? []
  }
})

const TODAY = '2026-11-14'
const logged: unknown[][] = []
beforeEach(() => {
  fake.file = { schema: 1 }
  fake.sent = 0
  fake.unreadable = false
  logged.length = 0
  useData.setState({ rd: rdFrom(fake.file), view: { today: TODAY } as never })
  ;(window as unknown as { rd: unknown }).rd = { logEvents: vi.fn(async (events: unknown[]) => void logged.push(events)) }
})
afterEach(() => {
  delete (window as unknown as { rd?: unknown }).rd
})

const tree = { k: 'tree.change', day: TODAY }

describe('saveTree / undoTree (rd.json, od razu)', () => {
  it('nowa grupa z podkategorią: zapis pole po polu i tree.change w dzisiejszym logu', async () => {
    const g = { id: 'trd', name: 'Trading', order: 5, archived: false }
    const { entry } = await saveTree((raw) => setCategoryGroupRaw(addGroupRaw(raw, g), 'analiza', g.id))
    expect(entry).not.toBeNull()
    expect(groupOfCategory(rdFrom(fake.file), 'analiza')).toBe('trd')
    expect(logged).toEqual([[tree]])
  })

  it('nic się nie zmienia – nic nie idzie, bez tree.change; rd.json nieczytelny – nic nie idzie', async () => {
    const { entry } = await saveTree((raw) => setCategoryGroupRaw(raw, 'nauka', 'g-nauka'))
    expect(entry).toBeNull()
    fake.unreadable = true
    expect((await saveTree((raw) => setCategoryGroupRaw(raw, 'nauka', OTHER_GROUP))).entry).toBeNull()
    expect(fake.sent).toBe(0)
    expect(logged).toEqual([])
  })

  it('usunięcie grupy z przeniesieniem i „Cofnij”; plik zmieniony od usunięcia – zostaje, jak jest', async () => {
    const ids = Object.keys(rdFrom({}).categories)
    const { entry } = await saveTree((raw) => removeGroupRaw(raw, 'g-wolne', { to: OTHER_GROUP }, ids))
    expect(groupOfCategory(rdFrom(fake.file), 'projekty')).toBe(OTHER_GROUP)
    expect(await undoTree(entry!)).toBe('undone')
    expect(groupOfCategory(rdFrom(fake.file), 'projekty')).toBe('g-wolne')
    expect(logged).toEqual([[tree], [tree]])
    // Changed since (another computer moved a subcategory back): „Cofnij” overwrites nothing.
    const again = (await saveTree((raw) => removeGroupRaw(raw, 'g-wolne', { to: OTHER_GROUP }, ids))).entry!
    fake.file = setCategoryGroupRaw(fake.file, 'projekty', 'g-praca')
    expect(await undoTree(again)).toBe('changed')
    expect(groupOfCategory(rdFrom(fake.file), 'projekty')).toBe('g-praca')
  })
})

describe('saveVariants (ustawienia z datą, lista liczona w kolejce zapisu)', () => {
  const tomorrow = { from: '2026-11-15', at: null }

  it('wariant „Analizy” dodany od jutra: lista z rd.json z chwili zapisu (wariant z innego komputera zostaje), tree.change', async () => {
    // Another computer added a variant meanwhile; the window's view still has the old settings.
    fake.file = { schema: 1, settings: [{ id: 'other', from: '2026-11-15', at: null, made: 1, patch: { categories: { analiza: { variants: [{ id: 'x', name: 'Z innego' }] } } } }] }
    expect(await saveVariants('analiza', (now) => addVariant(now, { id: 'y', name: 'Przegląd', costs: { head: 2, emotions: 0, senses: 0 } }), tomorrow)).toBe(true)
    const s = settingsOn(rdFrom(fake.file).settings, '2026-11-15')
    expect(s.categories.analiza!.variants.map((v) => v.id)).toEqual(['x', 'y'])
    expect(costsOf(s.categories.analiza!, 'y')).toEqual({ head: 2, emotions: 0, senses: 0 })
    expect(logged).toEqual([[tree]])
  })

  it('koszt „jak podkategoria” (null); zmiana bez skutku – nic nie idzie, false, bez tree.change', async () => {
    expect(await saveVariants('nauka', (now) => changeVariant(now, 'sluchanie', { costs: null }), tomorrow)).toBe(true)
    const s = settingsOn(rdFrom(fake.file).settings, '2026-11-15')
    expect(costsOf(s.categories.nauka!, 'sluchanie')).toEqual(s.categories.nauka!.costs)
    logged.length = 0
    const sent = fake.sent
    expect(await saveVariants('nauka', (now) => changeVariant(now, 'sluchanie', { costs: null }), tomorrow)).toBe(false)
    expect(await saveVariants('nie-ma', (now) => addVariant(now, { id: 'z', name: 'Z' }), tomorrow)).toBe(false)
    expect(fake.sent).toBe(sent)
    expect(logged).toEqual([])
  })
})

describe('createCategory w grupie', () => {
  it('nowa podkategoria w nazwanej grupie: pole grupy i tree.change; w „Inne” – bez pola i bez zdarzenia', async () => {
    const save = async () => true
    expect(await createCategory(save, 'c1', {}, { name: 'Ogród', color: null, group: 'g-dom' })).toBe(true)
    expect(groupOfCategory(rdFrom(fake.file), 'c1')).toBe('g-dom')
    expect(logged).toEqual([[tree]])
    expect(await createCategory(save, 'c2', {}, { name: 'Różne', color: null, group: OTHER_GROUP })).toBe(true)
    expect(rdFrom(fake.file).categories.c2).not.toHaveProperty('group')
    expect(logged).toHaveLength(1)
  })
})

describe('lista „Podkategoria” w panelu bloku (D510)', () => {
  it('jedna lista z nagłówkami kategorii: nazwy, nie id; pusta i zarchiwizowana grupa pominięta; bieżąca zarchiwizowana zostaje', () => {
    const rd = rdFrom({ schema: 1, categoryGroups: [{ id: 'g-wolne', archived: true }, { id: 'pusta', name: 'Pusta', order: 7 }], categories: { posilek: { name: 'Posiłek', archived: true } } })
    const list = groupedCategoryOptions({ rd, settings: DEFAULT_SETTINGS }, 'posilek')
    expect(list.map((g) => g.label)).toEqual(['Praca', 'Nauka', 'Dom i opieka', 'Inne'])
    expect(list[0]!.options).toEqual([
      { value: 'analiza', label: 'Analiza' },
      { value: 'inne', label: 'Inne obowiązki' },
      { value: 'journaling', label: 'Journaling' },
      { value: 'sesja', label: 'Sesja tradingowa' }
    ])
    expect(list[2]!.options[0]).toEqual({ value: 'posilek', label: 'Posiłek' })
    expect(list[3]!.options.map((o) => o.label)).toEqual(['Projekty', 'Regeneracja'])
    expect(groupedCategoryOptions({ rd, settings: DEFAULT_SETTINGS })[2]!.options.map((o) => o.value)).not.toContain('posilek')
  })
})
