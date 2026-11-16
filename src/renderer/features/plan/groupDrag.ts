/**
 * Przeciąganie grupy (D531) in the window – the write of a drag of a selected block of a selection of two and more: „Dziś” and the columns of
 * „Tydzień” and „3 dni” (`dragDayGroup`), the axis of „Szablony” (`dragTemplateGroup`). Every day the drag touches is read and counted in the
 * turn of the write (A6-01) and judged and laid by `engine/groupDrag.ts` there: ONE edit of all the days (the halves that bring blocks to other
 * days first – T952), the pushed starts in it (D367; today the bar's marker of variants only, T1541); with Ctrl – the group's copy (D513 for each:
 * the sprawy of a block copied as new ones going with the day, its attachments' files copied in the background). What it did says the line of the
 * view („Przeniesiono 3 bloki · 1 został – już trwa · najniższa energia 52 → 44 · Cofnij”, `GroupLine`). Its „Cofnij”: within a day the one of
 * „Przesuń o” of the menu (only the fields the drag set, a block changed since stays – T1763); to other days every day that still stands as the
 * drag left it – the days of a block moved between them together or not at all (D417); it says how many blocks changed since stay (`keptText`,
 * D313). Without a DOM (tests in `tests/web`).
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { blockCopy } from '@shared/engine/copy'
import { copyKeyOf, draggedDays, judgeDrag, stayWordOf, type DragDelta, type DragJudged, type DragKey, type DragPreview, type DragStay, type DragStayWhy, type GroupDragged } from '@shared/engine/groupDrag'
import { fieldsUndoOf, followsMoving, groupEnergy, judgeGroup, undoFields, type EnergyChange, type FieldsUndo, type GroupDay } from '@shared/engine/groupEdit'
import { groupLineText, keptText, VERB } from '@shared/groupText'
import { attachmentFrom, attachmentRel, attachmentsOfBlock, type BlockPlace } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import { templateFrom, withTemplateVersion, type PlanBlock } from '@shared/model/plan'
import { seriesOfBlock } from '@shared/model/series'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { copyAttachments, removeAttachments } from '../../store/attachments'
import { change, DAY_UNREADABLE, type CaseUndoFile } from '../../store/cases'
import { editOf, outcomeFate, rawRecord, readDayFiles, trySaveWith, useData, type SendState } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { takeBackDays, type DayEdit } from '../../store/dayUndo'
import { showGroupLine, UndoNotDone, type GroupView } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { dayPlace } from '../attachments/attachView'
import { changeTemplateGroup, type TemplateGroupTarget } from '../templates/templateGroup'
import { sampleDay, templateDayOf, versionFrom } from '../templates/templateDay'
import { templateGroupCopy, templateShift, type TemplateDay } from '../templates/templatePush'
import { axisSources } from '../templates/sessionChoices'
import { onUnsettled } from '../today/dayPush'
import { energyOptions } from '../today/groupActions'
import { moveUncountedText, moveUnreadableText, statusOf, type WeekMoveStatus } from '../week/weekMove'
import { undoUnreadableText } from '../week/weekActions'
import { unwrittenDaysText } from './groupRun'
import { stands } from './blockCopy'

/** What a group's drag came to: written or not, how many blocks went (were copied), which stayed and why, the pushed, the energy, „Cofnij”. */
export interface GroupDragDone {
  status: WeekMoveStatus
  moved: number
  stayed: DragStay[]
  pushed: number
  energy?: EnergyChange
  /** The words of the line (said by the line when something went, else by a message). */
  text: string
  undo: (() => Promise<string | void>) | null
}

/** A drag of a group of blocks of days: the view whose line says it, the selected blocks, the difference, Ctrl held; the days the view shows. */
export interface DayGroupDrag {
  view: Extract<GroupView, 'today' | 'week'>
  keys: readonly DragKey[]
  delta: DragDelta
  copy: boolean
  /** The days the view shows (a block that would go to another one stays); left out – any. */
  inView?: (date: string) => boolean
  /** The window's clock (tests); left out – now. „Today” is counted from it at the write. */
  at?: number
}

