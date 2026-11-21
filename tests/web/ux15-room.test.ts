// @vitest-environment jsdom
/**
 * „Pokój” tłumaczy własne słowa (UX15, E8): nota pod pokojem mówi, za co są nuty, co to „dzień ochronny” i „bez danych” (z „?” do
 * okna „Jak to działa”), a każdy status ostatnich dni ma podpowiedź.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { GameScreen } from '@shared/api'
import { gameView } from '@shared/engine/progress'
import { rdFrom } from '@shared/model/rd'
import { RoomPage } from '@renderer/features/game/RoomPage'
import { stepHelp } from '@renderer/features/game/gameText'
import { useData } from '@renderer/store/data'
import { useGame } from '@renderer/store/game'
import { useHelp } from '@renderer/store/help'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const TODAY = '2026-11-21'
const steps = (['up', 'held', 'protected', 'broken', 'skip'] as const).map((move, i) => ({ date: `2026-11-${String(16 + i).padStart(2, '0')}`, move, frozen: true }))
let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

beforeEach(() => {
  useData.setState({ rd: rdFrom({}), view: { today: TODAY } as never })
  useGame.setState({ game: { ...gameView([], TODAY), steps, due: [] } as unknown as GameScreen, loaded: true, failed: false })
  useHelp.setState({ open: null, term: null })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useGame.setState({ game: null, loaded: false, failed: false })
})

const mount = async () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(RoomPage)))
}

describe('E8: Pokój mówi, co znaczą jego słowa', () => {
  it('nota: za co są nuty, dzień ochronny i „bez danych”, z „?” do okna pojęć', async () => {
    await mount()
    const note = q('room-note')!
    expect(note).not.toBeNull()
    expect(note.textContent).toContain('Nuty')
    expect(note.textContent).toContain('dotrzymana granica')
    expect(note.textContent).toContain('dzień ochronny')
    expect(note.textContent).toContain('bez danych')
    for (const term of ['notes', 'protectiveDay', 'noData']) expect(note.querySelector(`[data-testid="help-${term}"]`), term).not.toBeNull()
    act(() => note.querySelector<HTMLElement>('[data-testid="help-protectiveDay"]')!.click())
    expect(useHelp.getState()).toMatchObject({ open: 'concepts', term: 'protectiveDay' })
  })

  it('każdy dzień z ostatnich ma podpowiedź swojego statusu', async () => {
    await mount()
    for (const s of steps) {
      const cell = q(`room-day-${s.date}`)!
      expect(cell.getAttribute('title'), s.move).toBe(stepHelp(s.move))
      expect(stepHelp(s.move).length).toBeGreaterThan(20)
    }
    expect(stepHelp('protected')).toContain('passa trwa')
    expect(stepHelp('held')).toContain('nie przerywa passy')
  })
})
