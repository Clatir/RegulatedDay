// @vitest-environment jsdom
/**
 * „Pokój” przy wyłączonej grze (D471): pusty stan ma przycisk „Otwórz Ustawienia”, który otwiera Ustawienia od razu na
 * sekcji „Moduły” (to samo przejście co Enter w wyszukiwarce – `pick`), a nie tylko opis, gdzie szukać.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { rdFrom } from '@shared/model/rd'
import { RoomPage } from '@renderer/features/game/RoomPage'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  const rd = rdFrom({})
  useData.setState({ rd: { ...rd, general: { ...rd.general, modules: { ...rd.general.modules, game: false } } }, view: { today: '2026-11-18' } as never })
  useUi.setState({ page: 'room', day: null, focus: null, pick: null })
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('pusty „Pokój” przy wyłączonej grze (D471)', () => {
  it('ma przycisk „Otwórz Ustawienia”; klik otwiera Ustawienia z wybraną sekcją „Moduły”', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(RoomPage)))
    const off = host.querySelector('[data-testid="room-off"]')!
    expect(off.textContent).toContain('Gra jest wyłączona – włączysz ją w Ustawieniach → Moduły.')
    const button = [...off.querySelectorAll('button')].find((b) => b.textContent === 'Otwórz Ustawienia')
    expect(button).toBeDefined()
    act(() => button!.click())
    const ui = useUi.getState()
    expect(ui.page).toBe('settings')
    expect(ui.pick).toEqual({ kind: 'setting', id: 'settings-modules' })
  })
})
