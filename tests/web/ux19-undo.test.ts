// @vitest-environment jsdom
/**
 * UX19 (D565 P29): Ctrl+Z in the main window takes back the last „Cofnij” that is visible – a message of the corner or a line of a page (the
 * newest by its time; one without a time – the line of a template, the card of the boundary – after them). Not in a text field (its own undo),
 * not under a dialog, and nothing when no „Cofnij” is shown.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupLine } from '@renderer/components/GroupLine'
import { Toasts } from '@renderer/components/Toasts'
import { onModal } from '@renderer/lib/escape'
import { latestUndoButton, useUndoKey } from '@renderer/lib/undoKey'
import { SHORTCUTS } from '@renderer/lib/shortcuts'
import { clearGroupLine, showGroupLine } from '@renderer/store/groupLine'
import { toast, undoToast, useUi } from '@renderer/store/ui'

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
  for (const v of ['today', 'template', 'week', 'cases', 'calendar'] as const) clearGroupLine(v)
  for (const t of useUi.getState().toasts) useUi.setState({ toasts: [] })
})

function Probe() {
  useUndoKey()
  return createElement('div', null, createElement(Toasts), createElement(GroupLine, { view: 'week' }), createElement('input', { 'data-testid': 'field' }))
}
async function mount() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Probe)))
}
const press = (target: EventTarget = window, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(e))
  return e
}

describe('Ctrl+Z = ostatnie widoczne „Cofnij”', () => {
  it('dymek z „Cofnij”: Ctrl+Z uruchamia jego akcję i zamyka dymek', async () => {
    const undo = vi.fn()
    await mount()
    act(() => void undoToast('Usunięto blok', undo))
    const e = press()
    expect(undo).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
    expect(useUi.getState().toasts).toHaveLength(0)
  })

  it('dymek bez akcji i bez „Cofnij” nic nie cofa; klawisz zostaje przeglądarce', async () => {
    await mount()
    act(() => void toast('Zapisano'))
    const e = press()
    expect(e.defaultPrevented).toBe(false)
    expect(useUi.getState().toasts).toHaveLength(1)
  })

  it('dymek z inną akcją niż „Cofnij” nie jest cofnięciem', async () => {
    const run = vi.fn()
    await mount()
    act(() => void toast('Typ dzisiejszego dnia zmienisz w „Dziś”', 'info', 5000, { label: 'Otwórz Dziś', run }))
    press()
    expect(run).not.toHaveBeenCalled()
  })

  it('linia strony: Ctrl+Z cofa ją raz i linia znika', async () => {
    const undo = vi.fn()
    await mount()
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo }))
    press()
    await act(async () => undefined)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="group-line-week"]')).toBeNull()
  })

  it('dwa „Cofnij”: wygrywa nowszy – linia nowsza od dymku, dymek nowszy od linii', async () => {
    const toastUndo = vi.fn()
    const lineUndo = vi.fn()
    await mount()
    act(() => void undoToast('Usunięto blok', toastUndo))
    vi.setSystemTime(new Date('2026-11-21T10:00:05Z'))
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo: lineUndo }))
    press()
    await act(async () => undefined)
    expect(lineUndo).toHaveBeenCalledTimes(1)
    expect(toastUndo).not.toHaveBeenCalled()
    // The line is gone; the older message is the last one left.
    press()
    expect(toastUndo).toHaveBeenCalledTimes(1)
  })

  it('dymek nowszy od linii wygrywa z linią', async () => {
    const toastUndo = vi.fn()
    const lineUndo = vi.fn()
    await mount()
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo: lineUndo }))
    vi.setSystemTime(new Date('2026-11-21T10:00:05Z'))
    act(() => void undoToast('Usunięto blok', toastUndo))
    press()
    expect(toastUndo).toHaveBeenCalledTimes(1)
    expect(lineUndo).not.toHaveBeenCalled()
  })

  it('w polu tekstowym Ctrl+Z zostaje polu (jego własne cofnięcie), nic nie jest cofane', async () => {
    const undo = vi.fn()
    await mount()
    act(() => void undoToast('Usunięto blok', undo))
    const field = document.querySelector<HTMLElement>('[data-testid="field"]')!
    field.focus()
    const e = press(field)
    expect(undo).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  })

  it('bez Ctrl, z Shift (ponów) albo z Alt (AltGr) – nic', async () => {
    const undo = vi.fn()
    await mount()
    act(() => void undoToast('Usunięto blok', undo))
    press(window, { ctrlKey: false })
    press(window, { shiftKey: true })
    press(window, { altKey: true })
    expect(undo).not.toHaveBeenCalled()
  })

  it('okno dialogowe otwarte: Ctrl+Z nie cofa spod niego', async () => {
    const undo = vi.fn()
    await mount()
    act(() => void undoToast('Usunięto blok', undo))
    const modal = onModal()
    press()
    modal.off()
    expect(undo).not.toHaveBeenCalled()
  })
})

describe('latestUndoButton', () => {
  const button = (attrs: Record<string, string>, disabled = false) => {
    const b = document.createElement('button')
    for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v)
    b.disabled = disabled
    document.body.append(b)
    return b
  }
  it('najnowszy czas; bez czasu po tych z czasem; przy remisie – późniejszy w dokumencie; wyłączony pomijany', () => {
    const old = button({ 'data-undo': '100' })
    const fresh = button({ 'data-undo': '300' })
    button({ 'data-undo': '900' }, true)
    button({ 'data-undo': '' })
    expect(latestUndoButton()).toBe(fresh)
    fresh.remove()
    expect(latestUndoButton()).toBe(old)
    old.remove()
    const a = button({ 'data-undo': '' })
    const b = button({ 'data-undo': '' })
    expect(latestUndoButton()).toBe(b)
    expect(a).not.toBe(b)
  })
})

it('lista skrótów (F1) ma Ctrl+Z', () => {
  const row = SHORTCUTS.find(([k]) => k === 'Ctrl+Z')
  expect(row?.[1]).toContain('Cofnij')
})
