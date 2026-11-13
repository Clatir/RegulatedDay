// @vitest-environment jsdom
/**
 * U6 (D465) in the window: „Zrobione” of a task that repeats writes the next task in the same edit (its „Cofnij” takes both
 * back – the next one only while it stands as made); a next task the window already has is not written again; the field
 * „Powtarzaj” of the row (the rules of a series without „W dni szczególne”, „Zapisz powtarzanie”), the rule in words by the task.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { nextTaskId, nextTaskRaw } from '@shared/engine/caseRepeat'
import { caseItems, listedRaw, patchedRaw } from '@shared/engine/cases'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { statusParts } from '@renderer/features/cases/casesLogic'
import { answerTask, changeCase, moveCase, nextTaskText, undoCase } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
const data = useData.getState()
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  useData.setState(data, true)
})

const TODAY = logicalDayOf(Date.now())
const rel = (id: string) => paths.record('request', id)
const daily = (o: Partial<{ doDate: string | null }> = {}) => {
  const t = newTask('t1', Date.now(), TODAY, { title: 'Podlać kwiaty', doDate: o.doDate ?? TODAY })!
  const r = patchedRaw(t, { repeat: { rule: { kind: 'daily' }, until: null, count: null } }, Date.now())
  if ('error' in r) throw new Error(r.error)
  return r.raw
}

/** The window over a folder of records; the edits are collected and laid (applied) as the folder would. */
function stub(records: RawRecord[]) {
  const sent: EditEntry[][] = []
  const state = { records: [...records] }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {}, computers: [] }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async () => ({}),
    caseDays: async () => ({ files: {}, gone: {}, begun: {} }),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), rd: rdFrom({}), requests: state.records.map((r) => requestFrom(r)!) })
  const set = (r: string, v: RawRecord | null) => {
    state.records = [...state.records.filter((x) => rel(String(x.id)) !== r), ...(v ? [v] : [])]
    useData.setState({ view: view(), requests: state.records.map((x) => requestFrom(x)!) })
  }
  return { sent, set }
}

describe('„Zrobione” zadania, które się powtarza (D465)', () => {
  it('jedna edycja: zadanie w „Zrobione” i następne z kolejną datą; dymek z „Cofnij”; „Cofnij” zdejmuje następne i przywraca zadanie', async () => {
    const t = daily()
    const { sent, set } = stub([t])
    const r = await moveCase('t1', 'done')
    expect(r.saved).toBe(true)
    expect(r.next).toBe(nextTaskId('t1'))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([rel('t1'), rel(nextTaskId('t1'))].sort())
    const made = sent[0]!.find((e) => e.rel === rel(nextTaskId('t1')))!
    expect(made.create).toBe(true)
    expect(made.edits.find((x) => x.path.join('.') === 'doDate')!.value).toBe(addDays(TODAY, 1))
    const toast = useUi.getState().toasts.at(-1)!
    expect(toast.text).toBe('Następne: „Podlać kwiaty” – wykonać jutro')
    // The spec's example: the next one on Thursday 19.11, seen on Monday 16.11.
    expect(nextTaskText({ ...made.edits.reduce((o, x) => ({ ...o, [x.path.join('.')]: x.value }), {}), doDate: '2026-11-19' }, '2026-11-16')).toBe('Następne: „Podlać kwiaty” – wykonać cz 19.11')
    expect(nextTaskText({ id: 'x', kind: 'task', title: 'Czynsz', dueDate: '2026-12-10' }, '2026-11-12')).toBe('Następne: „Czynsz” – termin cz 10.12')
    expect(toast.action?.label).toBe('Cofnij')
    // The folder as the change left it, then „Cofnij”: the next one removed, the task back.
    for (const u of r.undo) set(u.rel, u.after)
    expect((await undoCase(r.undo)).saved).toBe(true)
    const back = sent[1]!
    expect(back.find((e) => e.rel === rel(nextTaskId('t1')))).toMatchObject({ remove: true })
    expect(back.find((e) => e.rel === rel('t1'))!.edits.find((x) => x.path.join('.') === 'list')!.value).toBe(requestFrom(t)!.list)
  })

  it('następne już jest w oknie (z drugiego komputera, ponowne odhaczenie po ręcznym powrocie) – nie pisze się drugi raz, bez dymka', async () => {
    const t = daily()
    const next = nextTaskRaw(t, listedRaw(t, 'done', Date.now()), Date.now(), marketDay)!
    const { sent } = stub([t, next.raw])
    const r = await moveCase('t1', 'done')
    expect(r.saved).toBe(true)
    expect(r.next).toBeNull()
    expect(sent[0]!.map((e) => e.rel)).toEqual([rel('t1')])
    expect(useUi.getState().toasts).toEqual([])
  })

  it('„Tak” na „Zadanie zrobione?” w oknie (rytuał) też daje następne; zadanie bez powtarzania – jak dotąd, bez dymka', async () => {
    const { sent } = stub([daily(), newTask('t2', Date.now(), TODAY, { title: 'Raz' })!])
    expect((await answerTask('t1', 'done')).next).toBe(nextTaskId('t1'))
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([rel('t1'), rel(nextTaskId('t1'))].sort())
    for (const t of useUi.getState().toasts) closeToast(t.id)
    expect((await moveCase('t2', 'done')).next).toBeNull()
    expect(sent[1]!.map((e) => e.rel)).toEqual([rel('t2')])
    expect(useUi.getState().toasts).toEqual([])
  })

  it('„Powtarzaj” zapisuje regułę i koniec (`changeCase`); prośba – odmowa', async () => {
    const { sent } = stub([newTask('t2', Date.now(), TODAY, { title: 'Raz' })!])
    expect((await changeCase('t2', { repeat: { rule: { kind: 'workdays' }, until: null, count: 5 } })).saved).toBe(true)
    expect(sent[0]![0]!.edits.find((x) => x.path.join('.') === 'repeat')!.value).toEqual({ rule: { kind: 'workdays' }, until: null, count: 5, n: 1 })
  })
})

