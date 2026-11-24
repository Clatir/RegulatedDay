/**
 * Wklejona lista na stronie „Sprawy” bez DOM (N11, D605, D606): `createTasks` – każda linia jak `createTask` (słowa dat, długość, #podkategoria,
 * godzina → blok na osi), wszystko jedną edycją (pliki dni raz), jedno „Cofnij” (`undoGroup`) zdejmujące wszystko poza zmienionym od zapisu.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { LIST_MAX } from '@shared/quickList'
import { requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { createTasks } from '@renderer/store/cases'
import { undoGroup } from '@renderer/store/casesGroup'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const TODAY = logicalDayOf(Date.now())
const TOMORROW = addDays(TODAY, 1)
const rel = (id: string) => paths.record('request', id)

/** The window over an empty folder whose days are readable; `lay` puts what a change left, as the folder would. */
function stub() {
  const sent: EditEntry[][] = []
  const state = { records: [] as RawRecord[], days: {} as Record<string, RawRecord | null> }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const sync = () => useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, state.days[d] ?? null])),
    caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, state.days[d] ?? null])), gone: {}, begun: {} }),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  sync()
  const set = (r: string, v: RawRecord | null) => {
    if (r.startsWith('days/')) state.days[r.slice(10, 20)] = v
    else state.records = [...state.records.filter((x) => rel(String(x.id)) !== r), ...(v ? [v] : [])]
    sync()
  }
  const lay = (undo: ReadonlyArray<{ rel: string; after: RawRecord | null }>) => undo.forEach((u) => set(u.rel, u.after))
  return { sent, set, lay, state }
}
const field = (e: EditEntry, name: string) => e.edits.find((x) => x.path.join('.') === name)?.value
const LINES = ['Kup mleko', 'Raport @jutro 15:00 1h #anal', 'Telefon @jutro 16:00', 'Stara @2020-01-05 15:00', 'Zamówić karmę !jutro']

