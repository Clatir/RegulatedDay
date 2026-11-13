// @vitest-environment jsdom
/**
 * Attachments on the tiles of the axis (SNT4, D410, T815): the 📎N mark, the tile lit and taking files and links dropped on it
 * (only a file or a link – the gestures of the axis, the drag of a block, stay as they were), a tile that is no block's takes none.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'

const item = (id: string, startMin: number, extra: Partial<TimelineItem> = {}): TimelineItem => ({ id, startMin, endMin: startMin + 60, title: `Blok ${id}`, marks: [], color: '#888888', categoryId: 'inne', background: false, ...extra })

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

async function mount(items: TimelineItem[], onAttachDrop?: (id: string, dt: DataTransfer) => void) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Timeline, { items, markers: [], selected: null, onSelect: () => undefined, from: 8 * 60, to: 14 * 60, onAttachDrop })))
  return (id: string) => host!.querySelector<HTMLElement>(`[data-testid="block-${id}"]`)!
}
/** A drag event on `el` with the given types (jsdom has no DataTransfer): whether it was cancelled (= taken). */
function fire(el: Element, type: string, types: string[], text = ''): boolean {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const dt = { types, getData: () => text, files: [], dropEffect: 'none' }
  Object.defineProperty(e, 'dataTransfer', { value: dt })
  let cancelled = false
  act(() => {
    cancelled = !el.dispatchEvent(e)
  })
  return cancelled
}

describe('znaczek 📎N na kafelku', () => {
  it('jest od jednego załącznika, z liczbą i podpowiedzią; bez załączników i dla kafelka bez bloku – nie ma', async () => {
    const tile = await mount([item('a', 9 * 60, { attach: 2 }), item('b', 10 * 60, { attach: 0 }), item('c', 11 * 60)])
    const badge = tile('a').querySelector('[data-testid="attach-badge"]')!
    expect(badge.textContent).toBe('📎2')
    expect(badge.getAttribute('title')).toBe('2 załączniki')
    expect(tile('b').querySelector('[data-testid="attach-badge"]')).toBeNull()
    expect(tile('c').querySelector('[data-testid="attach-badge"]')).toBeNull()
  })
})

describe('upuszczenie plików na kafelek', () => {
  it('plik nad kafelkiem: przeciągnięcie przyjęte, kafelek podświetlony; upuszczenie oddaje id i przeniesienie', async () => {
    const drop = vi.fn()
    const tile = await mount([item('a', 9 * 60, { attach: 0 })], drop)
    expect(fire(tile('a'), 'dragover', ['Files'])).toBe(true)
    expect(tile('a').dataset.drop).toBe('on')
    expect(fire(tile('a'), 'drop', ['Files'])).toBe(true)
    expect(tile('a').dataset.drop).toBeUndefined()
    expect(drop).toHaveBeenCalledTimes(1)
    expect(drop.mock.calls[0]![0]).toBe('a')
  })

  it('adres z przeglądarki też; przeciągnięcie wyjęte z kafelka gasi podświetlenie', async () => {
    const drop = vi.fn()
    const tile = await mount([item('a', 9 * 60, { attach: 1 })], drop)
    expect(fire(tile('a'), 'dragenter', ['text/uri-list', 'text/plain'])).toBe(true)
    expect(tile('a').dataset.drop).toBe('on')
    fire(tile('a'), 'dragleave', ['text/uri-list'])
    expect(tile('a').dataset.drop).toBeUndefined()
  })

  it('co nie jest plikiem ani adresem (html) – przeciągnięcie nieprzyjęte, nic nie upuszczone', async () => {
    const drop = vi.fn()
    const tile = await mount([item('a', 9 * 60, { attach: 0 })], drop)
    expect(fire(tile('a'), 'dragover', ['text/html'])).toBe(false)
    expect(fire(tile('a'), 'drop', ['text/html'])).toBe(false)
    expect(drop).not.toHaveBeenCalled()
  })

  it('kafelek bez bloku (attach nieustalone) i oś bez onAttachDrop plików nie biorą', async () => {
    const drop = vi.fn()
    const tile = await mount([item('a', 9 * 60), item('b', 10 * 60, { attach: 0 })], drop)
    expect(fire(tile('a'), 'dragover', ['Files'])).toBe(false)
    expect(tile('a').dataset.drop).toBeUndefined()
    act(() => root?.unmount())
    host?.remove()
    const plain = await mount([item('b', 10 * 60, { attach: 0 })])
    expect(fire(plain('b'), 'dragover', ['Files'])).toBe(false)
    expect(drop).not.toHaveBeenCalled()
  })
})
