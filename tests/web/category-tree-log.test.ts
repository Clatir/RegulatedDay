/**
 * `tree.change` (T1313, T1391): every save of the window goes through one place (`store/data`), and that place writes the event to today's
 * log after a save that really wrote a change of the tree (`treeEdit`) – at most once a day. Whichever way the tree is written (`saveTree`,
 * „Cofnij”, a variant, a new subcategory in a group), nothing sent – no event; a name, a colour or an archive of a subcategory – none (an
 * older version shows them).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, EventIn, RdApi } from '@shared/api'
import { deepEqual, setAt, valueAt } from '@shared/data/merge'
import { OTHER_GROUP, addVariant, removeGroupRaw, setCategoryGroupRaw } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { createCategory, setMeta } from '@renderer/features/settings/categoryFields'
import { saveTree, saveVariants, undoTree } from '@renderer/features/settings/categoryTreeEdits'
import { useData } from '@renderer/store/data'

const IDS = Object.keys(DEFAULT_SETTINGS.categories)
const data = useData.getState()
let file: Record<string, unknown>
let logged: EventIn[]
let refuse: 'log' | 'edit' | null

/** The main process: the queue lays each field whose base holds (else a question), the log takes the events. */
function stub(today: string) {
  file = { schema: 1 }
  logged = []
  refuse = null
  const view = () => ({ today, rd: file, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    edit: async (entries: EditEntry[]) =>
      entries.map((e) => {
        if (refuse === 'edit') return { status: 'conflict' as const }
        let value: unknown = file
        for (const f of e.edits) if (deepEqual(valueAt(value, f.path), f.base)) value = setAt(value, f.path, f.value)
        file = value as Record<string, unknown>
        return { status: 'applied' as const }
      }),
    logEvents: async (events) => {
      if (refuse === 'log') throw new Error('log away')
      logged.push(...events)
    },
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), rd: rdFrom(file) })
}
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
})

const tree = (day: string) => ({ k: 'tree.change', day })

describe('tree.change raz na dzień, w jednym miejscu (T1391)', () => {
  beforeEach(() => stub('2026-11-14'))

  it('dwie zmiany drzewa jednego dnia – jedno zdarzenie; „Cofnij” i wariant tego dnia – już żadne', async () => {
    const { entry } = await saveTree((raw) => removeGroupRaw(raw, 'g-wolne', { to: OTHER_GROUP }, IDS))
    expect(logged).toEqual([tree('2026-11-14')])
    await saveTree((raw) => setCategoryGroupRaw(raw, 'analiza', 'g-dom'))
    expect(await undoTree(entry!)).toBe('undone')
    expect(await saveVariants('analiza', (now) => addVariant(now, { id: 'v', name: 'Przegląd' }), { from: '2026-11-15', at: null })).toBe(true)
    expect(logged).toEqual([tree('2026-11-14')])
  })

  it('nazwa, kolor i archiwum podkategorii – bez zdarzenia; zapis, który nic nie wysłał – bez zdarzenia (T1313)', async () => {
    await setMeta('analiza', { name: 'Analiza 2', color: '#79AFAB' })
    await setMeta('analiza', { archived: true })
    await setMeta('analiza', { archived: false })
    expect(rdFrom(file).categories.analiza).toMatchObject({ name: 'Analiza 2', archived: false })
    // The subcategory is there already as it would be made: `setMeta` sends nothing – no event (`isSaved([])` is not a save).
    file = { schema: 1, categories: { c1: { name: 'Ogród', color: null, archived: false, group: 'g-dom' } } }
    useData.setState({ view: { ...useData.getState().view!, rd: file }, rd: rdFrom(file) })
    expect(await createCategory(async () => true, 'c1', {}, { name: 'Ogród', color: null, group: 'g-dom' })).toBe(true)
    expect(logged).toEqual([])
  })
})

describe('tree.change: każdy dzień od nowa, porażka zapisu zdarzenia – następna zmiana próbuje znów', () => {
  it('nowa podkategoria w grupie; zmiana, która spotkała pytanie – bez zdarzenia; log niedostępny – próba przy następnej zmianie', async () => {
    stub('2026-11-15')
    refuse = 'edit'
    await saveTree((raw) => setCategoryGroupRaw(raw, 'analiza', 'g-dom'))
    expect(logged).toEqual([])
    refuse = 'log'
    expect(await createCategory(async () => true, 'c1', {}, { name: 'Ogród', color: null, group: 'g-dom' })).toBe(true)
    expect(logged).toEqual([])
    refuse = null
    await saveTree((raw) => setCategoryGroupRaw(raw, 'analiza', 'g-dom'))
    expect(logged).toEqual([tree('2026-11-15')])
    // The next day: one again.
    stub('2026-11-16')
    await saveTree((raw) => setCategoryGroupRaw(raw, 'analiza', 'g-nauka'))
    await saveTree((raw) => setCategoryGroupRaw(raw, 'analiza', 'g-dom'))
    expect(logged).toEqual([tree('2026-11-16')])
  })
})
