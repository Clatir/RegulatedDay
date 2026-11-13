// @vitest-environment jsdom
/**
 * The „Załączniki” section of a block's panel (SNT4, D410, T811–T813): the list with icons, thumbnails, names, sizes and
 * domains; what a day's block shows of the template's and the series' (tagged, changed where they belong); the notes (file not
 * here yet, a program); „Dołącz plik…”, „Dodaj link” (Enter adds, Esc closes), „Otwórz wszystko (N)”, the rename in place, the
 * removal with „Cofnij”, Ctrl V.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentOpen } from '@shared/api'
import { ownerToAdd, type Attachment, type BlockPlace } from '@shared/model/attachment'
import { templateBlockId } from '@shared/engine/createDay'
import { AttachmentsSection } from '@renderer/features/attachments/AttachmentsSection'
import { MISSING_NOTE, PROGRAM_NOTE } from '@renderer/features/attachments/attachView'
import { handleEscape, installEscape } from '@renderer/lib/escape'
import { addLink, openAllAttachments, openAttachment, pickFiles, removeAttachments, renameAttachment, restoreAttachments, showAttachment } from '@renderer/store/attachments'
import { useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/attachments', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/attachments')>()),
  addLink: vi.fn(async () => 'id9'),
  attachFiles: vi.fn(async () => ({ added: [], failed: [] })),
  openAllAttachments: vi.fn(async () => []),
  openAttachment: vi.fn(async (id: string): Promise<AttachmentOpen> => ({ id, ok: true, how: 'opened', code: null, text: null })),
  pickFiles: vi.fn(async () => ({ added: [], failed: [] })),
  removeAttachments: vi.fn(async (ids: readonly string[]) => ({ ids: [...ids], removedAt: 42 })),
  renameAttachment: vi.fn(async () => true),
  restoreAttachments: vi.fn(async () => true),
  showAttachment: vi.fn(async (id: string): Promise<AttachmentOpen> => ({ id, ok: true, how: 'shown', code: null, text: null }))
}))

const DAY: BlockPlace = { scope: 'day', date: '2026-11-18', templateId: 't1' }
// A block of the template in the day (its id derived from the day, the template and its block – T831).
const block = { id: templateBlockId('2026-11-18', 't1', 's1'), origin: 'template' as const, sourceId: 's1' }

const file = (id: string, fileName: string, owner: Attachment['owner'], at: number, size = 1536): Attachment => ({
  id,
  kind: 'file',
  name: fileName,
  file: { fileName, size, ext: fileName.split('.').pop()!.toLowerCase() },
  link: null,
  owner,
  addedAt: at,
  removedAt: null
})
const link = (id: string, owner: Attachment['owner'], at: number, title: string | null, icon: string | null = null): Attachment => ({
  id,
  kind: 'link',
  name: title ?? 'example.org',
  file: null,
  link: { url: 'https://example.org/x', title, iconDataUrl: icon, domain: 'example.org' },
  owner,
  addedAt: at,
  removedAt: null
})
const OWN = { scope: 'day', date: '2026-11-18', blockId: block.id } as const
const TPL = { scope: 'template', templateId: 't1', blockId: 's1' } as const

let root: Root | null = null
let host: HTMLElement | null = null

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
})
beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:\\${f.name}` }
  for (const x of useUi.getState().toasts) closeToast(x.id)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useData.setState({ attachments: [], attachmentsMissing: new Set() })
})

async function show(list: Attachment[], opts: { place?: BlockPlace; withBlock?: boolean; missing?: string[] } = {}) {
  const place = opts.place ?? DAY
  const b = opts.withBlock === false ? null : block
  useData.setState({ attachments: list, attachmentsMissing: new Set(opts.missing ?? []) })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(AttachmentsSection, { block: b, place, owner: ownerToAdd(b, place) })))
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => host!.querySelector<T>(`[data-testid="${sel}"]`)
  const all = (sel: string) => [...host!.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)]
  return { q, all }
}
const click = (el: HTMLElement | null) => act(async () => el!.click())
const typeInto = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const key = (el: Element, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))

describe('lista załączników', () => {
  it('plik: nazwa, rodzaj i rozmiar po polsku; link: tytuł i domena; w kolejności dodania', async () => {
    const { all } = await show([link('a2', OWN, 20, 'Strona firmy'), file('a1', 'raport.pdf', OWN, 10)])
    const rows = all('attachment')
    expect(rows.map((r) => r.dataset.name)).toEqual(['raport.pdf', 'Strona firmy'])
    expect(rows[0]!.querySelector('[data-testid="attachment-meta"]')!.textContent).toBe('PDF · 1,5 KB')
    expect(rows[0]!.querySelector('[data-testid="attachment-icon"]')!.getAttribute('data-kind')).toBe('pdf')
    expect(rows[1]!.querySelector('[data-testid="attachment-meta"]')!.textContent).toBe('example.org')
    expect(rows[1]!.querySelector('[data-testid="attachment-icon"]')!.getAttribute('data-kind')).toBe('link')
  })

  it('link z ikoną strony pokazuje tę ikonę, bez – ogólną', async () => {
    const { q } = await show([link('a1', OWN, 1, 'Ze znaczkiem', 'data:image/png;base64,AAAA')])
    expect(q('attachment-site-icon')!.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(q('attachment-icon')).toBeNull()
  })

  it('pusta lista: podpowiedź i przyciski; bez bloku (nowy, niezapisany) – nic do dodania', async () => {
    const { q } = await show([])
    expect(q('attach-pick')).not.toBeNull()
    expect(q('attach-open-all')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const none = await show([], { place: { scope: 'day', date: '2026-11-18', templateId: null }, withBlock: false })
    expect(none.q('attach-pick')).toBeNull()
    expect(none.q('attach-link-add')).toBeNull()
  })

  it('blok dnia widzi też załączniki szablonu, z dopiskiem; zmienić nazwę i usunąć ich tu nie można (T811)', async () => {
    const { all } = await show([file('a1', 'moj.pdf', OWN, 1), file('a2', 'z-szablonu.pdf', TPL, 2)])
    const [own, tpl] = all('attachment')
    expect(own!.querySelector('[data-testid="attachment-origin"]')).toBeNull()
    expect(own!.querySelector('[data-testid="attachment-remove"]')).not.toBeNull()
    expect(tpl!.querySelector('[data-testid="attachment-origin"]')!.textContent).toBe('z szablonu')
    expect(tpl!.querySelector('[data-testid="attachment-remove"]')).toBeNull()
    expect(tpl!.querySelector('[data-testid="attachment-rename"]')).toBeNull()
    // …ale otworzyć i pokazać w folderze – tak.
    expect(tpl!.querySelector('[data-testid="attachment-open"]')).not.toBeNull()
    expect(tpl!.querySelector('[data-testid="attachment-show"]')).not.toBeNull()
  })

  it('załączniki serii w bloku wystąpienia – z dopiskiem „z serii”', async () => {
    const { all } = await show([file('a1', 'seria.pdf', { scope: 'series', root: 'r1' }, 1)], { place: DAY })
    expect(all('attachment')).toHaveLength(0)
    act(() => root?.unmount())
    host?.remove()
    useData.setState({ attachments: [] })
    const occ = { id: 'b2', origin: 'series' as const, sourceId: 'r1' }
    useData.setState({ attachments: [file('a1', 'seria.pdf', { scope: 'series', root: 'r1' }, 1)], attachmentsMissing: new Set() })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(AttachmentsSection, { block: occ, place: DAY, owner: ownerToAdd(occ, DAY) })))
    expect(host.querySelector('[data-testid="attachment-origin"]')!.textContent).toBe('z serii')
  })

  it('edycja serii: załączniki serii są własne (zmiana nazwy i usunięcie są), dodanie – do serii', async () => {
    const place: BlockPlace = { scope: 'series', root: 'r1' }
    const { q, all } = await show([file('a1', 'seria.pdf', { scope: 'series', root: 'r1' }, 1)], { place, withBlock: false })
    expect(all('attachment')).toHaveLength(1)
    expect(q('attachment-remove')).not.toBeNull()
    await click(q('attach-pick'))
    expect(pickFiles).toHaveBeenCalledWith({ scope: 'series', root: 'r1' })
  })
})

describe('miniatury i dopiski', () => {
  it('obraz: z adresu procesu głównego (rd-attachment://img/<id>), ikona do załadowania; nie załadował się – ikona zostaje (T837)', async () => {
    const { q, all } = await show([file('a1', 'foto.png', OWN, 1), file('a2', 'zepsuty.jpg', OWN, 2), file('a3', 'tekst.pdf', OWN, 3), file('a4', 'rys.svg', OWN, 4)])
    const imgs = all('attachment-thumb') as HTMLImageElement[]
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['rd-attachment://img/a1', 'rd-attachment://img/a2'])
    expect(imgs.every((i) => i.classList.contains('hidden'))).toBe(true)
    await act(async () => void imgs[0]!.dispatchEvent(new Event('load')))
    await act(async () => void imgs[1]!.dispatchEvent(new Event('error')))
    expect((all('attachment-thumb') as HTMLImageElement[]).map((i) => [i.getAttribute('src'), i.classList.contains('hidden')])).toEqual([['rd-attachment://img/a1', false]])
    // The icons left: the broken image, the PDF and the SVG (never asked for).
    expect(all('attachment-icon').map((i) => i.getAttribute('data-kind'))).toEqual(['image', 'pdf', 'image'])
    expect(q('attachment-thumb')).not.toBeNull()
  })

  it('obraz ponad 20 MB – bez <img> (okno nie dekoduje go dla 32 px), ikona rodzaju (T837)', async () => {
    const { all } = await show([file('a1', 'duże.png', OWN, 1, 20 * 1024 * 1024 + 1), file('a2', 'małe.png', OWN, 2, 20 * 1024 * 1024)])
    expect((all('attachment-thumb') as HTMLImageElement[]).map((i) => [i.getAttribute('src'), i.getAttribute('decoding')])).toEqual([['rd-attachment://img/a2', 'async']])
    expect(all('attachment-icon').map((i) => i.getAttribute('data-kind'))).toEqual(['image', 'image'])
  })

  it('plik, który jeszcze nie dotarł z drugiego komputera – dopisek (bez pytania o miniaturę)', async () => {
    const { all } = await show([file('a1', 'foto.png', OWN, 1)], { missing: ['a1'] })
    expect(all('attachment-thumb')).toEqual([])
    expect(all('attachment-note').map((n) => n.textContent)).toEqual([MISSING_NOTE])
  })

  it('program: dopisek, a kliknięcie otwiera przez proces główny, który go tylko pokaże – bez toastu', async () => {
    vi.mocked(openAttachment).mockResolvedValueOnce({ id: 'a1', ok: true, how: 'shown', code: null, text: null })
    const { q, all } = await show([file('a1', 'setup.exe', OWN, 1)])
    expect(all('attachment-note').map((n) => n.textContent)).toEqual([PROGRAM_NOTE])
    await click(q('attachment-open'))
    expect(openAttachment).toHaveBeenCalledWith('a1')
    expect(useUi.getState().toasts).toHaveLength(0)
  })

  it('zwykły plik nie ma dopisku', async () => {
    const { all } = await show([file('a1', 'raport.pdf', OWN, 1)])
    expect(all('attachment-note')).toHaveLength(0)
  })
})

describe('otwieranie', () => {
  it('klik w pozycję otwiera ją po id; „Pokaż w folderze” – tylko pliki', async () => {
    const { q, all } = await show([file('a1', 'raport.pdf', OWN, 1), link('a2', OWN, 2, 'Strona')])
    const rows = all('attachment')
    await click(rows[0]!.querySelector('[data-testid="attachment-open"]'))
    expect(openAttachment).toHaveBeenCalledWith('a1')
    await click(rows[0]!.querySelector('[data-testid="attachment-show"]'))
    expect(showAttachment).toHaveBeenCalledWith('a1')
    expect(rows[1]!.querySelector('[data-testid="attachment-show"]')).toBeNull()
    expect(q('attachment')).not.toBeNull()
  })

  it('„Otwórz wszystko (N)” od dwóch pozycji, z id wszystkich widocznych', async () => {
    const one = await show([file('a1', 'a.pdf', OWN, 1)])
    expect(one.q('attach-open-all')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const two = await show([file('a1', 'a.pdf', OWN, 1), file('a2', 'b.pdf', TPL, 2)])
    expect(two.q('attach-open-all')!.textContent).toBe('Otwórz wszystko (2)')
    await click(two.q('attach-open-all'))
    expect(openAllAttachments).toHaveBeenCalledWith(['a1', 'a2'])
  })
})

describe('dodawanie', () => {
  it('„Dołącz plik…” pyta proces główny o wybór, pod właścicielem bloku', async () => {
    const { q } = await show([])
    await click(q('attach-pick'))
    expect(pickFiles).toHaveBeenCalledWith(OWN)
  })

  it('„Dodaj link”: pole adresu, Enter dodaje i zamyka; odmowa zostawia pole z adresem', async () => {
    const { q } = await show([])
    expect(q('attach-link-input')).toBeNull()
    await click(q('attach-link-add'))
    const input = q<HTMLInputElement>('attach-link-input')!
    expect(document.activeElement).toBe(input)
    await typeInto(input, 'https://example.org/a')
    vi.mocked(addLink).mockResolvedValueOnce(null)
    await key(input, 'Enter')
    expect(addLink).toHaveBeenCalledWith(OWN, 'https://example.org/a')
    expect(q<HTMLInputElement>('attach-link-input')!.value).toBe('https://example.org/a')
    await key(q('attach-link-input')!, 'Enter')
    expect(addLink).toHaveBeenCalledTimes(2)
    expect(q('attach-link-input')).toBeNull()
  })

  it('Esc zamyka pole adresu (przed panelem)', async () => {
    const { q } = await show([])
    await click(q('attach-link-add'))
    expect(q('attach-link-input')).not.toBeNull()
    act(() => void handleEscape())
    expect(q('attach-link-input')).toBeNull()
  })

  it('pusty adres niczego nie dodaje', async () => {
    const { q } = await show([])
    await click(q('attach-link-add'))
    await key(q('attach-link-input')!, 'Enter')
    expect(addLink).not.toHaveBeenCalled()
  })

  it('Ctrl V poza polem tekstowym: adres ze schowka to link; w polu – zwykłe wklejanie', async () => {
    const { q } = await show([])
    const paste = (target: Element, text: string) => {
      const e = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'clipboardData', { value: { types: ['text/plain'], getData: (t: string) => (t === 'text/plain' ? text : ''), files: [] } })
      let taken = false
      act(() => {
        taken = !target.dispatchEvent(e)
      })
      return taken
    }
    expect(paste(document.body, 'https://example.org/p')).toBe(true)
    expect(addLink).toHaveBeenCalledWith(OWN, 'https://example.org/p')
    expect(paste(document.body, 'zwykły tekst')).toBe(false)
    await click(q('attach-link-add'))
    expect(paste(q('attach-link-input')!, 'https://example.org/q')).toBe(false)
    expect(addLink).toHaveBeenCalledTimes(1)
  })
})

describe('zmiana nazwy i usunięcie', () => {
  it('„Zmień nazwę” w miejscu: pole z nazwą, Enter zapisuje nową', async () => {
    const { q } = await show([file('a1', 'raport.pdf', OWN, 1)])
    await click(q('attachment-rename'))
    const input = q<HTMLInputElement>('attachment-rename-input')!
    expect(input.value).toBe('raport.pdf')
    expect(document.activeElement).toBe(input)
    await typeInto(input, 'Raport roczny')
    await key(input, 'Enter')
    await act(async () => input.blur())
    expect(renameAttachment).toHaveBeenCalledWith('a1', 'Raport roczny')
    expect(q('attachment-rename-input')).toBeNull()
  })

  it('bez zmiany nic nie zapisuje; Esc wychodzi z pola', async () => {
    const { q } = await show([file('a1', 'raport.pdf', OWN, 1)])
    await click(q('attachment-rename'))
    act(() => void handleEscape())
    expect(q('attachment-rename-input')).toBeNull()
    expect(renameAttachment).not.toHaveBeenCalled()
  })

  it('„Usuń” bez pytania; toast z „Cofnij” przywraca tym samym wynikiem usunięcia', async () => {
    const { q } = await show([file('a1', 'raport.pdf', OWN, 1)])
    await click(q('attachment-remove'))
    expect(removeAttachments).toHaveBeenCalledWith(['a1'])
    const t = useUi.getState().toasts.at(-1)!
    expect(t.text).toBe('Usunięto załącznik „raport.pdf”')
    expect(t.action?.label).toBe('Cofnij')
    t.action!.run()
    expect(restoreAttachments).toHaveBeenCalledWith({ ids: ['a1'], removedAt: 42 })
  })

  it('usunięcie, które się nie udało (nic nie usunięto), nie daje „Cofnij”', async () => {
    vi.mocked(removeAttachments).mockResolvedValueOnce(null)
    const { q } = await show([file('a1', 'raport.pdf', OWN, 1)])
    await click(q('attachment-remove'))
    expect(useUi.getState().toasts).toHaveLength(0)
  })
})
