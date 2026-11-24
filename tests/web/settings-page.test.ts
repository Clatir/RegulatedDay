// @vitest-environment jsdom
/**
 * Strona Ustawień (UX14, E1, E2, E6, D565 P22): spis sekcji po lewej (każda sekcja jednym kliknięciem), grupy, znacznik „od
 * razu”, jeden pasek „od jutra” z listą zaplanowanych zmian, bez duplikatów „Wersja” i „Folder danych”, kopie zapasowe w „Dane
 * i kopie”, pola paska przy wyłączonym pasku spójnie widoczne i wyłączone, pole „Szukaj w ustawieniach” i wybór pola z Ctrl K.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, RdApi } from '@shared/api'
import { DEFAULT_MACHINE_PREFS } from '@shared/machine'
import { rdFrom } from '@shared/model/rd'
import { SettingsPage } from '@renderer/features/settings/SettingsPage'
import { SETTING_FIELDS, settingRecords } from '@renderer/features/settings/settingsIndex'
import { scrollToSetting } from '@renderer/features/settings/settingsScroll'
import { SETTINGS_GROUPS } from '@renderer/features/settings/settingsLayout'
import { useData } from '@renderer/store/data'
import { useMachine } from '@renderer/store/machine'
import { useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null
const scrolled: Array<{ id: string | null; block: string | undefined }> = []

const mount = async () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(SettingsPage)))
  await act(async () => undefined)
  return host
}
const q = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)
const click = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
const type = async (el: Element | null, value: string) => {
  expect(el).not.toBeNull()
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(el, value)
    el!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const view = (over: Partial<DataView> = {}): DataView => ({ status: 'open', today: '2026-11-21', folder: 'C:\\Dane', ...over }) as DataView
const future = [{ id: 'z1', from: '2026-11-25', at: null, made: 1, patch: { reserve: 20, dayTypes: { zwykly: { budgetMin: 420 } } } }]

beforeEach(() => {
  scrolled.length = 0
  Element.prototype.scrollIntoView = function (this: Element, o?: boolean | ScrollIntoViewOptions) {
    scrolled.push({ id: this.getAttribute('data-testid'), block: typeof o === 'object' ? o.block : undefined })
  }
  useUi.setState({ page: 'settings', day: null, focus: null, pick: null, toasts: [] })
  useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: true }, loaded: true })
  const api = new Proxy(
    {
      appInfo: () => Promise.resolve({ version: '1.33.0', electron: '44', identity: 'test', name: 'RD', userData: 'C:\\Users\\x\\AppData', computerId: 'c1', helper: { state: 'running' }, platform: 'win32', nightInstall: true }),
      autostart: () => Promise.resolve({ supported: false, willStart: false, disabledInTaskManager: false }),
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
  useData.setState({ view: view(), rd: rdFrom({ settings: future }) })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  delete (window as unknown as { rd?: unknown }).rd
  useData.setState({ view: null, rd: rdFrom(undefined) })
})

describe('E1: spis sekcji', () => {
  it('spis ma sześć grup, a każda sekcja strony ma w nim pozycję', async () => {
    await mount()
    const toc = q('settings-toc')!
    expect(toc).not.toBeNull()
    expect([...toc.querySelectorAll('[data-testid^="toc-group-"]')].map((b) => b.textContent)).toEqual(SETTINGS_GROUPS.map((g) => g.title))
    for (const s of SETTINGS_GROUPS.flatMap((g) => g.sections)) {
      expect(q(s.id), `sekcja ${s.id}`).not.toBeNull()
      expect(q(`toc-${s.id}`), `pozycja spisu ${s.id}`).not.toBeNull()
    }
  })

  it('kliknięcie pozycji przewija do sekcji (jedno kliknięcie), grupy – do jej nagłówka', async () => {
    await mount()
    await click(q('toc-settings-data'))
    expect(scrolled.at(-1)).toMatchObject({ id: 'settings-data', block: 'start' })
    await click(q('toc-settings-info'))
    expect(scrolled.at(-1)).toMatchObject({ id: 'settings-info', block: 'start' })
    await click(q('toc-group-day'))
    expect(scrolled.at(-1)?.id).toBe('settings-group-day')
  })

  it('sekcje są w kolejności grup ze spisu, każda grupa ma nagłówek', async () => {
    await mount()
    const order = [...document.querySelectorAll('[data-testid="settings"] [data-testid^="settings-"]')].map((e) => e.getAttribute('data-testid')!).filter((id) => id.startsWith('settings-group-') || SETTINGS_GROUPS.some((g) => g.sections.some((s) => s.id === id)))
    const want = SETTINGS_GROUPS.flatMap((g) => [`settings-group-${g.id}`, ...g.sections.map((s) => s.id)])
    expect(order).toEqual(want)
  })

  it('bez folderu danych: spis ma tylko sekcje, które są (pasek, dane, aktualizacje…)', async () => {
    useData.setState({ view: view({ status: 'none', folder: null }) })
    await mount()
    expect(q('toc-settings-bar')).not.toBeNull()
    expect(q('toc-settings-data')).not.toBeNull()
    expect(q('toc-settings-energy')).toBeNull()
    expect(q('settings-from')).toBeNull()
    expect(q('toc-group-day')).toBeNull()
  })
})

describe('E2: od razu, od jutra i zaplanowane zmiany', () => {
  it('znacznik „od razu” przy sekcjach bez daty, nie przy tych z datą', async () => {
    await mount()
    const tagged = (id: string) => q(id)!.querySelector('[data-testid="now-tag"]') !== null
    for (const id of ['settings-modules', 'settings-care', 'settings-cases', 'settings-calendars', 'settings-bar', 'settings-notices', 'settings-machine']) expect(tagged(id), id).toBe(true)
    for (const id of ['settings-daytypes', 'settings-plan', 'settings-sleep', 'settings-energy', 'settings-timer', 'settings-reminders', 'settings-accuracy', 'settings-categories', 'settings-data', 'settings-updates']) expect(tagged(id), id).toBe(false)
  })

  it('jeden pasek „od jutra”, nad pierwszą sekcją z datą i pod „Moduły”', async () => {
    await mount()
    expect(document.querySelectorAll('[data-testid="settings-from"]')).toHaveLength(1)
    const all = [...document.querySelectorAll('[data-testid="settings"] [data-testid]')].map((e) => e.getAttribute('data-testid'))
    const at = all.indexOf('settings-from')
    expect(at).toBeGreaterThan(all.indexOf('settings-modules'))
    expect(at).toBeLessThan(all.indexOf('settings-daytypes'))
    expect(at).toBeLessThan(all.indexOf('settings-categories'))
    // „Dane i kopie” i reszta są poza paskiem (po ostatniej sekcji z datą).
    expect(all.indexOf('settings-categories')).toBeLessThan(all.indexOf('settings-data'))
    expect(q('settings-from')!.parentElement!.contains(q('settings-bar'))).toBe(false)
    expect(q('settings-from')!.parentElement!.contains(q('settings-energy'))).toBe(true)
  })

  it('lista zaplanowanych zmian: pole, wartość i data; w wierszu „Wycofaj” (zapis – settings-withdraw.test.ts)', async () => {
    await mount()
    const row = q('settings-planned-z1')!
    expect(row).not.toBeNull()
    expect(row.textContent).toContain('25.11.2026')
    expect(row.textContent).toContain('Rezerwa energii')
    expect(row.textContent).toContain('20')
    expect(row.textContent).toContain('Zwykły: budżet pracy')
    expect(row.textContent).toContain('7 h')
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Wycofaj'])
    expect(q('settings-withdraw-z1')).toBe(row.querySelector('button'))
    expect(q('settings-from')!.textContent).not.toContain('Zaplanowane zmiany: od')
  })

  it('bez zaplanowanych zmian listy nie ma', async () => {
    useData.setState({ rd: rdFrom(undefined) })
    await mount()
    expect(q('settings-planned')).toBeNull()
  })
})

describe('E6: duplikaty i pola paska', () => {
  it('„Wersja” jest jedna (z rodzajem instalacji), bez „Wersja aplikacji”', async () => {
    await mount()
    const labels = [...document.querySelectorAll('span.text-muted')].map((s) => s.textContent?.trim())
    expect(labels.filter((l) => l === 'Wersja')).toHaveLength(1)
    expect(labels).not.toContain('Wersja aplikacji')
    expect(q('identity')!.textContent).toBe('1.33.0 · testowa (Regulated Day Test)')
    expect(q('current-version')).toBeNull()
  })

  it('„Folder danych” jest jeden (w „Dane i kopie”), folder programu nazwany inaczej', async () => {
    await mount()
    const labels = [...document.querySelectorAll('span.text-muted')].map((s) => s.textContent?.trim())
    expect(labels.filter((l) => l === 'Folder danych')).toHaveLength(1)
    expect(labels).not.toContain('Folder danych aplikacji')
    expect(q('settings-data')!.contains(q('data-folder'))).toBe(true)
    expect(q('settings-info')!.contains(q('user-data'))).toBe(true)
    expect(q('user-data')!.textContent).toBe('C:\\Users\\x\\AppData')
  })

  it('kopie zapasowe w jednym miejscu: lista i dodatkowe miejsce w „Dane”, nie w „Ten komputer”', async () => {
    await mount()
    expect(q('settings-data')!.contains(q('field-backups'))).toBe(true)
    expect(q('settings-data')!.contains(q('field-backup-extra'))).toBe(true)
    expect(q('settings-machine')!.textContent).not.toContain('kopii')
  })

  it('tolerancja trafności jest w „Trafność planu”, nie w „Pytania w ciągu dnia”', async () => {
    await mount()
    expect(q('settings-accuracy')!.contains(q('setting-accuracyTolerancePct'))).toBe(true)
    expect(q('settings-timer')!.contains(q('setting-accuracyTolerancePct'))).toBe(false)
  })

  it('przy włączonym pasku jego pola są aktywne', async () => {
    await mount()
    for (const id of ['field-bar-back', 'field-bar-place', 'field-bar-pulse']) {
      expect(q(id), id).not.toBeNull()
      expect(q(id)!.closest('fieldset')?.disabled ?? false, id).toBe(false)
    }
  })

  it('przy wyłączonym pasku wszystkie jego pola (także „Pasek wraca…”) stoją na swoich miejscach, wyłączone, z jednym wyjaśnieniem', async () => {
    useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: false }, loaded: true })
    await mount()
    for (const id of ['field-bar-back', 'field-bar-place', 'field-bar-pulse']) {
      expect(q(id), id).not.toBeNull()
      expect(q(id)!.closest('fieldset')?.disabled, id).toBe(true)
    }
    expect(q('pref-bar-back-with-main')).not.toBeNull()
    expect(q('settings-bar-off')!.textContent).toContain('wyłączony')
    // Pole samego paska i pola, które działają bez niego, zostają aktywne.
    expect(q('pref-desktop-bar')).not.toBeNull()
    expect(q('field-bar')!.closest('fieldset')).toBeNull()
    expect(q('field-sound')!.closest('fieldset')).toBeNull()
  })
})

describe('pole „Szukaj w ustawieniach”', () => {
  it('„rezerwa” pokazuje pole „Rezerwa energii”, a kliknięcie przewija do pola (na środek) i zostawia je oznaczone', async () => {
    await mount()
    await type(q('settings-search'), 'rezerwa')
    const hit = q('settings-search-hit-field-reserve')
    expect(hit).not.toBeNull()
    expect(hit!.textContent).toContain('Rezerwa energii')
    expect(hit!.textContent).toContain('Energia')
    await click(hit)
    expect(scrolled.at(-1)).toMatchObject({ id: 'field-reserve', block: 'center' })
    expect(q('field-reserve')!.hasAttribute('data-found')).toBe(true)
  })

  it('Enter w polu otwiera pierwszy wynik; Esc czyści pole', async () => {
    await mount()
    const input = q('settings-search') as HTMLInputElement
    await type(input, 'folder')
    await act(async () => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(scrolled.length).toBeGreaterThan(0)
    await act(async () => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(input.value).toBe('')
  })

  it('brak wyniku – komunikat, nie pusty wiersz', async () => {
    await mount()
    await type(q('settings-search'), 'zzzzzz')
    expect(q('settings-search-none')).not.toBeNull()
  })
})

describe('Ctrl K: wybór pola prowadzi do pola', () => {
  it('wybór „field-reserve” przewija do pola, a pick jest zużyty', async () => {
    useUi.setState({ pick: { kind: 'setting', id: 'field-reserve' } })
    await mount()
    expect(scrolled.at(-1)).toMatchObject({ id: 'field-reserve', block: 'center' })
    expect(useUi.getState().pick).toBeNull()
  })

  it('wybór sekcji dalej przewija jej początek', async () => {
    useUi.setState({ pick: { kind: 'setting', id: 'settings-energy' } })
    await mount()
    expect(scrolled.at(-1)).toMatchObject({ id: 'settings-energy', block: 'start' })
  })

  it('każde pole ze spisu istnieje na stronie (Enter w Ctrl K nie kończy się „nie ma”)', async () => {
    await mount()
    const missing = SETTING_FIELDS.filter((f) => !q(f.id)).map((f) => f.id)
    expect(missing).toEqual([])
  })
})

describe('przegląd UX14, runda 1', () => {
  it('bez otwartego folderu pole szukania nie podpowiada pól, których strona nie ma (CSV, kopie), a każdy podpowiedziany wynik jest na stronie', async () => {
    useData.setState({ view: view({ status: 'none', folder: null }) })
    await mount()
    for (const r of settingRecords(false)) expect(q(r.id), r.id).not.toBeNull()
    expect(settingRecords(false).map((r) => r.id)).not.toContain('field-backups')
    expect(settingRecords(false).map((r) => r.id)).not.toContain('field-csv')
    expect(settingRecords(true).map((r) => r.id)).toContain('field-csv')
    await type(q('settings-search'), 'kopie')
    expect(q('settings-search-hit-field-backups')).toBeNull()
    expect(q('settings-search-hit-field-backup-extra')).not.toBeNull()
  })

  it('wybór pola z Ctrl K bez otwartego folderu mówi, czemu nic się nie stało', async () => {
    useData.setState({ view: view({ status: 'none', folder: null }) })
    useUi.setState({ pick: { kind: 'setting', id: 'field-backups' } })
    await mount()
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Ta część ustawień jest dostępna po otwarciu folderu danych.')
  })

  it('bez otwartego folderu: pole i sekcja, których nie ma wcale, mają „nie ma”, nie „po otwarciu folderu”', async () => {
    useData.setState({ view: view({ status: 'none', folder: null }) })
    useUi.setState({ pick: { kind: 'setting', id: 'field-nie-ma' } })
    await mount()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Tego pola ustawień nie ma.'])
    act(() => useUi.setState({ toasts: [], pick: { kind: 'setting', id: 'settings-nie-ma' } }))
    await act(async () => undefined)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Tej sekcji ustawień nie ma.'])
  })

  it('pole, którego nie ma, ma komunikat o polu, a sekcja – o sekcji', async () => {
    useUi.setState({ pick: { kind: 'setting', id: 'field-nie-ma' } })
    await mount()
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Tego pola ustawień nie ma.')
    act(() => useUi.setState({ toasts: [], pick: { kind: 'setting', id: 'settings-nie-ma' } }))
    await act(async () => undefined)
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Tej sekcji ustawień nie ma.')
  })

  it('otwarcie folderu nie montuje od nowa sekcji, które były (pasek, Ten komputer)', async () => {
    useData.setState({ view: view({ status: 'none', folder: null }) })
    await mount()
    const bar = q('settings-bar')
    const machine = q('settings-machine')
    expect(bar).not.toBeNull()
    await act(async () => useData.setState({ view: view() }))
    expect(q('settings-from')).not.toBeNull()
    expect(q('settings-bar')).toBe(bar)
    expect(q('settings-machine')).toBe(machine)
  })

  it('dwa wpisy o tej samej etykiecie na liście zaplanowanych nie dają ostrzeżenia o kluczach', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useData.setState({ rd: rdFrom({ settings: [{ id: 'z2', from: '2026-11-25', at: null, made: 1, patch: { categories: { a1: { cost: 1 }, a2: { cost: 2 } } } }] }) })
    await mount()
    expect(q('settings-planned-z2')!.querySelectorAll('li li')).toHaveLength(2)
    expect(spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('same key'))).toEqual([])
    spy.mockRestore()
  })
})

describe('scrollToSetting: obwódka', () => {
  afterEach(() => vi.useRealTimers())

  it('ponowny wybór tego samego pola w 2,2 s odnawia obwódkę (pierwszy czas jej nie zdejmuje)', () => {
    vi.useFakeTimers()
    Element.prototype.scrollIntoView = () => undefined
    const el = document.createElement('div')
    el.setAttribute('data-testid', 'field-x')
    document.body.append(el)
    expect(scrollToSetting('field-x')).toBe(true)
    vi.advanceTimersByTime(1500)
    scrollToSetting('field-x')
    vi.advanceTimersByTime(1500)
    expect(el.hasAttribute('data-found')).toBe(true)
    vi.advanceTimersByTime(800)
    expect(el.hasAttribute('data-found')).toBe(false)
    el.remove()
  })
})
