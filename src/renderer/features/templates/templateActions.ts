/**
 * Removals in „Szablony” with the attachments they take (D415, T841): a block taken out of a template from a date, and a
 * whole template. Each is one edit with the soft removal of the attachments (`removedAt` – their files stay 30 days, then
 * the leader deletes them, T806), and „Cofnij” for 10 s brings back the template as it was before the change (a change made
 * since on another computer stays a question), then – only once that is saved – the attachments.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { classify, paths } from '@shared/data/paths'
import { removalEdits, templateRemovalIds, type AttachmentUndo } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { blockInTemplateFrom, templateFrom, withTemplateVersion, type PlanBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { restoreAttachments } from '../../store/attachments'
import { editOf, isSaved, rawRecord, trySaveEdits, trySaveWith, useData } from '../../store/data'
import { undoToast } from '../../store/ui'

/** The soft removal of the attachments `ids` (those still there, from the records as the window sees them) and its „Cofnij”. */
function attachmentRemoval(ids: readonly string[]): { entries: EditEntry[]; undo: AttachmentUndo | null } {
  const at = Date.now()
  const entries = removalEdits(useData.getState().view?.attachments ?? [], ids, at)
  const removed = entries.map((e) => classify(e.rel)?.id).filter((id): id is string => !!id)
  return { entries, undo: removed.length ? { ids: removed, removedAt: at } : null }
}

/** „Cofnij”: the template back as `before` over what the change left (`after`); its attachments only once that is saved. */
async function undoRemoval(rel: string, after: RawRecord | null, before: RawRecord, attachments: AttachmentUndo | null): Promise<void> {
  const back = await trySaveEdits([editOf(rel, after, before)])
  if (isSaved(back) && attachments) await restoreAttachments(attachments)
}

/**
 * „Usuń z szablonu”: the block out of the template's version from `from` (made when it is not there yet, as every change
 * of a template). When no version from `from` on keeps it, its attachments go in the same edit (D415): the template's own
 * of the block from every day, and the days' own of its occurrences from `from` on. True once saved („Cofnij” in a toast).
 */
export async function removeTemplateBlock(templateId: string, from: string, block: Pick<PlanBlock, 'id'>, name: string): Promise<boolean> {
  const rel = paths.record('template', templateId)
  const made: { before: RawRecord | null; after: RawRecord | null; attachments: AttachmentUndo | null } = { before: null, after: null, attachments: null }
  const out = await trySaveWith(() => {
    const before = rawRecord(rel)
    const t = before ? templateFrom(before) : null
    if (!before || !t) return []
    const next = withTemplateVersion(t, from, (v) => ({ blocks: v.blocks.filter((b) => b.id !== block.id) }))
    const after = templateJson(next, before)
    const edit = editOf(rel, before, after)
    // Not in the version any more (removed meanwhile): nothing to write, nothing said.
    if (!edit) return []
    made.before = before
    made.after = after
    // A later version keeps the block: it is still the template's – its attachments stay.
    if (blockInTemplateFrom(next, block.id, from)) return [edit]
    const removal = attachmentRemoval(templateRemovalIds(useData.getState().attachments, templateId, [block.id], from))
    made.attachments = removal.undo
    return [edit, ...removal.entries]
  })
  const { before, after, attachments } = made
  if (!before || !isSaved(out)) return false
  undoToast(`Usunięty z szablonu: ${name}`, () => void undoRemoval(rel, after, before, attachments))
  return true
}

/**
 * „Usuń” of a template: the record goes with the attachments of all its blocks in the same edit (D415, T841) – the
 * template's own from every day, the days' own of its blocks from tomorrow (today is made from it already and keeps
 * them). True once saved („Cofnij” in a toast).
 */
export async function removeTemplate(templateId: string, name: string): Promise<boolean> {
  const rel = paths.record('template', templateId)
  const made: { before: RawRecord | null; attachments: AttachmentUndo | null } = { before: null, attachments: null }
  const out = await trySaveWith(() => {
    const before = rawRecord(rel)
    if (!before) return []
    made.before = before
    const { view, attachments: list } = useData.getState()
    // Its blocks in every version – and any block its own attachments name (never left shown nowhere and kept for ever).
    const blockIds = new Set<string>()
    for (const v of templateFrom(before)?.versions ?? []) for (const b of v.blocks) blockIds.add(b.id)
    for (const a of list) if (a.owner.scope === 'template' && a.owner.templateId === templateId) blockIds.add(a.owner.blockId)
    const tomorrow = addDays(view?.today || logicalDayOf(Date.now()), 1)
    const removal = attachmentRemoval(templateRemovalIds(list, templateId, [...blockIds], tomorrow))
    made.attachments = removal.undo
    return [editOf(rel, before, null), ...removal.entries]
  })
  const { before, attachments } = made
  if (!before || !isSaved(out)) return false
  undoToast(`Usunięty szablon: ${name}`, () => void undoRemoval(rel, null, before, attachments))
  return true
}
