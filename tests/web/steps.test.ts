/**
 * Steps in the window and on the bar (SNT5, D440) without a DOM: the bar's step line „☐ <krok> · krok 1/4” with its tick
 * (in every bar – the desktop bar's click works without keys, D229), „Wszystkie kroki ✓” without a tick, nothing without
 * steps; the store's changes as one edit each (`store/steps.ts`) – a tick only the day's `stepsDone`, a block of a task with
 * the task's record, a task's change with its block's day, a template's version, „Cofnij” only of what stands as left.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { addStepOp, moveStepOp, type Step } from '@shared/model/steps'
import { templateJson } from '@shared/model/defaults'
import { planBlock, templateFrom } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { noFolderView, type WidgetView } from '@shared/widget'
import { Bar } from '@renderer/widget/Bar'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { changeBlockSteps, changeTaskSteps, changeTemplateSteps, tickBlockStep, tickTaskStep, undoSteps } from '@renderer/store/steps'
import { DAY_UNREADABLE } from '@renderer/store/cases'

const four = (): Step[] => ['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie', 'Zrobić commit'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: false }))

describe('linia kroku w pasku (D440)', () => {
  const dayView = (over: Partial<WidgetView> = {}): WidgetView => ({ ...noFolderView(), day: '2026-11-18', lines: [], block: { name: 'Wdrożenie', className: 'praca', endsAt: null }, ...over })
  const html = (view: WidgetView, mode: 'main' | 'panel' | 'desktop') => renderToStaticMarkup(createElement(Bar, { view, mode }))

  it('„☐ Napisać testy · krok 1/4” z ptaszkiem w każdym pasku', () => {
    for (const mode of ['main', 'panel', 'desktop'] as const) {
      const out = html(dayView({ steps: { block: 'b1', step: { id: 's1', title: 'Napisać testy', n: 1 }, total: 4 } }), mode)
      expect(out).toContain('data-testid="bar-step-tick"')
      expect(out).toContain('☐')
      expect(out).toContain('Napisać testy · krok 1/4')
      expect(out).toContain('aria-label="Odhacz: Napisać testy"')
    }
  })

  it('po ostatnim – „Wszystkie kroki ✓” bez ptaszka; bez kroków albo bez bloku – nic', () => {
    const all = html(dayView({ steps: { block: 'b1', step: null, total: 4 } }), 'desktop')
    expect(all).toContain('Wszystkie kroki ✓')
    expect(all).not.toContain('bar-step-tick')
    expect(html(dayView({ steps: null }), 'desktop')).not.toContain('bar-step')
    expect(html(dayView({ block: null, steps: { block: 'b1', step: null, total: 1 } }), 'desktop')).not.toContain('bar-step')
  })
})

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const TODAY = logicalDayOf(Date.now())

/** The window over records and days' files; the edits are collected, the test sets what they leave. */
function stub(records: { requests?: RawRecord[]; templates?: RawRecord[] }, days: Record<string, RawRecord | null> = {}) {
  const sent: EditEntry[][] = []
  const state = { requests: [...(records.requests ?? [])], templates: [...(records.templates ?? [])], days: { ...days } }
  const view = (): DataView => ({ status: 'open', rd: null, templates: state.templates, lectures: [], requests: state.requests, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in state.days)
      return { files: Object.fromEntries(known.map((d) => [d, state.days[d] ?? null])), gone: {}, begun: {} }
    },
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  const sync = () => useData.setState({ view: view(), requests: state.requests.map((r) => requestFrom(r)!), templates: state.templates.map((t) => templateFrom(t)!) })
  sync()
  const set = (rel: string, v: RawRecord | null) => {
    if (rel.startsWith('days/')) state.days[rel.slice(10, 20)] = v
    else if (rel.startsWith('requests/')) state.requests = [...state.requests.filter((r) => paths.record('request', String(r.id)) !== rel), ...(v ? [v] : [])]
    else state.templates = [...state.templates.filter((r) => paths.record('template', String(r.id)) !== rel), ...(v ? [v] : [])]
    sync()
  }
  return { sent, set }
}

const paths1 = (e: EditEntry[]) => e.map((x) => x.edits.map((f) => `${x.rel}:${f.path.join('.')}`)).flat()

