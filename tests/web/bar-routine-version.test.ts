// @vitest-environment jsdom
/**
 * „Kroki ▸” of a routine on the bar (D481, T1110): a click on its version switches the day's version of the block at once – the
 * action `routineVersion` (`<block>|<version>`), so the panel „Kroki” and the card in „Dziś” switch with it; the unfolding starts
 * from the day's version and ticks (T1108).
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
  ;(window as unknown as { rd: Partial<RdApi> }).rd = { widgetAction: widgetAction as unknown as RdApi['widgetAction'], quickToday: () => Promise.resolve('2026-11-12') }
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const LINE = 'routine:2026-11-12:rut'
const view = (version: 'normal' | 'worse', done: string[]): WidgetView => ({
  ...noFolderView(),
  day: '2026-11-12',
  block: null,
  lines: [{ id: LINE, text: 'Poranna', actions: [{ id: 'all', label: '✓ Wszystkie' }, { id: 'steps', label: 'Kroki ▸' }, { id: 'worse', label: 'gorsze dni' }], dot: false }],
  routines: [{ line: LINE, block: 'rut', name: 'Poranna', normal: [{ id: 'woda', name: 'woda', min: 2 }, { id: 'kot', name: 'kot', min: 8 }], worse: [{ id: 'leki', name: 'leki', min: 0 }], version, done }]
})
const q = (id: string) => host!.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)

async function unfold(v: WidgetView) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Bar, { view: v, mode: 'main' })))
  await act(async () => q('bar-act-routine-steps')!.click())
}

describe('„Kroki ▸” na pasku: wersja od razu w dniu (D481)', () => {
  it('klik „gorsze dni” wysyła `routineVersion` bloku – panel i karta przełączają się; ta sama wersja – nic', async () => {
    await unfold(view('normal', ['woda']))
    // Started from the day: its ticks pressed.
    expect(q('bar-routine-step-woda')!.getAttribute('aria-pressed')).toBe('true')
    await act(async () => q('bar-routine-version-normal')!.click())
    expect(widgetAction).not.toHaveBeenCalled()
    await act(async () => q('bar-routine-version-worse')!.click())
    expect(widgetAction).toHaveBeenCalledWith('routineVersion', 'rut|worse')
    // The worse days' steps shown; a step without a time – no „0 min”.
    expect(q('bar-routine-step-leki')!.textContent).toBe('leki')
  })

  it('rozwinięcie zaczyna od wersji dnia', async () => {
    await unfold(view('worse', []))
    expect(q('bar-routine-version-worse')!.getAttribute('aria-pressed')).toBe('true')
    expect(q('bar-routine-step-leki')).not.toBeNull()
    expect(q('bar-routine-step-woda')).toBeNull()
  })
})
