// @vitest-environment jsdom
/**
 * „+” of the quick capture in the bar (D402: always, T763): also while the bar has no day (no data folder, a day not
 * counted now) – and a field unfolded with a title typed stays as it is when the day goes from the view (a file read for
 * a moment unknown never takes your text).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Bar } from '@renderer/widget/Bar'
import { noFolderView, type WidgetView } from '@shared/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-12', lines: [], block: null })

describe('„+” bez dnia w pasku', () => {
  it('pasek bez dnia ma „+” w oknie, w panelu i na pasku pulpitu', () => {
    for (const mode of ['main', 'panel', 'desktop'] as const) expect(renderToStaticMarkup(createElement(Bar, { view: noFolderView(), mode }))).toContain('data-testid="bar-quick"')
  })

  it('pole z wpisanym tytułem zostaje, gdy dzień znika z widoku (i wraca)', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'Zamówić karmę')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => root!.render(createElement(Bar, { view: noFolderView('failed'), mode: 'main' })))
    expect(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')?.value).toBe('Zamówić karmę')
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    expect(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')?.value).toBe('Zamówić karmę')
  })
})