describe('kroki w oknie (store/steps.ts)', () => {
  it('odhaczenie: jedna edycja – tylko `stepsDone` dnia; „Cofnij” je zdejmuje, zmienione w międzyczasie – zostaje', async () => {
    const block = planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 90, origin: 'template', steps: four() })
    const { sent, set } = stub({}, { [TODAY]: null })
    const r = await tickBlockStep(TODAY, block, 's1', true)
    expect(r.saved).toBe(true)
    // Leaf by leaf (T788): the first tick on two computers – two fields, never one whole map meeting the other's.
    expect(paths1(sent[0]!)).toEqual([`${paths.day(TODAY)}:schema`, `${paths.day(TODAY)}:date`, `${paths.day(TODAY)}:stepsDone.b1.s1`])
    expect(sent[0]![0]!.edits.find((f) => f.path[0] === 'stepsDone')).toMatchObject({ base: undefined, value: true })
    for (const u of r.undo) set(u.rel, u.after)
    const back = await undoSteps(r.undo)
    expect(back.saved).toBe(true)
    expect(sent[1]![0]).toMatchObject({ rel: paths.day(TODAY), remove: true })
    // Ticked again elsewhere meanwhile: „Cofnij” writes nothing over it.
    for (const u of r.undo) set(u.rel, { ...u.after!, note: 'inny komputer' })
    await undoSteps(r.undo)
    expect(sent).toHaveLength(2)
  })

  it('plik dnia nieczytelny teraz: nic nie zapisane; znana wersja z okna – zapis na niej', async () => {
    const block = planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 90, steps: four() })
    const { sent } = stub({})
    expect(await tickBlockStep(TODAY, block, 's1', true)).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(sent).toEqual([])
    expect((await tickBlockStep(TODAY, block, 's1', true, { schema: 1, date: TODAY })).saved).toBe(true)
  })

  it('blok zadania: odhaczenie i nowy krok – plik dnia i rekord zadania w jednej edycji', async () => {
    const task = { ...newTask('t1', Date.now(), TODAY, { title: 'Wdrożenie' })!, day: TODAY, block: 'tb', state: 'planned', steps: four().map(({ done: _d, ...s }) => s) }
    const block = planBlock({ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 90, task: 't1', steps: four() })
    const day = { schema: 1, date: TODAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 90, origin: 'user', task: 't1', steps: four().map(({ done: _d, ...s }) => s) }] }
    const { sent } = stub({ requests: [task] }, { [TODAY]: day })
    expect((await tickBlockStep(TODAY, block, 's2', true)).saved).toBe(true)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
    expect(paths1(sent[0]!).sort()).toEqual([`${paths.day(TODAY)}:stepsDone.tb.s2`, `${paths.record('request', 't1')}:stepsDone.s2`].sort())
    const add = await changeBlockSteps(TODAY, block, addStepOp('Napisać changelog'))
    expect(add.saved).toBe(true)
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
  })

  it('zadanie ze „Spraw”: zmiana listy i odhaczenie idą też do jego bloku dziś', async () => {
    const task = { ...newTask('t1', Date.now(), TODAY, { title: 'Wdrożenie' })!, day: TODAY, block: 'tb', state: 'planned', steps: four().map(({ done: _d, ...s }) => s) }
    const day = { schema: 1, date: TODAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 90, origin: 'user', task: 't1', steps: four().map(({ done: _d, ...s }) => s) }] }
    const { sent } = stub({ requests: [task] }, { [TODAY]: day })
    expect((await changeTaskSteps('t1', moveStepOp(four(), 's4', 0))).saved).toBe(true)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
    expect((await tickTaskStep('t1', 's1', true)).saved).toBe(true)
    expect(paths1(sent[1]!).sort()).toEqual([`${paths.day(TODAY)}:stepsDone.tb.s1`, `${paths.record('request', 't1')}:stepsDone.s1`].sort())
    // Not planned: the record alone.
    const s2 = stub({ requests: [{ ...task, day: null, block: null, state: 'queued' }] })
    expect((await tickTaskStep('t1', 's1', true)).saved).toBe(true)
    expect(s2.sent[0]!.map((e) => e.rel)).toEqual([paths.record('request', 't1')])
    expect(await changeTaskSteps('gone', addStepOp('x'))).toMatchObject({ saved: false, error: 'Tej sprawy już nie ma.' })
  })

  it('blok szablonu: lista w wersji od daty; brak szablonu – odmowa', async () => {
    // As the app writes a template (`templateJson`).
    const t = templateJson(templateFrom({ schema: 1, id: 'zw', name: 'Zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: { '2026-01-01': { blocks: [{ id: 'w', categoryId: 'inne', startMin: 540, durationMin: 60, steps: four() }] } } })!)
    const { sent } = stub({ templates: [t] })
    const r = await changeTemplateSteps('zw', '2099-01-01', 'w', { op: 'remove', id: 's1' })
    expect(r.saved).toBe(true)
    expect(sent[0]![0]!.rel).toBe(paths.record('template', 'zw'))
    expect(paths1(sent[0]!)).toEqual([`${paths.record('template', 'zw')}:versions.2099-01-01`])
    expect(await changeTemplateSteps('brak', '2099-01-01', 'w', { op: 'remove', id: 's1' })).toMatchObject({ saved: false, error: 'Tego szablonu już nie ma.' })
  })
})
