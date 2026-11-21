// @vitest-environment jsdom
/**
 * UX4 (D563 P1, B1): „Zamknij dzień” of the evening ritual says so in the same toast as the morning list (D468) –
 * „Zamknięto <dzień>: … · Cofnij” – and „Cofnij” sends the ids of that close's events; the day comes back to the days not closed.
 * Also F3 (capital letters of the ritual's buttons) and F4 (one word for approving the boundary, morning and evening).
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CloseResult, TimerResult } from '@shared/api'
import type { RitualRow, RitualView } from '@shared/engine/ritual'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { RitualPanel } from '@renderer/features/ritual/RitualPanel'
import { closedToastText } from '@renderer/features/ritual/UnclosedDays'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'

const DAY = '2026-11-13'
const base = { id: 'x', afterClose: false }
const rows: RitualRow[] = [
  { ...base, id: 'r1', kind: 'parkedAnchored', block: 'b', anchor: 'a', answered: false } as unknown as RitualRow,
  { ...base, id: 'r2', kind: 'silent', items: [{ block: 'b', plannedEnd: 600, end: 650, seenAt: null, seenOn: null, explain: false }], extraMin: 50, explainMin: 0, answered: true } as unknown as RitualRow
]
const view = (closed: RitualView['closed'], r: RitualRow[]): RitualView => ({ rows: r, effects: {}, asWritten: { changes: [], forecast: false }, closed, felt: [] })
const model = { date: DAY, ctx: { date: DAY, plan: [], snapshot: { settings: { sessions: [] }, blocks: [] } }, state: { facts: { blocks: new Map() }, now: 0 } } as unknown as DayModel
const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useUi.setState({ toasts: [] })
})

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

async function mount(undo: TimerResult, r: RitualRow[] = []) {
  let closed: RitualView['closed'] = null
  const onClosed = vi.fn()
  const rd = {
    ritual: vi.fn(async () => view(closed, r)),
    casesRitual: vi.fn(async () => ({ back: [], questions: [], someday: null })),
    closeDay: vi.fn(async (): Promise<CloseResult> => ((closed = { at: 900, how: 'ritual' }), { ok: true, why: null, confirm: null, written: ['pca-1', 'pca-2'] })),
    undoClose: vi.fn(async (): Promise<TimerResult> => (undo.ok && (closed = null), undo))
  }
  ;(window as unknown as { rd: unknown }).rd = rd
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(RitualPanel, { model, names, onClosed })))
  await flush()
  return { rd, onClosed }
}
const el = (testId: string) => host!.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const click = async (testId: string) => {
  await act(async () => void el(testId)!.click())
  await flush()
}

describe('„Cofnij” po „Zamknij dzień” z rytuału (D563 P1, rozszerza D468)', () => {
  it('po zamknięciu dymek „Zamknięto …” z „Cofnij”; „Cofnij” wysyła id zdarzeń zamknięcia i dzień jest znów otwarty', async () => {
    const { rd, onClosed } = await mount({ ok: true, why: null, confirm: null })
    await click('ritual-close')
    expect(rd.closeDay).toHaveBeenCalledWith(DAY, 'ritual')
    expect(onClosed).toHaveBeenCalled()
    expect(el('ritual-left')!.textContent).toContain('dzień zamknięty o')
    const t = useUi.getState().toasts.at(-1)!
    expect(t).toMatchObject({ text: closedToastText(DAY, 'ritual'), kind: 'info', action: { label: 'Cofnij' } })
    expect(t.text.startsWith('Zamknięto piątek 13.11.2026')).toBe(true)
    await act(async () => t.action!.run())
    await flush()
    expect(rd.undoClose).toHaveBeenCalledWith(DAY, ['pca-1', 'pca-2'])
    expect(el('ritual-left')!.textContent).not.toContain('dzień zamknięty')
    expect(el('ritual-close')).not.toBeNull()
  })

  it('odmowa „Cofnij” (dzień zamrożony): powód w dymku', async () => {
    const why = 'ten dzień jest już zamrożony – zamknięcia nie da się cofnąć'
    await mount({ ok: false, why, confirm: null })
    await click('ritual-close')
    await act(async () => useUi.getState().toasts.at(-1)!.action!.run())
    await flush()
    expect(useUi.getState().toasts.at(-1)).toMatchObject({ text: why, kind: 'error' })
  })

  it('zamknięcie po „Wróć” / potwierdzeniu wierszy bez wyboru też ma dymek z „Cofnij”', async () => {
    await mount({ ok: true, why: null, confirm: null }, [rows[0]!])
    await click('ritual-close')
    expect(el('ritual-close-left')).not.toBeNull()
    await click('ritual-close-confirm')
    expect(useUi.getState().toasts.at(-1)).toMatchObject({ action: { label: 'Cofnij' } })
  })
})

describe('przyciski rytuału z wielką literą (F3)', () => {
  it('„Zostaw”, „Usuń”, „Rozwiń”, „Otwórz jutro”, „Anuluj”', async () => {
    await mount({ ok: true, why: null, confirm: null }, rows)
    const labels = [...host!.querySelectorAll('button')].map((b) => b.textContent)
    for (const l of ['Zostaw', 'Usuń', 'Rozwiń', 'Otwórz jutro']) expect(labels).toContain(l)
    await click('ritual-silent-unfold')
    expect([...host!.querySelectorAll('button')].map((b) => b.textContent)).toContain('Zwiń')
    const lower = [...host!.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((l) => /^[a-ząćęłńóśźż]/.test(l))
    expect(lower).toEqual([])
  })

  it('żaden przycisk rytuału w kodzie nie zaczyna się od małej litery (także „Anuluj” edytora godziny)', () => {
    const src = readFileSync('src/renderer/features/ritual/RitualPanel.tsx', 'utf8')
    const lines = src.split('\n').map((l) => l.trim())
    // A button's text: a line of words right before `</Act>` / `</button>`, or a quoted word of a ternary in it.
    const bad = lines.filter((l, i) => /^[a-ząćęłńóśźż][^<>{}=()']*$/.test(l) && /^<\/(Act|button)>/.test(lines[i + 1] ?? ''))
    expect(bad).toEqual([])
  })
})

describe('jedno słowo zatwierdzenia granicy (F4 cz. 1)', () => {
  it('rano i wieczorem przycisk to „Zatwierdź”', async () => {
    await mount({ ok: true, why: null, confirm: null }, [{ ...base, id: 'b1', kind: 'boundary', proposal: 900, approved: null } as unknown as RitualRow])
    expect(el('ritual-boundary-approve')!.textContent).toBe('Zatwierdź')
    const morning = readFileSync('src/renderer/features/today/MorningPlan.tsx', 'utf8')
    const at = morning.indexOf('data-testid="boundary-approve"')
    expect(morning.slice(at, at + 120).replace(/\s+/g, ' ')).toMatch(/> Zatwierdź </)
  })
})
