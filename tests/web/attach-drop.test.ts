// @vitest-environment jsdom
/**
 * Files and links brought to a block from outside (SNT4, D410, T814): dropped from the Explorer or a browser, pasted with Ctrl V.
 * The File object has no path of its own (`window.rd.pathForFile`, mocked here); a link is the address of `text/uri-list` or
 * a plain one-line text; a text dragged or pasted within a field of text stays the field's.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentOwner } from '@shared/model/attachment'
import { addressOf, attachable, attachTransfer, hasFiles, NO_PATH_TEXT, pasteTransfer, textTarget, useAttachDrop } from '@renderer/features/attachments/attachDrop'
import { attachFiles, addLink } from '@renderer/store/attachments'
import { closeToast, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/attachments', async (orig) => ({ ...(await orig<typeof import('@renderer/store/attachments')>()), attachFiles: vi.fn(async () => ({ added: [], failed: [] })), addLink: vi.fn(async () => 'id1') }))

const owner: AttachmentOwner = { scope: 'day', date: '2026-11-18', blockId: 'b1' }
const file = (name: string): File => new File(['x'], name)

/** A transfer as a browser fills it: the types it holds, their data, the files. */
function transfer(data: Record<string, string>, files: File[] = []) {
  return {
    types: [...Object.keys(data), ...(files.length ? ['Files'] : [])],
    getData: (t: string) => data[t] ?? '',
    files: files as unknown as FileList
  }
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.mocked(attachFiles).mockClear()
  vi.mocked(addLink).mockClear()
  for (const x of useUi.getState().toasts) closeToast(x.id)
  // The path of a file is its name under C:\ – a file called „brak” has none (a picture dragged out of a page).
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => (f.name === 'brak' ? '' : `C:\\dane\\${f.name}`) }
})

describe('co przeciągnięcie może nieść', () => {
  it('pliki, adres albo tekst – nic innego', () => {
    expect(attachable({ types: ['Files'] })).toBe(true)
    expect(attachable({ types: ['text/uri-list', 'text/plain'] })).toBe(true)
    // Plain text alone is not taken (its data cannot be read before the drop; a word is no link, T818).
    expect(attachable({ types: ['text/plain'] })).toBe(false)
    expect(attachable({ types: ['text/html'] })).toBe(false)
    expect(attachable(null)).toBe(false)
    expect(hasFiles({ types: ['Files'] })).toBe(true)
    expect(hasFiles({ types: ['text/plain'] })).toBe(false)
  })

  it('pole tekstowe: input, textarea, select i edytor notatki – nie zwykły element', () => {
    document.body.innerHTML = '<div id="d"><input id="i"><textarea id="t"></textarea><select id="s"></select><div id="e" contenteditable="true"><p id="p">x</p></div></div>'
    const at = (id: string) => document.getElementById(id)
    expect([at('i'), at('t'), at('s'), at('p')].map(textTarget)).toEqual([true, true, true, true])
    expect(textTarget(at('d'))).toBe(false)
    expect(textTarget(null)).toBe(false)
  })

  it('adres: pierwszy wiersz listy adresów bez komentarzy, inaczej jednowierszowy tekst; wielowiersz – nic', () => {
    expect(addressOf(transfer({ 'text/uri-list': '# komentarz\r\nhttps://a.pl/x\r\nhttps://b.pl', 'text/plain': 'coś' }))).toBe('https://a.pl/x')
    expect(addressOf(transfer({ 'text/plain': '  https://c.pl  ' }))).toBe('https://c.pl')
    expect(addressOf(transfer({ 'text/plain': 'a\nb' }))).toBeNull()
    expect(addressOf(transfer({}))).toBeNull()
  })
})

