// @vitest-environment jsdom
/**
 * „Ostatnio usunięte” in „Historia” (N24): the filter „Usunięte · 30 dni” lists what was removed (blocks, sprawy …) by name,
 * grouped by kind, each with „Przywróć” – a block back at its hours on its day's file, a record made again – and „Cofnij”
 * after it; a block of a frozen day has „Przywróć” off with why. The history empty, the filter is there all the same.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditEntry, HistoryRecord, RdApi, RemovedItem, RemovedList } from '@shared/api'
import { DEFAULT_MACHINE_PREFS } from '@shared/machine'
import { HistoryPage } from '@renderer/features/history/HistoryPage'
import { REMOVED_FAILED_TEXT, REMOVED_REREAD_MS } from '@renderer/features/history/RemovedList'
import { ALREADY_BACK_TEXT, useRemovedChanges } from '@renderer/features/history/removedActions'
import { ANCHOR_GONE_TEXT, ATTACHMENTS_UNKNOWN_TEXT, FROZEN_TEXT } from '@renderer/features/history/removedText'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useMachine } from '@renderer/store/machine'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
})

let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string, el: ParentNode = document) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const qa = (id: string, el: ParentNode = document) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
const click = (el: Element | null) => {
  expect(el).not.toBeNull()
  return act(async () => void el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

const DATE = '2026-10-22'
const DAY_REL = `days/2026/${DATE}.json`
const AT = Date.UTC(2026, 9, 21, 8, 5)
const analiza = { id: 'b', categoryId: 'analiza', startMin: 630, durationMin: 60, fixed: false, note: 'telefon' }
const block = (o: Partial<RemovedItem> = {}): RemovedItem => ({ kind: 'block', id: 'b', rel: DAY_REL, date: DATE, removedAt: AT, value: analiza, cancelled: false, frozen: false, anchorGone: false, attachmentsUnknown: false, startMin: null, attachments: null, ...o })
const task = { schema: 1, id: 't1', kind: 'task', title: 'Raport', estimateMin: 30, categoryId: 'inne', list: 'inbox', state: 'queued', createdAt: 1 }
const request: RemovedItem = { kind: 'request', id: 't1', rel: 'requests/t1.json', date: null, removedAt: AT - 60_000, value: task, cancelled: false, frozen: false, anchorGone: false, attachmentsUnknown: false, startMin: null, attachments: null }

let removed: RemovedList
let records: HistoryRecord[]
let sent: EditEntry[][]
let dayFile: Record<string, unknown>

beforeEach(() => {
  removed = { items: [block(), request], complete: true }
  records = []
  sent = []
  dayFile = { schema: 1, date: DATE, blocks: [{ id: 'a', categoryId: 'analiza', startMin: 630, durationMin: 30, fixed: false }] }
  const api: Partial<RdApi> = {
    historyList: () => Promise.resolve(records),
    historyVersions: () => Promise.resolve([]),
    historyRemoved: () => Promise.resolve(removed),
    dayFiles: (dates) => Promise.resolve(Object.fromEntries(dates.map((d) => [d, d === DATE ? dayFile : null]))),
    edit: (list) => (sent.push(list), Promise.resolve(list.map(() => ({ status: 'applied' as const })))) as never,
    dataView: () => Promise.reject(new Error('not in this test')),
    setPrefs: (p) => Promise.resolve({ ...useMachine.getState().prefs, ...p })
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = api
  useData.setState({ view: { status: 'open', today: '2026-10-21', requests: [], templates: [], routines: [], lectures: [], series: [], allDay: [] } as never })
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

async function open(): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(HistoryPage)))
  await settle()
  return host
}

async function openRemoved(): Promise<HTMLElement> {
  const h = await open()
  await click(q('history-removed-toggle'))
  await settle()
  return h
}

const rows = () => qa('removed-row')
const rowOf = (text: string) => rows().find((r) => r.textContent?.includes(text)) ?? null

describe('Historia → „Usunięte · 30 dni” (N24)', () => {
  it('pusta historia: zdanie i przycisk „Usunięte · 30 dni”; lista – grupy rodzajów, nazwy bez id, dzień i godziny bloku, chwila usunięcia', async () => {
    const h = await open()
    expect(h.textContent).toContain('Historia jest pusta')
    await openRemovedFrom(h)
    const groups = qa('removed-group-name').map((g) => g.textContent)
    expect(groups).toEqual(['Bloki', 'Sprawy'])
    const b = rowOf('Analiza')!
    expect(b).not.toBeNull()
    expect(b.textContent).toContain('22.10.2026 · 10:30–11:30')
    expect(b.textContent).toContain('usunięto 21.10.2026 10:05')
    expect(rowOf('Zadanie: Raport')).not.toBeNull()
    // Never an id.
    expect(rows().map((r) => r.textContent).join(' ')).not.toMatch(/\bt1\b|requests\//)
  })

  it('„Przywróć” bloku: plik dnia dostaje dokładnie ten blok na jego godziny (nic nie przesunięte); „Cofnij” wyjmuje go znowu', async () => {
    await openRemoved()
    await click(q('removed-restore', rowOf('Analiza')!))
    await settle()
    expect(sent).toHaveLength(1)
    const [entry] = sent[0]!
    expect(entry!.rel).toBe(DAY_REL)
    // Only the block comes in: the one at 10:30 keeps its hour.
    const values = JSON.stringify(entry!.edits.map((e) => e.value))
    expect(values).toContain('"id":"b"')
    expect(values).toContain('"startMin":630')
    expect(values).toContain('"note":"telefon"')
    expect(values).not.toContain('"id":"a"')
    const toast = useUi.getState().toasts.find((t) => t.text === 'Przywrócono: Analiza')
    expect(toast?.action?.label).toBe('Cofnij')
    // „Cofnij” stands on the file as the restore left it.
    dayFile = { ...dayFile, blocks: [...(dayFile.blocks as unknown[]), analiza] }
    await act(async () => toast!.action!.run())
    await settle()
    expect(sent).toHaveLength(2)
    const back = JSON.stringify(sent[1]![0]!.edits)
    expect(sent[1]![0]!.rel).toBe(DAY_REL)
    expect(back).toContain('"id":"b"')
  })

  it('„Przywróć” sprawy: rekord powstaje taki, jak przed usunięciem; „Cofnij” usuwa go znowu', async () => {
    await openRemoved()
    await click(q('removed-restore', rowOf('Zadanie: Raport')!))
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]![0]).toMatchObject({ rel: 'requests/t1.json', create: true })
    expect(JSON.stringify(sent[0]![0]!.edits)).toContain('Raport')
    const toast = useUi.getState().toasts.find((t) => t.text === 'Przywrócono: Zadanie: Raport')!
    await act(async () => toast.action!.run())
    await settle()
    expect(sent[1]![0]).toMatchObject({ rel: 'requests/t1.json', remove: true })
  })

  it('dzień zamrożony: „Przywróć” wyłączone, powód w podpowiedzi i pod nazwą; nic się nie zapisuje', async () => {
    removed = { items: [block({ frozen: true })], complete: true }
    await openRemoved()
    const btn = q('removed-restore', rowOf('Analiza')!) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toBe(FROZEN_TEXT)
    expect(rowOf('Analiza')!.textContent).toContain(FROZEN_TEXT)
    await click(btn)
    expect(sent).toHaveLength(0)
  })

  it('blok, który stał po bloku już spoza planu: „Przywróć” wyłączone z powodem', async () => {
    removed = { items: [block({ anchorGone: true })], complete: true }
    await openRemoved()
    const btn = q('removed-restore', rowOf('Analiza')!) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toBe(ANCHOR_GONE_TEXT)
  })

  it('pusta lista mówi „nic” tylko, gdy jest kompletna; niepełna – tylko to; wyłączenie filtra wraca do wersji rekordów', async () => {
    records = [{ kind: 'routine', id: 'r1', rel: 'routines/r1.json', versions: 1, last: AT, exists: true }]
    removed = { items: [], complete: true }
    useData.setState({ routines: [{ id: 'r1', name: 'Poranek' }] as never })
    await openRemoved()
    expect(q('removed-none')!.textContent).toContain('Nic nie zostało usunięte w ostatnich 30 dniach.')
    expect(q('removed-partial')).toBeNull()
    await click(q('history-removed-toggle'))
    removed = { items: [], complete: false }
    await click(q('history-removed-toggle'))
    await settle()
    // Unknown is never „none”.
    expect(q('removed-none')).toBeNull()
    expect(q('removed-partial')!.textContent).toContain('lista może być niepełna')
    expect(qa('history-record')).toHaveLength(0)
    await click(q('history-removed-toggle'))
    expect(qa('history-record').map((r) => r.textContent)).toEqual([expect.stringContaining('Poranek')])
  })
})

async function openRemovedFrom(h: HTMLElement) {
  await click(q('history-removed-toggle', h))
  await settle()
}

describe('Historia → „Usunięte · 30 dni” – po przeglądzie (N24)', () => {
  const link = (id: string, owner: Record<string, unknown>, removedAt: number | null) => ({ schema: 1, id, kind: 'link', name: id, link: { url: `https://example.com/${id}` }, owner, addedAt: 1, removedAt })
  const setAttachments = (list: unknown[]) => useData.setState({ view: { ...(useData.getState().view as object), attachments: list } as never })
  const attachmentEntries = (entries: EditEntry[]) => entries.filter((e) => e.rel.startsWith('attachments/'))
  const typeIn = (el: HTMLInputElement, v: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })

  it('„Przywróć” bloku przywraca w tej samej edycji dokładnie załączniki zdjęte tym usunięciem (`attachments` z procesu głównego); „Cofnij” zdejmuje je znowu', async () => {
    const day = { scope: 'day', date: DATE, blockId: 'b' }
    setAttachments([link('a1', day, AT + 300), link('a2', day, AT + 300), link('old', day, AT - 3_600_000), link('other', { ...day, blockId: 'x' }, AT + 300)])
    removed = { items: [block({ attachments: { ids: ['a1', 'a2'], removedAt: AT + 300 } })], complete: true }
    await openRemoved()
    await click(q('removed-restore', rowOf('Analiza')!))
    await settle()
    const [dayEntry, ...rest] = sent[0]!
    expect(dayEntry!.rel).toBe(DAY_REL)
    expect(rest.map((e) => e.rel).sort()).toEqual(['attachments/a1.json', 'attachments/a2.json'])
    // Laid only once the day is (T923), each out of the bin.
    expect(rest.every((e) => JSON.stringify(e.after) === '[0]' && e.edits.some((x) => x.path.join('.') === 'removedAt' && x.value === null))).toBe(true)
    const toast = useUi.getState().toasts.find((t) => t.text === 'Przywrócono: Analiza')!
    setAttachments([link('a1', day, null), link('a2', day, null), link('old', day, AT - 3_600_000)])
    dayFile = { ...dayFile, blocks: [...(dayFile.blocks as unknown[]), analiza] }
    await act(async () => toast.action!.run())
    await settle()
    expect(sent[1]![0]!.rel).toBe(DAY_REL)
    const again = attachmentEntries(sent[1]!)
    expect(again.map((e) => e.rel).sort()).toEqual(['attachments/a1.json', 'attachments/a2.json'])
    expect(again.every((e) => e.edits.some((x) => x.path.join('.') === 'removedAt' && typeof x.value === 'number'))).toBe(true)
  })

  it('„Przywróć” szablonu przywraca załączniki jego bloków zdjęte z nim', async () => {
    const tpl = { schema: 1, id: 'tp', name: 'Sobota', dayType: 'weekend', weekdays: [6], versions: { '2026-01-01': { blocks: [{ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 60, fixed: false }] } }, archived: false }
    removed = { items: [{ kind: 'template', id: 'tp', rel: 'templates/tp.json', date: null, removedAt: AT, value: tpl, cancelled: false, frozen: false, anchorGone: false, attachmentsUnknown: false, startMin: null, attachments: { ids: ['t1'], removedAt: AT - 200 } }], complete: true }
    setAttachments([link('t1', { scope: 'template', templateId: 'tp', blockId: 'tb' }, AT - 200), link('t2', { scope: 'template', templateId: 'zz', blockId: 'tb' }, AT - 200)])
    await openRemoved()
    await click(q('removed-restore', rowOf('Sobota')!))
    await settle()
    expect(sent[0]!.map((e) => e.rel)).toEqual(['templates/tp.json', 'attachments/t1.json'])
    expect(sent[0]![0]).toMatchObject({ create: true })
  })

  it('seria: „Przywróć” tylko póki jest w archiwum – zdejmuje archiwum i przywraca koniec, reszta rekordu jak teraz', async () => {
    const value = { schema: 1, id: 's1', root: 's1', start: '2026-10-01', until: null, count: null, archived: false, versions: {}, note: 'z archiwum' }
    removed = { items: [{ kind: 'series', id: 's1', rel: 'series/s1.json', date: null, removedAt: AT, value, cancelled: false, frozen: false, anchorGone: false, attachmentsUnknown: false, startMin: null, attachments: null }], complete: true }
    // Brought back elsewhere meanwhile: nothing written, said.
    useData.setState({ view: { ...(useData.getState().view as object), series: [{ ...value, note: 'zmieniona' }] } as never })
    await openRemoved()
    await click(q('removed-restore', rows()[0]!))
    await settle()
    expect(sent).toHaveLength(0)
    expect(useUi.getState().toasts.map((t) => t.text)).toContain(ALREADY_BACK_TEXT)
    // Still archived: out of it, its end back; a field changed since stays as it is now.
    useData.setState({ view: { ...(useData.getState().view as object), series: [{ ...value, archived: true, until: '2026-10-20', note: 'zmieniona' }] } as never })
    await click(q('removed-restore', rows()[0]!))
    await settle()
    const edits = Object.fromEntries(sent[0]![0]!.edits.map((e) => [e.path.join('.'), e.value]))
    expect(edits).toEqual({ archived: false, until: null })
  })

  it('„Cofnij” przywrócenia, gdy bloku już nie ma w pliku: nic się nie zapisuje – także załączniki', async () => {
    const day = { scope: 'day', date: DATE, blockId: 'b' }
    removed = { items: [block({ attachments: { ids: ['a1'], removedAt: AT + 300 } })], complete: true }
    setAttachments([link('a1', day, AT + 300)])
    await openRemoved()
    await click(q('removed-restore', rowOf('Analiza')!))
    await settle()
    expect(sent).toHaveLength(1)
    const toast = useUi.getState().toasts.find((t) => t.text === 'Przywrócono: Analiza')!
    // Gone from the file again meanwhile (another computer): its „Cofnij” writes nothing – no attachment on its own.
    setAttachments([link('a1', day, null)])
    await act(async () => toast.action!.run())
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('załączniki nieczytelne w tej chwili: „Przywróć” wyłączone z powodem (blok nie wróci bez nich)', async () => {
    removed = { items: [block({ attachmentsUnknown: true })], complete: false }
    await openRemoved()
    const btn = q('removed-restore', rowOf('Analiza')!) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toBe(ATTACHMENTS_UNKNOWN_TEXT)
    expect(rowOf('Analiza')!.textContent).toContain(ATTACHMENTS_UNKNOWN_TEXT)
  })

  it('blok zakotwiczony (bez własnej godziny): godziny, od których stanie po przywróceniu', async () => {
    removed = { items: [block({ value: { ...analiza, startMin: null, anchor: 'a' }, startMin: 660 })], complete: true }
    await openRemoved()
    expect(rowOf('Analiza')!.textContent).toContain('22.10.2026 · 11:00–12:00')
  })

  it('wersja serii zapisana przy usunięciu (archiwizacji) ma w Historii podpis „przed usunięciem”', async () => {
    records = [{ kind: 'series', id: 's1', rel: 'series/s1.json', versions: 1, last: AT, exists: true }]
    useData.setState({ view: { ...(useData.getState().view as object), computers: [] } as never })
    ;(window.rd as Partial<RdApi>).historyVersions = () => Promise.resolve([{ file: 'v.json', savedAt: AT, savedBy: 'pca', reason: 'archive', record: {} }])
    await open()
    await click(qa('history-record')[0]!)
    await settle()
    expect(q('history-version')!.textContent).toContain('przed usunięciem')
  })

  it('nieudany ponowny odczyt listy jest powiedziany także nad listą odczytaną wcześniej', async () => {
    await openRemoved()
    expect(rows()).toHaveLength(2)
    ;(window.rd as Partial<RdApi>).historyRemoved = () => Promise.reject(new Error('EBUSY'))
    await act(async () => useRemovedChanges.setState((s) => ({ n: s.n + 1 })))
    await settle()
    expect(q('removed-failed')!.textContent).toBe(REMOVED_FAILED_TEXT)
    expect(rows()).toHaveLength(2)
  })

  it('szukanie znajduje blok także po jego dniu (RRRR-MM-DD i DD.MM.RRRR)', async () => {
    await openRemoved()
    for (const text of ['2026-10-22', '22.10.2026']) {
      await typeIn(q('history-search') as HTMLInputElement, text)
      expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Analiza')])
    }
  })

  it('zmiana danych czyta listę najwyżej raz na 30 s; „Przywróć” i „Cofnij” – od razu', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    let reads = 0
    ;(window.rd as Partial<RdApi>).historyRemoved = () => (reads++, Promise.resolve(removed))
    const flush = () => act(async () => void (await Promise.resolve()))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(HistoryPage)))
    await flush()
    await click(q('history-removed-toggle'))
    await flush()
    expect(reads).toBe(1)
    await act(async () => useData.setState({ stamp: useData.getState().stamp + 1 }))
    await act(async () => void vi.advanceTimersByTime(REMOVED_REREAD_MS - 1000))
    await act(async () => useData.setState({ stamp: useData.getState().stamp + 1 }))
    expect(reads).toBe(1)
    await act(async () => void vi.advanceTimersByTime(1000))
    await flush()
    expect(reads).toBe(2)
    await act(async () => useRemovedChanges.setState((s) => ({ n: s.n + 1 })))
    await flush()
    expect(reads).toBe(3)
  })
})
