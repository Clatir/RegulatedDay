/**
 * The „Załączniki” section of a block's panel (SNT4, D410): the files and links of the block as the day, the template's block
 * or the series shows them (`attachmentsOfBlock`) – each with its icon or thumbnail, name and size or domain; a click opens it.
 * „Dołącz plik…” (the dialog of Windows, in the main process), „Dodaj link” (an address, Enter adds, Esc closes), „Otwórz
 * wszystko (N)” from two on. Files and links dropped on the panel or pasted (Ctrl V outside a field of text) come here too
 * (`attachDrop`). A day's block shows the template's and the series' attachments as well, tagged: those are changed where
 * they belong (T811). A removal has its „Cofnij” in a toast (the window's way).
 */
import { useEffect, useRef, useState } from 'react'
import { attachmentsOfBlock, ATTACHMENT_NAME_MAX, type Attachment, type AttachmentOwner, type BlockPlace } from '@shared/model/attachment'
import type { PlanBlock } from '@shared/model/plan'
import { TextField } from '../../components/fields'
import { cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useEscapeLayer } from '../../lib/escape'
import { addLink, openAllAttachments, openAttachment, pickFiles, removeAttachments, renameAttachment, restoreAttachments, showAttachment } from '../../store/attachments'
import { useData } from '../../store/data'
import { undoToast } from '../../store/ui'
import { FileIcon, GlobeIcon } from './AttachmentIcon'
import { fileKind, isOwnHere, KIND_LABEL, MISSING_NOTE, originTag, PROGRAM_NOTE, sizeText } from './attachView'
import { pasteTransfer } from './attachDrop'

/** Thumbnails already made (they never change: an attachment's file is never rewritten) – the panel opens with them at once. */
const THUMBS = new Map<string, string>()

