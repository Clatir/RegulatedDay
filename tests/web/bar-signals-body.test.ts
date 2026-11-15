// @vitest-environment jsdom
/**
 * „Sygnały ▸” on the bar and the body (D520, D522): the relative judgement (gorzej / tak samo / lepiej) is asked for every pool –
 * also „ciało”; the signals themselves stay four and none of them is the body's.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { installEscape } from '@renderer/lib/escape'
import { Bar } from '@renderer/widget/Bar'
import { noFolderView, type WidgetView } from '@shared/widget'

let uninstallEscape: () => void = () => undefined
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  uninstallEscape = installEscape()
})
afterAll(() => uninstallEscape())

const widgetAction = vi.fn((_a: string, _arg?: string) => Promise.resolve())
beforeEach(() => {
  widgetAction.mockClear()
  ;(window as unknown as { rd: Partial<RdApi> }).rd = { widgetAction: widgetAction as unknown as RdApi['widgetAction'], quickToday: () => Promise.resolve('2026-11-18') }
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

const q = (id: string) => host!.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
async function unfold() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const view: WidgetView = { ...noFolderView(), day: '2026-11-18', lines: [], block: null, signals: true, requests: { people: [], running: null, interrupted: null } }
  await act(async () => root!.render(createElement(Bar, { view, mode: 'main' })))
  await act(async () => q('bar-group-signals')!.click())
}
const buttonsOf = (pool: string) => [...host!.querySelectorAll<HTMLElement>('span.inline-flex')].find((s) => s.firstElementChild?.textContent === pool)!.querySelectorAll<HTMLButtonElement>('button')

describe('ocena względna w pasku: cztery pule (D520)', () => {
  it('lista ma głowę, emocje, bodźce i ciało – każda z „gorzej”, „tak samo”, „lepiej”', async () => {
    await unfold()
    for (const pool of ['głowa', 'emocje', 'bodźce', 'ciało']) expect([...buttonsOf(pool)].map((b) => b.textContent)).toEqual(['gorzej', 'tak samo', 'lepiej'])
  })

  it('„ciało – gorzej” wysyła `relative` z pulą body i −10', async () => {
    await unfold()
    await act(async () => buttonsOf('ciało')[0]!.click())
    expect(widgetAction).toHaveBeenCalledWith('relative', 'body|-10')
  })

  it('sygnały zostają cztery i żaden nie dotyczy ciała (D522)', async () => {
    await unfold()
    const ids = [...host!.querySelectorAll('[data-testid^="bar-signal-"]')].map((b) => b.getAttribute('data-testid'))
    expect(ids).toEqual(['bar-signal-glasses', 'bar-signal-earplugs', 'bar-signal-rocking', 'bar-signal-questions'])
  })
})
