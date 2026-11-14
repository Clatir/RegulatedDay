// @vitest-environment jsdom
/**
 * „Zaplanuj” on the page of „Sprawy” (D464): the end typed changes the block's length, the start shown stays – also while it
 * is still the proposal (the nearest free place for the estimate), which would move for the longer block.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord, RdApi } from '@shared/api'
import { computeDay } from '@shared/engine/day'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { closeToast, useUi } from '@renderer/store/ui'
import { block, Scenario } from '../unit/engine/dsl'

// The day of the form: far ahead (not today – the search starts an hour after the wake, not from the clock), a block of
// yours at 7:45 – 30 minutes fit before it, 90 do not.
const D1 = '2099-03-02'
const days = vi.hoisted(() => ({ model: (_date: string): unknown => null }))
vi.mock('@renderer/store/day', async (orig) => ({ ...(await orig<typeof import('@renderer/store/day')>()), useDay: (date: string) => days.model(date) }))
days.model = (date: string) => {
  if (date !== D1) return null
  const s = new Scenario({ date, plan: [block({ id: 'x', cat: 'inne', at: '07:45', min: 60, origin: 'user' })] }).observe('07:00', null)
  const ctx = s.contextAt(s.at('08:00'))
  return { date, ctx, state: computeDay(ctx), data: { dayFile: null } } as unknown as DayModel
}

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

function stub(records: RawRecord[]) {
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: records, routines: [], series: [], seriesDays: {}, computers: [] }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async () => ({}),
    caseDays: async () => ({ files: {}, gone: {}, begun: {} }),
    edit: async (entries) => entries.map(() => ({ status: 'applied' as const })),
    dataView: async () => view(),
    requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), rd: rdFrom({}), requests: records.map((r) => requestFrom(r)!) })
}

const q = (sel: string, el: ParentNode = host!) => el.querySelector<HTMLInputElement>(`[data-testid="${sel}"]`)
/** Types `v` into the field and presses Enter. */
const typeEnter = (el: HTMLInputElement, v: string) =>
  act(async () => {
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })

describe('„Zaplanuj” na stronie: Koniec zmienia długość, początek stoi (D464)', () => {
  it('początek jeszcze z propozycji: wpisany koniec 8:30 zostaje, początek 7:00 nie skacze za blok 7:45', async () => {
    stub([newTask('t1', Date.now(), TODAY, { title: 'Raport', list: 'week' })!])
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(CasesPage)))
    const row = host.querySelector<HTMLElement>('[data-case="t1"]')!
    await act(async () => q('case-plan-open', row)!.click())
    await typeEnter(q('case-plan-date', row)!, '2.03.2099')
    // The proposal for the estimate (30 min): an hour after the wake, before the block at 7:45.
    expect(q('case-plan-start', row)!.value).toBe('07:00')
    expect(q('case-plan-end', row)!.value).toBe('07:30')
    await typeEnter(q('case-plan-end', row)!, '8:30')
    expect(q('case-plan-start', row)!.value).toBe('07:00')
    expect(q('case-plan-end', row)!.value).toBe('08:30')
    expect(row.querySelector('[data-testid="case-plan-length"]')!.textContent).toBe('1 h 30 min')
  })
})