describe('wiersz zadania: pole „Powtarzaj” i reguła słowami (D465)', () => {
  const render = async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(CasesPage)))
  }
  const q = (sel: string, el: ParentNode = host!) => el.querySelector<HTMLElement>(`[data-testid="${sel}"]`)

  it('przycisk „Powtarzaj” obok „Terminy”: reguły serii bez „W dni szczególne”; „Zapisz powtarzanie” wysyła regułę; przy zadaniu – „↻ codziennie”', async () => {
    const { sent, set } = stub([newTask('t2', Date.now(), TODAY, { title: 'Raz', list: 'week' })!])
    await render()
    const row = host!.querySelector<HTMLElement>('[data-case="t2"]')!
    const button = q('case-repeat-open', row)!
    expect(button.textContent).toBe('Powtarzaj')
    expect(q('case-dates-open', row)!.nextElementSibling).toBe(button)
    await act(async () => button.click())
    const form = q('case-repeat-form', row)!
    expect(q('series-special', form)).toBeNull()
    expect(q('case-repeat-save', form)).toBeNull()
    const rule = q('series-rule', form) as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(rule, 'daily')
      rule.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => q('case-repeat-save', form)!.click())
    expect(sent[0]![0]!.edits.find((x) => x.path.join('.') === 'repeat')!.value).toMatchObject({ rule: { kind: 'daily' }, until: null, count: null, n: 1 })
    // The folder as the save left it: the rule in words in the row's line.
    const after = patchedRaw(newTask('t2', Date.now(), TODAY, { title: 'Raz', list: 'week' })!, { repeat: { rule: { kind: 'daily' }, until: null, count: null } }, Date.now())
    if ('error' in after) throw new Error(after.error)
    await act(async () => set(rel('t2'), after.raw))
    expect(q('case-status', host!.querySelector<HTMLElement>('[data-case="t2"]')!)!.textContent).toContain('↻ codziennie')
  })

  it('tekst w wierszu (czysty): reguła przy zadaniu niezrobionym, w „Zrobione” – nie', () => {
    const t = daily()
    const [x] = caseItems([requestFrom(t)!], TODAY, () => null)
    expect(statusParts(x!, TODAY)).toContain('↻ codziennie')
    const [d] = caseItems([requestFrom(listedRaw(t, 'done', Date.now()))!], TODAY, () => null)
    expect(statusParts(d!, TODAY).some((p) => p.startsWith('↻'))).toBe(false)
  })
})
