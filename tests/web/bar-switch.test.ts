// @vitest-environment jsdom
/**
 * „Pasek pulpitu” in the settings (UX11, D564 P16, C3): the bar hidden by its „×” is no „włączony” – the switch says
 * „schowany” and one click on it shows the bar; under it the line „Pasek pulpitu schowany · Pokaż pasek”. A bar switched off
 * has no such line (nothing hidden – its switch turns it on).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { DEFAULT_MACHINE_PREFS, type MachinePrefs } from '@shared/machine'
import { noFolderView } from '@shared/widget'
import { BarSwitch, barSwitchOf } from '@renderer/features/settings/BarSwitch'
import { useMachine } from '@renderer/store/machine'
import { useWidget } from '@renderer/store/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null
let setPrefs: ReturnType<typeof vi.fn<RdApi['setPrefs']>>

beforeEach(() => {
  setPrefs = vi.fn<RdApi['setPrefs']>((patch) => Promise.resolve({ ...useMachine.getState().prefs, ...(patch as Partial<MachinePrefs>) }))
  ;(window as unknown as { rd: Partial<RdApi> }).rd = { setPrefs }
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  act(() => useWidget.setState({ view: null }))
  useMachine.setState({ prefs: DEFAULT_MACHINE_PREFS })
  delete (window as unknown as { rd?: unknown }).rd
})

async function render(state: { desktopBar: boolean; closed: boolean }): Promise<void> {
  act(() => {
    useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: state.desktopBar } })
    useWidget.setState({ view: { ...noFolderView(), barClosed: state.closed } })
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BarSwitch)))
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))

describe('przełącznik „Pasek pulpitu” według stanu paska (C3)', () => {
  it('włączony, schowany „×”, wyłączony', () => {
    expect(barSwitchOf(true, false)).toEqual({ checked: true, label: 'włączony' })
    expect(barSwitchOf(true, true)).toEqual({ checked: false, label: 'schowany' })
    expect(barSwitchOf(false, false)).toEqual({ checked: false, label: 'wyłączony' })
    // Off: what „×” did before no longer counts – switched on, it shows.
    expect(barSwitchOf(false, true)).toEqual({ checked: false, label: 'wyłączony' })
  })
})

describe('Ustawienia – pasek schowany „×” (D564 P16)', () => {
  it('mówią „schowany” z linią „Pasek pulpitu schowany · Pokaż pasek”', async () => {
    await render({ desktopBar: true, closed: true })
    expect(q('pref-desktop-bar')!.getAttribute('aria-checked')).toBe('false')
    expect(q('pref-desktop-bar')!.parentElement!.textContent).toBe('schowany')
    expect(q('settings-bar-closed')!.textContent).toBe('Pasek pulpitu schowanyPokaż pasek')
  })

  it('jedno kliknięcie przełącznika włącza go – pasek się pokazuje (nie: wyłącz → włącz)', async () => {
    await render({ desktopBar: true, closed: true })
    await click(q('pref-desktop-bar')!)
    expect(setPrefs.mock.calls).toEqual([[{ desktopBar: true }]])
  })

  it('dwuklik w przełącznik „schowany” – pasek pokazany raz; drugie kliknięcie nie wyłącza go po rozesłanym widoku (C8)', async () => {
    await render({ desktopBar: true, closed: true })
    await click(q('pref-desktop-bar')!)
    // The main process shows the bar and sends the view: the switch is ticked before the second click of the pair lands.
    act(() => useWidget.setState({ view: { ...noFolderView(), barClosed: false } }))
    expect(q('pref-desktop-bar')!.getAttribute('aria-checked')).toBe('true')
    await act(async () => void q('pref-desktop-bar')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })))
    expect(setPrefs.mock.calls).toEqual([[{ desktopBar: true }]])
    // A key (Space, Enter – detail 0) and a click of its own still switch it.
    await act(async () => void q('pref-desktop-bar')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })))
    expect(setPrefs.mock.calls).toEqual([[{ desktopBar: true }], [{ desktopBar: false }]])
  })

  it('„Pokaż pasek” w linii – to samo jednym kliknięciem; dwuklik – raz', async () => {
    await render({ desktopBar: true, closed: true })
    await click(q('settings-bar-show')!)
    await act(async () => void q('settings-bar-show')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })))
    expect(setPrefs.mock.calls).toEqual([[{ desktopBar: true }]])
  })

  it('pasek na ekranie albo wyłączony – bez linii; przełącznik jak dotąd', async () => {
    await render({ desktopBar: true, closed: false })
    expect(q('settings-bar-closed')).toBeNull()
    expect(q('pref-desktop-bar')!.getAttribute('aria-checked')).toBe('true')
    await click(q('pref-desktop-bar')!)
    expect(setPrefs.mock.calls).toEqual([[{ desktopBar: false }]])
    act(() => root?.unmount())
    host?.remove()
    await render({ desktopBar: false, closed: true })
    expect(q('settings-bar-closed')).toBeNull()
    expect(q('pref-desktop-bar')!.parentElement!.textContent).toBe('wyłączony')
  })
})
