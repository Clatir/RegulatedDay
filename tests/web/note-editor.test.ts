// @vitest-environment jsdom
/**
 * The note's editor as a field (D388, T661a, T662, T664): opened and left it writes nothing; an edit is saved on leaving
 * it – once, the whole note; Esc throws the edit away without a save; a click on a check box saves at once; the counter and
 * the warning of an older version show under the text.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NoteEditor, withScheme } from '@renderer/features/note/NoteEditor'
import { loadNote, noteExtensions } from '@renderer/features/note/noteMarkdown'
import { installEscape, onEscapeLayer } from '@renderer/lib/escape'
import { useUi } from '@renderer/store/ui'
import { ofLabel } from '@shared/format'
import { NOTE_MAX } from '@shared/model/note'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // The window's one listener of Esc (the layers: the panel, the enlarged note).
  installEscape()
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

async function mount(value: string, o: { older?: string[]; onCommit?: (n: string) => void | Promise<boolean> } = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const onCommit = o.onCommit ?? vi.fn<(note: string) => void>()
  await act(async () => {
    root!.render(createElement(NoteEditor, { value, onCommit, olderComputers: o.older ?? [] }))
  })
  const el = host.querySelector<HTMLElement>('[data-testid="block-note"]')!
  const editor = (el as unknown as { editor: Editor }).editor
  const type = (text: string) =>
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText(text, editor.state.doc.content.size - 1))
    })
  const blur = () => act(() => void el.dispatchEvent(new FocusEvent('blur')))
  const esc = () => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })))
  return { el, editor, type, blur, esc, onCommit: onCommit as ReturnType<typeof vi.fn<(note: string) => void>>, host }
}

describe('notatka jako pole (T662)', () => {
  it('otwarta i opuszczona bez edycji – żadnego zapisu, także przy zamknięciu panelu', async () => {
    const m = await mount('stara\nnotatka\n\n- [ ] a')
    await m.blur()
    act(() => root!.unmount())
    root = null
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('inny zapis tych samych konstrukcji (normalizacja) nie jest edycją – żadnego zapisu', async () => {
    const m = await mount('__a__\n* b')
    await m.blur()
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('edycja zapisuje się przy opuszczeniu: raz, cała notatka z podziałem na linie', async () => {
    const m = await mount('stara\nnotatka')
    await m.type('!')
    expect(m.onCommit).not.toHaveBeenCalled()
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledTimes(1)
    expect(m.onCommit).toHaveBeenCalledWith('stara\nnotatka!')
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledTimes(1)
  })

  it('edycja cofnięta ręcznie do tego samego tekstu – bez zapisu', async () => {
    const m = await mount('abc')
    await m.type('d')
    act(() => void m.editor.commands.setContent('abc', { contentType: 'markdown', emitUpdate: true }))
    await m.blur()
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('Esc cofa niezatwierdzoną zmianę (bez zapisu, zdarzenie nie idzie dalej); drugi Esc idzie dalej', async () => {
    const m = await mount('abc')
    const reached = vi.fn()
    const off = onEscapeLayer(reached)
    await m.type('d')
    expect(m.editor.getText()).toBe('abcd')
    await m.esc()
    expect(m.editor.getText()).toBe('abc')
    await m.blur()
    expect(m.onCommit).not.toHaveBeenCalled()
    expect(reached).not.toHaveBeenCalled()
    await m.esc()
    expect(reached).toHaveBeenCalledTimes(1)
    off()
  })

  it('Esc w edytorze bez niezapisanej zmiany dochodzi do warstw okna (ProseMirror sam go połyka)', async () => {
    const m = await mount('abc')
    const closed = vi.fn()
    const off = onEscapeLayer(closed)
    await m.esc()
    expect(closed).toHaveBeenCalledTimes(1)
    off()
  })

  it('klik w pole wyboru zapisuje od razu (bez opuszczania pola)', async () => {
    const m = await mount('- [ ] a\n- [ ] b')
    const boxes = m.el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    await act(async () => {
      boxes[0]!.click()
    })
    expect(m.onCommit).toHaveBeenCalledTimes(1)
    expect(m.onCommit).toHaveBeenCalledWith('- [x] a\n- [ ] b')
    await act(async () => {
      m.el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click()
    })
    expect(m.onCommit).toHaveBeenLastCalledWith('- [x] a\n- [x] b')
  })

  it('nowa wartość z zewnątrz (inny komputer) bez niezapisanej edycji wchodzi do edytora', async () => {
    const m = await mount('a')
    await act(async () => {
      root!.render(createElement(NoteEditor, { value: 'zmieniona\nzdalnie', onCommit: m.onCommit, olderComputers: [] }))
    })
    expect(m.editor.getMarkdown()).toBe('zmieniona\nzdalnie')
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('wartość z zewnątrz nie wyrzuca niezapisanej edycji', async () => {
    const m = await mount('a')
    await m.type('X')
    await act(async () => {
      root!.render(createElement(NoteEditor, { value: 'z zewnątrz', onCommit: m.onCommit, olderComputers: [] }))
    })
    expect(m.editor.getText()).toBe('aX')
  })

  it('zapis odrzucony: edytor pokazuje znowu zapisaną wartość, jak pole (nie zostaje niezapisany tekst z dirty=false)', async () => {
    const refuse = vi.fn(() => Promise.resolve(false))
    const m = await mount('abc', { onCommit: refuse })
    await m.type('d')
    await m.blur()
    expect(refuse).toHaveBeenCalledWith('abcd')
    await act(async () => void (await Promise.resolve()))
    expect(m.editor.getText()).toBe('abc')
    await m.blur()
    expect(refuse).toHaveBeenCalledTimes(1)
  })

  it('zapis odrzucony, ale już piszesz dalej: tekst zostaje (zapisze się przy następnym opuszczeniu)', async () => {
    let answer: (saved: boolean) => void = () => undefined
    const onCommit = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)))
    const m = await mount('abc', { onCommit })
    await m.type('d')
    await m.blur()
    await m.type('e')
    await act(async () => {
      answer(false)
      await Promise.resolve()
    })
    expect(m.editor.getText()).toBe('abcde')
    await m.blur()
    expect(onCommit).toHaveBeenLastCalledWith('abcde')
  })

  it('zapis przyjęty: nic nie jest cofane', async () => {
    const m = await mount('abc', { onCommit: () => Promise.resolve(true) })
    await m.type('d')
    await m.blur()
    await act(async () => void (await Promise.resolve()))
    expect(m.editor.getText()).toBe('abcd')
  })

  it('Esc wraca do ostatnio zapisanego tekstu, nie do propa (ten spóźnia się po zapisie)', async () => {
    const m = await mount('abc')
    await m.type('d')
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledWith('abcd')
    // The prop still says „abc” (the store has not answered yet); the next edit thrown away goes back to what was saved.
    await m.type('e')
    expect(m.editor.getText()).toBe('abcde')
    await m.esc()
    expect(m.editor.getText()).toBe('abcd')
  })

  it('Ctrl Z nie przywraca tekstu sprzed zmiany z innego komputera ani porzuconego Esc', async () => {
    const m = await mount('a')
    await act(async () => {
      root!.render(createElement(NoteEditor, { value: 'zdalnie', onCommit: m.onCommit, olderComputers: [] }))
    })
    expect(m.editor.getText()).toBe('zdalnie')
    act(() => void m.editor.commands.undo())
    expect(m.editor.getText()).toBe('zdalnie')
    await m.type('X')
    await m.esc()
    expect(m.editor.getText()).toBe('zdalnie')
    act(() => void m.editor.commands.undo())
    expect(m.editor.getText()).toBe('zdalnie')
  })

  it('wartość z zewnątrz wchodzi także wtedy, gdy jej zapis Markdown przekracza limit (filtr limitu jej nie dotyczy)', async () => {
    const m = await mount('a')
    act(() => loadNote(m.editor, '__x__ '.repeat(1700)))
    expect(m.editor.getMarkdown().length).toBeGreaterThan(NOTE_MAX)
  })
})

describe('adres linku bez schematu (T663)', () => {
  it('„localhost:3000” i „example.com:8080/x” dostają https://, znane schematy zostają i są odrzucane dalej', () => {
    expect(withScheme('localhost:3000')).toBe('https://localhost:3000')
    expect(withScheme('example.com:8080/x')).toBe('https://example.com:8080/x')
    expect(withScheme('example.com')).toBe('https://example.com')
    expect(withScheme('http://a.b')).toBe('http://a.b')
    for (const u of ['mailto:a@b.c', 'javascript:alert(1)', 'file:///C:/x', 'ftp://a.b', 'data:text/html,x']) expect(withScheme(u)).toBe(u)
  })
})

describe('jedna instancja marked na edytor', () => {
  it('kolejne edytory nie dokładają tokenizerów do wcześniejszych', () => {
    const count = (e: Editor) => ((e.markdown as unknown as { markedInstance: { defaults: { extensions?: unknown[] | null } } }).markedInstance.defaults.extensions ?? []).length
    const first = new Editor({ extensions: noteExtensions(), content: 'a', contentType: 'markdown' })
    const before = count(first)
    for (let i = 0; i < 3; i++) new Editor({ extensions: noteExtensions(), content: 'b', contentType: 'markdown' }).destroy()
    expect(count(first)).toBe(before)
    first.destroy()
  })
})


describe('„Powiększ” (T665)', () => {
  it('ten sam edytor na całe okno: tekst niezapisany zostaje, Esc wraca bez cofania zmian', async () => {
    const m = await mount('abc')
    await m.type('d')
    const expand = m.host.querySelector<HTMLButtonElement>('[data-testid="note-expand"]')!
    expect(expand.textContent).toBe('Powiększ')
    await act(async () => expand.click())
    expect(m.host.querySelector('[data-testid="note-editor"]')!.getAttribute('role')).toBe('dialog')
    expect(m.host.querySelector('[data-testid="block-note"]')).toBe(m.el)
    expect(m.editor.getText()).toBe('abcd')
    expect(expand.textContent).toBe('Pomniejsz')
    await m.esc()
    expect(m.host.querySelector('[data-testid="note-editor"]')!.getAttribute('role')).toBeNull()
    expect(m.editor.getText()).toBe('abcd')
    expect(m.onCommit).not.toHaveBeenCalled()
  })
})

describe('licznik i ostrzeżenie pod notatką (T664)', () => {
  it('licznik „x z 10 000” dopiero od 9000 znaków', async () => {
    const short = await mount('x'.repeat(8999))
    expect(short.host.querySelector('[data-testid="note-counter"]')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const long = await mount('x'.repeat(9000))
    expect(long.host.querySelector('[data-testid="note-counter"]')!.textContent).toBe(ofLabel(9000, NOTE_MAX))
  })

  it('ostrzeżenie z nazwą komputera ze starszą wersją, tylko dla notatki powyżej 2000 znaków', async () => {
    const calm = await mount('x'.repeat(2000), { older: ['Biuro'] })
    expect(calm.host.querySelector('[data-testid="note-warning"]')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const warned = await mount('x'.repeat(2001), { older: ['Biuro'] })
    expect(warned.host.querySelector('[data-testid="note-warning"]')!.textContent).toBe('Notatka ma ponad 2000 znaków – na komputerze Biuro ze starszą wersją aplikacji zostanie obcięta.')
    act(() => root?.unmount())
    host?.remove()
    const none = await mount('x'.repeat(5000))
    expect(none.host.querySelector('[data-testid="note-warning"]')).toBeNull()
  })
})

describe('zapis nie obcina tego, co coś znaczy (D)', () => {
  it('pusty ostatni checkbox „- [ ] ” przeżywa zapis (spacja po ] zostaje)', async () => {
    const m = await mount('- [x] a\n- [ ] ')
    act(() => void m.editor.view.dispatch(m.editor.state.tr.insertText('X', 3)))
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledWith('- [x] Xa\n- [ ] ')
  })

  it('końcowe znaki nowej linii nadal znikają', async () => {
    const m = await mount('a')
    act(() => void m.editor.commands.insertContentAt(m.editor.state.doc.content.size, { type: 'paragraph' }))
    act(() => void m.editor.view.dispatch(m.editor.state.tr.insertText('b', 2)))
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledWith('ab')
  })
})

describe('link w notatce (I)', () => {
  it('kliknięcie otwiera adres przez openLink; odrzucenie przez main daje komunikat', async () => {
    const openLink = vi.fn(() => Promise.reject(new Error('odmowa')))
    ;(window as unknown as { rd: { openLink: typeof openLink } }).rd = { openLink }
    const m = await mount('[strona](https://example.com/a)')
    const a = m.el.querySelector<HTMLAnchorElement>('a[href]')!
    await act(async () => {
      a.click()
      await Promise.resolve()
    })
    expect(openLink).toHaveBeenCalledWith('https://example.com/a')
    await act(async () => void (await Promise.resolve()))
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Nie udało się otworzyć linku.')
  })

  it('adres innego protokołu nie idzie do openLink', async () => {
    const openLink = vi.fn(() => Promise.resolve())
    ;(window as unknown as { rd: { openLink: typeof openLink } }).rd = { openLink }
    const m = await mount('[m](mailto:a@b.c) [f](ftp://a.b)')
    for (const a of m.el.querySelectorAll<HTMLAnchorElement>('a[href]')) await act(async () => void a.click())
    expect(openLink).not.toHaveBeenCalled()
  })
})

describe('„Powiększ”: Tab nie wychodzi z nakładki (H)', () => {
  const tab = (target: Element, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
    act(() => void target.dispatchEvent(e))
    return e
  }

  it('z ostatniego elementu wraca do pierwszego, Shift+Tab z pierwszego idzie do ostatniego', async () => {
    const m = await mount('abc')
    await act(async () => m.host.querySelector<HTMLButtonElement>('[data-testid="note-expand"]')!.click())
    const items = Array.from(m.host.querySelector('[data-testid="note-editor"]')!.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [contenteditable="true"]'))
    expect(items.length).toBeGreaterThan(3)
    const first = items[0]!
    const last = items.at(-1)!
    expect(last).toBe(m.el)
    act(() => last.focus())
    expect(document.activeElement).toBe(last)
    expect(tab(last).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    expect(tab(first, true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    // In the middle the browser's own step goes on.
    act(() => items[1]!.focus())
    expect(tab(items[1]!).defaultPrevented).toBe(false)
  })

  it('bez powiększenia Tab nie jest przechwytywany', async () => {
    const m = await mount('abc')
    act(() => m.el.focus())
    expect(tab(m.el).defaultPrevented).toBe(false)
  })
})