/** The blocks of a series among the moved ones (D529: changed as „Tylko to” – the line's note). */
function seriesIn(days: ReadonlyMap<string, GroupDay>, keys: readonly DragKey[]): boolean {
  const list = useData.getState().series
  return keys.some((k) => {
    const b = days.get(k.date)?.ctx.plan.find((x) => x.id === k.id)
    return b != null && seriesOfBlock(list, b, k.date) != null
  })
}

/** The words of the line (D531): „Przeniesiono 3 bloki · 1 został – już trwa · najniższa energia 52 → 44”; with Ctrl – „Skopiowano …”. */
export function dragLineText(o: { copy: boolean; moved: number; stayed: readonly DragStayWhy[]; energy?: EnergyChange | null; series?: boolean }): string {
  return groupLineText({ verb: o.copy ? VERB.copied : VERB.moved, n: o.moved, stayed: o.stayed, energy: o.energy ? { from: o.energy.before, to: o.energy.after } : null, series: o.series === true })
}

/** The days a drag reads: those of the selection and those it would take blocks to (only those the view shows and not gone by). */
function datesOf(keys: readonly DragKey[], delta: DragDelta, today: string, inView?: (date: string) => boolean): string[] {
  const out = new Set<string>()
  for (const k of keys) {
    out.add(k.date)
    const to = addDays(k.date, delta.days)
    if (to >= today && (!inView || inView(to))) out.add(to)
  }
  return [...out].sort()
}

/** Every day read and counted in the turn of the write; a day that cannot be read (or a source that cannot be counted) – why not (the toast says it). */
async function countedAll(dates: readonly string[], sources: ReadonlySet<string>, at: number): Promise<{ files: Record<string, RawRecord | null>; days: Map<string, DayModel> }> {
  const files = await readDayFiles(dates)
  for (const d of dates) if (!(d in files)) throw new Error(moveUnreadableText(d))
  const counted = await Promise.all(dates.map((d) => countedDay(d, files[d] ?? null, at)))
  const days = new Map<string, DayModel>()
  dates.forEach((d, i) => {
    const c = counted[i]
    if (c) days.set(d, c)
    else if (sources.has(d)) throw new Error(moveUncountedText(d))
  })
  return { files, days }
}

/** The pushing of today told to the bar for the marker of variants only (T1541: the line with its „Cofnij” is the window's). */
async function tellBar(today: string, day: { date: string; pushed: readonly unknown[] } | undefined, entry: EditEntry | null, made: RawRecord | null): Promise<void> {
  if (!day || day.date !== today || !day.pushed.length || !entry) return
  try {
    await window.rd.planPushed(today, day.pushed.length, entry, made, false)
  } catch {
    // The plan is saved; only the bar's marker is missing (the main process is closing).
  }
}

/** The energy of today when the drag touches it (D529: the lowest before and after), else none. */
function energyOf(days: ReadonlyMap<string, GroupDay>, d: GroupDragged, today: string): EnergyChange | null {
  const t = days.get(today)
  const after = d.days.find((x) => x.date === today)
  return t && after ? groupEnergy(t, { plan: after.plan }, energyOptions()) : null
}

/** The line of the view and what is said: something went – the line with „Cofnij”; nothing – a message only. */
function tell(view: GroupView, done: GroupDragDone): GroupDragDone {
  if (done.status !== 'saved') return done
  if (done.undo) showGroupLine(view, { text: done.text, undo: done.undo })
  else if (done.stayed.length) toast(done.text, 'info')
  return done
}

/**
 * A group of blocks of days dragged (D531): within a day („Dziś”, a column) or to other days („Tydzień”, „3 dni”), with Ctrl – copied. The line
 * of `view` says it, with its one „Cofnij”.
 */
export function dragDayGroup(o: DayGroupDrag): Promise<GroupDragDone> {
  return (o.copy ? copyGroup(o) : moveGroup(o)).then((done) => tell(o.view, done))
}

/** What a move made in its turn. */
interface MoveMade {
  /** The logical day of the turn of the write (T1773). */
  today: string
  stayed: DragStay[]
  dragged: GroupDragged | null
  whole: DayEdit[]
  /** Within a day: the fields the drag set on each day's blocks (its „Cofnij” is the one of „Przesuń o”); to other days – none. */
  fields: Array<{ date: string; undo: FieldsUndo[] }> | null
  energy: EnergyChange | null
  series: boolean
}

