/**
 * Del removes the selected element (D462): a click selects (the element takes the focus – `deleteMark`, ringed as the selected
 * block of the axis), Del asks „Usunąć „…”?” (Enter – Usuń, Esc – Anuluj) and then runs what the element's own button runs, so the
 * „Cofnij” and the series' scope question follow as from the button. Nothing happens while the focus is in a field to type in
 * (Del erases text there), while a dialog is open, or with a modifier. Three ways to say what Del removes:
 * - `deleteMark(prefix, id)` on the element, `useDeleteResolver(prefix, fn)` in the screen that knows the element (a list's rows);
 * - `useDeleteSelected(target)` for a screen whose selection is its own state (the panel is open for the block, the focus
 *   gone to the page) – used when the focus is on no marked element.
 * The newest registration answers; a resolver answering null means „nothing to remove here” (the focus on a row not selected).
 * The answer is read twice: at the keypress (is there a question to ask) and once confirmed (what is removed – as it is then).
 */
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { modalOpen } from './escape'

export interface DeleteTarget {
  /** The question of the dialog – the wording of the element's own button („Usunąć „X”?”, „Odwołać „X” na ten dzień?”). */
  title: string
  /** The confirming button: the word of the element's own button („Usuń”, „Odwołaj”). */
  yes?: string
  /** The removal asks by itself (a block of a series: its scope question) – no second question. */
  asked?: boolean
  /** The very code of the element's own button. */
  run: () => unknown
}

/** `Usunąć „X”?` with the button „Usuń”. */
export const removeTarget = (name: string, run: () => unknown, asked = false): DeleteTarget => ({ title: `Usunąć „${name}”?`, yes: 'Usuń', asked, run })

/** An element Del can remove: marked, and focusable by a click (tabIndex −1 – never reached by Tab). */
export const deleteMark = (prefix: string, id: string): { 'data-del': string; tabIndex: -1 } => ({ 'data-del': `${prefix}:${id}`, tabIndex: -1 })

/** The ring of a selected (focused) element, the same as the block of the axis. */
export const DEL_RING = 'outline-none focus:ring-1 focus:ring-lamp'

type Resolver = (id: string) => DeleteTarget | null
interface Entry<T> {
  id: number
  get: () => T
}
let nextId = 1
const resolvers = new Map<string, Array<Entry<Resolver | null>>>()
const selected: Array<Entry<DeleteTarget | null>> = []

/** The screen answers what a marked element of `prefix` removes (null: not removable now). */
export function useDeleteResolver(prefix: string, resolve: Resolver): void {
  const ref = useRef(resolve)
  ref.current = resolve
  useEffect(() => {
    const entry: Entry<Resolver | null> = { id: nextId++, get: () => ref.current }
    resolvers.set(prefix, [...(resolvers.get(prefix) ?? []), entry])
    return () => {
      const rest = (resolvers.get(prefix) ?? []).filter((e) => e.id !== entry.id)
      if (rest.length) resolvers.set(prefix, rest)
      else resolvers.delete(prefix)
    }
  }, [prefix])
}

/** The element the screen has selected (null: none) – removed by Del when the focus is on no marked element. */
export function useDeleteSelected(target: DeleteTarget | null): void {
  const ref = useRef(target)
  ref.current = target
  const on = target != null
  useEffect(() => {
    if (!on) return
    const entry: Entry<DeleteTarget | null> = { id: nextId++, get: () => ref.current }
    selected.push(entry)
    return () => {
      const i = selected.findIndex((e) => e.id === entry.id)
      if (i >= 0) selected.splice(i, 1)
    }
  }, [on])
}

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color', 'range'])

/** The focus is where Del erases text (or changes a value): a field, a list, the note's editor. */
export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') return !NOT_TEXT.has((el as HTMLInputElement).type)
  return el.isContentEditable === true || el.closest('[contenteditable=""], [contenteditable="true"], .ProseMirror') != null
}

/** What the screen answers for the marked element `key` („prefix:id”) – the newest resolver that knows it. */
function markedTarget(key: string): DeleteTarget | null {
  const at = key.indexOf(':')
  const entries = resolvers.get(key.slice(0, at)) ?? []
  for (const e of [...entries].reverse()) {
    const t = e.get()?.(key.slice(at + 1))
    if (t) return t
  }
  return null
}

/** The target and who answers it: the marked element (`mark:` its key) or the screen's selection (`entry:` its registration). */
function found(from: EventTarget | null): { target: DeleteTarget; source: string } | null {
  const marked = from instanceof Element ? from.closest('[data-del]') : null
  if (marked) {
    const key = marked.getAttribute('data-del') ?? ''
    const target = markedTarget(key)
    return target ? { target, source: `mark:${key}` } : null
  }
  for (const e of [...selected].reverse()) {
    const target = e.get()
    if (target) return { target, source: `entry:${e.id}` }
  }
  return null
}

/** The target of `source` as the screen answers now; null – gone, or another selection answers first (another element). */
function foundAgain(source: string): DeleteTarget | null {
  if (source.startsWith('mark:')) return markedTarget(source.slice('mark:'.length))
  for (const e of [...selected].reverse()) {
    const target = e.get()
    if (target) return `entry:${e.id}` === source ? target : null
  }
  return null
}

/** What Del removes with the focus on `from`: the marked element it is in, else the screen's selection; null – nothing. */
export function deleteTargetOf(from: EventTarget | null): DeleteTarget | null {
  return found(from)?.target ?? null
}

interface Ask {
  title: string
  yes: string
  resolve: (ok: boolean) => void
}
export const useDeleteAsk = create<{ ask: Ask | null }>(() => ({ ask: null }))

/** Shows the question; a question already open is answered „no” first. */
export function askDelete(title: string, yes = 'Usuń'): Promise<boolean> {
  return new Promise((resolve) => {
    useDeleteAsk.getState().ask?.resolve(false)
    useDeleteAsk.setState({ ask: { title, yes, resolve } })
  })
}

/**
 * Del of the window: asks (unless the removal asks itself) and runs the removal. The question may stand long: once confirmed,
 * the target is read again – its `run` is the element's as it is now (a block started meanwhile ends its timer, D336), not the
 * one of the keypress. Gone meanwhile (or another selection answers) – nothing; its words changed – asked again with them.
 */
export async function deleteSelected(from: EventTarget | null): Promise<boolean> {
  const first = found(from)
  if (!first) return false
  let t = first.target
  while (!t.asked) {
    const { title, yes } = t
    if (!(await askDelete(title, yes))) return true
    const now = foundAgain(first.source)
    if (!now) return true
    t = now
    if (now.title === title && (now.yes ?? 'Usuń') === (yes ?? 'Usuń')) break
  }
  await t.run()
  return true
}

/** The window's one listener of Del; the answer takes it away again (the tests). */
export function installDeleteKey(): () => void {
  const listener = (e: KeyboardEvent) => {
    if (e.key !== 'Delete' || e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || modalOpen()) return
    if (isEditable(e.target)) return
    if (!deleteTargetOf(e.target)) return
    e.preventDefault()
    void deleteSelected(e.target)
  }
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
}

/** The window's Del (`App.tsx`). */
export function useDeleteKey(): void {
  useEffect(() => installDeleteKey(), [])
}
