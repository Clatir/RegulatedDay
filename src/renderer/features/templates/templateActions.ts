/**
 * Removals in „Szablony” with the attachments they take (D415, D420, T841, T848): a block taken out of a template from a
 * date, and a whole template. The template's change goes first; only once it is saved do its attachments go – soft
 * (`removedAt`: their files stay 30 days, then the leader deletes them, T806), in the next turn, from the records as they
 * are then: a change that met another computer's (a question) never leaves the attachments of a block that stays in the
 * bin. Refused while the list of attachments cannot be read (`DataView.attachmentsUnread` – unknown is never „none”).
 * „Cofnij” for 10 s brings back the template as it was before the change (a change made since on another computer stays
 * a question), then – only once that is saved – the attachments.
 */
import type { RawRecord } from '@shared/api'
import { classify, paths } from '@shared/data/paths'
import { removalEdits, templateRemovalIds, type AttachmentUndo } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { templateFrom, withTemplateVersion, type PlanBlock, type Template } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { restoreAttachments } from '../../store/attachments'
import { editOf, isSaved, rawRecord, trySaveEdits, trySaveWith, useData } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

/** Said when the list of attachments cannot be read now: the change waits for it (as a series' removal, T842). */
export const ATTACHMENTS_UNREAD_TEXT = 'Listy załączników nie da się teraz odczytać – nic nie zostało zapisane, spróbuj za chwilę.'

/** The first day a template still makes (today is made from it already). */
const tomorrowOf = (): string => addDays(useData.getState().view?.today || logicalDayOf(Date.now()), 1)

/**
 * In its own turn, after the template's saved change: the attachments the change takes (`templateRemovalIds` over the
 * template before and after it), removed softly from the records as the window sees them then; what their „Cofnij” needs
 * (null – none). The list unreadable by then: they stay (the change of the template is saved already).
 */
async function removeAttachmentsOf(templateId: string, before: Template | null, after: Template | null, tomorrow: string): Promise<AttachmentUndo | null> {
  const made: { undo: AttachmentUndo | null } = { undo: null }
  await trySaveWith(() => {
    const { view, attachments } = useData.getState()
    if (!view || view.attachmentsUnread) return []
    const at = Date.now()
    const entries = removalEdits(view.attachments, templateRemovalIds(attachments, templateId, before, after, tomorrow), at)
    const ids = entries.map((e) => classify(e.rel)?.id).filter((id): id is string => !!id)
    made.undo = ids.length ? { ids, removedAt: at } : null
    return entries
  })
  // Also after a failure part-way: „Cofnij” brings back only those removed at that very instant.
  return made.undo
}

/** „Cofnij”: the template back as `before` over what the change left (`after`); its attachments only once that is saved. */
async function undoRemoval(rel: string, after: RawRecord | null, before: RawRecord, attachments: AttachmentUndo | null): Promise<void> {
  const back = await trySaveEdits([editOf(rel, after, before)])
  if (isSaved(back) && attachments) await restoreAttachments(attachments)
}

/** What a removal of a template's block or of a template found in its turn. */
interface Made {
  unread: boolean
  before: RawRecord | null
  after: RawRecord | null
  was: Template | null
  next: Template | null
}
const nothing = (): Made => ({ unread: false, before: null, after: null, was: null, next: null })

/**
 * „Usuń z szablonu” (D420): the block out of the template's version from `from` (made when it is not there yet, as every
 * change of a template); then its attachments (D415): the template's own of the block when no version from tomorrow on
 * keeps it, and the days' own of its occurrences on the days that lose it. True once saved („Cofnij” in a toast).
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
    Object.assign(made, { before, after, was: t, next })
    return [edit]
  })
  return done(made, out, templateId, rel, `Usunięty z szablonu: ${name}`)
}

/**
 * „Usuń” of a template (D420): as a removal of all its blocks – the record goes, then the template's own attachments of
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
    if (!before) return []
    Object.assign(made, { before, was: templateFrom(before) })
    return [editOf(rel, before, null)]
  })
  return done(made, out, templateId, rel, `Usunięty szablon: ${name}`)
}

/** After the template's edit: refused – said; saved – its attachments in the next turn, and „Cofnij” for both. */
async function done(made: Made, out: Awaited<ReturnType<typeof trySaveWith>>, templateId: string, rel: string, text: string): Promise<boolean> {
  if (made.unread) {
    toast(ATTACHMENTS_UNREAD_TEXT, 'error', 8000)
    return false
  }
  const { before, after, was, next } = made
  if (!before || !isSaved(out)) return false
  const attachments = await removeAttachmentsOf(templateId, was, next, tomorrowOf())
  undoToast(text, () => void undoRemoval(rel, after, before, attachments))
  return true
}
