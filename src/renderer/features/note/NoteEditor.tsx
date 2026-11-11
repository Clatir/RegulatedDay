/**
 * The note of a block as a live Markdown editor (D388): the formatting shows while you write. It saves like every field of
 * the window (spec „Edycja pól”, T662): on leaving it, with Ctrl+S and before a change of screen or day (`commitActiveField`
 * blurs it); Esc throws away what was not saved (the next Esc closes what is around); a click on a check box saves at once;
 * Enter is a new line, never a save. A note that was only opened is never written (`dirty` says whether you changed it).
 * „Powiększ” makes the same editor the whole window (no move in the page – the cursor and the unsaved text stay), Esc or
 * „Pomniejsz” brings it back with the text.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { ofLabel } from '@shared/format'
import { NOTE_COUNTER_FROM, NOTE_MAX, longNoteWarning } from '@shared/model/note'
import { safeLinkUrl } from '@shared/noteLink'
import { cx } from '../../components/ui'
import { handleEscape, onModal, tabTarget, topModal, useEscapeLayer } from '../../lib/escape'
import { toast } from '../../store/ui'
import { loadNote, noteExtensions, noteMarkdown } from './noteMarkdown'

/**
 * What was typed as the address of a link, with its scheme: „localhost:3000” and „example.com:8080/x” have none (https is
 * added); a scheme is „x://” or one of the known ones (mailto:, javascript:, file: … – refused afterwards).
 */
export const withScheme = (text: string): string => (/^(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|javascript|file|data|tel|ftp|sms|vbscript|blob|about):)/i.test(text) ? text : `https://${text}`)

/** What Tab goes through in the note that fills the window: its buttons and the text. */
const TABBABLE = 'button:not([disabled]), input:not([disabled]), [contenteditable="true"]'

const EDITOR_PROPS = { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Notatka', spellcheck: 'false', class: 'rd-note', 'data-testid': 'block-note' } }

function Tool({ label, title, active, onClick, testId }: { label: ReactNode; title: string; active?: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active ?? false}
      data-testid={testId}
      // The mouse goes to the button without taking the focus from the text (the selection stays).
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx('h-[24px] min-w-[26px] rounded border px-1.5 text-[12px] leading-none', active ? 'border-lamp/60 bg-lamp-soft text-lamp' : 'border-line-strong bg-raised text-fg hover:bg-hover')}
    >
      {label}
    </button>
  )
}

