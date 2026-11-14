// @vitest-environment jsdom
/**
 * A press of the pointer outside a part of the screen (D461: leaving a new block – the panel of „Dziś”, the small window of
 * „Tydzień”): one hook for both (`useOutsidePointer`), heard before what the press starts, the active field committed first; a
 * dialog, a toast and what the part names are never „outside”. `holdGesture` keeps the press and its click from what is below.
 */
import { readFileSync } from 'node:fs'
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { holdGesture, useOutsidePointer } from '@renderer/lib/outside'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
  root = null
  host = null
})

const press = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

/** A part of the screen with a field, a dialog and a toast beside it, and a place elsewhere. */
function mount(o: { active?: boolean; bySelector?: boolean; onLeave?: (e: PointerEvent) => void } = {}) {
  const onLeave = vi.fn(o.onLeave ?? (() => undefined))
  const committed = vi.fn()
  function Part() {
    const ref = useRef<HTMLDivElement>(null)
    useOutsidePointer(o.active ?? true, o.bySelector ? '[data-testid="part"], [data-part-tile]' : ref, onLeave)
    return createElement(
      'div',
      null,
      createElement('div', { ref, 'data-testid': 'part' }, createElement('input', { 'data-testid': 'field', onBlur: committed })),
      createElement('div', { 'data-part-tile': '', 'data-testid': 'tile' }),
      createElement('div', { role: 'dialog', 'data-testid': 'dialog' }),
      createElement('div', { role: 'status', 'data-testid': 'toast' }),
      createElement('div', { 'data-testid': 'elsewhere' })
    )
  }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(createElement(Part)))
  const el = (id: string) => host!.querySelector(`[data-testid="${id}"]`)!
  return { onLeave, committed, el }
}

describe('klik poza częścią ekranu (D461, jeden hook)', () => {
  it('naciśnięcie gdzie indziej najpierw zatwierdza aktywne pole, potem mówi o opuszczeniu – z tym naciśnięciem', () => {
    const order: string[] = []
    const m = mount({ onLeave: () => void order.push('leave') })
    m.committed.mockImplementation(() => void order.push('commit'))
    act(() => (m.el('field') as HTMLInputElement).focus())
    act(() => void press(m.el('elsewhere')))
    expect(order).toEqual(['commit', 'leave'])
    expect(m.onLeave.mock.calls[0]![0]).toBeInstanceOf(PointerEvent)
  })

  it('w samej części, w oknie dialogowym i w dymku – nic; ze ścieżką selektora także kafelek szkicu', () => {
    const m = mount()
    for (const id of ['field', 'dialog', 'toast']) act(() => void press(m.el(id)))
    expect(m.onLeave).not.toHaveBeenCalled()
    act(() => void press(m.el('tile')))
    expect(m.onLeave).toHaveBeenCalledTimes(1)
    act(() => root!.unmount())
    host!.remove()
    const s = mount({ bySelector: true })
    for (const id of ['field', 'tile', 'dialog', 'toast']) act(() => void press(s.el(id)))
    expect(s.onLeave).not.toHaveBeenCalled()
    act(() => void press(s.el('elsewhere')))
    expect(s.onLeave).toHaveBeenCalledTimes(1)
  })

  it('nieaktywny albo odmontowany – nie słucha', () => {
    const m = mount({ active: false })
    act(() => void press(m.el('elsewhere')))
    expect(m.onLeave).not.toHaveBeenCalled()
    act(() => root!.unmount())
    root = null
    press(document.body)
    expect(m.onLeave).not.toHaveBeenCalled()
  })

  it('`holdGesture`: ani naciśnięcie, ani jego klik nie dochodzą niżej; następne naciśnięcie i klik – już tak', () => {
    const m = mount({ onLeave: (e) => holdGesture(e) })
    const below = vi.fn()
    m.el('elsewhere').addEventListener('pointerdown', below)
    m.el('elsewhere').addEventListener('click', below)
    act(() => void press(m.el('elsewhere')))
    act(() => void click(m.el('elsewhere')))
    expect(below).not.toHaveBeenCalled()
    // The click that never came (let go elsewhere): the next press ends the hold – it is heard below, so is its click.
    act(() => void press(m.el('dialog')))
    act(() => void click(m.el('elsewhere')))
    m.el('elsewhere').removeEventListener('pointerdown', below)
    expect(below).toHaveBeenCalledTimes(1)
  })

  it('„Dziś” i okienko „Tygodnia” słuchają przez ten jeden hook (bez własnych nasłuchów naciśnięcia)', () => {
    for (const f of ['src/renderer/features/today/TodayPage.tsx', 'src/renderer/features/week/NewBlockPopover.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src).toContain('useOutsidePointer(')
      expect(src).not.toContain("addEventListener('pointerdown'")
    }
  })
})