describe('upuszczenie i wklejenie', () => {
  it('pliki ze ścieżkami idą do attachFiles (nazwane ścieżkami, nie obiektami File)', async () => {
    expect(await attachTransfer(owner, transfer({}, [file('a.pdf'), file('b.png')]))).toBe(true)
    expect(attachFiles).toHaveBeenCalledWith(owner, ['C:\\dane\\a.pdf', 'C:\\dane\\b.png'])
    expect(addLink).not.toHaveBeenCalled()
  })

  it('plik bez ścieżki (obraz wyciągnięty ze strony) – bierze się adres; bez adresu – komunikat', async () => {
    expect(await attachTransfer(owner, transfer({ 'text/uri-list': 'https://a.pl/o.png' }, [file('brak')]))).toBe(true)
    expect(addLink).toHaveBeenCalledWith(owner, 'https://a.pl/o.png')
    expect(attachFiles).not.toHaveBeenCalled()
    expect(await attachTransfer(owner, transfer({}, [file('brak')]))).toBe(true)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([NO_PATH_TEXT])
  })

  it('adres z przeglądarki (text/uri-list) i sam tekst z jawnym adresem (http, https, mailto, www.) – jak „Dodaj link”; nic – false', async () => {
    expect(await attachTransfer(owner, transfer({ 'text/plain': 'https://d.pl' }))).toBe(true)
    expect(addLink).toHaveBeenLastCalledWith(owner, 'https://d.pl')
    expect(await attachTransfer(owner, transfer({ 'text/plain': 'www.d.pl/x' }))).toBe(true)
    expect(addLink).toHaveBeenLastCalledWith(owner, 'www.d.pl/x')
    expect(await attachTransfer(owner, transfer({ 'text/plain': 'mailto:ala@d.pl' }))).toBe(true)
    expect(await attachTransfer(owner, transfer({}))).toBe(false)
    expect(addLink).toHaveBeenCalledTimes(3)
  })

  it('zwykły tekst upuszczony na miejsce (słowo, „plan.md”, goła domena) nie jest linkiem – nic się nie dzieje, żaden toast (T818)', async () => {
    for (const text of ['słowo', 'plan.md', 'example.org/strona', 'ftp://x.pl/a', 'C:/dane/a.txt']) {
      expect(await attachTransfer(owner, transfer({ 'text/plain': text }))).toBe(false)
    }
    expect(addLink).not.toHaveBeenCalled()
    expect(useUi.getState().toasts).toHaveLength(0)
    // Ctrl V sądzi inaczej (linkFromInput) – bez zmian.
    expect(addressOf(transfer({ 'text/plain': 'plan.md' }), 'explicit')).toBeNull()
    expect(addressOf(transfer({ 'text/plain': 'plan.md' }))).toBe('plan.md')
  })

  it('Ctrl V: adres dodaje link, pliki ze ścieżkami – pliki; zwykły tekst i pole tekstowe – nic', () => {
    const ev = (dt: ReturnType<typeof transfer>, target: EventTarget | null = document.body) => ({ clipboardData: dt as unknown as DataTransfer, target, defaultPrevented: false })
    expect(pasteTransfer(owner, ev(transfer({ 'text/plain': 'https://e.pl' })))).toBe(true)
    expect(addLink).toHaveBeenLastCalledWith(owner, 'https://e.pl')
    expect(pasteTransfer(owner, ev(transfer({}, [file('c.txt')])))).toBe(true)
    expect(attachFiles).toHaveBeenLastCalledWith(owner, ['C:\\dane\\c.txt'])
    expect(pasteTransfer(owner, ev(transfer({ 'text/plain': 'zwykły tekst' })))).toBe(false)
    expect(pasteTransfer(owner, ev(transfer({}, [file('brak')])))).toBe(false)
    const input = document.createElement('input')
    expect(pasteTransfer(owner, ev(transfer({ 'text/plain': 'https://f.pl' }), input))).toBe(false)
    expect(pasteTransfer(owner, { clipboardData: null, target: document.body, defaultPrevented: false })).toBe(false)
    expect(pasteTransfer(owner, { ...ev(transfer({ 'text/plain': 'https://g.pl' })), defaultPrevented: true })).toBe(false)
    expect(vi.mocked(addLink)).toHaveBeenCalledTimes(1)
  })
})