describe('createTasks – wklejona lista (N11)', () => {
  it('5 linii – 5 spraw jedną edycją: plik dnia jutra raz z dwoma blokami, rekordy po nim; nieudana godzina – bez bloku i policzona', async () => {
    const { sent } = stub()
    const r = await createTasks(LINES)
    expect(r).toMatchObject({ saved: true, error: null, notPlaced: 1 })
    expect(r.ids).toHaveLength(5)
    expect(sent).toHaveLength(1)
    const di = sent[0]!.findIndex((e) => e.rel === paths.day(TOMORROW))
    const dayEntry = sent[0]![di]
    const records = sent[0]!.filter((_, i) => i !== di)
    expect(sent[0]).toHaveLength(6)
    expect(sent[0]!.filter((e) => e.rel.startsWith('days/'))).toHaveLength(1)
    const blocks = field(dayEntry!, 'blocks') as Array<{ id: string; startMin: number; durationMin: number; categoryId: string; task: string }>
    expect(blocks.map((b) => [b.startMin, b.durationMin, b.categoryId]).sort()).toEqual([[900, 60, 'analiza'], [960, 30, 'inne']])
    const byTitle = Object.fromEntries(records.map((e) => [field(e, 'title') as string, e]))
    expect(Object.keys(byTitle).sort()).toEqual(['Kup mleko', 'Raport', 'Stara', 'Telefon', 'Zamówić karmę'])
    expect(byTitle['Raport']!.after).toEqual([di])
    expect(field(byTitle['Raport']!, 'day')).toBe(TOMORROW)
    expect(field(byTitle['Raport']!, 'estimateMin')).toBe(60)
    expect(field(byTitle['Telefon']!, 'block')).toBe(blocks.find((b) => b.startMin === 960)!.id)
    expect(byTitle['Kup mleko']!.after).toBeUndefined()
    expect(field(byTitle['Stara']!, 'day')).toBeNull()
    expect(field(byTitle['Zamówić karmę']!, 'dueDate')).toBe(TOMORROW)
    // The ids come back in the order of the lines.
    expect(r.ids.map((id) => field(records.find((e) => e.rel === rel(id))!, 'title'))).toEqual(['Kup mleko', 'Raport', 'Telefon', 'Stara', 'Zamówić karmę'])
  })

  it('linie bez tytułu (same słowa) i puste pomijane; nic do zapisania – odmowa jak przy jednej sprawie, nic nie wysłane', async () => {
    const { sent } = stub()
    expect(await createTasks(['Jedno', '!jutro', '  ', 'Drugie'])).toMatchObject({ saved: true, notPlaced: 0, ids: expect.arrayContaining([expect.any(String)]) })
    expect(sent[0]).toHaveLength(2)
    expect(await createTasks(['!jutro', ' '])).toMatchObject({ saved: false, error: 'Zadanie potrzebuje tytułu.', ids: [] })
    expect(sent).toHaveLength(1)
  })

  it('najwyżej 50 linii naraz (D605)', async () => {
    const { sent } = stub()
    const r = await createTasks(Array.from({ length: LIST_MAX + 7 }, (_, i) => `Zadanie ${i + 1}`))
    expect(r.ids).toHaveLength(LIST_MAX)
    expect(sent[0]).toHaveLength(LIST_MAX)
  })

  it('plik dnia nieczytelny: wszystkie zapisane bez bloków, wszystkie policzone', async () => {
    const { sent } = stub()
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window.rd.caseDays = () => Promise.reject(new Error('ipc'))
    const r = await createTasks(['Raport @jutro 15:00', 'Telefon @jutro 16:00', 'Trzecie'])
    expect(r).toMatchObject({ saved: true, notPlaced: 2 })
    expect(sent[0]).toHaveLength(3)
  })

  it('„Cofnij” (undoGroup): wszystkie sprawy i plik dnia z ich blokami znikają jedną edycją', async () => {
    const { sent, lay, state } = stub()
    const r = await createTasks(LINES)
    lay(r.undo)
    expect(state.records).toHaveLength(5)
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 5, kept: 0, daysKept: 0 })
    expect(sent).toHaveLength(2)
    expect(sent[1]!.every((e) => e.remove === true)).toBe(true)
    expect(sent[1]).toHaveLength(6)
  })

  it('„Cofnij” zostawia sprawę zmienioną od zapisu i nie przepisuje dnia, w którym przesunięto blok z listy (kept, daysKept)', async () => {
    const { sent, lay, set, state } = stub()
    const r = await createTasks(LINES)
    lay(r.undo)
    // „Kup mleko” renamed since the save.
    const milk = state.records.find((x) => x.title === 'Kup mleko')!
    set(rel(String(milk.id)), { ...milk, title: 'Kup masło' })
    // A block of the list moved in the day's file since.
    const file = state.days[TOMORROW]!
    set(paths.day(TOMORROW), { ...file, blocks: (file.blocks as Array<Record<string, unknown>>).map((b, i) => (i === 0 ? { ...b, startMin: 1000 } : b)) })
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, daysKept: 1 })
    // Taken: „Stara” and „Zamówić karmę” (no block). Kept: the renamed one and the two with blocks (tied to the day that stayed).
    expect(back).toMatchObject({ restored: 2, kept: 3 })
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([rel(String(state.records.find((x) => x.title === 'Stara')!.id)), rel(String(state.records.find((x) => x.title === 'Zamówić karmę')!.id))].sort())
  })

  it('jedna sprawa listy zmieniona od zapisu zatrzymuje dzień: wszystkie 3 sprawy z blokami zostają (kept 3, daysKept 1) – D607', async () => {
    const { sent, lay, set, state } = stub()
    const r = await createTasks(['A @jutro 10:00', 'B @jutro 11:00', 'C @jutro 12:00'])
    lay(r.undo)
    const a = state.records.find((x) => x.title === 'A')!
    set(rel(String(a.id)), { ...a, title: 'A zmieniona' })
    expect(await undoGroup(r.undo)).toMatchObject({ saved: true, restored: 0, kept: 3, daysKept: 1 })
    expect(sent).toHaveLength(1)
    expect(state.records).toHaveLength(3)
    expect((state.days[TOMORROW]!.blocks as unknown[]).length).toBe(3)
  })
})