export function NoteEditor({ value, onCommit, olderComputers, readOnly }: { value: string; onCommit: (note: string) => void | Promise<boolean>; olderComputers: readonly string[]; readOnly?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [length, setLength] = useState(value.length)
  const [link, setLink] = useState<string | null>(null)
  // The saved note the editor shows (what it was opened with, what it saved last); `dirty`: changed since.
  const base = useRef(value)
  const dirty = useRef(false)
  const latest = useRef({ value, onCommit })
  latest.current = { value, onCommit }
  const wrap = useRef<HTMLDivElement>(null)

  const extensions = useMemo(noteExtensions, [])
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    editorProps: EDITOR_PROPS,
    onUpdate: ({ editor: e, transaction }) => {
      // Only a change of the text is an edit (setEditable and the like also announce an update).
      if (!transaction.docChanged) return
      dirty.current = true
      setLength(noteMarkdown(e).length)
    },
    onBlur: () => commit()
  })

  /** The editor shows `text` again as the saved note (not an edit: no step of Ctrl Z, no update). */
  const show = (text: string) => {
    if (!editor || editor.isDestroyed) return
    loadNote(editor, text)
    base.current = text
    dirty.current = false
    setLength(text.length)
  }

  /**
   * Saves the note when it changed: the whole text as it is now (the latest value of quick clicks, T517 in the store). A save
   * that was refused (the store says so and the window tells why) puts back what the note was, as a field does – unless you
   * went on writing meanwhile.
   */
  const commit = () => {
    if (!editor || editor.isDestroyed || !dirty.current) return
    dirty.current = false
    // Only the line breaks at the end go: a space there may be the one of an empty check box („- [ ] ”).
    const text = noteMarkdown(editor).replace(/\n+$/, '')
    base.current = text
    if (text === latest.current.value) return
    const refused = () => {
      if (!dirty.current && base.current === text) show(latest.current.value)
    }
    void Promise.resolve(latest.current.onCommit(text)).then((saved) => saved === false && refused(), refused)
  }

  // A change that came from elsewhere (another computer, the history) while there is nothing of yours unsaved.
  useEffect(() => {
    if (!editor || editor.isDestroyed || dirty.current || value === base.current) return
    show(value)
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!readOnly, false)
  }, [editor, readOnly])

  // A click on a check box saves at once: after the box changed the note (its own handler runs first, on the box).
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') commit()
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  })

  // „Powiększ”: the pages' shortcuts wait while the note fills the window, like for a dialog.
  useEscapeLayer(expanded, () => setExpanded(false))
  useEffect(() => {
    if (!expanded) return
    const modal = onModal()
    // Tab stays inside the note while it fills the window (A6-21, as in a dialog): after the editor's own keys (a list takes
    // Tab to go a level deeper), from the last element to the first, Shift+Tab the other way.
    const onKey = (e: globalThis.KeyboardEvent) => {
      const box = wrap.current
      if (e.key !== 'Tab' || e.defaultPrevented || !box || topModal() !== modal.id) return
      const items = Array.from(box.querySelectorAll<HTMLElement>(TABBABLE))
      const active = document.activeElement
      const to = tabTarget(items.length, active instanceof HTMLElement ? items.indexOf(active) : -1, e.shiftKey)
      if (to == null) return
      e.preventDefault()
      ;(items[to] ?? box).focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      modal.off()
    }
  }, [expanded])
  // The text takes the focus when the note changes size (not when the panel opens: it never takes it by itself).
  const sized = useRef(expanded)
  useEffect(() => {
    if (sized.current === expanded) return
    sized.current = expanded
    if (editor && !editor.isDestroyed && !readOnly) editor.commands.focus()
  }, [editor, expanded, readOnly])

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? { bold: e.isActive('bold'), italic: e.isActive('italic'), strike: e.isActive('strike'), h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }), bullets: e.isActive('bulletList'), numbers: e.isActive('orderedList'), tasks: e.isActive('taskList'), quote: e.isActive('blockquote'), code: e.isActive('codeBlock'), link: e.isActive('link'), href: String(e.getAttributes('link').href ?? '') }
        : null
  })

  // ProseMirror takes every Esc as its own (it prevents the default), so the window's listener would skip it: the editor
  // handles it before ProseMirror – throws away what was not saved, otherwise passes it to the layers of the window.
  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !editor) return
    e.stopPropagation()
    e.preventDefault()
    if (expanded || !dirty.current) {
      handleEscape()
      return
    }
    // The first Esc only throws away what was not saved; the next one goes to whatever is around.
    show(base.current)
    editor.commands.blur()
  }

  // A link is not an edit: the mouse goes to the address (no caret in the same move), the browser opens it (T663).
  const linkOf = (e: MouseEvent): HTMLAnchorElement | null => (e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null)
  const onLinkDown = (e: MouseEvent) => {
    if (e.button === 0 && linkOf(e)) e.preventDefault()
  }
  const onLinkClick = (e: MouseEvent) => {
    const a = linkOf(e)
    if (!a) return
    e.preventDefault()
    const url = safeLinkUrl(a.getAttribute('href') ?? '')
    if (url) void window.rd.openLink(url).catch(() => toast('Nie udało się otworzyć linku.', 'error', 5000))
  }

  const applyLink = (text: string) => {
    if (!editor) return
    const trimmed = text.trim()
    if (!trimmed) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const href = safeLinkUrl(withScheme(trimmed))
      if (!href) {
        toast('Link musi zaczynać się od http:// albo https://.', 'error', 5000)
        return
      }
      if (editor.state.selection.empty && !editor.isActive('link')) editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
      else editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setLink(null)
  }

  const warning = longNoteWarning(olderComputers, length)
  const act = (fn: (c: ReturnType<NonNullable<typeof editor>['chain']>) => { run: () => boolean }) => () => {
    if (editor) fn(editor.chain().focus()).run()
  }

  return (
    <div
      ref={wrap}
      className={cx('flex flex-col gap-1.5', expanded && 'rd-note-expanded fixed inset-0 z-50 bg-bg p-6')}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? 'Notatka na całe okno' : undefined}
      data-testid="note-editor"
    >
      <div className={cx('flex min-h-0 flex-1 flex-col gap-1.5', expanded && 'mx-auto w-full max-w-[860px]')}>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-auto text-[12.5px] leading-snug text-muted">Notatka</span>
          {!readOnly && state && (
            <>
              <Tool label={<b>B</b>} title="Pogrubienie (Ctrl B)" active={state.bold} onClick={act((c) => c.toggleBold())} testId="note-bold" />
              <Tool label={<i>I</i>} title="Kursywa (Ctrl I)" active={state.italic} onClick={act((c) => c.toggleItalic())} />
              <Tool label={<s>S</s>} title="Przekreślenie" active={state.strike} onClick={act((c) => c.toggleStrike())} />
              <Tool label="H1" title="Nagłówek 1" active={state.h1} onClick={act((c) => c.toggleHeading({ level: 1 }))} />
              <Tool label="H2" title="Nagłówek 2" active={state.h2} onClick={act((c) => c.toggleHeading({ level: 2 }))} />
              <Tool label="H3" title="Nagłówek 3" active={state.h3} onClick={act((c) => c.toggleHeading({ level: 3 }))} />
              <Tool label="•" title="Lista punktowana" active={state.bullets} onClick={act((c) => c.toggleBulletList())} />
              <Tool label="1." title="Lista numerowana" active={state.numbers} onClick={act((c) => c.toggleOrderedList())} />
              <Tool label="☐" title="Pola wyboru" active={state.tasks} onClick={act((c) => c.toggleTaskList())} testId="note-tasks" />
              <Tool label="”" title="Cytat" active={state.quote} onClick={act((c) => c.toggleBlockquote())} />
              <Tool label="</>" title="Blok kodu" active={state.code} onClick={act((c) => c.toggleCodeBlock())} />
              <Tool label="Link" title="Link (http lub https)" active={state.link} onClick={() => setLink(link == null ? state.href : null)} />
            </>
          )}
          <button
            type="button"
            className="h-[24px] rounded border border-line-strong bg-raised px-2 text-[12px] leading-none text-fg hover:bg-hover"
            // Without taking the focus: the unsaved text and the cursor stay where they are.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded(!expanded)}
            data-testid="note-expand"
          >
            {expanded ? 'Pomniejsz' : 'Powiększ'}
          </button>
        </div>
        {link != null && (
          <input
            className="input"
            value={link}
            placeholder="https://…"
            aria-label="Adres linku"
            autoFocus
            spellCheck={false}
            onChange={(e) => setLink(e.currentTarget.value)}
            onBlur={() => setLink(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink(e.currentTarget.value)
              if (e.key === 'Escape') {
                e.stopPropagation()
                e.preventDefault()
                setLink(null)
                editor?.commands.focus()
              }
            }}
            data-testid="note-link-input"
          />
        )}
        <div className={cx(expanded ? 'flex min-h-0 flex-1 flex-col' : 'max-h-[320px] overflow-y-auto rounded')} onKeyDownCapture={onKeyDownCapture} onMouseDownCapture={onLinkDown} onClick={onLinkClick}>
          <EditorContent editor={editor} className={cx(expanded && 'flex min-h-0 flex-1 flex-col [&>div]:min-h-0 [&>div]:flex-1')} />
        </div>
        {length >= NOTE_COUNTER_FROM && (
          <p className={cx('num text-right text-[11px]', length >= NOTE_MAX ? 'text-rose' : 'text-muted')} data-testid="note-counter">
            {ofLabel(length, NOTE_MAX)}
          </p>
        )}
        {warning && (
          <p className="text-[12px] leading-snug text-lamp" data-testid="note-warning">
            {warning}
          </p>
        )}
      </div>
    </div>
  )
}
