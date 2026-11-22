// @vitest-environment jsdom
/**
 * Okno „Przelicz koszty ×N” (D566, D567): domyślnie ×2, wszystkie pule i cały zakres; podgląd pokazuje każdą zmianę „przed → po” (cztery
 * liczby G · E · B · C) z licznikiem, pozycje bez zmiany pominięte, przycięte do ±5 oznaczone; ×1 albo pula bez kosztów – „Nic się nie
 * zmienia.” i „Przelicz” nieaktywne; Esc i „Anuluj” zamykają bez zapisu; „Przelicz” – jeden zapis i linia „Przeliczono … · Cofnij”.
 * Dostęp: przycisk w „Kategoriach” i polecenie Ctrl K; wpis w indeksie Ustawień. Własny mnożnik (T2431): „Własny…” i pole – przecinek albo
 * kropka, liczba dodatnia; zła wartość – komunikat, bez podglądu, „Przelicz” nieaktywne.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, EditOutcome, RdApi } from '@shared/api'
import { rdFrom } from '@shared/model/rd'
import { CostScaleDialog, CUSTOM_FACTOR_HINT } from '@renderer/features/settings/CostScaleDialog'
import { choose } from '@renderer/features/search/paletteLogic'
import { COMMANDS } from '@renderer/features/search/records'
import { settingRecords } from '@renderer/features/settings/settingsIndex'
import { resetSettingsFrom } from '@renderer/features/settings/settingsStore'
import { handleEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const TODAY = '2026-11-21'
const c = (head: number, emotions: number, senses: number, body: number) => ({ head, emotions, senses, body })
/** rd.json: „analiza” 3·1·1·0 and „inne” 2·0·0·0 from the start, every other subcategory with no cost (so the preview lists only these). */
function rd(): Record<string, unknown> {
  const zero = Object.fromEntries(Object.keys(rdFrom(undefined).categories).map((id) => [id, { costs: c(0, 0, 0, 0), variants: [] }]))
  return { schema: 1, settings: [{ id: 's0', from: '2026-01-01', at: null, made: 1, patch: { categories: { ...zero, analiza: { costs: c(3, 1, 1, 0), variants: [] }, inne: { costs: c(2, 0, 0, 0), variants: [] } } } }] }
}
const sent: EditEntry[][] = []
const view = (): DataView => ({ status: 'open', today: TODAY, folder: 'C:\\Dane', rd: rd(), templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {}, allDay: [], attachments: [], attachmentsMissing: [], computers: [], questions: [], problems: [] }) as unknown as DataView

