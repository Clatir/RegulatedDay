// @vitest-environment jsdom
/**
 * UX1 / A6: skróty „Przenieś na…” liczą się od dziś (nie od oglądanego dnia), podpis ma dzień tygodnia i datę; skrót, który wskazuje
 * oglądany dzień albo dzień miniony, jest wyłączony z powodem w `title`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { MoveDialog, moveShortcuts } from '@renderer/features/today/MoveDialogs'
import type { DayModel } from '@renderer/store/day'

const TODAY = '2026-11-21'

describe('skróty „Przenieś na…” (A6)', () => {
  it('liczą od dziś, z dniem tygodnia i datą w podpisie', () => {
    // The viewed day is in the future (the 25th): „jutro” is still tomorrow of today.
    expect(moveShortcuts('2026-11-25', TODAY).map((s) => [s.date, s.label, s.disabled])).toEqual([
      ['2026-11-22', 'Jutro (nd 22.11)', undefined],
      ['2026-11-23', 'Pojutrze (pn 23.11)', undefined],
      ['2026-11-28', 'Za tydzień (sb 28.11)', undefined]
    ])
  })

  it('skrót na oglądany dzień jest wyłączony z powodem', () => {
    const s = moveShortcuts('2026-11-22', TODAY)
    expect(s[0]!.disabled).toBe('To jest oglądany dzień.')
    expect(s[1]!.disabled).toBeUndefined()
  })

  it('zawsze po dziś, także gdy oglądany jest dzień miniony', () => {
    expect(moveShortcuts('2026-11-20', TODAY).every((s) => s.disabled === undefined)).toBe(true)
    expect(moveShortcuts('2026-11-25', '2026-11-30').every((s) => s.date > '2026-11-30')).toBe(true)
  })
})

describe('okno „Przenieś na…” (A6)', () => {
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

  it('oglądany jutrzejszy dzień: „Jutro” wyłączone z powodem, „Pojutrze” zaznacza dzień od dziś', async () => {
    const block = planBlock({ id: 'b1', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'user' })
    const model = { date: '2026-11-22', data: { dayFile: null }, ctx: { plan: [block] } } as unknown as DayModel
    const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(MoveDialog, { model, block, names, today: TODAY, onClose: () => undefined })))
    const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-testid^="move-shortcut-"]')]
    expect(chips.map((c) => c.textContent)).toEqual(['Jutro (nd 22.11)', 'Pojutrze (pn 23.11)', 'Za tydzień (sb 28.11)'])
    expect(chips[0]!.disabled).toBe(true)
    expect(chips[0]!.title).toBe('To jest oglądany dzień.')
    await act(async () => void chips[1]!.click())
    expect(document.querySelector('[data-testid="move-apply"]')!.textContent).toBe('Przenieś na 23.11.2026')
  })
})