/** The thumbnail of an image attachment, loaded when it is shown (null – none yet: the icon stands in). */
function useThumb(id: string, wanted: boolean, missing: boolean): string | null {
  const [url, setUrl] = useState<string | null>(THUMBS.get(id) ?? null)
  useEffect(() => {
    if (!wanted) return
    const have = THUMBS.get(id)
    if (have) {
      setUrl(have)
      return
    }
    let live = true
    void window.rd
      .attachmentThumb(id)
      .then((v) => {
        if (v) THUMBS.set(id, v)
        if (live) setUrl(v)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id, wanted, missing])
  return wanted ? url : null
}

function AttachmentRow({ a, place }: { a: Attachment; place: BlockPlace }) {
  const missing = useData((s) => s.attachmentsMissing).has(a.id)
  const [renaming, setRenaming] = useState(false)
  const [shown, setShown] = useState(false)
  const [busy, run] = useBusy()
  const rename = useRef<HTMLDivElement>(null)
  useEscapeLayer(renaming, () => setRenaming(false))
  useEffect(() => {
    if (renaming) rename.current?.querySelector('input')?.focus()
  }, [renaming])
  const own = isOwnHere(a, place)
  const tag = originTag(a, place)
  const file = a.file
  const kind = file ? fileKind(file.fileName, file.ext) : null
  const thumb = useThumb(a.id, kind === 'image' && !missing, missing)
  const program = kind === 'program' || shown
  const meta = file ? sizeText(file.size) : a.link && a.link.domain !== a.name ? a.link.domain : ''
  const open = () =>
    run(async () => {
      const r = await openAttachment(a.id)
      if (r.how === 'shown') setShown(true)
    })
  const remove = () =>
    run(async () => {
      const undo = await removeAttachments([a.id])
      if (undo) undoToast(`Usunięto załącznik „${a.name}”`, () => void restoreAttachments(undo))
    })
  return (
    <li className="flex flex-col gap-1 rounded border border-line bg-raised px-2 py-1.5" data-testid="attachment" data-name={a.name} data-kind={a.kind} data-missing={missing ? 'true' : undefined}>
      <div className="flex items-center gap-2">
        {renaming ? (
          <div ref={rename} className="min-w-0 flex-1" onBlur={() => setRenaming(false)}>
            <TextField
              value={a.name}
              max={ATTACHMENT_NAME_MAX}
              onCommit={(name) => void renameAttachment(a.id, name)}
              className="w-full text-[12.5px]"
              shellClassName="w-full"
              errorPlacement="below"
              aria-label="Nazwa załącznika"
              data-testid="attachment-rename-input"
            />
          </div>
        ) : (
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => void open()} disabled={busy} title={a.link?.url ?? file?.fileName} data-testid="attachment-open">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm text-muted">
              {thumb ? (
                <img src={thumb} alt="" className="max-h-8 max-w-8 object-contain" data-testid="attachment-thumb" />
              ) : a.link ? (
                a.link.iconDataUrl ? (
                  <img src={a.link.iconDataUrl} alt="" className="h-5 w-5 object-contain" data-testid="attachment-site-icon" />
                ) : (
                  <GlobeIcon />
                )
              ) : (
                <FileIcon kind={kind ?? 'other'} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-fg" data-testid="attachment-name">
                {a.name}
              </span>
              <span className="block truncate text-[11px] text-muted" data-testid="attachment-meta">
                {[kind && kind !== 'other' ? KIND_LABEL[kind] : null, meta].filter(Boolean).join(' · ') || ' '}
              </span>
            </span>
          </button>
        )}
      </div>
      {tag && (
        <span className="text-[11px] text-muted" data-testid="attachment-origin">
          {tag}
        </span>
      )}
      {missing && (
        <span className="text-[11px] text-lamp" role="status" data-testid="attachment-note">
          {MISSING_NOTE}
        </span>
      )}
      {program && !missing && (
        <span className="text-[11px] text-lamp" role="status" data-testid="attachment-note">
          {PROGRAM_NOTE}
        </span>
      )}
      {own && !renaming && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
          <button type="button" className="hover:text-fg" onClick={() => setRenaming(true)} data-testid="attachment-rename">
            Zmień nazwę
          </button>
          {file && (
            <button type="button" className="hover:text-fg" onClick={() => void showAttachment(a.id)} data-testid="attachment-show">
              Pokaż w folderze
            </button>
          )}
          <button type="button" className="hover:text-fg" disabled={busy} onClick={() => void remove()} data-testid="attachment-remove">
            Usuń
          </button>
        </div>
      )}
      {!own && file && (
        <div className="flex flex-wrap gap-x-3 text-[11.5px] text-muted">
          <button type="button" className="hover:text-fg" onClick={() => void showAttachment(a.id)} data-testid="attachment-show">
            Pokaż w folderze
          </button>
        </div>
      )}
    </li>
  )
}

export function AttachmentsSection({
  block,
  place,
  owner,
  dropOver
}: {
  block: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'> | null
  place: BlockPlace
  /** Whose an attachment added here becomes (`ownerToAdd`); null – nothing can be added. */
  owner: AttachmentOwner | null
  /** A file or a link is being dragged over the panel. */
  dropOver?: boolean
}) {
  const all = useData((s) => s.attachments)
  const list = attachmentsOfBlock(all, block, place)
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, run] = useBusy()
  const input = useRef<HTMLInputElement>(null)
  useEscapeLayer(adding, () => setAdding(false))
  useEffect(() => {
    if (adding) input.current?.focus()
  }, [adding])
  // Ctrl V anywhere on the page outside a field of text (the focus often stays on the tile just clicked).
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const o = ownerRef.current
      if (o && pasteTransfer(o, e)) e.preventDefault()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
  const add = () =>
    run(async () => {
      if (!owner || !url.trim()) return
      if ((await addLink(owner, url)) != null) {
        setUrl('')
        setAdding(false)
      }
    })
  return (
    <section className={cx('flex flex-col gap-2 rounded', dropOver && 'ring-1 ring-lamp')} data-testid="attachments" data-drop={dropOver ? 'on' : undefined} aria-label="Załączniki">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-[12.5px] font-medium">
          Załączniki{list.length ? <span className="num ml-1 text-muted">{list.length}</span> : null}
        </h4>
        {list.length >= 2 && (
          <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => void openAllAttachments(list.map((a) => a.id))} data-testid="attach-open-all">
            Otwórz wszystko ({list.length})
          </button>
        )}
      </div>
      {list.length > 0 && (
        <ul className="flex flex-col gap-1.5" data-testid="attachment-list">
          {list.map((a) => (
            <AttachmentRow key={a.id} a={a} place={place} />
          ))}
        </ul>
      )}
      {owner && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => void (await pickFiles(owner)))} data-testid="attach-pick">
            Dołącz plik…
          </button>
          <button type="button" className="btn" aria-pressed={adding} onClick={() => setAdding((v) => !v)} data-testid="attach-link-add">
            Dodaj link
          </button>
        </div>
      )}
      {owner && adding && (
        <input
          ref={input}
          className="input w-full"
          value={url}
          placeholder="Adres, np. https://… (Enter dodaje)"
          spellCheck={false}
          aria-label="Adres linku"
          data-testid="attach-link-input"
          onChange={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
        />
      )}
      {owner && list.length === 0 && !adding && <p className="text-[11.5px] text-muted">Przeciągnij tu plik albo link, wklej adres (Ctrl V) albo użyj przycisków.</p>}
    </section>
  )
}
