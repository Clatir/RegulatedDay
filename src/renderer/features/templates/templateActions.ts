/**
 * Removals in „Szablony” with the attachments they take (D415, D420, T841, T847, T923): a block taken out of a template
 * from a date, and a whole template. One edit: the template's change and the soft removal of its attachments (`removedAt`
 * – their files stay 30 days, then the leader deletes them, T806), each attachment laid by the queue only once the
 * template's change is (`EditEntry.after`): waiting for the folder – they wait with it; a question – they wait for your
 * answer, „theirs” takes them out with it, so a block that stays never loses its attachments. Refused while the list of
 * attachments cannot be read (`DataView.attachmentsUnread` – unknown is never „none”). „Cofnij” for 10 s brings back the
 * template as it was before the change (a change made since on another computer stays a question) and, with it, the
 * attachments.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { classify, paths } from '@shared/data/paths'
import { ATTACHMENTS_UNREAD_TEXT, removalEdits, restoreEdits, templateRemovalIds, type AttachmentUndo } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { templateFrom, withTemplateVersion, type PlanBlock, type Template } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { editOf, isSaved, rawRecord, trySaveWith, useData } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

/** The first day a template still makes (today is made from it already). */
const tomorrowOf = (): string => addDays(useData.getState().view?.today || logicalDayOf(Date.now()), 1)

/**
 * The template's edit (the first entry) and the soft removal of the attachments the change takes (`templateRemovalIds`
 * over the template before and after it), each going with the template's edit; what their „Cofnij” needs.
 */
function withAttachments(edit: EditEntry, templateId: string, before: Template | null, after: Template | null): { entries: EditEntry[]; undo: AttachmentUndo | null } {
  const { view, attachments } = useData.getState()
  const at = Date.now()
  const removed = removalEdits(view?.attachments ?? [], templateRemovalIds(attachments, templateId, before, after, tomorrowOf()), at)
  const ids = removed.map((e) => classify(e.rel)?.id).filter((id): id is string => !!id)
  return { entries: [edit, ...removed.map((e) => ({ ...e, after: [0] }))], undo: ids.length ? { ids, removedAt: at } : null }
}

/** „Cofnij”: the template back as `before` over what the change left (`after`), its attachments with it (T923). */
function undoRemoval(rel: string, after: RawRecord | null, before: RawRecord, attachments: AttachmentUndo | null): Promise<unknown> {
  return trySaveWith(() => {
    const back = editOf(rel, after, before)
    const restore = attachments ? restoreEdits(useData.getState().view?.attachments ?? [], attachments) : []
    // The template stands as before already (nothing to write): the attachments alone.
    return back ? [back, ...restore.map((e) => ({ ...e, after: [0] }))] : restore
  })
}

/** What a removal of a template's block or of a template found in its turn. */
interface Made {
  unread: boolean
  before: RawRecord | null
  after: RawRecord | null
  attachments: AttachmentUndo | null
}
const nothing = (): Made => ({ unread: false, before: null, after: null, attachments: null })

/**
 * „Usuń z szablonu” (D420): the block out of the template's version from `from` (made when it is not there yet, as every
 * change of a template), with its attachments (D415, T847): the template's own of the block when no version from tomorrow
 * on keeps it, and the days' own of its occurrences on the days that lose it. True once saved („Cofnij” in a toast).
 */
export async function removeTemplateBlock(templateId: string, from: string, block: Pick<PlanBlock, 'id'>, name: string): Promise<boolean> {
  const rel = paths.record('template', templateId)
  const made = nothing()
  const out = await trySaveWith(() => {
    if (useData.getState().view?.attachmentsUnread) {
      made.unread = true
      return []
    }
    const before = rawRecord(rel)
    const t = before ? templateFrom(before) : null
    if (!before || !t) return []
    const next = withTemplateVersion(t, from, (v) => ({ blocks: v.blocks.filter((b) => b.id !== block.id) }))
    const after = templateJson(next, before)
    const edit = editOf(rel, before, after)
    // Not in the version any more (removed meanwhile): nothing to write, nothing said.
    if (!edit) return []
    const w = withAttachments(edit, templateId, t, next)
    Object.assign(made, { before, after, attachments: w.undo })
    return w.entries
  })
  return done(made, out, rel, `Usunięty z szablonu: ${name}`)
}

/**
 * „Usuń” of a template (D420): as a removal of all its blocks – the record goes with the template's own attachments of
 * every block and the days' own of its blocks from tomorrow (today, made from it already, keeps them). True once saved
 * („Cofnij” in a toast).
 */
export async function removeTemplate(templateId: string, name: string): Promise<boolean> {
  const rel = paths.record('template', templateId)
  const made = nothing()
  const out = await trySaveWith(() => {
    if (useData.getState().view?.attachmentsUnread) {
      made.unread = true
      return []
    }
    const before = rawRecord(rel)
    const edit = before ? editOf(rel, before, null) : null
    if (!before || !edit) return []
    const w = withAttachments(edit, templateId, templateFrom(before), null)
    Object.assign(made, { before, attachments: w.undo })
    return w.entries
  })
  return done(made, out, rel, `Usunięty szablon: ${name}`)
}

/** After the edit: refused for the list – said; saved – „Cofnij” for the template and its attachments. */
function done(made: Made, out: Awaited<ReturnType<typeof trySaveWith>>, rel: string, text: string): boolean {
  if (made.unread) {
    toast(ATTACHMENTS_UNREAD_TEXT, 'error', 8000)
    return false
  }
  const { before, after, attachments } = made
  if (!before || !isSaved(out)) return false
  undoToast(text, () => void undoRemoval(rel, after, before, attachments))
  return true
}
