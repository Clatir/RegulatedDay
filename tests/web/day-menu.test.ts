// @vitest-environment jsdom
/**
 * UX1 / A3: menu „⋯” w „Dziś” – Esc, klik obok i zjechanie myszą bez skutku; klawiatura (fokus na pierwszej pozycji, strzałki, Enter),
 * fokus wraca na „⋯”; ponowny klik w „⋯” zamyka (nie otwiera od nowa).
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DayMenu } from '@renderer/features/today/DayMenu'
import { installEscape } from '@renderer/lib/escape'

let root: Root | null = null
let host: HTMLDivElement | null = null
let offEsc: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  offEsc?.()
  root = null
  host = null
})

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const key = (k: string) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))

async function mount() {
  offEsc = installEscape()
  const copy = vi.fn()
  const type = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      createElement(DayMenu, {
        items: [
          { label: 'Skopiuj ten dzień do…', onPick: copy, testId: 'day-copy' },
          { label: 'Dodaj bloki typu zwykły…', onPick: type, testId: 'day-type' }
        ]
      })
    )
  )
  return { copy, type, button: q('day-menu')! }
}
const open = async (button: HTMLElement) => {
  act(() => button.focus())
  await act(async () => void button.click())
}

describe('menu „⋯” dnia (A3)', () => {
  it('otwiera się klikiem, fokus na pierwszej pozycji; Esc zamyka i fokus wraca na „⋯”', async () => {
    const { button } = await mount()
    expect(q('day-copy')).toBeNull()
    await open(button)
    expect(q('day-copy')).not.toBeNull()
    expect(document.activeElement).toBe(q('day-copy'))
    key('Escape')
    expect(q('day-copy')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('klik obok zamyka menu', async () => {
    const { button } = await mount()
    await open(button)
    const elsewhere = document.createElement('div')
    document.body.append(elsewhere)
    act(() => void elsewhere.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(q('day-copy')).toBeNull()
    elsewhere.remove()
  })

  it('zjechanie myszą nie zamyka menu', async () => {
    const { button } = await mount()
    await open(button)
    const menu = q('day-menu-list')!
    act(() => {
      menu.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      menu.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
      host!.querySelector('div')!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    })
    expect(q('day-copy')).not.toBeNull()
  })

  it('strzałki przechodzą między pozycjami, Enter wybiera i zamyka', async () => {
    const { button, copy, type } = await mount()
    await open(button)
    key('ArrowDown')
    expect(document.activeElement).toBe(q('day-type'))
    key('ArrowUp')
    expect(document.activeElement).toBe(q('day-copy'))
    key('ArrowDown')
    key('Enter')
    expect(type).toHaveBeenCalledTimes(1)
    expect(copy).not.toHaveBeenCalled()
    expect(q('day-copy')).toBeNull()
  })

  it('ponowny klik w „⋯” zamyka menu (klik obok go nie otwiera od nowa)', async () => {
    const { button } = await mount()
    await open(button)
    act(() => void button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await act(async () => void button.click())
    expect(q('day-copy')).toBeNull()
  })

  it('strona nie zamyka menu zjechaniem myszy', () => {
    expect(readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')).not.toContain('onMouseLeave')
  })
})
