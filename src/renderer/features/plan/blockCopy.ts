/**
 * Kopia Ctrl + przeciągnięciem (D513) in the window – one way for „Dziś”, „3 dni” and „Tydzień” (also to another day), one for
 * „Szablony”: the copy of a block (`engine/copy.ts` – a new block of yours, the sprawy it is for copied as new ones, none of the
 * original's history) put at the hour of the drop with the flexible blocks after it pushed apart as for a new block (D367,
 * `copyChange`) – the file and the new sprawy in one edit of the queue, the sprawy going with the day (T923) – then the files of
 * the attachments the block sees copied for the copy in the background (the main process, T839: files of its own, never shared;
 * the save does not wait for them). The original never changes: it is neither written nor pushed (it stands as a fixed block –
 * `copyChange`). One „Cofnij” in the toast takes all of it back while the plan stands as the copy left it; the bar of „Dziś” only
 * hears of the pushing (its marker of variants, no line of its own – one „Cofnij”, as „Tydzień” has it, D400). Without a DOM
 * (tests in `tests/web`).
 */
import type { EditOutcome, RawRecord } from '@shared/api'
import { dayRaw, isRaw, putBlock } from '@shared/data/dayEdits'
import { sameContentAs } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { blockCopy } from '@shared/engine/copy'
import type { DayContext, DayState } from '@shared/engine/day'
import { copiedBlock } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import { attachmentFrom, attachmentRel, attachmentsOfBlock, type AttachmentOwner, type BlockPlace } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import { templateFrom, withTemplateVersion, type PlanBlock } from '@shared/model/plan'
import { copyAttachments, removeAttachments } from '../../store/attachments'
import { change, DAY_UNREADABLE, type CaseUndoFile } from '../../store/cases'
import { editOf, rawRecord, useData, type SendState } from '../../store/data'
import { undoToast } from '../../store/ui'
import { templateCopy, withTemplateChange, type TemplateDay } from '../templates/templatePush'
import { withPushed } from '../today/dayActions'
import { copyChange, COPY_SPAN_ID, pushedStarts, type DayChange } from '../today/dayPush'

/**
 * What a copy of `block` dropped at `startMin` of a day to come (`pushes`) pushes apart – for the preview while it is held (the copy
 * under `COPY_SPAN_ID`, the original held where it is).
 */
export function copyPreview(day: { ctx: DayContext; state: DayState }, block: PlanBlock, startMin: number, pushes: boolean): DayChange {
  return copyChange(day, copiedBlock(block, startMin, { id: COPY_SPAN_ID }), block.id, pushes)
}

/** Said when „Cofnij” of a copy finds the plan changed since the copy: nothing is taken back (the copy stays as it is). */
export const COPY_CHANGED_TEXT = 'Kopii nie cofnięto – plan zmienił się po niej (zostaje tak, jak jest teraz).'

/** What the toast says of a copy: „Skopiowano: <nazwa>”, the day of another one („na wt 6.01”), the blocks it pushed apart. */
export function copiedText(name: string, o: { day?: string; pushed?: number } = {}): string {
  return [`Skopiowano: ${name}${o.day ? ` na ${o.day}` : ''}`, ...(o.pushed ? [pushedText(o.pushed).toLowerCase()] : [])].join(' · ')
}

/** What the copy needs, read in the turn of its write: the block as its day's file holds it, where it is shown (the attachments it sees), the day it goes to – counted – and that day's file now. */
export interface CopyRead {
  block: PlanBlock
  place: BlockPlace
  day: { ctx: DayContext; state: DayState }
  file: RawRecord | null
}

/** What a copy came to: saved (written or waiting for the folder), the copy, how many blocks it pushed apart; the edit's outcomes. */
export interface CopyDone {
  saved: boolean
  block: PlanBlock | null
  pushed: number
  outcomes: EditOutcome[] | null
  sent?: SendState
  /** The ids of the copies of the attachments – they go on after the save (the window is free at once); a failure says itself. */
  files: Promise<string[]>
}

const NO_FILES: Promise<string[]> = Promise.resolve([])

/** A file of the change stands as the change left it (`after`); none – it is gone. */
const stands = (now: RawRecord | null, after: RawRecord | null): boolean => (now == null ? after == null : after != null && isRaw(now) && sameContentAs(now, after))

/**
 * „Cofnij” of a copy (one edit): the copies of the files come to their end first (a record written after it would stand without its
 * block); then the file holding the copy (`ownerRel` – the day's, the template's) back as it was, with the new sprawy going with it
 * (T923) – only while that file stands as the copy left it: changed since (here or on another computer) – nothing is taken back
 * (`COPY_CHANGED_TEXT`), the copy, its sprawy and the copies of its files stay. Taken back – the copies of the attachments to the
 * bin (D410: their files go after 30 days; the original's are never touched).
 */
async function undoCopy(undo: readonly CaseUndoFile[], ownerRel: string, files: Promise<string[]>): Promise<void> {
  const added = await files.catch((): string[] => [])
  let back = false
  const r = await change(async (put) => {
    back = false
    const own = undo.find((u) => u.rel === ownerRel)
    if (!own) return null
    const date = own.rel.startsWith('days/') ? /(\d{4}-\d{2}-\d{2})\.json$/.exec(own.rel)?.[1] : undefined
    let now: RawRecord | null
    if (date) {
      const read = await window.rd.dayFiles([date])
      if (!(date in read)) return DAY_UNREADABLE
      now = read[date] ?? null
    } else now = rawRecord(own.rel)
    if (!stands(now, own.after)) return COPY_CHANGED_TEXT
    put(own.rel, now, own.before)
    for (const u of undo) {
      if (u.rel === ownerRel) continue
      const was = rawRecord(u.rel)
      if (stands(was, u.after)) put(u.rel, was, u.before, ownerRel)
    }
    back = true
    return null
  })
  if (!r.saved || !back) return
  const live = added.filter((id) => {
    const raw = rawRecord(attachmentRel(id))
    return raw != null && attachmentFrom(raw)?.removedAt == null
  })
  if (live.length) await removeAttachments(live)
}

