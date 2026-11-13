/**
 * Steps in the window (SNT5) – the cases of the xhigh review without a DOM: a change of a series' list by its scope goes
 * to the main process as an op (laid on the version in force in the write's turn, T517) – never as a list copied from a
 * block the window holds; the list of a series in „Szablony” the same way; „Tylko to” not saved for a broken file or a
 * failed send is a refusal (`false`), not a question; a task whose block's day cannot be read now changes nothing
 * (`DAY_UNREADABLE`, as T769).
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi, SeriesResult } from '@shared/api'
import { planBlock } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { addStepOp, type Step } from '@shared/model/steps'
import { logicalDayOf } from '@shared/time/day'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { DAY_UNREADABLE } from '@renderer/store/cases'
import * as store from '@renderer/store/steps'
import { stepsAnswer } from '@renderer/features/steps/stepsUi'

const four = (): Step[] => ['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie', 'Zrobić commit'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: false }))
const TODAY = logicalDayOf(Date.now())

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const okResult: SeriesResult = { ok: true, error: null, code: null, seriesId: 'ang', outcomes: [], undo: [] }

function stub(o: { requests?: RawRecord[]; days?: Record<string, RawRecord | null>; edit?: RdApi['edit']; dayFiles?: RdApi['dayFiles']; broken?: string[] } = {}) {
  const sent: EditEntry[][] = []
  const calls: unknown[][] = []
  const days = o.days ?? {}
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: o.requests ?? [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: o.dayFiles ?? (async (dates) => Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, days[d] ?? null]))),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in days)
      return { files: Object.fromEntries(known.map((d) => [d, days[d] ?? null])), gone: {}, begun: {}, ...(o.broken ? { broken: dates.filter((d) => o.broken!.includes(d)) } : {}) }
    },
    edit: o.edit ?? (async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const })))),
    dataView: async () => view(),
    seriesChange: async (...args) => (calls.push(args), okResult)
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: (o.requests ?? []).map((r) => requestFrom(r)!) })
  return { sent, calls }
}

describe('zakres serii: operacja na wersji w turze zapisu (przegląd, T790)', () => {
  it('„Cała seria” i „To i następne” wysyłają operację, nie listę z bloku okna – dwa kroki z rzędu z tego samego bloku: oba', async () => {
    const { calls } = stub()
    // Today's occurrence begun: the window's block does not follow the series – no list of it goes, only the op.
    const a = addStepOp('A')
    const b = addStepOp('B')
    expect(await store.changeSeriesSteps({ date: TODAY, blockId: 'occ' }, 'all', a, '')).toEqual({ answer: true, refused: false })
    expect(await store.changeSeriesSteps({ date: TODAY, blockId: 'occ' }, 'following', b, '')).toEqual({ answer: true, refused: false })
    expect(calls).toEqual([
      [{ date: TODAY, blockId: 'occ' }, 'all', { stepsOp: a }],
      [{ date: TODAY, blockId: 'occ' }, 'following', { stepsOp: b }]
    ])
  })

  it('lista serii w „Szablonach”: `changeSeriesListSteps` – cała seria od dziś, operacją', async () => {
    const { calls } = stub()
    const op = { op: 'remove' as const, id: 's2' }
    expect(await store.changeSeriesListSteps('ang', op, 'Krok usunięty')).toBe(true)
    expect(calls).toEqual([[{ seriesId: 'ang' }, 'all', { stepsOp: op }]])
  })

  it('„Tylko to” (edycja dnia) niezapisane: plik uszkodzony – odmowa (`false`); błąd po wysłaniu – pytanie (przegląd 2: `steps-review2.test.ts`)', async () => {
    const block = planBlock({ id: 'occ', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'series', sourceId: 'ang', steps: four() })
    stub({ days: { [TODAY]: null }, edit: async (entries) => entries.map(() => ({ status: 'broken' as const })) })
    const op = addStepOp('x')
    expect(stepsAnswer(op, await store.changeBlockSteps(TODAY, block, op))).toBe(false)
  })
})

describe('zadanie z blokiem, którego dnia nie da się odczytać (przegląd, T792)', () => {
  it('zmiana listy i odhaczenie zadania: `DAY_UNREADABLE`, nic nie zapisane (nigdy samo zadanie bez bloku)', async () => {
    const task = { ...newTask('t1', Date.now(), TODAY, { title: 'Wdrożenie' })!, day: TODAY, block: 'tb', state: 'planned', steps: four().map(({ done: _d, ...s }) => s) }
    const { sent } = stub({ requests: [task] })
    expect(await store.changeTaskSteps('t1', addStepOp('nowy'))).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(await store.tickTaskStep('t1', 's1', true)).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(sent).toEqual([])
  })
})
