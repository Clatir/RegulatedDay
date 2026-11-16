// @vitest-environment jsdom
/**
 * Przycisk „Zastosuj do…” w oknie (D546, runda 1): „Dziś” i „Jutro” liczą dzień z chwili kliknięcia (jak silnik), nie z dnia, z którym
 * narysowano stronę – po 04:00 bez przerysowania; okno godzin w trakcie zapisu nie zamyka się ani „Anuluj”, ani Esc.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, RdApi } from '@shared/api'
import { planBlock, type Template } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { TemplateDaysButton } from '@renderer/features/templates/ApplyTemplate'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'

const template: Template = {
  id: 'trening',
  name: 'Trening',
  dayType: 'zwykly',
  weekdays: [3],
  archived: false,
  versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [planBlock({ id: 'rano', categoryId: 'sport', startMin: 6 * 60, durationMin: 60, origin: 'template' })] }]
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView = () => undefined
})

let root: Root | null = null
let host: HTMLElement | null = null
const data = useData.getState()
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
  delete (window as { rd?: unknown }).rd
  useData.setState(data, true)
})

/** The window's folder: `dayData` answers at once, or (`hold`) – the first read – only when the test says so. */
function stub(hold = false) {
  const asked: string[] = []
  let holding = hold
  let release: () => void = () => undefined
  const rd: Partial<RdApi> = {
    dayData: (date) => {
      asked.push(date)
      const answer = { date, dayFile: null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false } as DayData
      if (!holding) return Promise.resolve(answer)
      holding = false
      return new Promise((res) => (release = () => res(answer)))
    },
    edit: async (entries) => entries.map(() => ({ status: 'applied' as const })),
    applyTemplateDays: async (entries, asks) => ({ outcomes: entries.map(() => ({ status: 'applied' as const })), facts: asks.map((a) => ({ day: a.day, written: [], taken: a.ids, skipped: [], closed: false })) }),
    dataView: async () => ({ today: '2026-11-16' }) as DataView
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: { today: '2026-11-16' } as DataView, templates: [template] })
  return { asked, release: () => release() }
}

async function mount(today: string) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(TemplateDaysButton, { template, today, kind: 'apply' })))
}
const byTest = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
async function pick(item: string) {
  await act(async () => byTest('template-apply')!.click())
  await act(async () => byTest(item)!.click())
}

describe('„Dziś” / „Jutro” z chwili kliknięcia', () => {
  it('strona narysowana wczoraj (przed 04:00), klik po 04:00: „Jutro” to jutro dziś liczonego dnia, bez okna godzin', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(placeLogical('2026-11-16', 10 * 60))
    const s = stub()
    await mount('2026-11-15')
    await pick('template-apply-tomorrow')
    await vi.waitFor(() => expect(s.asked).toContain('2026-11-17'))
    expect(s.asked).not.toContain('2026-11-16')
    expect(byTest('template-apply-confirm')).toBeNull()
  })

  it('„Dziś” – dzisiejszy dzień kliknięcia: okno godzin z „Godziny dziś”, zastosowanie do tego dnia', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(placeLogical('2026-11-16', 10 * 60))
    const s = stub()
    await mount('2026-11-15')
    await pick('template-apply-today')
    expect(byTest('template-apply-confirm')?.textContent).toContain('Zastosuj „Trening” do dziś')
    expect(byTest('template-apply-confirm-hours')).not.toBeNull()
    await act(async () => byTest('template-apply-confirm-ok')!.click())
    await vi.waitFor(() => expect(s.asked).toContain('2026-11-16'))
    expect(s.asked).not.toContain('2026-11-15')
  })
})

describe('okno w trakcie zapisu', () => {
  it('„Anuluj” wyłączone, Esc nie zamyka; po zapisie okno znika', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(placeLogical('2026-11-16', 10 * 60))
    const s = stub(true)
    await mount('2026-11-16')
    await pick('template-apply-today')
    await act(async () => byTest('template-apply-confirm-ok')!.click())
    expect((byTest('template-apply-confirm-cancel') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(byTest('template-apply-confirm')).not.toBeNull()
    await act(async () => s.release())
    await vi.waitFor(() => expect(byTest('template-apply-confirm')).toBeNull())
  })
})
