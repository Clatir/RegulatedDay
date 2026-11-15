// @vitest-environment jsdom
/**
 * The pointer's drag of a sprawa (`usePointerDrag`, D384, D450) and the keys while it is held (D513): Ctrl pressed or let go
 * says whether the drop is a copy, the release with Ctrl gives `copy`; Esc cancels only when it is pressed – letting it go
 * (keyup) changes nothing.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { usePointerDrag } from '@renderer/features/cases/usePointerDrag'

let root: Root | null = null
let host: HTMLDivElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function Probe({ onDrop }: { onDrop: (id: string, target: string, copy: boolean) => void }) {
  const { drag, grab } = usePointerDrag(() => 'cel', onDrop)
  return createElement('div', { 'data-testid': 'probe', 'data-held': drag ? 'true' : undefined, 'data-copy': drag?.copy ? 'true' : undefined, onPointerDown: (e: { button: number; clientX: number; clientY: number; target: EventTarget }) => grab('x', e) })
}
async function mount(onDrop: (id: string, target: string, copy: boolean) => void): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Probe, { onDrop })))
  return host.querySelector<HTMLElement>('[data-testid="probe"]')!
}
const mouse = (target: EventTarget, type: string, x: number, o: { buttons?: number; ctrlKey?: boolean } = {}) => act(() => void target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10, button: 0, buttons: o.buttons ?? 1, ctrlKey: o.ctrlKey ?? false })))
const key = (type: 'keydown' | 'keyup', k: string, ctrlKey = false) => act(() => void window.dispatchEvent(new KeyboardEvent(type, { key: k, ctrlKey, bubbles: true, cancelable: true })))

describe('usePointerDrag – klawisze w trakcie (D513)', () => {
  it('Ctrl wciśnięty w trakcie – „kopia”; puszczenie z Ctrl daje `copy`', async () => {
    const onDrop = vi.fn()
    const el = await mount(onDrop)
    mouse(el, 'pointerdown', 10)
    mouse(window, 'pointermove', 40)
    expect(el.getAttribute('data-copy')).toBeNull()
    key('keydown', 'Control', true)
    expect(el.getAttribute('data-copy')).toBe('true')
    mouse(window, 'pointerup', 40, { buttons: 0, ctrlKey: true })
    expect(onDrop).toHaveBeenCalledWith('x', 'cel', true)
  })

  it('puszczenie Esc (keyup) nic nie przerywa; Esc wciśnięty – przerywa bez upuszczenia', async () => {
    const onDrop = vi.fn()
    const el = await mount(onDrop)
    mouse(el, 'pointerdown', 10)
    mouse(window, 'pointermove', 40)
    key('keyup', 'Escape')
    expect(el.getAttribute('data-held')).toBe('true')
    key('keydown', 'Escape')
    expect(el.getAttribute('data-held')).toBeNull()
    mouse(window, 'pointerup', 40, { buttons: 0 })
    expect(onDrop).not.toHaveBeenCalled()
  })
})
