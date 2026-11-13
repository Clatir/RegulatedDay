/**
 * Attachments of blocks from the window (SNT4, D410): what a block sees (`attachmentsOfBlock` over `useData().attachments`),
 * adding files and links (the main process copies the file before its record – `window.rd.attachFiles`, `addLink`), a
 * new name, a removal with „Cofnij” and opening. A removal is soft (`removedAt`); its answer is what „Cofnij” needs
 * (`AttachmentUndo`) – only the attachments still removed at that very instant come back. A change of a record that is there
 * goes in its turn after the edits sent before it (`trySaveWith`). New files: the dialog and the copying go outside that
 * turn (gigabytes never hold it), their records in it (`attachCommit` – a block removed meanwhile is known then), and so
 * does a new link (`addLink` – quick, nothing copied) (T839).
 */
import type { AddLinkResult, AttachmentOpen, AttachPrepared, AttachResult } from '@shared/api'
import { recordEdit } from '@shared/data/merge'
import {
  ATTACHMENT_NAME_MAX,
  attachmentFrom,
  attachmentJson,
  attachmentRel,
  attachmentsOfBlock,
  linkFromInput,
  removalEdits,
  restoreEdits,
  type Attachment,
  type AttachmentOwner,
  type AttachmentUndo,
  type BlockPlace
} from '@shared/model/attachment'
import type { PlanBlock } from '@shared/model/plan'
import { inTurn, isSaved, rawRecord, reloadData, trySaveWith, useData } from './data'
import { toast } from './ui'

/** What a change of an attachment says when it is gone (removed elsewhere, deleted after 30 days). */
export const ATTACHMENT_GONE_TEXT = 'Tego załącznika już nie ma.'
export const LINK_INPUT_TEXT = 'To nie jest adres, który się otworzy – tylko http, https albo adres e-mail.'

/** The attachments a block sees where it is shown (none removed), in their order – from the data now. */
export function attachmentsFor(block: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'> | null, place: BlockPlace): Attachment[] {
  return attachmentsOfBlock(useData.getState().attachments, block, place)
}

/** The file of the attachment is not on this computer yet (OneDrive brings it after the record, T802). */
export const fileMissing = (id: string): boolean => useData.getState().attachmentsMissing.has(id)

/** The raw records of attachments as the window sees them now (for the edits). */
const raws = () => useData.getState().view?.attachments ?? []

/** Says what did not go of a drop or a choice of files (by name). */
function sayFailed(r: AttachResult): void {
  if (!r.failed.length) return
  const one = r.failed[0]!
  const text = r.failed.length === 1 ? `Nie dołączono „${one.name}”: ${one.error}.` : `Nie dołączono ${r.failed.length} plików (m.in. „${one.name}”: ${one.error}).`
  toast(text, 'error', 8000)
}

/**
 * The files copied outside the turn of the window's edits (T839: the dialog open, gigabytes copied never hold them), their
 * records written in it – after an edit sent before (a block removed meanwhile is known then: they come removed) and before
 * the next one, which sees them (the view is read again in the turn).
 */
async function attachCall(call: () => Promise<AttachPrepared>): Promise<AttachResult> {
  const fail = (e: unknown) => [{ name: '', error: e instanceof Error ? e.message : String(e) }]
  let p: AttachPrepared
  try {
    p = await call()
  } catch (e) {
    p = { ids: [], failed: fail(e) }
  }
  const committed = p.ids.length
    ? await inTurn(async () => {
        try {
          return await window.rd.attachCommit(p.ids)
        } catch (e) {
          return { added: [], failed: fail(e) }
        } finally {
          await reloadData()
        }
      })
    : { added: [], failed: [] }
  const r: AttachResult = { added: committed.added, failed: [...p.failed, ...committed.failed] }
  sayFailed(r)
  return r
}

/** Files dropped on a block (paths from `window.rd.pathForFile`): the attachments made. */
export const attachFiles = (owner: AttachmentOwner, paths: readonly string[]): Promise<AttachResult> => attachCall(() => window.rd.attachFiles(owner, [...paths]))

/** „Dołącz plik…”: the dialog of Windows in the main process; nothing chosen – nothing. */
export const pickFiles = (owner: AttachmentOwner): Promise<AttachResult> => attachCall(() => window.rd.attachPick(owner))

