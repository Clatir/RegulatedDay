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
import { NOTE_COUNTER_FROM, NOTE_MAX, longNoteWarning } from '@shared/model/note'
import { safeLinkUrl } from '@shared/noteLink'
import { cx } from '../../components/ui'
import { handleEscape, onModal, useEscapeLayer } from '../../lib/escape'
import { toast } from '../../store/ui'
import { noteExtensions } from './noteMarkdown'

/** „x z 10 000” – thousands apart. */
const spaced = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

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

export function NoteEditor({ value, onCommit, olderComputers, readOnly }: { value: string; onCommit: (note: string) => void; olderComputers: readonly string[]; readOnly?: boolean }) {
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
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Notatka', spellcheck: 'false', class: 'rd-note', 'data-testid': 'block-note' }
    },
    onUpdate: ({ editor: e, transaction }) => {
      // Only a change of the text is an edit (setEditable and the like also announce an update).
      if (!transaction.docChanged) return
      dirty.current = true
      setLength(e.getMarkdown().length)
    },
    onBlur: () => commit()
  })

  /** Saves the note when it changed: the whole text as it is now (the latest value of quick clicks, T517 in the store). */
  const commit = () => {
    if (!editor || editor.isDestroyed || !dirty.current) return
    dirty.current = false
    const text = editor.getMarkdown().replace(/\s+$/, '')
    base.current = text
    if (text !== latest.current.value) latest.current.onCommit(text)
  }

  // A change that came from elsewhere (another computer, the history) while there is nothing of yours unsaved.
  useEffect(() => {
    if (!editor || editor.isDestroyed || dirty.current || value === base.current) return
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    base.current = value
    setLength(value.length)
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
    return modal.off
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
    dirty.current = false
    editor.commands.setContent(latest.current.value, { contentType: 'markdown', emitUpdate: false })
    base.current = latest.current.value
    setLength(latest.current.value.length)
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
    if (url) void window.rd.openLink(url)
  }

  const applyLink = (text: string) => {
    if (!editor) return
    const trimmed = text.trim()
    if (!trimmed) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const href = safeLinkUrl(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`)
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
            {spaced(length)} z {spaced(NOTE_MAX)}
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