describe('miejsce, na które upuszcza się pliki (useAttachDrop)', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function Zone({ o }: { o: AttachmentOwner | null }) {
    const d = useAttachDrop(o)
    return createElement('div', { 'data-testid': 'zone', 'data-over': d.over ? 'on' : undefined, ...d.bind }, createElement('input', { 'data-testid': 'field' }))
  }
  const mount = async (o: AttachmentOwner | null) => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Zone, { o })))
    return { zone: host.querySelector<HTMLElement>('[data-testid="zone"]')!, field: host.querySelector<HTMLElement>('[data-testid="field"]')! }
  }
  /** A drag event on `el` carrying `dt` (jsdom has no DataTransfer): whether it was cancelled. */
  const fire = (el: Element, type: string, dt: ReturnType<typeof transfer>): boolean => {
    const e = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'dataTransfer', { value: { ...dt, dropEffect: 'none' } })
    let cancelled = false
    act(() => {
      cancelled = !el.dispatchEvent(e)
    })
    return cancelled
  }

  it('pliki nad miejscem: przeciągnięcie przyjęte i miejsce podświetlone; upuszczenie – dołączone pod właścicielem', async () => {
    const { zone } = await mount(owner)
    const dt = transfer({}, [file('a.pdf')])
    expect(fire(zone, 'dragover', dt)).toBe(true)
    expect(zone.dataset.over).toBe('on')
    expect(fire(zone, 'drop', dt)).toBe(true)
    expect(zone.dataset.over).toBeUndefined()
    expect(attachFiles).toHaveBeenCalledWith(owner, ['C:\\dane\\a.pdf'])
  })

  it('tekst przeciągany nad polem tekstowym zostaje polu (przeciągnięcie nie jest przyjęte, nic się nie dołącza)', async () => {
    const { zone, field } = await mount(owner)
    const dt = transfer({ 'text/uri-list': 'https://x.pl', 'text/plain': 'https://x.pl' })
    expect(fire(field, 'dragover', dt)).toBe(false)
    expect(fire(field, 'drop', dt)).toBe(false)
    expect(addLink).not.toHaveBeenCalled()
    // …a ten sam adres poza polem to link.
    expect(fire(zone, 'drop', dt)).toBe(true)
    expect(addLink).toHaveBeenCalledWith(owner, 'https://x.pl')
  })

  it('sam tekst (zaznaczone słowo z dokumentu) nie jest przyjmowany: bez podświetlenia, drop nic nie robi (T818)', async () => {
    const { zone } = await mount(owner)
    const dt = transfer({ 'text/plain': 'plan.md' })
    expect(fire(zone, 'dragover', dt)).toBe(false)
    expect(zone.dataset.over).toBeUndefined()
    expect(fire(zone, 'drop', dt)).toBe(false)
    expect(addLink).not.toHaveBeenCalled()
  })

  it('inne przeciągnięcie (np. html) i miejsce bez właściciela – nie są przyjmowane', async () => {
    const { zone } = await mount(owner)
    expect(fire(zone, 'dragover', transfer({ 'text/html': '<b>x</b>' }))).toBe(false)
    act(() => root?.unmount())
    host?.remove()
    const none = await mount(null)
    expect(fire(none.zone, 'dragover', transfer({}, [file('a.pdf')]))).toBe(false)
    expect(fire(none.zone, 'drop', transfer({}, [file('a.pdf')]))).toBe(false)
    expect(attachFiles).not.toHaveBeenCalled()
  })

  it('drop już obsłużony przez pole (np. edytor notatki) nie dołącza niczego', async () => {
    const { zone, field } = await mount(owner)
    field.addEventListener('drop', (e) => e.preventDefault())
    expect(fire(field, 'drop', transfer({}, [file('a.pdf')]))).toBe(true)
    expect(attachFiles).not.toHaveBeenCalled()
    expect(zone.dataset.over).toBeUndefined()
  })
})

describe('obok listy adresów albo plików zwykły tekst nigdy (T818, runda 2)', () => {
  it('pusta albo sama komentarzowa uri-list, pliki bez ścieżki – text/plain nie jest brany', async () => {
    expect(addressOf(transfer({ 'text/uri-list': '', 'text/plain': 'https://zly.pl' }))).toBeNull()
    expect(addressOf(transfer({ 'text/uri-list': '# tylko komentarz', 'text/plain': 'https://zly.pl' }))).toBeNull()
    expect(addressOf(transfer({ 'text/plain': 'https://zly.pl' }, [file('brak')]))).toBeNull()
    expect(await attachTransfer(owner, transfer({ 'text/plain': 'https://zly.pl' }, [file('brak')]))).toBe(true)
    expect(addLink).not.toHaveBeenCalled()
    expect(useUi.getState().toasts.some((t) => t.text === NO_PATH_TEXT)).toBe(true)
    // Plain text alone – as before.
    expect(addressOf(transfer({ 'text/plain': 'https://c.pl' }))).toBe('https://c.pl')
  })
})
