/**
 * „Przywróć” of „Ostatnio usunięte” (N24), in the window's turn like every edit (T517), with „Cofnij” for 10 s as every
 * change (spec „Usuwanie”). A block: its day's file as it is then gets the very block back at its hours (nothing pushed apart –
 * an overlap is allowed, as by hand, D72), or its cancel taken back; „Cofnij” takes it out again from the file as it is then.
 * A record: made again as it was before its removal, only while there is none of its id; a series – out of its archive with
 * the end it had (`until`, `count`), over the record as it is then, only while it still is archived. „Cofnij” is the opposite
 * of that one change (a field changed meanwhile is a question, never written over quietly). The attachments that very removal
 * took with it (`RemovedItem.attachments` – the main process finds them exactly) come back in the same edit, laid only once
 * their owner is (T923), and go again with „Cofnij”; with no edit of the owner – none of them either.
 */
import type { EditEntry, RawRecord, RemovedItem } from '@shared/api'
import { dayRaw } from '@shared/data/dayEdits'
import { removedAgain, restoredDay } from '@shared/data/removed'
import { removalEdits, restoreEdits, type AttachmentUndo } from '@shared/model/attachment'
import { create } from 'zustand'
import { editOf, isSaved, rawRecord, readDayFiles, trySaveWith, useData, withOwner } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

export const DAY_UNREADABLE_TEXT = 'plik tego dnia jest teraz nieczytelny – spróbuj za chwilę'
export const ALREADY_BACK_TEXT = 'To już jest z powrotem.'

/** Said once a restore or its „Cofnij” is sent – the list reads itself again at once (not at the next change of the data only). */
export const useRemovedChanges = create<{ n: number }>(() => ({ n: 0 }))
const changed = () => useRemovedChanges.setState((s) => ({ n: s.n + 1 }))

const attachmentRaws = (): RawRecord[] => useData.getState().view?.attachments ?? []

/** The attachments of `undo` brought back with `owner`, laid once it is; no edit of the owner – nothing. */
const withAttachmentsBack = (owner: EditEntry | null, undo: AttachmentUndo | null): EditEntry[] => (owner ? withOwner(owner, undo ? restoreEdits(attachmentRaws(), undo) : []) : [])

/** „Cofnij”: the attachments brought back removed again (now) with `owner`; no edit of the owner – nothing. */
const withAttachmentsGone = (owner: EditEntry | null, undo: AttachmentUndo | null): EditEntry[] => (owner ? withOwner(owner, undo ? removalEdits(attachmentRaws(), undo.ids, Date.now()) : []) : [])

/** True once restored (written, or waiting for the folder); every refusal is said. */
export async function restoreRemoved(item: RemovedItem, name: string): Promise<boolean> {
  const done = await (item.kind === 'block' ? restoreBlock(item, name) : restoreRecord(item, name))
  changed()
  return done
}

async function restoreBlock(item: RemovedItem, name: string): Promise<boolean> {
  const date = item.date
  if (!date) return false
  // What the edit made in its turn: the day's file as it left it (what „Cofnij” stands on while the file cannot be read).
  const made: { left: RawRecord | null; edit: boolean; attachments: AttachmentUndo | null } = { left: null, edit: false, attachments: null }
  const out = await trySaveWith(async () => {
    const files = await readDayFiles([date])
    // A day that cannot be read now is never made anew from nothing.
    if (!(date in files)) throw new Error(DAY_UNREADABLE_TEXT)
    const before = files[date] ?? null
    made.left = restoredDay(dayRaw(before, date), item)
    const edit = editOf(item.rel, before, made.left)
    made.edit = edit != null
    made.attachments = item.attachments
    return withAttachmentsBack(edit, made.attachments)
  })
  if (out && !made.edit) toast(ALREADY_BACK_TEXT, 'info', 6000)
  // The day's own entry says what became of it (T931): an attachment that met a question is not it.
  if (!made.edit || !isSaved(out ? out.slice(0, 1) : out)) return false
  undoToast(`Przywrócono: ${name}`, () =>
    void trySaveWith(async () => {
      const files = await readDayFiles([date])
      const before = date in files ? (files[date] ?? null) : made.left
      return withAttachmentsGone(editOf(item.rel, before, removedAgain(dayRaw(before, date), item)), made.attachments)
    }).finally(changed)
  )
  return true
}

async function restoreRecord(item: RemovedItem, name: string): Promise<boolean> {
  const value = item.value
  if (!value) return false
  const made: { before: RawRecord | null; after: RawRecord | null; edit: EditEntry | null; attachments: AttachmentUndo | null } = { before: null, after: null, edit: null, attachments: null }
  const out = await trySaveWith(() => {
    const now = rawRecord(item.rel)
    made.before = now
    // A series comes back from its archive over the record as it is now – only while it still is archived; any other record is
    // made again only while there is none of its id (made again elsewhere meanwhile: nothing written over).
    if (item.kind === 'series') made.after = now && now.archived === true ? { ...now, archived: false, until: value.until ?? null, count: value.count ?? null } : null
    else made.after = now ? null : value
    made.edit = made.after ? editOf(item.rel, now, made.after) : null
    made.attachments = item.attachments
    return withAttachmentsBack(made.edit, made.attachments)
  })
  if (out && !made.edit) toast(ALREADY_BACK_TEXT, 'info', 6000)
  if (!made.edit || !isSaved(out ? out.slice(0, 1) : out)) return false
  const { before, after, attachments } = made
  undoToast(`Przywrócono: ${name}`, () => void trySaveWith(() => withAttachmentsGone(editOf(item.rel, after, before), attachments)).finally(changed))
  return true
}
