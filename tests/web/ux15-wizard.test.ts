// @vitest-environment jsdom
/**
 * Kreator (UX15, E4, E8, D565 P23): po kroku folderu „Zakończ z domyślnymi” (kreator kończy się w dwóch krokach), podsumowanie z linkami
 * do kroków, niekołowy opis maksimum, te same słowa co Ustawienia (zajęcia stacjonarne, przypięcie w OneDrive, pasek pod oknami), a po
 * pierwszym komputerze lista „pierwszego dnia” zamiast samego dymka „Gotowe”.
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderProbe, RdApi, WizardFinish } from '@shared/api'
import { rdFrom } from '@shared/model/rd'
import { Banners } from '@renderer/app/Banners'
import { Wizard } from '@renderer/features/wizard/Wizard'
import { changedCostCategories, patchSettings, patchWizard, resetWizard, useWizard } from '@renderer/features/wizard/wizardStore'
import { ONEDRIVE_PIN, STATIONARY } from '@renderer/lib/sameWords'
import { useData } from '@renderer/store/data'
import { useFirstDay } from '@renderer/store/firstDay'
import { useHelp } from '@renderer/store/help'
import { useUi } from '@renderer/store/ui'
import { DEFAULT_SETTINGS } from '@shared/model/settings'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const probe = (over: Partial<FolderProbe> = {}): FolderProbe => ({ path: 'C:\\Dane', exists: false, empty: true, hasData: false, unreadable: null, entries: 0, inOneDrive: true, ...over })
let root: Root | null = null
let host: HTMLElement | null = null
const finished: WizardFinish[] = []
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const set = (p: Parameters<typeof patchWizard>[0]) => act(() => patchWizard(p))
const flush = () => act(async () => undefined)
const click = async (id: string) => {
  expect(q(id), id).not.toBeNull()
  await act(async () => void q(id)!.click())
}

beforeEach(() => {
  finished.length = 0
  resetWizard()
  patchWizard({ folder: 'C:\\Dane', probe: probe(), firstConfirmed: true })
  useFirstDay.setState({ show: false })
  useHelp.setState({ open: null, term: null })
  useUi.setState({ page: 'settings', day: null, focus: null, pick: null, toasts: [] })
  useData.setState({ view: { status: 'none', today: '2026-11-21', computer: 'c1' } as never, rd: rdFrom({}) })
  const api = new Proxy(
    {
      folderDefault: () => Promise.resolve('C:\\Dane'),
      folderProbe: () => Promise.resolve(probe()),
      wizardFinish: (w: WizardFinish) => {
        finished.push(w)
        return Promise.resolve({ ok: true, error: null })
      },
      barAction: () => Promise.resolve(),
      dataView: () => Promise.resolve(null),
      update: () => Promise.resolve(null),
      onUpdate: () => () => undefined
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (() => Promise.resolve(null)) }
  )
  ;(window as unknown as { rd: Partial<RdApi> }).rd = api as never
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  delete (window as unknown as { rd?: unknown }).rd
  vi.restoreAllMocks()
})

const mount = async (el: ReactElement = createElement(Wizard)) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  await flush()
}
const text = () => host?.textContent ?? ''

describe('E4: „Zakończ z domyślnymi”', () => {
  it('na kroku folderu go nie ma; od następnego kroku jest i kończy kreator zapisem z domyślnymi (2 kroki)', async () => {
    await mount()
    expect(q('wizard-step')!.textContent).toContain('1 z 14')
    expect(q('wizard-finish-defaults')).toBeNull()
    await click('wizard-next')
    expect(q('wizard-step')!.textContent).toContain('2 z 14')
    expect(q('wizard-finish-defaults')).not.toBeNull()
    await click('wizard-finish-defaults')
    await flush()
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ folder: 'C:\\Dane', first: true })
    expect(finished[0]!.records.length).toBeGreaterThan(0)
    expect(useWizard.getState().open).toBe(false)
  })

  it('jest na każdym kroku po folderze (nie na podsumowaniu, które ma „Zakończ”); w kreatorze kolejnego komputera – na kroku „Ten komputer”', async () => {
    await mount()
    for (let i = 1; i < 13; i++) {
      await click('wizard-next')
      expect(q('wizard-finish-defaults'), `krok ${i + 1}`).not.toBeNull()
    }
    await click('wizard-next')
    expect(q('wizard-step')!.textContent).toContain('14 z 14')
    expect(q('wizard-finish-defaults')).toBeNull()
    expect(q('wizard-finish')).not.toBeNull()

    act(() => root?.unmount())
    host?.remove()
    resetWizard()
    patchWizard({ folder: 'C:\\Dane', probe: probe({ hasData: true, exists: true, empty: false }), step: 1 })
    await mount()
    expect(q('wizard-step')!.textContent).toContain('2 z 3')
    await click('wizard-finish-defaults')
    await flush()
    expect(finished.at(-1)).toMatchObject({ first: false, records: [] })
  })

  it('zapisuje to, co już ustawiono w kreatorze (reszta zostaje domyślna)', async () => {
    await mount()
    await click('wizard-next')
    await set({ people: [{ id: 'p1', name: 'Mama', archived: false }] })
    await click('wizard-finish-defaults')
    await flush()
    expect(JSON.stringify(finished[0]!.records)).toContain('Mama')
  })

  it('w czasie zapisu jest wyłączony (drugi zapis się nie zaczyna)', async () => {
    await mount()
    await click('wizard-next')
    await set({ busy: true })
    await flush()
    expect((q('wizard-finish-defaults') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('E4: podsumowanie z linkami do kroków', () => {
  it('każda pozycja podsumowania ma link do swojego kroku', async () => {
    await set({ step: 13 })
    await mount()
    expect(q('wizard-summary')).not.toBeNull()
    for (const [link, title] of [
      ['wizard-goto-week', 'Tydzień'],
      ['wizard-goto-hours', 'Pobudka i sen'],
      ['wizard-goto-work', 'Praca i granica'],
      ['wizard-goto-lectures', 'Plan wykładów'],
      ['wizard-goto-calendar', 'Zjazdy'],
      ['wizard-goto-people', 'Osoby'],
      ['wizard-goto-modules', 'Moduły'],
      ['wizard-goto-computer', 'Ten komputer']
    ] as const) {
      await set({ step: 13 })
      await flush()
      await click(link)
      expect(q('wizard-step')!.textContent, link).toContain(title)
    }
  })

  it('link prowadzi do kroku, a „Dalej” wraca dalej zwykłą drogą', async () => {
    await set({ step: 13 })
    await mount()
    await click('wizard-goto-people')
    expect(useWizard.getState().step).toBe(8)
    expect(q('wizard-step')!.textContent).toContain('9 z 14')
  })
})

describe('E4: opisy kroków i te same słowa co Ustawienia', () => {
  it('maksimum granicy opisane bez kołowego „do której sięga granica”', async () => {
    await set({ step: 3 })
    await mount()
    expect(q('wizard-step')!.textContent).toContain('Praca i granica')
    expect(text()).toContain('Maksimum granicy to najpóźniejsza godzina, jaką może mieć koniec pracy dnia')
    expect(text()).not.toContain('do której sięga granica')
  })

  it('zajęcia stacjonarne, przypięcie w OneDrive i pasek pod oknami – jak w Ustawieniach', async () => {
    await set({ step: 12 })
    await mount()
    expect(q('wizard-step')!.textContent).toContain('Ten komputer')
    expect(text()).not.toContain('nigdy nad nimi')
    expect(text()).toContain('Zawsze na wierzchu')
    expect(text()).toContain('Przypnij w OneDrive')
    expect(text()).toContain(ONEDRIVE_PIN.hint)
    act(() => root?.unmount())
    host?.remove()
    await set({ step: 10 })
    await mount()
    expect(q('wizard-step')!.textContent).toContain('Koszty podkategorii')
    expect(text()).toContain(STATIONARY.label)
    expect(text()).toContain(STATIONARY.hint)
    expect(text()).not.toContain('Na zajęciach stacjonarnych używasz tego komputera?')
  })
})

describe('E8: lista pierwszego dnia po kreatorze', () => {
  it('po pierwszym komputerze: lista zamiast samego dymka, z drogami (Dziś, pasek, pojęcia, skróty) i zamknięciem', async () => {
    await mount(createElement('div', null, createElement(Wizard), createElement(Banners)))
    await click('wizard-next')
    await click('wizard-finish-defaults')
    await flush()
    expect(useFirstDay.getState().show).toBe(true)
    act(() => root?.unmount())
    host?.remove()
    await mount(createElement(Banners))
    const list = q('first-day')!
    expect(list).not.toBeNull()
    for (const id of ['first-day-today', 'first-day-bar', 'first-day-concepts', 'first-day-shortcuts']) expect(q(id), id).not.toBeNull()
    await click('first-day-concepts')
    expect(useHelp.getState().open).toBe('concepts')
    await click('first-day-bar')
    expect(useUi.getState().page).toBe('settings')
    expect(useUi.getState().pick).toEqual({ kind: 'setting', id: 'settings-bar' })
    await click('first-day-close')
    expect(q('first-day')).toBeNull()
  })

  it('kolejny komputer (dołącza do danych) listy nie dostaje', async () => {
    resetWizard()
    patchWizard({ folder: 'C:\\Dane', probe: probe({ hasData: true, exists: true, empty: false }), step: 1 })
    await mount()
    await click('wizard-finish-defaults')
    await flush()
    expect(finished.at(-1)).toMatchObject({ first: false })
    expect(useFirstDay.getState().show).toBe(false)
  })
})

describe('przegląd UX15, runda 1', () => {
  it('podsumowanie: koszty startowe – „wartości startowe”, po zmianie kosztu albo odpowiedzi kroku kosztów – „zmienione: N”', async () => {
    expect(changedCostCategories(DEFAULT_SETTINGS)).toBe(0)
    await set({ step: 13 })
    await mount()
    expect(q('wizard-line-costs')!.textContent).toContain('wartości startowe')
    await act(async () => patchSettings({ categories: { analiza: { costs: { head: 5 } } } }))
    expect(q('wizard-line-costs')!.textContent).toContain('Podkategorie: zmienione 1')
    expect(q('wizard-line-costs')!.textContent).not.toContain('wartości startowe')
    await act(async () => patchSettings({ categories: { posilek: { place: 'passive' } } }))
    expect(q('wizard-line-costs')!.textContent).toContain('Podkategorie: zmienione 2')
  })

  it('w trakcie zapisu „Dalej”, „Wstecz” i linki „Zmień” są wyłączone', async () => {
    await set({ step: 13 })
    await mount()
    await set({ busy: true })
    for (const id of ['wizard-back', 'wizard-goto-week', 'wizard-goto-computer', 'wizard-finish']) expect((q(id) as HTMLButtonElement).disabled, id).toBe(true)
    await set({ busy: false, step: 3 })
    await set({ busy: true })
    for (const id of ['wizard-back', 'wizard-next', 'wizard-finish-defaults']) expect((q(id) as HTMLButtonElement).disabled, id).toBe(true)
  })

  it('przełącznik modułu ma nazwę modułu (czytnik ekranu nie czyta samego „tak / nie”)', async () => {
    await set({ step: 11 })
    await mount()
    for (const [m, name] of [['game', 'Gra'], ['requests', 'Prośby'], ['energy', 'Energia i sygnały']] as const) expect(q(`wizard-module-${m}`)!.getAttribute('aria-label'), m).toBe(name)
  })

  it('w trakcie zapisu „Później” jest wyłączone, a treść kroku nieaktywna (inert)', async () => {
    await set({ step: 3 })
    await mount()
    expect((q('wizard-later') as HTMLButtonElement).disabled).toBe(false)
    expect(q('wizard-step-body')!.hasAttribute('inert')).toBe(false)
    await set({ busy: true })
    expect((q('wizard-later') as HTMLButtonElement).disabled).toBe(true)
    expect(q('wizard-step-body')!.hasAttribute('inert')).toBe(true)
  })

  it('moduły: te same słowa w kreatorze i w Ustawieniach – nazwa modułu i „tak / nie”', async () => {
    await set({ step: 11 })
    await mount()
    const toggle = q('wizard-module-game')!
    expect(toggle.closest('label')!.textContent).toBe('tak')
    expect(text()).toContain('Gra')
    expect(text()).not.toContain('włączony')
  })

  it('„Pierwszy dzień”: punkt o pytaniach o objawy tylko przy włączonym module energii', async () => {
    useFirstDay.setState({ show: true })
    await mount(createElement(Banners))
    expect(q('first-day-today')!.closest('li')!.textContent).toContain('pytania o objawy')
    act(() => root?.unmount())
    host?.remove()
    const rd = rdFrom({})
    useData.setState({ rd: { ...rd, general: { ...rd.general, modules: { ...rd.general.modules, energy: false } } } })
    await mount(createElement(Banners))
    const line = q('first-day-today')!.closest('li')!.textContent!
    expect(line).not.toContain('objawy')
    expect(line).toContain('granicę')
    const concepts = q('first-day-concepts')!.closest('li')!.textContent!
    expect(concepts).not.toMatch(/energii|rezerwa/)
    expect(concepts).toContain('twardy koniec')
  })
})