/**
 * A link added from what you typed, pasted or dragged (D410): an address without a scheme is https, an e-mail address
 * mailto; one that would not open is refused here with the reason (the main process checks it again). Its id, or null.
 */
export async function addLink(owner: AttachmentOwner, input: string): Promise<string | null> {
  const url = linkFromInput(input)
  if (!url) {
    toast(LINK_INPUT_TEXT, 'error', 6000)
    return null
  }
  // In the turn of the edits (quick – nothing copied): a block removed just before is known to the main process (T839).
  const r = await inTurn(async (): Promise<AddLinkResult> => {
    try {
      return await window.rd.addLink(owner, url)
    } catch (e) {
      return { ok: false, id: null, error: e instanceof Error ? e.message : String(e) }
    }
  })
  await reloadData()
  if (!r.ok) toast(`Nie dodano linku: ${r.error ?? 'spróbuj jeszcze raz'}`, 'error', 6000)
  return r.ok ? r.id : null
}

/** A new name (an empty one – the file's or the page's own again). True once saved. */
export async function renameAttachment(id: string, name: string): Promise<boolean> {
  const rel = attachmentRel(id)
  let gone = false
  const out = await trySaveWith(() => {
    const before = rawRecord(rel)
    const a = before ? attachmentFrom(before) : null
    if (!before || !a) {
      gone = true
      return []
    }
    return [recordEdit(rel, before, attachmentJson({ ...a, name: Array.from(name.trim()).slice(0, ATTACHMENT_NAME_MAX).join('') }, before))]
  })
  if (gone) toast(ATTACHMENT_GONE_TEXT, 'info', 6000)
  return !gone && isSaved(out)
}

/**
 * Attachments removed (D410: the file stays 30 days): what their „Cofnij” needs, or null – nothing removed (gone already,
 * or the edit did not go through; the toast says why).
 */
export async function removeAttachments(ids: readonly string[]): Promise<AttachmentUndo | null> {
  const at = Date.now()
  let entries = 0
  const out = await trySaveWith(() => {
    const list = removalEdits(raws(), ids, at)
    entries = list.length
    return list
  })
  if (!entries) {
    toast(ATTACHMENT_GONE_TEXT, 'info', 6000)
    return null
  }
  return isSaved(out) ? { ids: [...ids], removedAt: at } : null
}

/** „Cofnij” of a removal: back – each one still removed at that instant. True once saved (nothing to bring back – false). */
export async function restoreAttachments(undo: AttachmentUndo): Promise<boolean> {
  let entries = 0
  const out = await trySaveWith(() => {
    const list = restoreEdits(raws(), undo)
    entries = list.length
    return list
  })
  return entries > 0 && isSaved(out)
}

/** Says why an attachment did not open (a file of a program shown in its folder is no failure – the panel's note says it). */
function sayOpen(r: AttachmentOpen): void {
  if (!r.ok && r.text) toast(r.text, r.code === 'missing' ? 'info' : 'error', 6000)
}

/** An attachment opened by its id (the main process takes its path or address from the record). */
export async function openAttachment(id: string): Promise<AttachmentOpen> {
  const r = await window.rd.openAttachment(id).catch((e: unknown): AttachmentOpen => ({ id, ok: false, how: null, code: 'failed', text: e instanceof Error ? e.message : String(e) }))
  sayOpen(r)
  return r
}

/** „Otwórz wszystko (N)”: one after another; every failure said once (the first one's words). */
export async function openAllAttachments(ids: readonly string[]): Promise<AttachmentOpen[]> {
  const out = await window.rd.openAttachments([...ids]).catch((e: unknown): AttachmentOpen[] => ids.map((id) => ({ id, ok: false, how: null, code: 'failed', text: e instanceof Error ? e.message : String(e) })))
  const failed = out.filter((r) => !r.ok)
  if (failed.length === 1) sayOpen(failed[0]!)
  else if (failed.length > 1) toast(`Nie otworzono ${failed.length} załączników: ${failed[0]!.text ?? ''}`, 'error', 8000)
  return out
}

/** „Pokaż w folderze”. */
export async function showAttachment(id: string): Promise<AttachmentOpen> {
  const r = await window.rd.showAttachment(id).catch((e: unknown): AttachmentOpen => ({ id, ok: false, how: null, code: 'failed', text: e instanceof Error ? e.message : String(e) }))
  sayOpen(r)
  return r
}
