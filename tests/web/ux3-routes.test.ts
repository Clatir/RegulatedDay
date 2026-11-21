// @vitest-environment jsdom
/**
 * Drogi z komunikatów (UX3, A9): „Nie mogę teraz odczytać …” i pytanie o uszkodzony plik mają „Historia” (historia tego rekordu
 * przez `pick`, jak wybór z Ctrl K), baner kopii prowadzi do sekcji „Dane”, „Folder danych: Nie wybrano” ma „Otwórz kreator”.
 * A11: sekcje ustawień nie wchodzą pod przyklejony pasek „od jutra”.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditQuestion, HistoryRecord, RdApi } from '@shared/api'
import { Section } from '@renderer/components/ui'
import { Banners } from '@renderer/app/Banners'
import { ProblemsBanner, QuestionsBanner } from '@renderer/app/Questions'
import { HistoryPage } from '@renderer/features/history/HistoryPage'
import { SettingsPage } from '@renderer/features/settings/SettingsPage'
import { useWizard } from '@renderer/features/wizard/wizardStore'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null
const mount = async (el: ReturnType<typeof createElement>) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  return host
}
const click = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
const byText = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) ?? null

const records: HistoryRecord[] = [
  { kind: 'day', id: '2026-11-12', rel: 'days/2026/2026-11-12.json', versions: 2, last: Date.UTC(2026, 10, 12), exists: true },
  { kind: 'settings', id: 'rd', rel: 'rd.json', versions: 1, last: Date.UTC(2026, 10, 12), exists: true }
]
const historyVersions = vi.fn<RdApi['historyVersions']>(() => Promise.resolve([]))

beforeEach(() => {
  useUi.setState({ page: 'today', day: null, focus: null, pick: null, toasts: [] })
  useWizard.setState({ open: false, asked: false })
  historyVersions.mockClear()
  const api: Partial<RdApi> = {
    historyList: () => Promise.resolve(records),
    historyVersions,
    dayFiles: () => Promise.resolve({}),
    appInfo: () => Promise.resolve({ version: '1.33.0', electron: '44', identity: 'prod', name: 'RD', userData: '', computerId: 'c1', helper: { state: 'running' }, platform: 'win32', nightInstall: true } as never),
    autostart: () => Promise.resolve({ supported: false, willStart: false, disabledInTaskManager: false } as never),
    update: () => Promise.resolve(null as never),
    onUpdate: () => () => undefined,
    barScreens: () => Promise.resolve({ displays: [] } as never),
    quickShortcut: () => Promise.resolve(null as never),
    onQuickShortcut: () => () => undefined
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = api
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  delete (window as unknown as { rd?: unknown }).rd
  useData.setState({ view: null })
})

const setView = (v: Partial<DataView> & { status: DataView['status'] }) => useData.setState({ view: v as DataView })

describe('A9: „Historia” przy uszkodzonym pliku', () => {
  it('baner „Nie mogę teraz odczytać” ma „Historia” – otwiera historię tego rekordu (plan dnia)', async () => {
    setView({ status: 'open', problems: ['days/2026/2026-11-12.json: Unexpected token'] })
    await mount(createElement(ProblemsBanner))
    await click(byText('Historia'))
    expect(useUi.getState().page).toBe('history')
    expect(useUi.getState().pick).toEqual({ kind: 'history', id: 'day/2026-11-12' })
  })

  it('kilka uszkodzonych rekordów – przycisk przy każdym, z jego nazwą; plik bez historii (np. lista plików) go nie ma', async () => {
    setView({ status: 'open', problems: ['days/2026/2026-11-12.json: x', 'rd.json: y', 'days/2026: lista plików: z'] })
    const el = await mount(createElement(ProblemsBanner))
    const labels = [...el.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual(['Historia: Plan dnia 12.11.2026', 'Historia: Ustawienia'])
  })

  it('pytanie o uszkodzony plik ma „Historia” – zamyka okno i otwiera historię rekordu', async () => {
    const q: EditQuestion = { id: 'q1', rel: 'rd.json', kind: 'broken', at: 1, theirsAt: null, fields: [] }
    setView({ status: 'open', questions: [q] })
    await mount(createElement(QuestionsBanner))
    await click(document.querySelector('[data-testid="questions-open"]'))
    expect(document.querySelector('[data-testid="questions"]')).not.toBeNull()
    await click(byText('Historia'))
    expect(useUi.getState().page).toBe('history')
    expect(useUi.getState().pick).toEqual({ kind: 'history', id: 'settings/rd' })
    expect(document.querySelector('[data-testid="questions"]')).toBeNull()
  })

  it('pytanie o inny rodzaj (konflikt) „Historii” nie ma', async () => {
    const q: EditQuestion = { id: 'q1', rel: 'rd.json', kind: 'conflict', at: 1, theirsAt: null, fields: [] }
    setView({ status: 'open', questions: [q] })
    await mount(createElement(QuestionsBanner))
    await click(document.querySelector('[data-testid="questions-open"]'))
    expect(byText('Historia')).toBeNull()
  })

  it('ekran Historii bierze wybór jednorazowo i otwiera wersje tego rekordu', async () => {
    useUi.setState({ page: 'history', pick: { kind: 'history', id: 'day/2026-11-12' } })
    setView({ status: 'open' })
    await mount(createElement(HistoryPage))
    await act(async () => undefined)
    expect(historyVersions).toHaveBeenCalledWith('day', '2026-11-12')
    expect(useUi.getState().pick).toBeNull()
    expect(document.querySelector('[data-testid="history-versions"]')).not.toBeNull()
  })

  it('rekord bez historii – komunikat, wybór nie czeka', async () => {
    useUi.setState({ page: 'history', pick: { kind: 'history', id: 'routine/nie-ma' } })
    setView({ status: 'open' })
    await mount(createElement(HistoryPage))
    await act(async () => undefined)
    expect(historyVersions).not.toHaveBeenCalled()
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text).join(' ')).toContain('historii')
  })
})

describe('A9: baner kopii prowadzi do „Dane”', () => {
  it('„Ustawienia” w banerze kopii otwiera sekcję „Dane” (jak Ctrl K), nie górę strony', async () => {
    setView({ status: 'open', backup: { stale: true, lastOk: null, failed: null } as never })
    await mount(createElement(Banners))
    await click(byText('Ustawienia'))
    expect(useUi.getState().page).toBe('settings')
    expect(useUi.getState().pick).toEqual({ kind: 'setting', id: 'settings-data' })
  })
})

describe('A9: „Folder danych: Nie wybrano” ma „Otwórz kreator”', () => {
  it('bez folderu przycisk otwiera kreator; z folderem go nie ma', async () => {
    setView({ status: 'none', folder: null })
    await mount(createElement(SettingsPage))
    await act(async () => undefined)
    await click(byText('Otwórz kreator'))
    expect(useWizard.getState().open).toBe(true)
    expect(useWizard.getState().asked).toBe(true)
    act(() => root?.unmount())
    host?.remove()
    useWizard.setState({ open: false, asked: false })
    setView({ status: 'none', folder: 'C:\\Dane' })
    await mount(createElement(SettingsPage))
    expect(byText('Otwórz kreator')).toBeNull()
  })
})

describe('A11: sekcje ustawień pod przyklejonym paskiem „od jutra”', () => {
  it('Section ma margines przewijania (scroll-mt) – nagłówek po przewinięciu nie wchodzi pod pasek', () => {
    const html = renderToStaticMarkup(createElement(Section, { title: 'Dane', 'data-testid': 'settings-data', children: 'x' }))
    expect(html).toMatch(/class="[^"]*\bscroll-mt-/)
  })
})