async function moveGroup(o: DayGroupDrag): Promise<GroupDragDone> {
  const state: SendState = { afterSend: false }
  let made: MoveMade | null = null
  const out = await trySaveWith(async () => {
    made = null
    // „Today” and the days read – counted in the turn of the write (T1773: the edits before it may cross 04:00).
    const at = o.at ?? Date.now()
    const today = logicalDayOf(at)
    const dates = datesOf(o.keys, o.delta, today, o.inView)
    const { files, days } = await countedAll(dates, new Set(o.keys.map((k) => k.date)), at)
    const raws = new Map(dates.map((d) => [d, files[d] ?? null]))
    const judged = judgeDrag(days, o.keys, o.delta, today, o.inView ? { inView: o.inView } : {})
    if (!judged.take.length) {
      made = { today, stayed: judged.stayed, dragged: null, whole: [], fields: null, energy: null, series: false }
      return []
    }
    const d = draggedDays({ days, raws }, judged, today, { onUnsettled })
    // Within its day the drag is „Przesuń o” by the difference (the same count – `shiftedDay`): the same „Cofnij” – the fields it set (D529).
    const within = judged.take.every((m) => m.to === m.date)
    const fields = within ? d.days.map((x) => ({ date: x.date, undo: fieldsUndoOf(x.before, x.after, x.date, days.get(x.date)!.ctx.plan) })) : null
    // ONE edit: the halves that bring the blocks first (the owners, T952), the rest laid only once they are.
    const owners: EditEntry[] = []
    const rest: EditEntry[] = []
    for (const s of d.stages) {
      const e = editOf(paths.day(s.date), s.before, s.after)
      if (e) (s.owner ? owners : rest).push(e)
    }
    const after = owners.map((_, i) => i)
    // What „Cofnij” takes back: each day's whole change (T968).
    const whole = d.days.flatMap((x): DayEdit[] => {
      const e = editOf(paths.day(x.date), x.before, x.after)
      return e ? [{ date: x.date, entry: e, made: e.create ? x.after : null }] : []
    })
    made = { today, stayed: judged.stayed, dragged: d, whole, fields, energy: energyOf(days, d, today), series: seriesIn(days, [...judged.take, ...judged.along]) }
    return [...owners, ...rest.map((e) => (after.length ? { ...e, after } : e))]
  }, state)
  const status = statusOf(out, state)
  const m = made as MoveMade | null
  const stayed = m?.stayed ?? []
  const base = { stayed, pushed: 0, undo: null }
  if (status !== 'saved' || !m || !m.dragged) return { status, moved: 0, text: dragLineText({ copy: false, moved: 0, stayed: stayed.map((s) => s.why) }), ...base }
  const d = m.dragged
  const today = m.today
  const todayDay = d.days.find((x) => x.date === today)
  const todayEdit = m.whole.find((x) => x.date === today)
  await tellBar(today, todayDay, todayEdit?.entry ?? null, todayEdit?.made ?? null)
  const pushed = d.days.reduce((n, x) => n + x.pushed.length, 0)
  const moved = d.moved.length
  const done: GroupDragDone = { status, moved, stayed, pushed, text: dragLineText({ copy: false, moved, stayed: stayed.map((s) => s.why), energy: m.energy, series: m.series }), undo: null }
  if (m.energy) done.energy = m.energy
  const fields = m.fields
  if (fields) done.undo = shiftedUndo(fields)
  else if (m.whole.length) done.undo = undoDays(m.whole, d.links, new Set(d.sources), countsOf(d, o.keys))
  return done
}

/**
 * „Cofnij” of a drag within its day (T1763) – the one of „Przesuń o” (`groupActions.ts` `undoEditDays`, one rule – T1772): each block whose fields
 * still stand as the drag left them gets them back (one edit of the days' files), one changed since stays (D313, counted – `keptText`); a day's
 * file gone since – all of it stays. It remembers what it did: a day taken back (saved) is counted once and never sent again; one whose entry met a
 * question waits for your answer – not counted, never sent again (said beside: `unwrittenDaysText`); one refused or not readable now is left for
 * the next „Cofnij”, which does only it – this one throws `UndoNotDone` (the save or the toast said why: the line stays).
 */
