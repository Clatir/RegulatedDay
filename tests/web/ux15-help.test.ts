// @vitest-environment jsdom
/**
 * Pojęcia i skróty (UX15, E3, E5, D565 P23): okno „Jak to działa” (pule G·E·B·C, rezerwa, granica, maksimum, pula projektów, twardy
 * koniec, nuty, dzień ochronny, „bez danych”) znajduje Ctrl K i otwiera na pojęciu; lista skrótów jest pod F1 i pozycją „Skróty”
 * u dołu menu, jest pełna i nie ma jej już na dole Ustawień.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { rdFrom } from '@shared/model/rd'
import { search } from '@shared/search'
import { PAGE_LABEL, pageKeys } from '@renderer/app/pages'
import { useHotkeys } from '@renderer/app/App'
import { SideMenu } from '@renderer/app/SideMenu'
import { GLOSSARY } from '@renderer/features/help/glossary'
import { HelpHost } from '@renderer/features/help/HelpDialog'
import { choose } from '@renderer/features/search/paletteLogic'
import { COMMANDS, searchRecords } from '@renderer/features/search/records'
import { SETTINGS_SECTIONS } from '@renderer/features/settings/settingsLayout'
import { SHORTCUTS } from '@renderer/lib/shortcuts'
import { onModal } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { closeHelp, useHelp } from '@renderer/store/help'
import { useUi } from '@renderer/store/ui'
import { readFileSync } from 'node:fs'
import { useWizard } from '@renderer/features/wizard/wizardStore'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const TODAY = '2026-11-21'
let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

function Probe() {
  useHotkeys()
  return createElement('div', null, createElement(SideMenu, { page: 'today' }), createElement(HelpHost))
}
const mount = async () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Probe)))
}
const key = (init: KeyboardEventInit) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))

const records = () => searchRecords({ today: TODAY, rd: rdFrom(undefined), templates: [], requests: [], routines: [], series: [], blocks: [], pageLabel: PAGE_LABEL, pageKeys })
const found = (query: string) => search(records(), query, TODAY).flatMap((g) => g.hits.map((h) => h.record))

beforeEach(() => {
  closeHelp()
  useUi.setState({ page: 'today', day: null, focus: null, pick: null })
  useData.setState({ view: { status: 'open', today: TODAY } as never })
  useWizard.setState({ open: false, asked: false })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  closeHelp()
})

describe('E3: okno „Jak to działa”', () => {
  const NEEDED = ['pools', 'reserve', 'boundary', 'maximum', 'projectPool', 'hardEnd', 'notes', 'protectiveDay', 'noData']

  it('ma wszystkie pojęcia z przeglądu, każde z objaśnieniem dłuższym niż nazwa', () => {
    const ids = GLOSSARY.map((t) => t.id)
    for (const id of NEEDED) expect(ids, id).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of GLOSSARY) expect(t.text.length, t.id).toBeGreaterThan(60)
  })

  it('Ctrl K znajduje je po nazwie i po słowach (rezerwa, twardy koniec, dzień ochronny, „bez danych”, nuty, pule)', () => {
    const pick = (query: string) => found(query).filter((r) => r.kind === 'help').map((r) => r.id)
    expect(pick('rezerwa')).toContain('reserve')
    expect(pick('twardy koniec')).toContain('hardEnd')
    expect(pick('ochronny')).toContain('protectiveDay')
    expect(pick('bez danych')).toContain('noData')
    expect(pick('nuty')).toContain('notes')
    expect(pick('pule')).toContain('pools')
    expect(pick('pula projektów')).toContain('projectPool')
    expect(pick('maksimum')).toContain('maximum')
  })

  it('jest też poleceniem „Jak to działa”, a Enter na pojęciu otwiera okno na nim (nie na górze)', async () => {
    expect(COMMANDS.map((c) => c.id)).toContain('concepts')
    await mount()
    act(() => choose(found('rezerwa').find((r) => r.kind === 'help')!, TODAY))
    expect(useHelp.getState()).toMatchObject({ open: 'concepts', term: 'reserve' })
    expect(q('help-concepts')).not.toBeNull()
    expect(q('concept-reserve')!.getAttribute('data-current')).toBe('true')
    expect(q('concept-boundary')!.getAttribute('data-current')).toBeNull()
    act(() => choose(COMMANDS.find((c) => c.id === 'concepts')!, TODAY))
    expect(useHelp.getState()).toMatchObject({ open: 'concepts', term: null })
  })
})

describe('E5: lista skrótów pod F1 i „Skróty” w menu', () => {
  it('F1 otwiera listę, jeszcze raz F1 albo „Zamknij” zamyka', async () => {
    await mount()
    expect(q('help-shortcuts')).toBeNull()
    key({ key: 'F1', code: 'F1' })
    expect(q('help-shortcuts')).not.toBeNull()
    key({ key: 'F1', code: 'F1' })
    expect(q('help-shortcuts')).toBeNull()
    key({ key: 'F1', code: 'F1' })
    expect(q('help-shortcuts')).not.toBeNull()
    act(() => q('help-close')!.click())
    expect(q('help-shortcuts')).toBeNull()
  })

  it('F1 z modyfikatorem nic nie robi; przy otwartym oknie strony (dialog) – też nic', async () => {
    await mount()
    key({ key: 'F1', code: 'F1', ctrlKey: true })
    key({ key: 'F1', code: 'F1', shiftKey: true })
    expect(useHelp.getState().open).toBeNull()
    const modal = onModal()
    key({ key: 'F1', code: 'F1' })
    expect(useHelp.getState().open).toBeNull()
    modal.off()
  })

  it('pozycja „Skróty” u dołu menu (po „Szukaj”, z „F1”) otwiera tę samą listę i nie jest ekranem', async () => {
    await mount()
    const items = [...q('side-menu')!.querySelectorAll('button')].map((b) => b.getAttribute('data-testid'))
    expect(items.slice(-2)).toEqual(['nav-search', 'nav-shortcuts'])
    const item = q('nav-shortcuts')!
    expect(item.textContent).toBe('SkrótyF1')
    expect(item.getAttribute('aria-current')).toBeNull()
    act(() => item.click())
    expect(q('help-shortcuts')).not.toBeNull()
    expect(useUi.getState().page).toBe('today')
  })

  it('lista jest pełna: F1, Del, Enter/Esc, Ctrl+przeciągnięcie, Shift+× paska, Alt+↑↓ kroków – a Ustawienia już jej nie mają', async () => {
    const keys = SHORTCUTS.map(([k]) => k).join(' | ')
    for (const k of ['F1', 'Del', 'Enter', 'Esc', 'Ctrl+przeciągnięcie', 'Shift+×', 'Alt+↑ / Alt+↓', 'Ctrl+K', 'PgUp / PgDn', 'Win+Alt+N']) expect(keys, k).toContain(k)
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('settings-shortcuts')
    await mount()
    key({ key: 'F1', code: 'F1' })
    expect(q('shortcuts')!.querySelectorAll('dt').length).toBe(SHORTCUTS.length)
  })

  it('z listy skrótów jest przejście do „Jak to działa” i z powrotem', async () => {
    await mount()
    key({ key: 'F1', code: 'F1' })
    act(() => q('help-to-concepts')!.click())
    expect(q('help-concepts')).not.toBeNull()
    expect(q('help-shortcuts')).toBeNull()
    act(() => q('help-to-shortcuts')!.click())
    expect(q('help-shortcuts')).not.toBeNull()
  })
})

describe('przegląd UX15, runda 1', () => {
  it('specyfikacja: Ctrl K ma grupę „Pojęcia” i polecenia „Jak to działa”, „Skróty klawiszowe”', () => {
    const spec = readFileSync('docs/specyfikacja.md', 'utf8')
    const at = spec.indexOf('**Wyszukiwarka Ctrl K (SNT6')
    expect(at).toBeGreaterThanOrEqual(0)
    const bullet = spec.slice(at, spec.indexOf(String.fromCharCode(10), at))
    expect(bullet).toContain('„Pojęcia”')
    expect(bullet).toContain('„Jak to działa”')
    expect(bullet).toContain('„Skróty klawiszowe”')
  })
})
