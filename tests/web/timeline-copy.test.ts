// @vitest-environment jsdom
/**
 * The axis of a day while a block is copied by Ctrl + drag (D513): the block stays at its place – never drawn as pushed apart,
 * though the preview of the copy may move it (the original never changes) – a dashed tile of the copy stands where the copy
 * will, and the release with Ctrl is `onCopy` at that start, not a move.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'

let root: Root | null = null
let host: HTMLDivElement | null = null
const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  for (const name of capture) Reflect.deleteProperty(Element.prototype, name)
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const item: TimelineItem = { id: 'a', startMin: 600, endMin: 660, title: 'A', marks: [], color: '#79AFAB', categoryId: 'inne', background: false, movable: true }
/** A pointer event of the left button (jsdom has no PointerEvent: a mouse event with the pointer's id). */
function pointer(target: EventTarget, type: string, y: number, ctrlKey: boolean, buttons = 1): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: y, button: 0, buttons, ctrlKey })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}

describe('oś przy kopii Ctrl + przeciągnięciem (D513)', () => {
  it('oryginał nie jest rysowany jako przesunięty, kafelek kopii stoi pod wskaźnikiem; puszczenie z Ctrl – `onCopy`, nie `onMove`', async () => {
    for (const name of capture) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
    const onMove = vi.fn()
    const onCopy = vi.fn()
    // The preview of the copy pushes the block itself on (a copy before it): the axis must still draw it where it stands.
    const pushPreview = (_id: string, _span: unknown, _edge: unknown, _shown: unknown, copy: boolean) => (copy ? new Map([['a', { startMin: 700, endMin: 760 }]]) : null)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Timeline, { items: [item], markers: [], selected: null, onSelect: () => undefined, onMove, onCopy, pushPreview, from: 360, to: 1320 })))
    const tile = host.querySelector<HTMLElement>('[data-testid="block-a"]')!
    pointer(tile, 'pointerdown', 100, true)
    // 55 px down: 50 minutes (1.1 px a minute) – 10:50.
    pointer(tile, 'pointermove', 155, true)
    expect(tile.getAttribute('data-pushed')).toBeNull()
    const ghost = host.querySelector<HTMLElement>('[data-testid="copy-ghost"]')!
    expect(ghost.getAttribute('data-start')).toBe('650')
    expect(host.querySelector('[data-testid="timeline"]')!.getAttribute('data-copying')).toBe('true')
    pointer(tile, 'pointerup', 155, true, 0)
    expect(onCopy).toHaveBeenCalledWith('a', 650)
    expect(onMove).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="copy-ghost"]')).toBeNull()
  })
})