function shiftedUndo(items: ReadonlyArray<{ date: string; undo: readonly FieldsUndo[] }>): () => Promise<string | void> {
  const left = new Map(items.map((i) => [i.date, i]))
  let kept = 0
  let waiting = 0
  return async () => {
    const todo = [...left.values()]
    const state: SendState = { afterSend: false }
    const sent: string[] = []
    const counts = new Map<string, number>()
    const notRead: string[] = []
    const out = await trySaveWith(async () => {
      sent.length = 0
      counts.clear()
      notRead.length = 0
      const files = await readDayFiles(todo.map((i) => i.date))
      const entries: EditEntry[] = []
      for (const i of todo) {
        // A day that cannot be read now: left for the next „Cofnij”.
        if (!(i.date in files)) {
          notRead.push(i.date)
          continue
        }
        const now = files[i.date] ?? null
        const u = now ? undoFields(now, i.date, i.undo) : null
        counts.set(i.date, u ? u.kept.length : i.undo.length)
        const e = now && u ? editOf(paths.day(i.date), now, u.raw) : null
        if (e) {
          entries.push(e)
          sent.push(i.date)
        }
      }
      return entries
    }, state)
    for (const i of todo) {
      const n = counts.get(i.date)
      if (n == null) continue
      // A day with nothing to write is done, whatever became of the others' send.
      const k = sent.indexOf(i.date)
      const fate = k < 0 ? 'saved' : out == null ? (state.afterSend ? 'asked' : 'refused') : outcomeFate(out[k])
      if (fate === 'refused') continue
      left.delete(i.date)
      if (fate === 'asked') waiting++
      else kept += n
    }
    if (out != null && notRead.length) toast(undoUnreadableText(notRead), 'error', 6000)
    if (left.size) throw new UndoNotDone()
    const said = [...(kept ? [keptText(kept)] : []), ...unwrittenDaysText({ waitingDays: waiting })]
    return said.length ? said.join(' · ') : undefined
  }
}

/** How many blocks of the drag each day holds (the line's count of what stays when that day changed since). */
function countsOf(d: GroupDragged, keys: readonly DragKey[]): Map<string, number> {
  const out = new Map<string, number>()
  const moved = new Set(d.moved)
  for (const k of keys) if (moved.has(k.id)) out.set(k.date, (out.get(k.date) ?? 0) + 1)
  return out
}

/**
 * „Cofnij” of a drag to other days (D531): from the days' files as they are now, each day that still stands as the drag left it goes back
 * (`takeBackDays`); the days of a block moved between them (`links`) go back together or not at all (D417) – one changed since leaves the rest of
 * them as they are (counted: `keptText`). The days the blocks came from go first (`sources`: their half brings the blocks back – the owner, T953).
 * It remembers what it did (T1780, the rule of T1772): a day taken back (saved) is never sent again; one whose entry met a question waits for your
 * answer – not counted, never sent again; one refused, or of a group with a day not readable now, is left for the next „Cofnij”, which does only
 * those – this one throws `UndoNotDone` (the save or the toast said why: the line stays).
 */
function undoDays(days: readonly DayEdit[], links: readonly string[][], sources: ReadonlySet<string>, counts: ReadonlyMap<string, number>): () => Promise<string | void> {
  const left = new Map(days.map((d) => [d.date, d]))
  let kept = 0
  let waiting = 0
  return async () => {
    const todo = [...left.values()]
    const state: SendState = { afterSend: false }
    const sent: string[] = []
    const stays: string[] = []
    const notRead: string[] = []
    const out = await trySaveWith(async () => {
      sent.length = 0
      stays.length = 0
      notRead.length = 0
      const files = await readDayFiles(todo.map((d) => d.date))
      const t = takeBackDays(todo, files)
      notRead.push(...t.unreadable)
      const changed = new Set(t.changed)
      // The days still to take back of each group of linked days: a day not readable – the group waits; one changed since – the group stays.
      const back = new Map(t.back.map((x) => [x.date, x.edit]))
      const first: EditEntry[] = []
      const then: EditEntry[] = []
      for (const l of links) {
        const open = l.filter((d) => left.has(d))
        if (!open.length || open.some((d) => notRead.includes(d))) continue
        if (open.some((d) => changed.has(d))) {
          stays.push(...open)
          continue
        }
        for (const d of open) {
          const e = back.get(d)
          if (!e) continue
          ;(sources.has(d) ? first : then).push(e)
          sent.push(d)
        }
      }
      // Sources first (sent in that order too): the others laid only once they are.
      const order = [...sent.filter((d) => sources.has(d)), ...sent.filter((d) => !sources.has(d))]
      sent.splice(0, sent.length, ...order)
      const after = first.map((_, i) => i)
      return [...first, ...then.map((e) => (after.length ? { ...e, after } : e))]
    }, state)
    if (out == null && !state.afterSend) throw new UndoNotDone()
    // A group changed since stays as it is – its blocks counted once.
    for (const d of stays) {
      left.delete(d)
      kept += counts.get(d) ?? 0
    }
    sent.forEach((d, k) => {
      const fate = out == null ? 'asked' : outcomeFate(out[k])
      if (fate === 'refused') return
      left.delete(d)
      if (fate === 'asked') waiting++
    })
    if (notRead.length) toast(undoUnreadableText(notRead), 'error', 6000)
    if (left.size) throw new UndoNotDone()
    const said = [...(kept ? [keptText(kept)] : []), ...unwrittenDaysText({ waitingDays: waiting })]
    return said.length ? said.join(' · ') : undefined
  }
}

