// @vitest-environment jsdom
/**
 * UX5 / „Dodano blok · Cofnij” (D563 P2): the toast stands only when the add changed the template. A record that is gone or cannot be read answers
 * the save with nothing to write (`isSaved([])` is true) – no toast then, nothing was added to take back.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { templateJson } from '@shared/model/defaults'
import { planBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { installEscape } from '@renderer/lib/escape'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { tryUpdateRecord, useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const records = new Map<string, RawRecord>()
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  tryUpdateRecord: vi.fn(async (rel: string, fn: (raw: RawRecord) => RawRecord | null) => {
    const before = records.get(rel)
    if (!before) return []
    const after = fn({ ...before })
    if (after) records.set(rel, after)
    return [{ status: 'applied' }]
  })
}))
// The axis is a button: its click is the click on the empty place of the axis at 10:00.
vi.mock('@renderer/features/plan/Timeline', () => ({
  Timeline: (p: { onCreate?: (min: number) => void }) => createElement('button', { 'data-testid': 'fake-axis', onClick: () => p.onCreate?.(600) })
}))

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  records.clear()
  useUi.setState({ toasts: [] })
  vi.mocked(tryUpdateRecord).mockClear()
})

const REL = 'templates/t1.json'
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const t1: Template = { id: 't1', name: 'Pusty', dayType: 'zwykly', weekdays: [7], versions: [{ from: '2026-01-01', blocks: [planBlock({ id: 'old', categoryId: 'inne', startMin: 900, durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }], archived: false }

async function open() {
  useData.setState({ templates: [t1], routines: [], series: [], seriesPlans: [], rd: rdFrom({}), view: { today: '2026-11-18', computers: [] } as unknown as DataView })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(TemplatesPage)))
  await click(q('template-item'))
}
const texts = () => useUi.getState().toasts.map((x) => x.text)

describe('dymek „Dodano blok”', () => {
  it('dodanie zmieniło szablon – dymek z „Cofnij”', async () => {
    records.set(REL, templateJson(t1))
    await open()
    await click(q('fake-axis'))
    expect(texts()).toEqual(['Dodano blok'])
  })

  it('rekord, którego nie ma w widoku (usunięty / nieczytelny): zapis nic nie zmienił – bez dymku', async () => {
    await open()
    await click(q('fake-axis'))
    expect(vi.mocked(tryUpdateRecord)).toHaveBeenCalled()
    expect(texts()).toEqual([])
  })
})
