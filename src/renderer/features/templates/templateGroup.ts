/**
 * Zmiany grupowe bloków szablonu (D528, D529): the menu „Zmień N bloków” on the axis of „Szablony” – a subcategory and variant, a variant,
 * the cost, a routine, „Przesuń o” ±N min, „Usuń” (no actions of a day: „Odwołaj”, „Zaparkuj”, „Przenieś na dzień”). In the turn of the
 * write (A6-01) the template is read as it is then and the day its version makes is counted from it (`templateDayOf` – the page's rule):
 * the blocks are judged on it (`judgeGroup` – the rules of „Dziś”, nothing begun there), the change is one edit of the template's version
 * from the page's date (made when it is not there yet, as every change of a template), the push apart in it (D367, D372 – `templateShift`);
 * a removal takes the blocks' attachments with it (D415, T923) and is refused while their list cannot be read. „Cofnij” – only the fields
 * the change set, each block that stands as it left it (D529, D313); the blocks removed come back while they are still gone, with their
 * attachments. A change that writes nothing changes nothing (no „Cofnij”).
 */
import type { EditEntry, EditOutcome } from '@shared/api'
import { fieldPatch, fieldsUndoIn, isFieldAction, judgeGroup, undoFieldsIn, type FieldsUndo, type GroupAction, type GroupJudged } from '@shared/engine/groupEdit'
import { deepEqual } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { ATTACHMENTS_UNREAD_TEXT, restoreEdits, type AttachmentUndo } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { templateFrom, withTemplateVersion, type PlanBlock, type Template } from '@shared/model/plan'
import { editOf, isSaved, rawRecord, trySaveWith, useData, withOwner, type SendState } from '../../store/data'
import { toast } from '../../store/ui'
import { groupNone, type GroupDone, type GroupUndone } from '../today/groupActions'
import { statusOf } from '../week/weekMove'
import { axisSources } from './sessionChoices'
import { withAttachments } from './templateActions'
import { sampleDay, templateDayOf, versionFrom } from './templateDay'
import { templateShift } from './templatePush'

/** The template of the page: its id and the date of the version it edits (from tomorrow on by default). */
export interface TemplateGroupTarget {
  templateId: string
  from: string
}

const TEMPLATE_GONE_TEXT = 'tego szablonu już nie ma'

/** A block removed from the version: as it was, and its place in the list. */
interface Removed {
  block: PlanBlock
  index: number
}

/** What the change made in its turn. */
interface Made {
  judged: GroupJudged
  /** Something to write – false: the version is as the change would make it (nothing changed). */
  edited: boolean
  before: PlanBlock[]
  after: PlanBlock[]
  removed: Removed[]
  attachments: AttachmentUndo | null
  pushed: number
}

/**
 * One action of the menu on the blocks `ids` of the version (their ids in it, as the axis of „Szablony” names them). The actions of a day
 * are refused (nothing written).
 */