/** What a copy made in its turn. */
interface CopyMade {
  /** The logical day of the turn of the write. */
  today: string
  stayed: DragStay[]
  dragged: GroupDragged | null
  energy: EnergyChange | null
  /** The attachments each copy sees of its original (their ids) and where the copy is. */
  files: Array<{ date: string; blockId: string; ids: string[] }>
}

/**
 * Ctrl held (D531, D513 for each): every block the drag takes copied to its new place – a new block of yours, the sprawy it is for copied as new
 * ones (going with the day that holds the copy, T923), the originals where they are; the flexible blocks after the copies pushed apart (D367). One
 * edit (`change`); the attachments' files of each copy in the background; „Cofnij” – each day back while it stands as the copy left it.
 */
async function copyGroup(o: DayGroupDrag): Promise<GroupDragDone> {
  let made: CopyMade | null = null
  const r = await change(async (put) => {
    made = null
    const at = o.at ?? Date.now()
    const today = logicalDayOf(at)
    const dates = datesOf(o.keys, o.delta, today, o.inView)
    const { files, days } = await countedAll(dates, new Set(o.keys.map((k) => k.date)), at)
    const raws = new Map(dates.map((d) => [d, files[d] ?? null]))
    const judged = judgeDrag(days, o.keys, o.delta, today, { copy: true, ...(o.inView ? { inView: o.inView } : {}) })
    if (!judged.take.length) {
      made = { today, stayed: judged.stayed, dragged: null, energy: null, files: [] }
      return null
    }
    const cases: Array<{ id: string; raw: RawRecord; date: string }> = []
    const d = draggedDays({ days, raws }, judged, today, {
      onUnsettled,
      copy: (b, startMin, date) => {
        const c = blockCopy(b, startMin, { date, at, caseOf: (id) => rawRecord(paths.record('request', id)) })
        cases.push(...c.cases.map((x) => ({ ...x, date })))
        return c.block
      }
    })
    for (const x of d.days) put(paths.day(x.date), x.before, x.after)
    // A new sprawa goes with the day that holds its block (T923): a question about the day keeps it waiting, „theirs” takes it out.
    for (const c of cases) put(paths.record('request', c.id), null, c.raw, paths.day(c.date))
    const { attachments, templates } = useData.getState()
    const placeOf = (date: string): BlockPlace => {
      const day = days.get(date)!
      return dayPlace(date, day.snapshot.templateId, templates, day.state.dayType)
    }
    made = {
      today,
      stayed: judged.stayed,
      dragged: d,
      energy: energyOf(days, d, today),
      files: d.copies.map((c) => {
        const from = judged.take.find((m) => m.id === c.of.id && m.to === c.date)!.date
        return { date: c.date, blockId: c.block.id, ids: attachmentsOfBlock(attachments, c.of, placeOf(from)).map((a) => a.id) }
      })
    }
    return null
  })
  const m = made as CopyMade | null
  const stayed = m?.stayed ?? []
  const status: WeekMoveStatus = r.saved ? 'saved' : statusOf(r.outcomes, r.sent ?? { afterSend: false })
  const base = { stayed, pushed: 0, undo: null }
  if (!r.saved || !m || !m.dragged) return { status: r.saved && m ? 'saved' : status, moved: 0, text: dragLineText({ copy: true, moved: 0, stayed: stayed.map((s) => s.why) }), ...base }
  const d = m.dragged
  const today = m.today
  const todayDay = d.days.find((x) => x.date === today)
  const u = r.undo.find((x) => x.rel === paths.day(today))
  const entry = u ? editOf(u.rel, u.before, u.after) : null
  await tellBar(today, todayDay, entry, entry?.create ? u!.after : null)
  // The copies of the attachments go on after the save (the window is free at once); a failure says itself.
  const copies = Promise.all(m.files.map((f) => (f.ids.length ? copyAttachments({ scope: 'day', date: f.date, blockId: f.blockId }, f.ids).then((a) => a.added, (): string[] => []) : Promise.resolve([] as string[])))).then((x) => x.flat())
  const moved = d.copies.length
  const pushed = d.days.reduce((n, x) => n + x.pushed.length, 0)
  const counts = new Map<string, number>()
  for (const c of d.copies) counts.set(paths.day(c.date), (counts.get(paths.day(c.date)) ?? 0) + 1)
  const done: GroupDragDone = { status: 'saved', moved, stayed, pushed, text: dragLineText({ copy: true, moved, stayed: stayed.map((s) => s.why), energy: m.energy }), undo: () => undoCopies(r.undo, counts, copies) }
  if (m.energy) done.energy = m.energy
  return done
}

