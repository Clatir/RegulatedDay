/**
 * „Sprawy” in the main window (`store/cases.ts`, D383, D384, D402) without a DOM: each change goes as one edit of the
 * queue made from the records as they are in its turn – a task put on the axis is the day's file and the record together,
 * its „Cofnij” takes back only what stands as the change left it; a task without a title is refused with why.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { dayFileFrom } from '@shared/model/plan'
import { changeCase, createTask, DAY_UNREADABLE, moveCase, planCase, removeCase, undoCase } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const TODAY = logicalDayOf(Date.now())

/** The window over a folder of records and days' files; the edits are only collected (the test sets what they leave). */
function stub(records: RawRecord[], days: Record<string, RawRecord | null> = {}) {
  const sent: EditEntry[][] = []
  const state = { records: [...records], days: { ...days } }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in state.days)
      return { files: Object.fromEntries(known.map((d) => [d, state.days[d] ?? null])), gone: Object.fromEntries(known.map((d) => [d, []])), begun: Object.fromEntries(known.map((d) => [d, []])) }
    },
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  /** What the folder holds after the edits (as the test says it). */
  const set = (rel: string, v: RawRecord | null) => {
    if (rel.startsWith('days/')) state.days[rel.slice(10, 20)] = v
    else state.records = [...state.records.filter((r) => paths.record('request', String(r.id)) !== rel), ...(v ? [v] : [])]
    useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  }
  return { sent, set }
}

const field = (e: EditEntry, name: string) => e.edits.find((x) => x.path.join('.') === name)?.value

describe('sprawy w oknie (store/cases.ts)', () => {
  it('nowe zadanie bez tytułu – odmowa z powodem, nic nie wysłane; z tytułem – jeden nowy rekord w „Skrzynce”', async () => {
    const { sent } = stub([])
    expect(await createTask({ title: '  ' })).toMatchObject({ saved: false, error: 'Zadanie potrzebuje tytułu.' })
    expect(sent).toEqual([])
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Zadanie potrzebuje tytułu.')
    const r = await createTask({ title: 'Filtr w ekspresie' })
    expect(r).toMatchObject({ saved: true, error: null })
    expect(sent).toHaveLength(1)
    expect(sent[0]![0]).toMatchObject({ rel: paths.record('request', r.id!), create: true })
    expect(field(sent[0]![0]!, 'list')).toBe('inbox')
  })

  it('przeniesienie na „Dziś” i zmiana pól to edycje jednego rekordu; zadanie bez tytułu odrzucone', async () => {
    const t = newTask('t1', Date.now(), TODAY, { title: 'x' })!
    const { sent } = stub([t])
    expect((await moveCase('t1', 'today')).saved).toBe(true)
    expect(field(sent[0]![0]!, 'list')).toBe('today')
    expect(field(sent[0]![0]!, 'listDay')).toBe(TODAY)
    expect(await changeCase('t1', { title: '' })).toMatchObject({ saved: false, error: 'Zadanie potrzebuje tytułu.' })
    expect(sent).toHaveLength(1)
    expect(await moveCase('gone', 'week')).toMatchObject({ saved: false, error: 'Tej sprawy już nie ma.' })
  })

  it('zadanie na osi: plik dnia i rekord w jednej edycji, „Cofnij” przywraca oba; zmienione w międzyczasie – nie nadpisuje', async () => {
    const t = newTask('t1', Date.now(), TODAY, { title: 'Zadzwonić' })!
    const { sent, set } = stub([t], { [TODAY]: null })
    const r = await planCase('t1', TODAY, 600)
    expect(r.saved).toBe(true)
    expect(r.block).toMatchObject({ categoryId: 'inne', startMin: 600, durationMin: 30, task: 't1' })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
    expect(r.undo.map((u) => u.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
    // The folder as the change left it, then „Cofnij”: the day without the block, the record without „zaplanowane”.
    for (const u of r.undo) set(u.rel, u.after)
    const back = await undoCase(r.undo)
    expect(back.saved).toBe(true)
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
    const rec = sent[1]!.find((e) => e.rel === paths.record('request', 't1'))!
    expect(field(rec, 'block')).toBeNull()
    // Changed on another computer since: that file stays as it is.
    for (const u of r.undo) set(u.rel, u.after)
    set(paths.record('request', 't1'), { ...r.undo.find((u) => u.rel.startsWith('requests/'))!.after!, note: 'zmienione' })
    await undoCase(r.undo)
    expect(sent[2]!.map((e) => e.rel)).toEqual([paths.day(TODAY)])
  })

  it('ponowne przeciągnięcie na jutro: dzisiejszy blok niezaczęty według logu wychodzi (T769), jutrzejszy – nowy', async () => {
    const tomorrow = '2099-01-02'
    const t = { ...newTask('t1', Date.now(), TODAY, { title: 'x' })!, day: TODAY, block: 'old', state: 'planned' }
    const { sent } = stub([t], { [TODAY]: { schema: 1, date: TODAY, blocks: [{ id: 'old', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user', task: 't1' }] }, [tomorrow]: null })
    const r = await planCase('t1', tomorrow, 700)
    expect(r.saved).toBe(true)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.day(tomorrow), paths.record('request', 't1')].sort())
    const moved = { ...t, day: '2099-01-01', block: 'old' }
    const s2 = stub([moved], { '2099-01-01': { schema: 1, date: '2099-01-01', blocks: [{ id: 'old', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user', task: 't1' }] }, [tomorrow]: null })
    const r2 = await planCase('t1', tomorrow, 700)
    // A day to come, the block not begun: taken out of it, in the same edit.
    expect(s2.sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day('2099-01-01'), paths.day(tomorrow), paths.record('request', 't1')].sort())
    const after = r2.undo.find((u) => u.rel === paths.day('2099-01-01'))!.after
    expect(dayFileFrom(after, '2099-01-01').blocks).toEqual([])
    expect(dayFileFrom(r2.undo.find((u) => u.rel === paths.day(tomorrow))!.after, tomorrow).blocks.map((b) => [b.startMin, b.task])).toEqual([[700, 't1']])
  })

  it('plik dnia nieczytelny teraz: nic nie zapisane (nigdy jak dzień bez pliku), chyba że okno zna jego wersję', async () => {
    const t = newTask('t1', Date.now(), TODAY, { title: 'x' })!
    const { sent } = stub([t])
    expect(await planCase('t1', TODAY, 600)).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(sent).toEqual([])
    const known = { schema: 1, date: TODAY, blocks: [{ id: 'a', categoryId: 'inne', startMin: 480, durationMin: 60, origin: 'user' }] }
    const r = await planCase('t1', TODAY, 600, { seen: () => known })
    expect(r.saved).toBe(true)
    expect(dayFileFrom(r.undo.find((u) => u.rel === paths.day(TODAY))!.after, TODAY).blocks.map((b) => b.id)).toEqual(['a', r.block!.id])
  })

  it('usunięcie z „Cofnij”', async () => {
    const t = newTask('t1', Date.now(), TODAY, { title: 'x' })!
    const { sent, set } = stub([t])
    const r = await removeCase('t1')
    expect(sent[0]![0]).toMatchObject({ rel: paths.record('request', 't1'), remove: true })
    set(paths.record('request', 't1'), null)
    await undoCase(r.undo)
    expect(sent[1]![0]).toMatchObject({ rel: paths.record('request', 't1'), create: true })
  })
})
