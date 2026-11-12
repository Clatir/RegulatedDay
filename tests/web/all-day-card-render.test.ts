// @vitest-environment jsdom
/**
 * The card of an all-day event mounted with no data view yet (the window before its first read): the selectors it uses must
 * answer the same value for the same state, or React loops and unmounts the whole window (`interfejs.md`, Pułapki).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { allDayDraft } from '@shared/model/allDay'
import { AllDayCard } from '@renderer/features/allday/AllDayCard'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  // jsdom has no layout: the card scrolls itself into view.
  Element.prototype.scrollIntoView = () => undefined
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('karta wydarzenia bez widoku danych', () => {
  it('montuje się, gdy `view` jest puste (selektor nie tworzy nowej tablicy przy każdym wywołaniu)', async () => {
    expect(useData.getState().view).toBeNull()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(AllDayCard, { event: allDayDraft('k1', '2026-11-18', '2026-11-18'), base: null, today: '2026-11-18', place: { left: 0, top: 0 }, brightness: 1, onClose: () => undefined, onRemoved: () => undefined, onFree: () => undefined }))
    })
    expect(host.querySelector('[data-testid="allday-card"]')).not.toBeNull()
    const warned = errors.mock.calls.map((c) => String(c[0])).filter((t) => /getSnapshot|Maximum update depth/.test(t))
    errors.mockRestore()
    expect(warned).toEqual([])
  })
})