/**
 * „Cofnij” of a group's copy: the copies of the files come to their end first; then each day's file that stands as the copy left it goes back,
 * with the new sprawy going with it (T923); a day changed since stays with its copies (counted – `keptText`). The copies of the attachments of
 * the copies taken back go to the bin (D410). A day that cannot be read now – nothing is taken back (throws: the line stays).
 */
async function undoCopies(undo: readonly CaseUndoFile[], counts: ReadonlyMap<string, number>, files: Promise<string[]>): Promise<string | void> {
  const added = await files.catch((): string[] => [])
  let kept = 0
  const back = new Set<string>()
  const days = undo.filter((u) => counts.has(u.rel))
  const r = await change(async (put) => {
    kept = 0
    back.clear()
    const dates = days.map((u) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(u.rel)![1]!)
    const read = await window.rd.dayFiles(dates)
    if (dates.some((d) => !(d in read))) return DAY_UNREADABLE
    days.forEach((u, i) => {
      const now = read[dates[i]!] ?? null
      if (stands(now, u.after)) {
        put(u.rel, now, u.before)
        back.add(u.rel)
      } else kept += counts.get(u.rel) ?? 0
    })
    for (const u of undo) {
      if (counts.has(u.rel) || !u.owner || !back.has(u.owner)) continue
      const was = rawRecord(u.rel)
      if (stands(was, u.after)) put(u.rel, was, u.before, u.owner)
    }
    return null
  })
  if (!r.saved) throw new UndoNotDone()
  // Only the copies of the days taken back: the others' blocks stay with their files.
  const live = added.filter((id) => {
    const raw = rawRecord(attachmentRel(id))
    const a = raw ? attachmentFrom(raw) : null
    return a != null && a.removedAt == null && a.owner.scope === 'day' && back.has(paths.day(a.owner.date))
  })
  if (live.length) await removeAttachments(live)
  return kept ? keptText(kept) : undefined
}

/**
 * A group of blocks of a template's version dragged on its axis (D531, D372 – only within the version: a difference of time): moved – „Przesuń o”
 * of the menu by the difference (`changeTemplateGroup`: the template read in the turn of the write, one change of the version with the push apart);
 * with Ctrl – copied (`templateGroupCopy`, one change of the template, the copies of the attachments the template's own). The line of the page says
 * it („Przeniesiono 3 bloki · 1 został – sesja · Cofnij”).
 */
export async function dragTemplateGroup(t: TemplateGroupTarget, ids: readonly string[], minutes: number, copy: boolean): Promise<GroupDragDone> {
  const done = copy ? await copyTemplateGroup(t, ids, minutes) : await moveTemplateGroup(t, ids, minutes)
  return tell('template', done)
}