let root: Root | null = null
let host: HTMLElement | null = null
let closed = 0
const q = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const all = (testid: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => undefined)
}
const click = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await flush()
}
const pick = async (el: HTMLElement | null, value: string) => {
  const s = el as HTMLSelectElement
  await act(async () => {
    s.value = value
    s.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flush()
}

beforeEach(async () => {
  sent.length = 0
  closed = 0
  resetSettingsFrom()
  ;(window as unknown as { rd: Partial<RdApi> }).rd = {
    dataView: () => Promise.resolve(view()),
    dayDatesFrom: () => Promise.resolve([]),
    dayFiles: () => Promise.resolve({}),
    edit: (list: EditEntry[]): Promise<EditOutcome[]> => {
      sent.push(list)
      return Promise.resolve(list.map(() => ({ status: 'applied' as const })))
    }
  }
  useData.setState({ view: view(), rd: rdFrom(rd()), templates: [], routines: [], series: [], seriesPlans: [], requests: [] })
  useGroupLine.setState({ lines: {} })
  useUi.setState({ page: 'settings', pick: null, toasts: [] })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CostScaleDialog, { onClose: () => void closed++ })))
  await flush()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

describe('okno „Przelicz koszty ×N” (D566, D567)', () => {
  it('domyślnie ×2, wszystkie pule i zakres; podgląd – każda zmiana „przed → po”, licznik, przycięte oznaczone', () => {
    expect((q('cost-scale-factor') as HTMLSelectElement).value).toBe('2')
    expect(all('cost-scale-pools').flatMap((f) => [...f.querySelectorAll('input')]).every((i) => i.checked)).toBe(true)
    expect([...q('cost-scale-scope')!.querySelectorAll('input')].every((i) => i.checked)).toBe(true)
    expect(all('cost-scale-item').map((li) => li.dataset.key)).toEqual(['category:analiza', 'category:inne'])
    expect(all('cost-scale-change').map((x) => x.textContent)).toEqual(['3 · 1 · 1 · 0 → 5 · 2 · 2 · 0', '2 · 0 · 0 · 0 → 4 · 0 · 0 · 0'])
    expect(q('cost-scale-count')!.textContent).toBe('Zmieni się 2 koszty · przycięte do ±5: 1')
    expect(all('cost-scale-clipped').map((x) => x.textContent)).toEqual(['przycięte (G)'])
    expect((q('cost-scale-apply') as HTMLButtonElement).disabled).toBe(false)
    expect(q('cost-scale-dialog')!.textContent).toContain('od jutra')
  })

  it('×1 – nic się nie zmienia, „Przelicz” nieaktywne; tylko pula C (bez kosztów) – też', async () => {
    await pick(q('cost-scale-factor'), '1')
    expect(all('cost-scale-item')).toHaveLength(0)
    expect(q('cost-scale-count')!.textContent).toBe('Nic się nie zmienia.')
    expect((q('cost-scale-apply') as HTMLButtonElement).disabled).toBe(true)
    await pick(q('cost-scale-factor'), '1.5')
    for (const p of ['head', 'emotions', 'senses']) await click(q(`cost-scale-pool-${p}`))
    expect((q('cost-scale-apply') as HTMLButtonElement).disabled).toBe(true)
  })

  it('×1,5 i tylko G: 3 → 5 (4,5 → 5), 2 → 3; reszta pul bez zmian', async () => {
    await pick(q('cost-scale-factor'), '1.5')
    expect([...(q('cost-scale-factor') as HTMLSelectElement).options].map((o) => o.textContent)).toContain('×1,5')
    for (const p of ['emotions', 'senses', 'body']) await click(q(`cost-scale-pool-${p}`))
    expect(all('cost-scale-change').map((x) => x.textContent)).toEqual(['3 · 1 · 1 · 0 → 5 · 1 · 1 · 0', '2 · 0 · 0 · 0 → 3 · 0 · 0 · 0'])
  })

  it('„Anuluj” i Esc zamykają bez zapisu', async () => {
    await click(q('cost-scale-cancel'))
    // Esc of the window (the app's one listener – `installEscape` – calls it).
    await act(async () => void handleEscape())
    expect(closed).toBe(2)
    expect(sent).toEqual([])
  })

  it('„Przelicz” – jeden zapis (wpis ustawień od jutra), okno się zamyka, linia „Przeliczono 2 koszty ×2 · Cofnij”', async () => {
    await click(q('cost-scale-apply'))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel)).toEqual(['rd.json'])
    expect(closed).toBe(1)
    expect(useGroupLine.getState().lines.settings?.text).toBe('Przeliczono 2 koszty ×2')
  })
})

/** Types into an input as React hears it (the native setter, then `input`). */
const type = async (el: HTMLElement | null, text: string) => {
  const input = el as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await flush()
}
const custom = () => q('cost-scale-custom') as HTMLInputElement | null
const applyOff = () => (q('cost-scale-apply') as HTMLButtonElement).disabled

