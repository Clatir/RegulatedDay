// @vitest-environment jsdom
/**
 * Pojęcia i pierwsze kroki (UX15, E3, D565 P23): żadne pole Ustawień nie jest bez opisu – każde pole ze spisu (`SETTING_FIELDS`,
 * te same, które znajduje Ctrl K i pole „Szukaj w ustawieniach”) ma na stronie opis (element `data-hint`), a „?” przy pojęciu
 * otwiera okno „Jak to działa” na tym pojęciu.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DataView, RdApi } from '@shared/api'
import { DEFAULT_MACHINE_PREFS } from '@shared/machine'
import { rdFrom } from '@shared/model/rd'
import { FIELD_TERMS, GLOSSARY } from '@renderer/features/help/glossary'
import { SettingsPage } from '@renderer/features/settings/SettingsPage'
import { SETTING_FIELDS } from '@renderer/features/settings/settingsIndex'
import { useData } from '@renderer/store/data'
import { useHelp } from '@renderer/store/help'
import { useMachine } from '@renderer/store/machine'
import { useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null

const mount = async () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(SettingsPage)))
  await act(async () => undefined)
  return host
}
const q = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)

/** The description of a field of the page: the element marked `data-hint` in its row (or the row itself), its attribute or its text. */
const describedBy = (id: string): string => {
  const row = q(id)
  if (!row) return ''
  const hint = row.matches('[data-hint]') ? row : row.querySelector('[data-hint]')
  return hint ? (hint.getAttribute('data-hint') || hint.textContent || '').trim() : ''
}

beforeEach(() => {
  useUi.setState({ page: 'settings', day: null, focus: null, pick: null, toasts: [] })
  useHelp.setState({ open: null, term: null })
  useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: true }, loaded: true })
  const api = new Proxy(
    {
      appInfo: () => Promise.resolve({ version: '1.33.0', electron: '44', identity: 'test', name: 'RD', userData: 'C:\\Users\\x\\AppData', computerId: 'c1', helper: { state: 'running' }, platform: 'win32', nightInstall: true }),
      autostart: () => Promise.resolve({ supported: true, willStart: true, disabledInTaskManager: false }),
      update: () => Promise.resolve(null),
      onUpdate: () => () => undefined,
      barScreens: () => Promise.resolve({ displays: [] }),
      quickShortcut: () => Promise.resolve(null),
      onQuickShortcut: () => () => undefined,
      backups: () => Promise.resolve([]),
      computerList: () => Promise.resolve([])
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (() => Promise.resolve(null)) }
  )
  ;(window as unknown as { rd: Partial<RdApi> }).rd = api as never
  useData.setState({ view: { status: 'open', today: '2026-11-21', folder: 'C:\\Dane' } as DataView, rd: rdFrom({}) })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  delete (window as unknown as { rd?: unknown }).rd
  useData.setState({ view: null, rd: rdFrom(undefined) })
})

describe('E3: każde pole Ustawień ma opis', () => {
  it('każde pole ze spisu ma na stronie opis dłuższy niż jego nazwa', async () => {
    await mount()
    const bare = SETTING_FIELDS.filter((f) => describedBy(f.id).length < 20).map((f) => f.id)
    expect(bare).toEqual([])
  })

  it('opis nie jest powtórzeniem nazwy pola', async () => {
    await mount()
    for (const f of SETTING_FIELDS) expect(describedBy(f.id).toLowerCase(), f.id).not.toBe(f.title.toLowerCase())
  })

  it('pola z pojęciem z okna „Jak to działa” mają „?”, który otwiera okno na tym pojęciu', async () => {
    await mount()
    for (const [fieldId, term] of Object.entries(FIELD_TERMS)) {
      expect(GLOSSARY.some((g) => g.id === term), `${fieldId} → ${term}`).toBe(true)
      const row = q(fieldId)
      expect(row, fieldId).not.toBeNull()
      expect(row!.querySelector(`[data-testid="help-${term}"]`), `${fieldId} ma „?”`).not.toBeNull()
    }
    const mark = q('field-reserve')!.querySelector<HTMLElement>('[data-testid="help-reserve"]')!
    act(() => mark.click())
    expect(useHelp.getState()).toMatchObject({ open: 'concepts', term: 'reserve' })
  })

  it('rezerwa mówi o zakresie pola (0–20 na skali puli 0–100)', async () => {
    await mount()
    expect(describedBy('field-reserve')).toContain('0–20')
    expect(describedBy('field-reserve')).toContain('0–100')
  })

  it('moduły w Ustawieniach: przełącznik „tak / nie”, nie „włączony” przy nazwie rodzaju żeńskiego i nijakiego', async () => {
    await mount()
    for (const m of ['energy', 'requests', 'game']) expect(q(`module-${m}`)!.closest('label')!.textContent, m).toBe('tak')
    expect(q('module-game')!.getAttribute('aria-label')).toBe('Gra')
    expect(q('module-requests')!.getAttribute('aria-label')).toBe('Prośby')
    expect(q('module-energy')!.getAttribute('aria-label')).toBe('Energia i sygnały')
  })

  it('pojęcia z przeglądu (rezerwa, bufor propozycji granicy, wyjątek granicy, koszt w tle, próg bezczynności) mają „?” w Ustawieniach', async () => {
    await mount()
    for (const id of ['field-reserve', 'field-boundaryBufferMin', 'field-exceptionMaxMin', 'field-backgroundCostPct', 'field-idleThresholdMin']) {
      expect(q(id)!.querySelector('[data-testid^="help-"]'), id).not.toBeNull()
    }
  })
})
