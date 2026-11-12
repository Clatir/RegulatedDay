/**
 * Files and links brought to a block from outside the window (SNT4, D410): dropped from the Explorer or a browser onto the
 * block's panel or its tile on the axis, pasted with Ctrl V. Files are named by their paths (`window.rd.pathForFile` – the
 * File object has none of its own); a link is an address from `text/uri-list` or the plain text. The window never navigates
 * to a dropped file (the main window refuses every `will-navigate`).
 */
import { useRef, useState, type DragEvent, type HTMLAttributes } from 'react'
import { linkFromInput, type AttachmentOwner } from '@shared/model/attachment'
import { modalOpen } from '../../lib/escape'
import { addLink, attachFiles } from '../../store/attachments'
import { toast } from '../../store/ui'

export const NO_PATH_TEXT = 'Nie da się dołączyć tego, co przeciągnięto – brak pliku na dysku ani adresu.'

/** The transfer may hold a file or a link (known before the drop, from its types alone). */
export function attachable(dt: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  if (!dt) return false
  const types = Array.from(dt.types ?? [])
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')
}

/** The transfer carries files themselves (a drop of text is judged apart – it is never taken from a field that holds text). */
export const hasFiles = (dt: Pick<DataTransfer, 'types'> | null | undefined): boolean => Array.from(dt?.types ?? []).includes('Files')

/** A field that holds text (its own paste and drop stay): an input, a textarea, a select, an editor of the note. */
export function textTarget(t: EventTarget | null): boolean {
  const el = t as Partial<HTMLElement> | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') != null
}

/** The address a transfer carries as a link: the first line of its `text/uri-list` (no comments), else a one-line plain text; null – none. */
export function addressOf(dt: Pick<DataTransfer, 'getData'>): string | null {
  const list = dt.getData('text/uri-list')
  const uri = list
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  if (uri) return uri
  const text = dt.getData('text/plain').trim()
  return text && !/[\r\n]/.test(text) ? text : null
}

/** The paths of files the transfer holds (those without a path – a picture dragged out of a page – are left out). */
export function pathsOf(files: Iterable<File>): string[] {
  return [...files].map((f) => window.rd.pathForFile(f)).filter(Boolean)
}

/** What a drop or a paste brings to the block of `owner`: its files, else its link. True when something was taken. */
export async function attachTransfer(owner: AttachmentOwner, dt: Pick<DataTransfer, 'getData' | 'files'>): Promise<boolean> {
  const files = Array.from(dt.files ?? [])
  const paths = pathsOf(files)
  if (paths.length) {
    await attachFiles(owner, paths)
    return true
  }
  const address = addressOf(dt)
  if (address) {
    await addLink(owner, address)
    return true
  }
  if (files.length) toast(NO_PATH_TEXT, 'error', 6000)
  return files.length > 0
}

/**
 * Ctrl V over a block's panel, outside a field that holds text (D410): files of the clipboard (when they give paths), else an
 * address as a link; any other text is left alone (nothing is said). True when the paste was taken (the caller cancels it).
 */
export function pasteTransfer(owner: AttachmentOwner, e: Pick<ClipboardEvent, 'clipboardData' | 'target' | 'defaultPrevented'>): boolean {
  const dt = e.clipboardData
  if (!dt || e.defaultPrevented || textTarget(e.target) || modalOpen()) return false
  const hasPaths = pathsOf(Array.from(dt.files ?? [])).length > 0
  const address = addressOf(dt)
  if (!hasPaths && !(address && linkFromInput(address))) return false
  void attachTransfer(owner, dt)
  return true
}

/**
 * A place that takes files and links dropped on it (D410): `bind` goes on its element, `over` says a drop is above it (the
 * place is lit). `owner` null – nothing takes a drop (no block). `dragover` is cancelled only for a file or a link – text
 * dragged within a field stays the field's.
 */
export function useAttachDrop(owner: AttachmentOwner | null): { over: boolean; bind: Pick<HTMLAttributes<HTMLElement>, 'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'> } {
  const [over, setOver] = useState(false)
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const takes = (e: DragEvent): boolean => ownerRef.current != null && attachable(e.dataTransfer) && (hasFiles(e.dataTransfer) || !textTarget(e.target))
  const enter = (e: DragEvent) => {
    if (!takes(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setOver(true)
  }
  return {
    over,
    bind: {
      onDragEnter: enter,
      onDragOver: enter,
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      },
      onDrop: (e) => {
        setOver(false)
        const o = ownerRef.current
        if (!o || e.defaultPrevented || !takes(e)) return
        e.preventDefault()
        void attachTransfer(o, e.dataTransfer)
      }
    }
  }
}