async function moveTemplateGroup(t: TemplateGroupTarget, ids: readonly string[], minutes: number): Promise<GroupDragDone> {
  const g = await changeTemplateGroup(t, ids, { k: 'shift', minutes })
  const stayed = g.skipped.map((s): DragStay => ({ date: '', id: s.id, why: stayWordOf(s.why) }))
  const text = dragLineText({ copy: false, moved: g.changed, stayed: stayed.map((s) => s.why) })
  const undo = g.undo
  return {
    status: g.status,
    moved: g.changed,
    stayed,
    pushed: g.pushed,
    text,
    undo: undo
      ? async () => {
          const u = await undo()
          if (!u.saved) throw new UndoNotDone()
          // What stayed (changed since), the days whose taking back waits for your answer – as the menu's „Cofnij” says it (`sayGroupDone`).
          const said = [...(u.kept ? [keptText(u.kept)] : []), ...unwrittenDaysText({ waitingDays: u.waitingDays })]
          return said.length ? said.join(' · ') : undefined
        }
      : null
  }
}

/** The day a version makes now and the ids of its blocks in the day and back (a session – by its entry, D511). */
function templateNow(t: TemplateGroupTarget) {
  const raw = rawRecord(paths.record('template', t.templateId))
  const tpl = raw ? templateFrom(raw) : null
  if (!raw || !tpl) return null
  const v0 = versionFrom(tpl, t.from)
  const { rd, lectures, routines } = useData.getState()
  const day = templateDayOf(tpl, v0, sampleDay(tpl, t.from), { changes: rd.settings, lectures, routines })
  const toVersion = axisSources(day.ctx.plan, v0.blocks)
  const toDay = new Map([...toVersion].map(([dayId, of]) => [of, dayId]))
  return { raw, tpl, v0, day, toVersion, toDay }
}

async function copyTemplateGroup(t: TemplateGroupTarget, ids: readonly string[], minutes: number): Promise<GroupDragDone> {
  const rel = paths.record('template', t.templateId)
  type Made = { stayed: DragStay[]; puts: Array<{ block: PlanBlock; of: PlanBlock }>; pushed: number }
  let made: Made | null = null
  const r = await change((write) => {
    made = null
    const n = templateNow(t)
    if (!n) return 'Tego szablonu już nie ma.'
    const j = judgeGroup(n.day, ids.map((id) => n.toDay.get(id) ?? id), { k: 'shift', minutes }, '')
    // A copy takes no anchored block (as on a day, T1756): it stays – „zakotwiczony”.
    const stayed = [...j.skipped.map((s): DragStay => ({ date: '', id: n.toVersion.get(s.id) ?? s.id, why: stayWordOf(s.why) })), ...j.along.map((id): DragStay => ({ date: '', id: n.toVersion.get(id) ?? id, why: 'zakotwiczony' }))]
    if (!j.take.length) {
      made = { stayed, puts: [], pushed: 0 }
      return null
    }
    const c = templateGroupCopy(n.day, j.take, minutes, () => newId(10))
    const patches = new Map<string, Partial<PlanBlock>>()
    for (const p of c.patches) patches.set(p.id, { ...patches.get(p.id), ...p.patch })
    const next = withTemplateVersion(n.tpl, t.from, (v) => ({ blocks: [...v.blocks.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id)! } : b)), ...c.puts.map((p) => p.block)] }))
    write(rel, n.raw, templateJson(next, n.raw))
    const byId = new Map(n.v0.blocks.map((b) => [b.id, b]))
    made = { stayed, puts: c.puts.flatMap((p) => (byId.has(p.of) ? [{ block: p.block, of: byId.get(p.of)! }] : [])), pushed: c.pushed }
    return null
  })
  const m = made as Made | null
  const stayed = m?.stayed ?? []
  if (!r.saved || !m || !m.puts.length) return { status: r.saved ? 'saved' : statusOf(r.outcomes, r.sent ?? { afterSend: false }), moved: 0, stayed, pushed: 0, text: dragLineText({ copy: true, moved: 0, stayed: stayed.map((s) => s.why) }), undo: null }
  const { attachments } = useData.getState()
  const place: BlockPlace = { scope: 'template', templateId: t.templateId }
  const files = Promise.all(
    m.puts.map((p) => {
      const seen = attachmentsOfBlock(attachments, p.of, place).map((a) => a.id)
      return seen.length ? copyAttachments({ scope: 'template', templateId: t.templateId, blockId: p.block.id }, seen).then((a) => a.added, (): string[] => []) : Promise.resolve([] as string[])
    })
  ).then((x) => x.flat())
  const undo = r.undo
  const moved = m.puts.length
  return {
    status: 'saved',
    moved,
    stayed,
    pushed: m.pushed,
    text: dragLineText({ copy: true, moved, stayed: stayed.map((s) => s.why) }),
    undo: async () => {
      const added = await files.catch((): string[] => [])
      let back = false
      const u = await change((put) => {
        back = false
        const own = undo.find((x) => x.rel === rel)
        if (!own) return null
        const now = rawRecord(rel)
        if (!stands(now, own.after)) return null
        put(rel, now, own.before)
        back = true
        return null
      })
      if (!u.saved) throw new UndoNotDone()
      if (!back) return keptText(moved)
      const live = added.filter((id) => {
        const raw = rawRecord(attachmentRel(id))
        return raw != null && attachmentFrom(raw)?.removedAt == null
      })
      if (live.length) await removeAttachments(live)
    }
  }
}