export async function changeTemplateGroup(t: TemplateGroupTarget, ids: readonly string[], a: GroupAction): Promise<GroupDone> {
  if (a.k === 'cancel' || a.k === 'park' || a.k === 'moveTo') return groupNone('refused')
  const rel = paths.record('template', t.templateId)
  const state: SendState = { afterSend: false }
  let made: Made | null = null
  let unread = false
  const out = await trySaveWith(async () => {
    // D415: a removal takes its attachments – never while their list cannot be read (unknown is never „none”).
    if (a.k === 'remove' && useData.getState().view?.attachmentsUnread) {
      unread = true
      return []
    }
    const raw = rawRecord(rel)
    const tpl = raw ? templateFrom(raw) : null
    if (!raw || !tpl) throw new Error(TEMPLATE_GONE_TEXT)
    const v0 = versionFrom(tpl, t.from)
    // The day the version makes now (A6-01: never the one the window drew – a change a moment before is in it).
    const { rd, lectures, routines } = useData.getState()
    const day = templateDayOf(tpl, v0, sampleDay(tpl, t.from), { changes: rd.settings, lectures, routines })
    // The blocks of the day by the version's ids (a session – by its entry, D511), and back.
    const toVersion = axisSources(day.ctx.plan, v0.blocks)
    const toDay = new Map([...toVersion].map(([dayId, of]) => [of, dayId]))
    const j = judgeGroup(day, ids.map((id) => toDay.get(id) ?? id), a, '')
    const back = (id: string) => toVersion.get(id) ?? id
    const judged: GroupJudged = { take: j.take.map(back), along: j.along.map(back), same: j.same.map(back), skipped: j.skipped.map((s) => ({ ...s, id: back(s.id) })) }
    const take = new Set(judged.take)
    let change: (blocks: readonly PlanBlock[]) => PlanBlock[]
    let pushed = 0
    let removed: Removed[] = []
    if (isFieldAction(a)) {
      const patch = fieldPatch(a)
      change = (blocks) => blocks.map((b) => (take.has(b.id) ? { ...b, ...patch } : b))
    } else if (a.k === 'shift') {
      const s = templateShift(day, j.take, a.minutes)
      pushed = s.pushed
      const patches = new Map<string, Partial<PlanBlock>>()
      for (const p of s.patches) patches.set(p.id, { ...patches.get(p.id), ...p.patch })
      change = (blocks) => blocks.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id)! } : b))
    } else {
      removed = v0.blocks.flatMap((block, index) => (take.has(block.id) ? [{ block, index }] : []))
      change = (blocks) => blocks.filter((b) => !take.has(b.id))
    }
    // The blocks as they are: no version is made for nothing (a change of a block the version does not have – a session of the layer).
    const next = deepEqual(change(v0.blocks), v0.blocks) ? tpl : withTemplateVersion(tpl, t.from, (v) => ({ blocks: change(v.blocks) }))
    const edit = next === tpl ? null : editOf(rel, raw, templateJson(next, raw))
    const m: Made = { judged, edited: edit != null, before: v0.blocks, after: versionFrom(next, t.from).blocks, removed, attachments: null, pushed }
    made = m
    if (!edit) return []
    if (a.k !== 'remove') return [edit]
    // D415, T923: the attachments of the blocks no version from tomorrow keeps go with the change.
    const w = await withAttachments(edit, t.templateId, tpl, next)
    m.attachments = w.undo
    return w.entries
  }, state)
  if (unread) {
    toast(ATTACHMENTS_UNREAD_TEXT, 'error', 8000)
    return groupNone('failed')
  }
  // The template's own entry says what became of it (T931).
  const status = statusOf(out?.slice(0, 1) ?? out, state)
  const m = made as Made | null
  if (status !== 'saved' || !m) return groupNone(status, m?.judged.skipped ?? [], m?.judged.same.length ?? 0)
  // Nothing written: the version is as the change would make it – nothing changed, no „Cofnij” (as a change of one block).
  if (!m.edited) return groupNone(status, m.judged.skipped, m.judged.same.length)
  const done: GroupDone = { status, changed: m.judged.take.length + m.judged.along.length, skipped: m.judged.skipped, same: m.judged.same.length, seriesOnly: 0, pushed: m.pushed, undo: null }
  const { removed, attachments } = m
  const items = fieldsUndoIn(m.before, m.after)
  done.undo = a.k === 'remove' ? () => undoRemoved(rel, t.from, removed, attachments) : () => undoFieldsOf(rel, t.from, items)
  return done
}

/** The version from `from` changed in its turn, with the entries that go with it (`deps`); null – nothing sent (the toast said why). */
function changeVersion(rel: string, from: string, fn: (blocks: readonly PlanBlock[]) => PlanBlock[], deps: (tpl: Template) => EditEntry[] = () => []): Promise<EditOutcome[] | null> {
  return trySaveWith(() => {
    const raw = rawRecord(rel)
    const tpl = raw ? templateFrom(raw) : null
    if (!raw || !tpl) throw new Error(TEMPLATE_GONE_TEXT)
    const next = withTemplateVersion(tpl, from, (v) => ({ blocks: fn(v.blocks) }))
    return withOwner(editOf(rel, raw, templateJson(next, raw)), deps(tpl))
  })
}

/** „Cofnij” of fields or a shift: each block that stands as the change left it gets its fields back; one changed since stays (D313). */
async function undoFieldsOf(rel: string, from: string, items: readonly FieldsUndo[]): Promise<GroupUndone> {
  const r = { restored: 0, kept: items.length }
  const out = await changeVersion(rel, from, (blocks) => {
    const u = undoFieldsIn(blocks, items)
    r.restored = u.restored.length
    r.kept = u.kept.length
    return u.blocks
  })
  return { saved: isSaved(out?.slice(0, 1) ?? out), ...r }
}

/** „Cofnij” of a removal: each block back while it is still gone (one there again stays as it is), its attachments with it. */
async function undoRemoved(rel: string, from: string, removed: readonly Removed[], attachments: AttachmentUndo | null): Promise<GroupUndone> {
  const r = { restored: 0, kept: 0 }
  const out = await changeVersion(
    rel,
    from,
    (blocks) => {
      const next = [...blocks]
      r.restored = 0
      r.kept = 0
      for (const x of [...removed].sort((p, q) => p.index - q.index)) {
        if (next.some((b) => b.id === x.block.id)) r.kept++
        else {
          next.splice(Math.min(x.index, next.length), 0, x.block)
          r.restored++
        }
      }
      return next
    },
    () => (attachments ? restoreEdits(useData.getState().view?.attachments ?? [], attachments) : [])
  )
  return { saved: isSaved(out?.slice(0, 1) ?? out), ...r }
}