describe('własny mnożnik (T2431)', () => {
  it('„Własny…” na liście; pole zaczyna od mnożnika wybranego, z przecinkiem', async () => {
    expect(custom()).toBeNull()
    const options = [...(q('cost-scale-factor') as HTMLSelectElement).options]
    expect(options.at(-1)!.textContent).toBe('Własny…')
    await pick(q('cost-scale-factor'), '1.5')
    await pick(q('cost-scale-factor'), 'custom')
    expect((q('cost-scale-factor') as HTMLSelectElement).value).toBe('custom')
    expect(custom()!.value).toBe('1,5')
    expect(q('cost-scale-custom-error')).toBeNull()
  })

  it('„1,3” (przecinek → 1.3): podgląd z mnożnikiem 1,3 – 3 → 4, 2 → 3; „1.3” to samo', async () => {
    await pick(q('cost-scale-factor'), 'custom')
    await type(custom(), '1,3')
    expect(all('cost-scale-change').map((x) => x.textContent)).toEqual(['3 · 1 · 1 · 0 → 4 · 1 · 1 · 0', '2 · 0 · 0 · 0 → 3 · 0 · 0 · 0'])
    expect(q('cost-scale-count')!.textContent).toBe('Zmieni się 2 koszty')
    await type(custom(), '1.3')
    expect(all('cost-scale-change')).toHaveLength(2)
    expect(applyOff()).toBe(false)
  })

  it('zła wartość (pusta, 0, ujemna, litery, dwa przecinki): komunikat, bez podglądu, „Przelicz” nieaktywne – bez zapisu', async () => {
    await pick(q('cost-scale-factor'), 'custom')
    for (const bad of ['', '0', '-1', 'abc', '1,,3']) {
      await type(custom(), bad)
      expect(q('cost-scale-custom-error')!.textContent).toBe(CUSTOM_FACTOR_HINT)
      expect(custom()!.getAttribute('aria-invalid')).toBe('true')
      expect(all('cost-scale-item')).toHaveLength(0)
      expect(q('cost-scale-count')!.textContent).toBe('Podaj mnożnik, żeby zobaczyć podgląd.')
      expect(applyOff()).toBe(true)
    }
    await click(q('cost-scale-apply'))
    expect(sent).toEqual([])
    // Corrected: the preview is back.
    await type(custom(), '0,5')
    expect(q('cost-scale-custom-error')).toBeNull()
    expect(all('cost-scale-change').map((x) => x.textContent)).toEqual(['3 · 1 · 1 · 0 → 2 · 1 · 1 · 0', '2 · 0 · 0 · 0 → 1 · 0 · 0 · 0'])
  })

  it('podgląd innego mnożnika nie zostaje, póki nowy się liczy: „Liczę…”, „Przelicz” nieaktywne', async () => {
    expect(all('cost-scale-item')).toHaveLength(2)
    // The preview of the next factor never comes back.
    ;(window as unknown as { rd: Partial<RdApi> }).rd.dayDatesFrom = () => new Promise(() => undefined)
    await pick(q('cost-scale-factor'), 'custom')
    await type(custom(), '1,3')
    expect(all('cost-scale-item')).toHaveLength(0)
    expect(q('cost-scale-count')!.textContent).toBe('Liczę…')
    expect(applyOff()).toBe(true)
  })

  it('mnożnik większy od 3 (np. 6): wszystko przycięte do ±5', async () => {
    await pick(q('cost-scale-factor'), 'custom')
    await type(custom(), '6')
    expect(all('cost-scale-change').map((x) => x.textContent)).toEqual(['3 · 1 · 1 · 0 → 5 · 5 · 5 · 0', '2 · 0 · 0 · 0 → 5 · 0 · 0 · 0'])
    expect(q('cost-scale-count')!.textContent).toBe('Zmieni się 2 koszty · przycięte do ±5: 2')
  })

  it('powrót do mnożnika z listy chowa pole i liczy z niego', async () => {
    await pick(q('cost-scale-factor'), 'custom')
    await type(custom(), 'abc')
    await pick(q('cost-scale-factor'), '2')
    expect(custom()).toBeNull()
    expect(q('cost-scale-custom-error')).toBeNull()
    expect(q('cost-scale-count')!.textContent).toBe('Zmieni się 2 koszty · przycięte do ±5: 1')
  })

  it('„Przelicz” z własnym 1,3 – jeden zapis z kosztami ×1,3, linia „Przeliczono 2 koszty ×1,3”', async () => {
    await pick(q('cost-scale-factor'), 'custom')
    await type(custom(), ' 1,3 ')
    await click(q('cost-scale-apply'))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel)).toEqual(['rd.json'])
    expect(JSON.stringify(sent[0]![0])).toContain('"head":4')
    expect(closed).toBe(1)
    expect(useGroupLine.getState().lines.settings?.text).toBe('Przeliczono 2 koszty ×1,3')
  })
})

describe('dostęp (D566)', () => {
  it('Ctrl K: polecenie „Przelicz koszty ×N” otwiera Ustawienia z oknem; pole w indeksie Ustawień', () => {
    const cmd = COMMANDS.find((x) => x.id === 'costScale')!
    expect(cmd.title).toBe('Przelicz koszty ×N')
    useUi.setState({ page: 'today', pick: null })
    choose(cmd, TODAY)
    expect(useUi.getState().page).toBe('settings')
    expect(useUi.getState().pick).toMatchObject({ kind: 'command', id: 'costScale' })
    expect(settingRecords().some((r) => r.id === 'field-cost-scale' && r.title === 'Przelicz koszty ×N')).toBe(true)
  })
})

