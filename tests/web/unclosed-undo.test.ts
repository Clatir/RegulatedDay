// @vitest-environment jsdom
/**
 * „Niezamknięte dni” rano (D468): after „Jak zapisano”, „Wolne” or „Nie pamiętam” a toast „Zamknięto <dzień>: <jak>” with
 * „Cofnij”; „Cofnij” sends the ids of that close's events and the row comes back; a refusal is said in a toast.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CloseResult, TimerResult, UnclosedDay } from '@shared/api'
import { closedToastText, dayTitle, UnclosedDays } from '@renderer/features/ritual/UnclosedDays'
import { useUi } from '@renderer/store/ui'

const DAY = '2026-11-13'
const day: UnclosedDay = { date: DAY, presence: true, closed: false, ritual: { rows: [], effects: {}, asWritten: { changes: [], forecast: false }, closed: null, felt: [] } }

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

/** The section mounted over a window whose folder closes the day and undoes the close as `undo` answers. */
async function mount(undo: TimerResult) {
  let open = [day]
  const rd = {
    unclosedDays: vi.fn(async () => open),
    closeDay: vi.fn(async (): Promise<CloseResult> => ((open = []), { ok: true, why: null, confirm: null, written: ['pca-7', 'pca-8'] })),
    undoClose: vi.fn(async (): Promise<TimerResult> => (undo.ok && (open = [day]), undo))
  }
  ;(window as unknown as { rd: unknown }).rd = rd
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(UnclosedDays)))
  await flush()
  return rd
}

const row = () => host!.querySelector(`[data-testid="unclosed-${DAY}"]`)
const click = async (testId: string) => {
  await act(async () => void (host!.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click())
  await flush()
}

describe('„Cofnij” po zamknięciu dnia rano (D468)', () => {
  it('„Wolne”: toast „Zamknięto …: wolny” z „Cofnij”; „Cofnij” wysyła id zdarzeń zamknięcia i wiersz wraca', async () => {
    const rd = await mount({ ok: true, why: null, confirm: null })
    expect(row()).not.toBeNull()
    await click(`unclosed-free-${DAY}`)
    expect(rd.closeDay).toHaveBeenCalledWith(DAY, 'free')
    expect(row()).toBeNull()
    const t = useUi.getState().toasts.at(-1)!
    expect(t).toMatchObject({ text: 'Zamknięto piątek 13.11.2026: wolny', kind: 'info', action: { label: 'Cofnij' } })
    await act(async () => t.action!.run())
    await flush()
    expect(rd.undoClose).toHaveBeenCalledWith(DAY, ['pca-7', 'pca-8'])
    expect(row()).not.toBeNull()
  })

  it('odmowa „Cofnij” (dzień zamrożony): powód w toaście, wiersza nie ma', async () => {
    const why = 'ten dzień jest już zamrożony – zamknięcia nie da się cofnąć'
    await mount({ ok: false, why, confirm: null })
    await click(`unclosed-unknown-${DAY}`)
    await act(async () => useUi.getState().toasts.at(-1)!.action!.run())
    await flush()
    expect(useUi.getState().toasts.at(-1)).toMatchObject({ text: why, kind: 'error' })
    expect(row()).toBeNull()
  })

  it('tekst toastu: dzień jak w wierszu, „jak zapisano” / „wolny” / „bez danych”', () => {
    expect(dayTitle(DAY)).toBe('piątek 13.11.2026')
    expect(closedToastText(DAY, 'asWritten')).toBe('Zamknięto piątek 13.11.2026: jak zapisano')
    expect(closedToastText(DAY, 'free')).toBe('Zamknięto piątek 13.11.2026: wolny')
    expect(closedToastText(DAY, 'unknown')).toBe('Zamknięto piątek 13.11.2026: bez danych')
  })
})