/**
 * The edit saved: the toast with its one „Cofnij”, the copies of the attachments (`ids` of the original's) for `owner` in the
 * background – their ids when they are written (a failure – the toast of `copyAttachments`).
 */
function afterCopy(text: string, undo: readonly CaseUndoFile[], ownerRel: string, owner: AttachmentOwner, ids: readonly string[]): Promise<string[]> {
  const files = ids.length ? copyAttachments(owner, ids).then((a) => a.added, (): string[] => []) : NO_FILES
  undoToast(text, () => void undoCopy(undo, ownerRel, files))
  return files
}

/**
 * The copy of a block put into the day `to` at `startMin` (D513; `today` – a day gone is history: nothing pushed). `read` runs in
 * the turn of the write (the files as they are then); it may throw why nothing is written (the toast says it). `dayText` – the
 * day named in the toast, when it is not the block's own.
 */
export async function copyBlockTo(o: { to: string; today: string; startMin: number; name: string; dayText?: string; at?: number; read: () => Promise<CopyRead> }): Promise<CopyDone> {
  let made: { block: PlanBlock; pushed: number; attachments: string[] } | null = null
  const r = await change(async (put) => {
    made = null
    const at = o.at ?? Date.now()
    const { block, place, day, file } = await o.read()
    const rel = paths.day(o.to)
    const copy = blockCopy(block, o.startMin, { date: o.to, at, caseOf: (id) => rawRecord(paths.record('request', id)) })
    // D367: on a taken place the flexible blocks after it are pushed apart, as for a new block (a day gone is history) – the
    // original held where it is (a copy never changes it).
    const pushed = pushedStarts(day.ctx.plan, copyChange(day, copy.block, block.id, o.to >= o.today))
    put(rel, file, withPushed(dayRaw(file, o.to), o.to, (raw) => putBlock(raw, copy.block), pushed))
    // A new sprawa goes with the day that holds its block (T923): a question about the day keeps it waiting, „theirs” takes it out.
    for (const c of copy.cases) put(paths.record('request', c.id), null, c.raw, rel)
    made = { block: copy.block, pushed: pushed.length, attachments: attachmentsOfBlock(useData.getState().attachments, block, place).map((a) => a.id) }
    return null
  })
  const m = made as { block: PlanBlock; pushed: number; attachments: string[] } | null
  const base = { outcomes: r.outcomes, ...(r.sent ? { sent: r.sent } : {}) }
  if (!r.saved || !m) return { saved: false, block: null, pushed: 0, files: NO_FILES, ...base }
  // Today's pushing: the bar's marker of variants only (its one „Cofnij” is the window's toast).
  const rel = paths.day(o.to)
  const u = r.undo.find((x) => x.rel === rel)
  const entry = u ? editOf(u.rel, u.before, u.after) : null
  if (o.to === o.today && m.pushed > 0 && entry) await window.rd.planPushed(o.to, m.pushed, entry, entry.create ? u!.after : null, false).catch(() => undefined)
  const files = afterCopy(copiedText(o.name, { day: o.dayText, pushed: m.pushed }), r.undo, rel, { scope: 'day', date: o.to, blockId: m.block.id }, m.attachments)
  return { saved: true, block: m.block, pushed: m.pushed, files, ...base }
}

/**
 * A block of a template's version (from `from`, D372) copied by Ctrl + drag (D513): a new block of the template at the hour of the
 * drop (as the axis shows it – `templateCopy`), the blocks it pushes apart with it, one edit of the template; the copies of its
 * attachments the template's own. One „Cofnij” in the toast (the template back while it stands as the copy left it).
 */
export async function copyTemplateBlock(o: { templateId: string; from: string; day: TemplateDay; block: PlanBlock; startMin: number; name: string }): Promise<CopyDone> {
  const rel = paths.record('template', o.templateId)
  const id = newId(10)
  let pushed = 0
  let put: PlanBlock | null = null
  const r = await change((write) => {
    const before = rawRecord(rel)
    const t = before ? templateFrom(before) : null
    if (!before || !t) return 'Tego szablonu już nie ma.'
    const c = templateCopy(o.day, o.block, o.startMin, id)
    pushed = c.pushed
    put = c.put
    write(rel, before, templateJson(withTemplateVersion(t, o.from, (v) => ({ blocks: withTemplateChange(v, c) })), before))
    return null
  })
  const base = { outcomes: r.outcomes, ...(r.sent ? { sent: r.sent } : {}) }
  if (!r.saved || !put) return { saved: false, block: null, pushed: 0, files: NO_FILES, ...base }
  const seen = attachmentsOfBlock(useData.getState().attachments, o.block, { scope: 'template', templateId: o.templateId }).map((a) => a.id)
  const files = afterCopy(copiedText(o.name, { pushed }), r.undo, rel, { scope: 'template', templateId: o.templateId, blockId: id }, seen)
  return { saved: true, block: put, pushed, files, ...base }
}
