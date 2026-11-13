// @vitest-environment jsdom
/**
 * The 📎N on a block's tile of „Tydzień” (D410, T815): in the line of the hours when the tile has room, beside the name when it
 * has not; its tooltip says the count; none – nothing.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { HorizonBlock } from '@shared/engine/week'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { BlockBox } from '@renderer/features/week/WeekPage'

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const tile = (id: string, minutes: number): HorizonBlock => ({ id, named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user', sourceId: null }, categoryId: 'inne', startMin: 9 * 60, endMin: 9 * 60 + minutes, state: 'planned', outsidePlan: false, background: false })

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

async function mount(b: HorizonBlock, attach: number) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BlockBox, { block: b, lo: 8 * 60, lane: 0, lanes: 1, names, brightness: 1, date: '2026-11-18', attach })))
  return host.querySelector<HTMLElement>(`[data-testid="week-block-2026-11-18-${b.id}"]`)!
}

describe('znaczek 📎N w „Tygodniu”', () => {
  it('wysoki kafelek: przy godzinach; podpowiedź mówi liczbę', async () => {
    const t = await mount(tile('a', 90), 3)
    const badge = t.querySelector('[data-testid="attach-badge"]')!
    expect(badge.textContent).toBe('📎3')
    expect(badge.parentElement!.textContent).toContain('–')
    expect(t.title).toContain('3 załączniki')
  })

  it('niski kafelek (bez wiersza godzin): przy nazwie', async () => {
    const t = await mount(tile('b', 15), 1)
    const badge = t.querySelector('[data-testid="attach-badge"]')!
    expect(badge.textContent).toBe('📎1')
    expect(badge.parentElement!.textContent).toContain('Inne')
    expect(t.title).toContain('1 załącznik')
  })

  it('bez załączników – bez znaczka i bez słowa w podpowiedzi', async () => {
    const t = await mount(tile('c', 90), 0)
    expect(t.querySelector('[data-testid="attach-badge"]')).toBeNull()
    expect(t.title).not.toContain('załącz')
  })
})