/**
 * The preview of a group dragged on the axis of a version (D531): the blocks of the version the drag takes at their new places, what they push
 * apart, the copies (Ctrl) – by the ids in the version, the same count as the write (`templateShift`, `templateGroupCopy`). Null – nothing moves.
 */
export function templateDragPreview(day: TemplateDay, toVersion: ReadonlyMap<string, string>, ids: readonly string[], minutes: number, copy: boolean): DragPreview | null {
  const toDay = new Map([...toVersion].map(([dayId, of]) => [of, dayId]))
  const j = judgeGroup(day, ids.map((id) => toDay.get(id) ?? id), { k: 'shift', minutes }, '')
  if (!j.take.length) return null
  if (copy) {
    const c = templateGroupCopy(day, j.take, minutes, copyKeyOf)
    return { moved: new Map(), pushed: c.preview, copies: c.copies }
  }
  // The blocks the drag takes and those anchored to them (selected or not – they follow their anchor, as `dragPreview`), by their ids in the version.
  const taken = new Set(j.take)
  const plan = new Map(day.ctx.plan.map((b) => [b.id, b]))
  const moved = new Set(day.ctx.plan.filter((b) => taken.has(b.id) || followsMoving(plan, b.id, taken)).map((b) => toVersion.get(b.id) ?? b.id))
  const s = templateShift(day, j.take, minutes, { preview: true })
  const out: DragPreview = { moved: new Map(), pushed: new Map(), copies: new Map() }
  for (const [id, span] of s.preview ?? []) (moved.has(id) ? out.moved : out.pushed).set(id, span)
  return out
}

/**
 * The days of a group dragged in the columns (D531), counted for its places while it is held: `dates` read and counted now; a day that cannot be
 * read or counted is left out (its blocks have no place shown). The same count the drop is judged on (`judgeDrag`).
 */
export async function countDragDays(dates: readonly string[], at = Date.now()): Promise<Map<string, DayModel>> {
  const files = await readDayFiles(dates)
  const readable = dates.filter((d) => d in files)
  const counted = await Promise.all(readable.map((d) => countedDay(d, files[d] ?? null, at)))
  return new Map(readable.flatMap((d, i) => (counted[i] ? [[d, counted[i]!] as const] : [])))
}

/**
 * Where the selected blocks of a group dragged in the columns would go (D531) – the judgement of the drop (`judgeDrag` on the days counted,
 * `countDragDays`): each block the drag takes at its new start in its new day, each anchored one that follows in its new day (`startMin` null –
 * its place is its anchor's end: where the columns show it plus the minutes). Both go – their tiles are dimmed while it is held.
 */
export function dragGoing(days: ReadonlyMap<string, GroupDay>, keys: readonly DragKey[], delta: DragDelta, today: string, o: { inView?: (date: string) => boolean; copy?: boolean } = {}): { judged: DragJudged; places: Array<DragKey & { to: string; startMin: number | null }> } {
  const judged = judgeDrag(days, keys, delta, today, o)
  const places = [...judged.take.map((m) => ({ date: m.date, id: m.id, to: m.to, startMin: m.startMin as number | null })), ...judged.along.map((a) => ({ ...a, to: addDays(a.date, delta.days), startMin: null }))]
  return { judged, places }
}
