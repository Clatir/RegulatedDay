// @vitest-environment jsdom
/**
 * „Wycofaj” zaplanowanej zmiany na stronie Ustawień (UX14, E2): przycisk w wierszu „Zaplanowane zmiany” wysyła jeden zapis (pole listy
 * `settings.#id` z bazą = zmiana), wiersz znika, dymek mówi wynik z „Cofnij” (odwrotna edycja – zmiana wraca); data, która nadeszła w
 * tym czasie, zmiana wycofana na innym komputerze, nieczytelne ustawienia – nic nie wysłane i dymek to mówi; spotkanie ze zmianą z
 * innego komputera – pytanie (bez „Wycofano”); zmiana warstwy sesji (przeniesienie do szablonów) – bez przycisku.
 * Prawdziwa droga zapisu okna (`trySaveWith` → `window.rd.edit` → `dataView`); atrapa procesu głównego kładzie pola jak `editQueue`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, EditOutcome, RawRecord, RdApi } from '@shared/api'
import { deepEqual, setAt, valueAt } from '@shared/data/merge'
import { DEFAULT_MACHINE_PREFS } from '@shared/machine'
import { rdFrom } from '@shared/model/rd'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import type { SettingsChange } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { SettingsPage } from '@renderer/features/settings/SettingsPage'
import { reloadData, useData } from '@renderer/store/data'
import { useMachine } from '@renderer/store/machine'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const TODAY = '2026-11-21'
const ch = (id: string, from: string, patch: Record<string, unknown>): SettingsChange => ({ id, from, at: null, made: 1, patch })
const Z = ch('z1', '2026-11-25', { reserve: 20 })
const A = ch('a', '2026-11-01', { reserve: 12 })

/** The main process: rd.json in the folder, the edits laid field by field as the queue lays them (a base not as the file – a question). */
const main = { file: null as RawRecord | null, sent: [] as EditEntry[], today: TODAY, answer: 'queue' as 'queue' | 'lost' }
const viewOf = (): DataView =>
  ({ status: 'open', folder: 'C:\\Dane', error: null, computer: 'c1', computerName: 'PC', rd: main.file, today: main.today, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {}, allDay: [], attachments: [], attachmentsMissing: [], computers: [], unsynced: 0 }) as unknown as DataView
function edit(list: EditEntry[]): Promise<EditOutcome[]> {
  main.sent.push(...list)
  if (main.answer === 'lost') return Promise.reject(new Error('przerwane'))
  return Promise.resolve(
    list.map((e) => {
      let value: unknown = main.file ?? {}
      const conflict = e.edits.some((f) => {
        const now = valueAt(value, f.path)
        if (deepEqual(now, f.value)) return false
        if (!deepEqual(now, f.base)) return true
        value = setAt(value, f.path, f.value)
        return false
      })
      if (conflict) return { status: 'conflict' as const }
      main.file = value as RawRecord
      return { status: 'applied' as const }
    })
  )
}

let root: Root | null = null
let host: HTMLElement | null = null
const q = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const click = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  // The save, the view read again, the toast.
  for (let i = 0; i < 5; i++) await act(async () => undefined)
}
const toasts = () => useUi.getState().toasts
const lastToast = () => toasts().at(-1)

async function mount(file: RawRecord | null) {
  main.file = file
  await reloadData(true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(SettingsPage)))
  await act(async () => undefined)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(placeLogical(TODAY, 10 * 60))
  main.sent = []
  main.today = TODAY
  main.answer = 'queue'
  for (const t of toasts()) closeToast(t.id)
  useUi.setState({ page: 'settings', day: null, focus: null, pick: null, toasts: [] })
  useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: true }, loaded: true })
  const api = new Proxy(
    {
      appInfo: () => Promise.resolve({ version: '1.34.0', electron: '44', identity: 'test', name: 'RD', userData: 'C:\\x', computerId: 'c1', helper: { state: 'running' }, platform: 'win32', nightInstall: true }),
      autostart: () => Promise.resolve({ supported: false, willStart: false, disabledInTaskManager: false }),
      onUpdate: () => () => undefined,
      onQuickShortcut: () => () => undefined,
      barScreens: () => Promise.resolve({ displays: [] }),
      backups: () => Promise.resolve([]),
      computerList: () => Promise.resolve([]),
      dataView: () => Promise.resolve(viewOf()),
      edit
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (() => Promise.resolve(null)) }
  )
  ;(window as unknown as { rd: Partial<RdApi> }).rd = api as never
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  vi.useRealTimers()
})

