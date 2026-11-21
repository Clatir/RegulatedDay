// @vitest-environment jsdom
/**
 * Historia i dymki (UX18, D565 P26): E7 – przycisk „Historia” przy panelu bloku, sprawie, szablonie i rutynie prowadzi do historii tego rekordu;
 * lista Historii ma filtr rodzajów z licznikami, szukanie i licznik „x z y” (`FilterBar`). F7 cz. 2 – dymek błędu zostaje do zamknięcia „×”
 * (`role="alert"`), identyczny się nie dubluje; inne dymki znikają same i mają `role="status"`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryRecord, RdApi } from '@shared/api'
import { DEFAULT_MACHINE_PREFS } from '@shared/machine'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { caseRowMenu, type RowMenuActs } from '@renderer/features/cases/rowMenu'
import { caseItems } from '@shared/engine/cases'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import type { MenuItem } from '@renderer/components/ContextMenu'
import { Toasts } from '@renderer/components/Toasts'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { HistoryPage } from '@renderer/features/history/HistoryPage'
import { installEscape } from '@renderer/lib/escape'
import { useOutsidePointer } from '@renderer/lib/outside'
import { useData } from '@renderer/store/data'
import { useMachine } from '@renderer/store/machine'
import { closeToast, openHistoryOf, refusalToast, toast, undoToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
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
const q = (id: string, el: ParentNode = document) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const qa = (id: string, el: ParentNode = document) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
const click = (el: Element | null) => {
  expect(el).not.toBeNull()
  return act(async () => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
}
const type = (el: HTMLInputElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  useUi.setState({ page: 'today', day: null, pick: null, from: null })
  useMachine.setState({ prefs: DEFAULT_MACHINE_PREFS })
  useData.setState({ view: null, templates: [], routines: [], requests: [] })
  delete (window as unknown as { rd?: unknown }).rd
  vi.useRealTimers()
})

describe('dymki błędów (F7 cz. 2, P26)', () => {
  it('błąd zostaje, dopóki go nie zamkniesz – także z podanym czasem; zwykły dymek znika po swoim czasie', () => {
    vi.useFakeTimers()
    toast('Nie zapisano: coś poszło nie tak', 'error')
    toast('Błąd z czasem', 'error', 6000)
    toast('Zapisano', 'success')
    vi.advanceTimersByTime(60_000)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Nie zapisano: coś poszło nie tak', 'Błąd z czasem'])
  })

  it('identyczny błąd się nie dubluje', () => {
    toast('Nie zapisano', 'error')
    toast('Nie zapisano', 'error')
    expect(useUi.getState().toasts).toHaveLength(1)
  })

  it('błąd z akcją („Cofnij”) zachowuje swój czas – okno cofnięcia nie znika, błąd go nie przedłuża', () => {
    vi.useFakeTimers()
    toast('Nie cofnięto', 'error', 10_000, { label: 'Spróbuj', run: () => undefined })
    vi.advanceTimersByTime(9_999)
    expect(useUi.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useUi.getState().toasts).toHaveLength(0)
  })

  it('odmowa pola (refusalToast) – błąd z dawnym czasem: znika po nim, nie czeka na „×”', () => {
    vi.useFakeTimers()
    refusalToast('To pole nie może być puste.', 6000)
    expect(useUi.getState().toasts[0]!.kind).toBe('error')
    vi.advanceTimersByTime(5_999)
    expect(useUi.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useUi.getState().toasts).toHaveLength(0)
    // The same words as an error that stays: that one is not made to go by a refusal.
    toast('Tak samo', 'error')
    refusalToast('Tak samo', 6000)
    vi.advanceTimersByTime(60_000)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Tak samo'])
  })

  it('limit stosu dotyczy tylko zwykłych dymków bez akcji – błąd, który stoi, i „Cofnij” nie odpadają nigdy (stos bywa wtedy dłuższy)', () => {
    toast('Błąd A', 'error')
    toast('Jeden', 'info')
    toast('Dwa', 'info')
    toast('Trzy', 'info')
    toast('Cztery', 'info')
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Błąd A', 'Dwa', 'Trzy', 'Cztery'])
    undoToast('Usunięto', () => undefined)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Błąd A', 'Trzy', 'Cztery', 'Usunięto'])
    // Three errors that stay and the undo: a new ordinary message is added, nothing of them goes.
    for (const t of useUi.getState().toasts) closeToast(t.id)
    for (const n of ['E1', 'E2', 'E3']) toast(n, 'error')
    undoToast('Usunięto', () => undefined)
    toast('Zapisano', 'success')
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['E1', 'E2', 'E3', 'Usunięto', 'Zapisano'])
    // The next ordinary one takes the place of the ordinary one standing.
    toast('Nowy', 'info')
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['E1', 'E2', 'E3', 'Usunięto', 'Nowy'])
    // Errors only: none is dropped either.
    for (const t of useUi.getState().toasts) closeToast(t.id)
    for (const n of ['E1', 'E2', 'E3', 'E4', 'E5']) toast(n, 'error')
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5'])
  })

  it('błąd ma role="alert" i „×”; „×” go zamyka; zwykły dymek ma role="status" i nie ma „×”', async () => {
    toast('Nie zapisano', 'error')
    toast('Zapisano', 'success')
    await mount(createElement(Toasts))
    const alert = host!.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('Nie zapisano')
    const close = q('toast-close', alert)!
    expect(close.getAttribute('aria-label')).toBe('Zamknij komunikat')
    expect(close.textContent).toBe('×')
    const status = host!.querySelector('[role="status"]')!
    expect(status.textContent).toContain('Zapisano')
    expect(q('toast-close', status)).toBeNull()
    await click(close)
    expect(host!.querySelector('[role="alert"]')).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Zapisano'])
  })
})

describe('dymki a „klik obok” (F7 cz. 2)', () => {
  it('klik w dymek (też „×” błędu) nie jest „klikiem obok” – nie zamyka szkicu bloku; kontener dymków jest oznaczony data-toast', async () => {
    const left = vi.fn()
    const Probe = () => (useOutsidePointer(true, 'nothing', left), null)
    await mount(createElement(Probe))
    toast('Nie zapisano', 'error')
    const toasts = document.createElement('div')
    document.body.append(toasts)
    const root2 = createRoot(toasts)
    await act(async () => root2.render(createElement(Toasts)))
    const close = q('toast-close')!
    expect(close.closest('[data-toast]')).not.toBeNull()
    act(() => void close.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(left).not.toHaveBeenCalled()
    const plain = document.createElement('div')
    document.body.append(plain)
    act(() => void plain.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(left).toHaveBeenCalledTimes(1)
    plain.remove()
    act(() => root2.unmount())
    toasts.remove()
  })
})

const day = (id: string, last: number): HistoryRecord => ({ kind: 'day', id, rel: `days/2026/${id}.json`, versions: 2, last, exists: true })
const records: HistoryRecord[] = [
  day('2026-11-12', Date.UTC(2026, 10, 12)),
  day('2026-11-13', Date.UTC(2026, 10, 13)),
  { kind: 'settings', id: 'rd', rel: 'rd.json', versions: 1, last: Date.UTC(2026, 10, 12), exists: true },
  { kind: 'routine', id: 'r1', rel: 'routines/r1.json', versions: 3, last: Date.UTC(2026, 10, 14), exists: true },
  { kind: 'template', id: 't1', rel: 'templates/t1.json', versions: 1, last: Date.UTC(2026, 10, 10), exists: true },
  // A kind the list has no name for (a folder of the app's, not a record): neither shown nor counted.
  { kind: 'presence', id: 'p1', rel: '.presence/p1.json', versions: 1, last: 1, exists: true }
]

describe('Historia: filtr z licznikami, szukanie, „x z y” (E7)', () => {
  beforeEach(() => {
    const api: Partial<RdApi> = {
      historyList: () => Promise.resolve(records),
      historyVersions: () => Promise.resolve([]),
      dayFiles: () => Promise.resolve({}),
      setPrefs: (p) => Promise.resolve({ ...useMachine.getState().prefs, ...p })
    }
    ;(window as unknown as { rd: Partial<RdApi> }).rd = api
    useData.setState({ view: { status: 'open' } as never, routines: [{ id: 'r1', name: 'Poranek' }] as never, templates: [{ id: 't1', name: 'Dzień roboczy' }] as never })
  })
  const open = async () => {
    await mount(createElement(HistoryPage))
    await act(async () => undefined)
  }
  const names = () => qa('history-record').map((b) => b.textContent ?? '')

  it('filtr rodzajów: każdy ma liczbę rekordów, razem „5 z 5”', async () => {
    await open()
    const bar = q('filters-history')!
    expect(bar).not.toBeNull()
    expect(q('filter-day', bar)!.textContent).toBe('Plany dni2')
    expect(q('filter-settings', bar)!.textContent).toBe('Ustawienia1')
    expect(q('filter-routine', bar)!.textContent).toBe('Rutyny1')
    expect(q('count-history')!.textContent).toBe('5 z 5')
    expect(names()).toHaveLength(5)
  })

  it('wybrany rodzaj zawęża listę i licznik; „Wyczyść filtry” przywraca wszystko', async () => {
    await open()
    await click(q('filter-day'))
    expect(names()).toHaveLength(2)
    expect(names().every((n) => n.includes('Plan dnia'))).toBe(true)
    expect(q('count-history')!.textContent).toBe('2 z 5')
    await click(q('filters-clear'))
    expect(names()).toHaveLength(5)
    expect(q('count-history')!.textContent).toBe('5 z 5')
  })

  it('szukanie po nazwie rekordu (bez polskich znaków i wielkości liter); liczby rodzajów idą za szukaniem', async () => {
    await open()
    await type(q('history-search') as HTMLInputElement, 'DZIEN rob')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Dzień roboczy')
    expect(q('count-history')!.textContent).toBe('1 z 5')
    expect(q('filter-template')!.textContent).toBe('Szablony1')
    expect(q('filter-day')!.textContent).toBe('Plany dni0')
    await type(q('history-search') as HTMLInputElement, '12.11')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Plan dnia 12.11.2026')
    // A day by its ISO date too.
    await type(q('history-search') as HTMLInputElement, '2026-11-13')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Plan dnia 13.11.2026')
  })

  it('szukanie po słowach: każde musi pasować, w dowolnej kolejności; nazwy rodzajów nie są szukane', async () => {
    await open()
    await type(q('history-search') as HTMLInputElement, 'roboczy dzien')
    expect(names()).toHaveLength(1)
    await type(q('history-search') as HTMLInputElement, 'dzien poranek')
    expect(names()).toHaveLength(0)
    await type(q('history-search') as HTMLInputElement, 'szablony')
    expect(names()).toHaveLength(0)
  })

  it('nic nie pasuje – jedno zdanie zamiast pustej listy', async () => {
    await open()
    await type(q('history-search') as HTMLInputElement, 'qqqq')
    expect(names()).toHaveLength(0)
    expect(q('history-none')!.textContent).toContain('Nic nie pasuje')
    expect(q('count-history')!.textContent).toBe('0 z 5')
  })

  it('odczyt historii zawiódł: nie „pusta” ani „nie ma wersji” – dymek błędu i to zdanie na ekranie; wybór rekordu nie czeka', async () => {
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { historyList: () => Promise.reject(new Error('EBUSY')) }
    useUi.setState({ page: 'history', pick: { kind: 'history', id: 'routine/r1' } })
    await open()
    const said = 'Nie udało się odczytać historii – spróbuj za chwilę.'
    expect(host!.textContent).toContain(said)
    expect(host!.textContent).not.toContain('Historia jest pusta')
    expect(useUi.getState().toasts.map((t) => [t.kind, t.text])).toEqual([['error', said]])
    expect(useUi.getState().pick).toBeNull()
  })

  it('rekord wybrany z innego miejsca („Historia” przy rekordzie) nie zostaje pod filtrem ani szukaniem', async () => {
    useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, filters: { history: ['settings'] } } })
    useUi.setState({ page: 'history', pick: { kind: 'history', id: 'routine/r1' } })
    await open()
    expect(q('history-versions')).not.toBeNull()
    expect(names().some((n) => n.includes('Poranek'))).toBe(true)
    expect(q('filters-clear')).toBeNull()
    expect(q('count-history')!.textContent).toBe('5 z 5')
  })
})

describe('„Historia” w panelu bloku (E7)', () => {
  const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
  const analiza = planBlock({ id: 'b1', categoryId: 'analiza', startMin: 9 * 60, durationMin: 45, origin: 'user' })
  const panel = async (o: Partial<Parameters<typeof BlockEditor>[0]> = {}) => {
    ;(window as unknown as { rd: unknown }).rd = { pathForFile: () => '' }
    await mount(createElement(BlockEditor, { block: analiza, plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, ...o }))
    await act(async () => undefined)
    return q('block-editor')!
  }
  const again = () => {
    act(() => root!.unmount())
    host!.remove()
  }

  it('blok dnia (place): jedno kliknięcie – historia planu tego dnia', async () => {
    const p = await panel({ place: { scope: 'day', date: '2026-11-12', templateId: null }, day: '2026-11-12' })
    const b = q('history-open', p) as HTMLButtonElement
    expect(b.textContent).toBe('Historia')
    expect(b.disabled).toBe(false)
    await click(b)
    expect(useUi.getState().page).toBe('history')
    expect(useUi.getState().pick).toEqual({ kind: 'history', id: 'day/2026-11-12' })
  })

  it('panel dnia bez place, z samym dniem – to samo', async () => {
    const p = await panel({ day: '2026-11-13' })
    await click(q('history-open', p))
    expect(useUi.getState().pick).toEqual({ kind: 'history', id: 'day/2026-11-13' })
  })

  it('seria podzielona: historia części, którą edytujesz (historyOf), nie części z korzenia; bez historyOf – seria nie zgaduje', async () => {
    let p = await panel({ place: { scope: 'series', root: 's1' }, inSeries: true, historyOf: 'series/s2.json' })
    await click(q('history-open', p))
    expect(useUi.getState().pick).toEqual({ kind: 'history', id: 'series/s2' })
    again()
    p = await panel({ place: { scope: 'series', root: 's1' }, inSeries: true })
    expect(q('history-open', p)).toBeNull()
  })

  it('blok w edytorze szablonu – bez drugiego „Historia” (jest w nagłówku edytora szablonu)', async () => {
    expect(q('history-open', await panel({ place: { scope: 'template', templateId: 't1' } }))).toBeNull()
  })

  it('nowy blok jeszcze niezapisany i panel bez miejsca – bez „Historia”', async () => {
    const p = await panel({ day: '2026-11-12', newBlock: { add: () => undefined } })
    expect(q('history-open', p)).toBeNull()
    again()
    expect(q('history-open', await panel())).toBeNull()
  })
})

describe('rekord bez wersji: przycisk i menu „…” prowadzą do Historii z dymkiem (E7)', () => {
  const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
  beforeEach(() => {
    ;(window as unknown as { rd: Partial<RdApi> & { pathForFile: () => string } }).rd = { pathForFile: () => '', historyList: () => Promise.resolve([]), historyVersions: () => Promise.resolve([]), dayFiles: () => Promise.resolve({}), setPrefs: (p) => Promise.resolve({ ...useMachine.getState().prefs, ...p }) }
    useData.setState({ view: { status: 'open' } as never })
  })
  const history = async () => {
    act(() => root?.unmount())
    host?.remove()
    await mount(createElement(HistoryPage))
    await act(async () => undefined)
  }
  const said = 'Ten rekord nie ma jeszcze wersji w historii.'

  it('przycisk w panelu bloku: strona history, wybór zużyty, dymek', async () => {
    await mount(createElement(BlockEditor, { block: planBlock({ id: 'b1', categoryId: 'analiza', startMin: 540, durationMin: 45, origin: 'user' }), plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, day: '2026-11-14' }))
    await click(q('history-open'))
    expect(useUi.getState().page).toBe('history')
    expect(useUi.getState().pick).toEqual({ kind: 'history', id: 'day/2026-11-14' })
    await history()
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([said])
  })

  it('pozycja „Historia” w menu „…” sprawy (to samo wejście)', async () => {
    openHistoryOf('requests/zzz.json')
    expect(useUi.getState().page).toBe('history')
    await history()
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([said])
  })
})

describe('„Historia” w menu „…” sprawy (E7)', () => {
  const acts: RowMenuActs = { list: () => undefined, priority: () => undefined, done: () => undefined, dates: () => undefined, steps: () => undefined, repeat: () => undefined, remove: () => undefined, history: vi.fn() }
  const today = logicalDayOf(Date.now())
  const item = (over: object = {}) => caseItems([requestFrom({ ...newTask('a', Date.now(), today, { title: 'zadanie', estimateMin: 30 })!, ...over })!], today, () => undefined)[0]!

  it('zadanie, prośba i zrobiona sprawa mają „Historia” przed „Usuń”; wybór woła akcję', () => {
    for (const x of [item(), item({ state: 'done', list: 'done', doneAt: Date.now() })]) {
      const labels = caseRowMenu(x, acts).flatMap((e) => (e.kind === 'separator' ? [] : [e.label]))
      expect(labels.at(-2)).toBe('Historia')
      expect(labels.at(-1)).toBe('Usuń')
    }
    const e = caseRowMenu(item(), acts).find((m): m is MenuItem => m.kind !== 'separator' && m.kind !== 'field' && m.label === 'Historia')
    expect(e?.testId).toBe('case-menu-history')
    e?.onPick?.()
    expect(acts.history).toHaveBeenCalledTimes(1)
  })
})
