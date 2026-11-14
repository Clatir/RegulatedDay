// @vitest-environment jsdom
/**
 * D496: in „Dziś” a bare click on an empty place of the axis makes nothing (no draft) – only a drag creates a block;
 * „Szablony” keep the click of D366 (a block on the quarter). `Timeline` `clickCreates`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Timeline } from '@renderer/features/plan/Timeline'
import { AXIS_HINT } from '@renderer/features/today/TodayPage'

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

async function clickHours(clickCreates: boolean | undefined): Promise<ReturnType<typeof vi.fn>> {
  const onCreate = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const props = { items: [], markers: [], selected: null, onSelect: () => undefined, onCreate, from: 6 * 60, to: 22 * 60, ...(clickCreates === undefined ? {} : { clickCreates }) }
  await act(async () => root!.render(createElement(Timeline, props)))
  const hours = host.querySelector<HTMLElement>('[data-testid="timeline-hours"]')!
  expect(hours).not.toBeNull()
  await act(async () => {
    hours.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 200 }))
  })
  return onCreate
}

describe('goły klik osi (D496)', () => {
  it('„Dziś” (clickCreates false): klik nie tworzy szkicu', async () => {
    expect(await clickHours(false)).not.toHaveBeenCalled()
  })

  it('domyślnie (Szablony, D366): klik daje blok na kwadrans', async () => {
    const onCreate = await clickHours(undefined)
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0]![0]! % 15).toBe(0)
  })

  it('podpowiedź w panelu „Dziś” nie każe klikać osi (nowy blok: przeciągnięcie, „+ Blok”, Ctrl+N)', () => {
    expect(AXIS_HINT).not.toMatch(/klik/i)
    expect(AXIS_HINT).toContain('Przeciągnij')
    expect(AXIS_HINT).toContain('+ Blok')
    expect(AXIS_HINT).toContain('Ctrl+N')
  })
})