describe('„Wycofaj” zaplanowanej zmiany', () => {
  it('jeden zapis pola `settings.#id`; wiersz znika, od jej daty obowiązuje to, co przed nią; dymek z „Cofnij” przywraca zmianę', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    const button = q('settings-planned-z1')!.querySelector('button')
    expect(button?.textContent).toBe('Wycofaj')
    await click(button)
    expect(main.sent).toEqual([{ rel: 'rd.json', edits: [{ path: ['settings', '#z1'], base: Z, value: undefined }] }])
    expect(rdFrom(main.file).settings.map((c) => c.id)).toEqual(['a'])
    expect(q('settings-planned-z1')).toBeNull()
    expect(lastToast()?.text).toBe('Wycofano zaplanowaną zmianę od 25.11.2026.')
    expect(lastToast()?.action?.label).toBe('Cofnij')

    await act(async () => lastToast()!.action!.run())
    for (let i = 0; i < 5; i++) await act(async () => undefined)
    expect(main.sent.at(-1)).toEqual({ rel: 'rd.json', edits: [{ path: ['settings', '#z1'], base: undefined, value: Z }] })
    expect(rdFrom(main.file).settings.find((c) => c.id === 'z1')).toEqual(Z)
    expect(q('settings-planned-z1')).not.toBeNull()
  })

  it('podwójne kliknięcie wysyła jeden zapis', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    const button = q('settings-planned-z1')!.querySelector('button')!
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    for (let i = 0; i < 5; i++) await act(async () => undefined)
    expect(main.sent).toHaveLength(1)
  })

  it('data zmiany nadeszła, zanim okno przeczytało nowy dzień: nic nie wysłane, dymek mówi, że obowiązuje', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    vi.setSystemTime(placeLogical('2026-11-25', 5 * 60))
    await click(q('settings-planned-z1')!.querySelector('button'))
    expect(main.sent).toEqual([])
    expect(lastToast()?.text).toBe('Tej zmiany nie da się już wycofać – obowiązuje od 25.11.2026. Zmień ustawienie od jutra.')
  })

  it('zmiana wycofana w tym czasie na innym komputerze: nic nie wysłane, dymek to mówi', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    // The window's view has it no more (rd.json from the other computer read), the list not drawn again yet.
    useData.setState((s) => ({ view: { ...s.view!, rd: { schema: 1, settings: [A] } } }))
    await click(q('settings-planned-z1')!.querySelector('button'))
    expect(main.sent).toEqual([])
    expect(lastToast()?.text).toBe('Tej zmiany już nie ma – wycofano ją wcześniej, może na innym komputerze.')
  })

  it('ustawień nie da się odczytać: nic nie wysłane, dymek błędu', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    useData.setState((s) => ({ view: { ...s.view!, rd: null } }))
    await click(q('settings-planned-z1')!.querySelector('button'))
    expect(main.sent).toEqual([])
    expect(lastToast()).toMatchObject({ kind: 'error', text: 'Ustawień nie da się teraz odczytać – zmiana nie została wycofana. Spróbuj za chwilę.' })
  })

  it('zmiana zmieniona w tym czasie na innym komputerze: pytanie u góry okna, bez „Wycofano”', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    main.file = { schema: 1, settings: [A, { ...Z, patch: { reserve: 18 } }] }
    await click(q('settings-planned-z1')!.querySelector('button'))
    expect(main.sent).toHaveLength(1)
    expect(toasts().map((t) => t.text)).toEqual(['Ta zmiana spotkała się ze zmianą z innego komputera – odpowiedz na pytanie u góry okna.'])
  })

  it('zapis przerwany po wysłaniu: bez „Wycofano” (dymek mówi „Nie zapisano”)', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    main.answer = 'lost'
    await click(q('settings-planned-z1')!.querySelector('button'))
    expect(toasts().map((t) => t.text)).toEqual(['Nie zapisano: przerwane'])
  })

  it('„Cofnij” po nadejściu daty zmiany: nic nie wysłane, dymek to mówi', async () => {
    await mount({ schema: 1, settings: [A, Z] })
    await click(q('settings-planned-z1')!.querySelector('button'))
    const undo = lastToast()!.action!
    vi.setSystemTime(placeLogical('2026-11-25', 5 * 60))
    await act(async () => undo.run())
    for (let i = 0; i < 5; i++) await act(async () => undefined)
    expect(main.sent).toHaveLength(1)
    expect(lastToast()?.text).toBe('Nie cofnięto – data zmiany (25.11.2026) już nadeszła. Ustaw ją jeszcze raz od jutra.')
  })

  it('późniejsza zmiana tej samej listy (typy dni tygodnia), zrobiona po niej: nic nie wysłane, dymek każe wycofać najpierw ją', async () => {
    const week = (sat: string) => ['zwykly', 'zwykly', 'zwykly', 'zwykly', 'zwykly', sat, 'weekend']
    const a = { ...ch('w1', '2026-11-25', { weekTypes: week('wolne') }), made: 1 }
    const b = { ...ch('w2', '2026-11-30', { weekTypes: ['wolne', ...week('wolne').slice(1)] }), made: 2 }
    await mount({ schema: 1, settings: [A, a, b] })
    await click(q('settings-withdraw-w1'))
    expect(main.sent).toEqual([])
    expect(lastToast()?.text).toBe('Późniejsza zmiana od 30.11.2026 zawiera tę wartość – wycofaj najpierw ją.')
    expect(lastToast()?.action).toBeUndefined()
    // The later one first – then the earlier one goes.
    await click(q('settings-withdraw-w2'))
    await click(q('settings-withdraw-w1'))
    expect(rdFrom(main.file).settings.map((c) => c.id)).toEqual(['a'])
  })

  it('zmiana, która dodaje podkategorię: nic nie wysłane, dymek odsyła do „Kategorii” z nazwą podkategorii', async () => {
    const add = ch('n1', '2026-11-25', { categories: { nowa: { cls: 'work', kind: 'other', place: 'computer', costs: { head: 1, emotions: 1, senses: 1, body: 0 } } } })
    await mount({ schema: 1, categories: { nowa: { name: 'Korekty', color: null, archived: false } }, settings: [A, add] })
    await click(q('settings-withdraw-n1'))
    expect(main.sent).toEqual([])
    expect(lastToast()?.text).toBe('Ta zmiana dodaje podkategorię „Korekty” – usuń podkategorię w „Kategoriach”.')
  })

  it('zmiana warstwy sesji (przeniesienie do szablonów): w wierszu bez „Wycofaj”, z wyjaśnieniem', async () => {
    await mount({ schema: 1, settings: [A, ch(`${SESSIONS_CHANGE_ID}-2026-11-28`, '2026-11-28', { sessions: [] }), Z] })
    const row = q(`settings-planned-${SESSIONS_CHANGE_ID}-2026-11-28`)!
    expect(row.querySelector('button')).toBeNull()
    expect(row.textContent).toContain('sesje są w szablonach')
    expect(q('settings-planned-z1')!.querySelector('button')).not.toBeNull()
  })
})
