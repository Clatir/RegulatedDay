// @vitest-environment jsdom
/**
 * „Terminy” of a sprawa on the page (D454, D455): the note „Ta data już minęła” and the buttons „Dziś” / „Jutro” count from
 * the day the save counts (the window's clock at the moment, `changeCase` → `patchedRaw`), not from the day the page read
 * up to 30 s ago – 04:00 passing under an open row does not leave the note a day behind.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { caseItems } from '@shared/engine/cases'
import { newTask, requestFrom } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { DatesForm } from '@renderer/features/cases/CasesPage'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterAll(() => vi.useRealTimers())

const WED = '2026-11-11'
const THU = '2026-11-12'

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
})

async function mount(doDate: string, nowMs: number) {
  vi.useFakeTimers({ toFake: ['Date'], now: nowMs })
  const raw = newTask('t', placeLogical(WED, 12 * 60), WED, { title: 'x', doDate })!
  const x = caseItems([requestFrom(raw)!], WED, () => null)[0]!
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const saved: Array<Record<string, unknown>> = []
  await act(async () => root!.render(createElement(DatesForm, { x, set: (patch) => void saved.push(patch) })))
  return saved
}

describe('„Terminy” liczą od dnia zapisu (D454)', () => {
  it('po 04:00 data z wczoraj ma już „Ta data już minęła”, choć strona czytała dzień przed chwilą', async () => {
    await mount(WED, placeLogical(THU, 4 * 60 + 1))
    expect(host!.querySelector('[data-testid="case-do-note"]')?.textContent).toBe('Ta data już minęła')
  })

  it('przed 04:00 ta sama data to jeszcze dziś – bez komunikatu', async () => {
    await mount(WED, placeLogical(WED, 26 * 60))
    expect(host!.querySelector('[data-testid="case-do-note"]')).toBeNull()
  })

  it('przycisk „Dziś” wpisuje dzień zapisu', async () => {
    const saved = await mount(WED, placeLogical(THU, 4 * 60 + 1))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="case-do-today"]')!.click())
    expect(saved).toEqual([{ doDate: THU }])
  })
})
