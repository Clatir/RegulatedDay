// @vitest-environment jsdom
/**
 * Niezapisana reguła serii w „Szablonach” (B6, D563 P5): wybór innej pozycji listy (serii albo szablonu) przy zmianie, której
 * „Zapisz zmianę serii” jeszcze nie zapisało, pyta „Zapisać zmianę serii? · Zapisz · Odrzuć”: „Zapisz” zapisuje i przechodzi, „Odrzuć”
 * przechodzi bez zapisu, Esc zostaje na serii z wpisaną regułą. Bez zmiany – przejście od razu.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { newSeries } from '@shared/engine/series'
import { rdFrom } from '@shared/model/rd'
import type { SeriesBlock } from '@shared/model/series'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { changeSeries } from '@renderer/features/series/seriesActions'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'

vi.mock('@renderer/features/series/seriesActions', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/series/seriesActions')>()),
  changeSeries: vi.fn(async () => true as const)
}))

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
beforeEach(() => vi.mocked(changeSeries).mockClear())
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
})

const TODAY = '2026-11-18'
const block = (name: string): SeriesBlock => ({ categoryId: 'inne', variantId: null, startMin: 17 * 60, durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name, routine: null, steps: [] })
const s1 = newSeries('s1', block('Pierwsza'), '2026-11-10', { kind: 'daily' }, 'ask', { until: null, count: null })
const s2 = newSeries('s2', block('Druga'), '2026-11-11', { kind: 'daily' }, 'ask', { until: null, count: null })
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const items = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid="series-item"]')]
const shown = () => q('series-name')?.textContent

async function open() {
  useData.setState({ templates: [], series: [s1, s2], seriesPlans: [], routines: [], rd: rdFrom({}), view: { today: TODAY, computers: [] } as unknown as DataView })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(TemplatesPage)))
  await click(items()[0]!)
}
const editRule = (v: string) =>
  act(async () => {
    const rule = q('series-rule') as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(rule, v)
    rule.dispatchEvent(new Event('change', { bubbles: true }))
  })

describe('niezapisana reguła serii przy wyborze innej pozycji (D563 P5)', () => {
  it('bez zmiany reguły druga seria otwiera się od razu, bez pytania', async () => {
    await open()
    expect(shown()).toContain('Pierwsza')
    await click(items()[1]!)
    expect(q('rule-unsaved')).toBeNull()
    expect(shown()).toContain('Druga')
  })

  it('zmiana reguły + inna seria: okno „Zapisać zmianę serii?”; seria się nie zmienia, nic nie zapisano', async () => {
    await open()
    await editRule('workdays')
    expect(q('series-save')).not.toBeNull()
    await click(items()[1]!)
    expect(q('rule-unsaved')!.textContent).toContain('Zapisać zmianę serii?')
    expect(shown()).toContain('Pierwsza')
    expect(changeSeries).not.toHaveBeenCalled()
  })

  it('„Odrzuć”: przechodzi do wybranej serii bez zapisu', async () => {
    await open()
    await editRule('workdays')
    await click(items()[1]!)
    await click(q('rule-unsaved-discard'))
    expect(q('rule-unsaved')).toBeNull()
    expect(shown()).toContain('Druga')
    expect(changeSeries).not.toHaveBeenCalled()
  })

  it('„Zapisz”: zapisuje zmianę pierwszej serii (cała seria) i przechodzi do wybranej', async () => {
    await open()
    await editRule('workdays')
    await click(items()[1]!)
    await click(q('rule-unsaved-save'))
    expect(changeSeries).toHaveBeenCalledTimes(1)
    expect(vi.mocked(changeSeries).mock.calls[0]!.slice(0, 2)).toEqual([{ seriesId: 's1' }, 'all'])
    expect(q('rule-unsaved')).toBeNull()
    expect(shown()).toContain('Druga')
  })

  it('Esc w oknie: zostaje na pierwszej serii, wpisana reguła i „Zapisz zmianę serii” są na miejscu', async () => {
    await open()
    await editRule('workdays')
    await click(items()[1]!)
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(q('rule-unsaved')).toBeNull()
    expect(shown()).toContain('Pierwsza')
    expect((q('series-rule') as HTMLSelectElement).value).toBe('workdays')
    expect(q('series-save')).not.toBeNull()
  })

  it('zapis, który się nie udał, zostaje na serii z regułą (nic nie ginie)', async () => {
    vi.mocked(changeSeries).mockResolvedValueOnce(false)
    await open()
    await editRule('workdays')
    await click(items()[1]!)
    await click(q('rule-unsaved-save'))
    expect(shown()).toContain('Pierwsza')
    expect((q('series-rule') as HTMLSelectElement).value).toBe('workdays')
  })

  it('ten sam wiersz klikany ponownie albo „Zapisz zmianę serii” zrobione wcześniej – bez pytania', async () => {
    await open()
    await editRule('workdays')
    await click(items()[0]!)
    expect(q('rule-unsaved')).toBeNull()
    await click(q('series-save'))
    expect(changeSeries).toHaveBeenCalledTimes(1)
  })
})
