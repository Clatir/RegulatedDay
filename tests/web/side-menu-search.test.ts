// @vitest-environment jsdom
/**
 * The side menu's „Szukaj” (D469): the visible way into the search palette – last in the menu, with its keys „Ctrl K” shown like the
 * screens' ones, a click opens the palette like the hotkey (the same guards), it is no screen (no digit, never „current”) and the
 * screens keep their order and digits (D362).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DIGIT_PAGES, pageKeys } from '@renderer/app/pages'
import { SideMenu } from '@renderer/app/SideMenu'
import { useSearch } from '@renderer/features/search/searchStore'
import { useData } from '@renderer/store/data'
import { PAGES, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  useUi.setState({ page: 'today', day: null, focus: null, pick: null })
  useSearch.setState({ open: false })
  useData.setState({ view: { status: 'open' } as never })
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})
async function mount() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(SideMenu, { page: 'today' })))
}
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('„Szukaj” w menu bocznym (D469)', () => {
  it('jest ostatnią pozycją menu, z napisem „Szukaj” i skrótem „Ctrl K” jak skróty ekranów', async () => {
    await mount()
    const search = q('nav-search')!
    expect(search).not.toBeNull()
    expect(search.textContent).toBe('SzukajCtrl K')
    expect(search.getAttribute('title')).toBe('Szukaj (Ctrl K)')
    // Same markup of the keys as the screens' ones.
    const keysOf = (el: HTMLElement) => el.querySelector('span.num')!.className
    expect(keysOf(search)).toBe(keysOf(q('nav-today')!))
    const items = [...q('side-menu')!.querySelectorAll('button')].map((b) => b.getAttribute('data-testid'))
    expect(items).toEqual([...PAGES.map((p) => `nav-${p}`), 'nav-search'])
  })

  it('klik otwiera paletę jak Ctrl K; pozycja nie jest „bieżącym ekranem”', async () => {
    await mount()
    expect(useSearch.getState().open).toBe(false)
    act(() => q('nav-search')!.click())
    expect(useSearch.getState().open).toBe(true)
    expect(q('nav-search')!.getAttribute('aria-current')).toBeNull()
    expect(useUi.getState().page).toBe('today')
  })

  it('ekrany zachowują kolejność i cyfry Ctrl+cyfra (D362); „Szukaj” nie zabiera cyfry', () => {
    expect(DIGIT_PAGES).toEqual(['today', 'calendar', 'week', 'stats', 'requests', 'templates', 'routines', 'room', 'history'])
    expect(DIGIT_PAGES.map((p) => pageKeys(p))).toEqual(['Ctrl 1', 'Ctrl 2', 'Ctrl 3', 'Ctrl 4', 'Ctrl 5', 'Ctrl 6', 'Ctrl 7', 'Ctrl 8', 'Ctrl 9'])
    expect(pageKeys('settings')).toBe('Ctrl ,')
  })
})
