/**
 * Group changes of „Sprawy” (D527–D531, ciąg Z, 1.28.0): several sprawy changed in one edit of the queue – the same ways the actions
 * of one sprawa go (`change`, `rawRecord`, `casePlan`), each file of the change in one list, one „Cofnij” for all (`undoGroup`). A
 * sprawa the action does not concern is left out and named with its reason (D72: nothing is refused – `GroupResult.skipped`); a
 * change that cannot be made (an estimate out of its range, a day not readable now) is refused whole, nothing written. The line
 * over the screen and the menu are the screens' (`features/cases`); the texts of the line – `groupText`.
 */
import type { RawRecord } from '@shared/api'
import { isRaw } from '@shared/data/dayEdits'
import { sameContentAs } from '@shared/data/merge'
import { classify, paths } from '@shared/data/paths'
import { casePlan, listOf } from '@shared/engine/cases'
import { categoryStep, doneStep, estimateRefusal, estimateStep, movedStep, restoredStep, revertedRaw, SKIP, type GroupSkip, type GroupStep } from '@shared/engine/casesGroup'
import { copiedCase } from '@shared/engine/copy'
import { newId } from '@shared/model/ids'
import type { PlanBlock } from '@shared/model/plan'
import { requestFrom, type CaseList, type RequestRecord } from '@shared/model/requests'
import { settingsOn } from '@shared/model/settings'
import { logicalDayOf } from '@shared/time/day'
import { change, changeOne, DAY_UNREADABLE, daysNow, pushedInto, readPlanDays, type CasePush, type CaseResult, type CaseUndoFile } from './cases'
import { rawRecord, useData } from './data'

const relOf = (id: string): string => paths.record('request', id)

/** What a group change did: the sprawy it changed, those it left out (with why), and its one „Cofnij” (`CaseResult.undo`, `undoGroup`). */
export interface GroupResult extends CaseResult {
  /** How many sprawy were changed (a copy made, a block put, a record written or removed); 0 when nothing was saved. */
  changed: number
  skipped: GroupSkip[]
  /** The ids of the next tasks made by ticking off tasks that repeat (D465); empty – none. */
  nextIds: string[]
}

/** The result of `change` as a group's – a change not saved (refused, nothing written) changed and skipped nothing. */
function resultOf(r: CaseResult, changed: number, skipped: readonly GroupSkip[], next: readonly string[] = []): GroupResult {
  return { ...r, changed: r.saved ? changed : 0, skipped: r.saved ? [...skipped] : [], nextIds: r.saved ? [...next] : [] }
}

/**
 * The records `ids` changed by `step` – each from what it is in its turn, by the one way a change of one sprawa goes (`changeOne`:
 * a task that repeats taken to „Zrobione” gets its next one in the same edit, D465); a sprawa that is gone, or that `step` leaves out
 * (a refusal of its own too – D72), is named in `skipped`, the others are written.
 */
async function changeRecords(ids: readonly string[], step: (raw: RawRecord, at: number) => GroupStep): Promise<GroupResult> {
  let skipped: GroupSkip[] = []
  let changed = 0
  let next: string[] = []
  const r = await change((put) => {
    skipped = []
    changed = 0
    next = []
    const at = Date.now()
    for (const id of new Set(ids)) {
      const o = changeOne(put, id, at, step)
      if ('gone' in o) skipped.push({ id, reason: SKIP.gone })
      else if ('skip' in o) skipped.push({ id, reason: o.skip })
      else if ('error' in o) skipped.push({ id, reason: SKIP.refused })
      else {
        changed++
        if (o.next) next.push(String(o.next.id))
      }
    }
    return null
  })
  return resultOf(r, changed, skipped, next)
}

/** „Przenieś na listę” (D528): the sprawy to a list; those that are on it already are left out. */
export function moveCases(ids: readonly string[], list: CaseList): Promise<GroupResult> {
  return changeRecords(ids, (raw, at) => (list === 'done' ? doneStep(raw, at) : movedStep(raw, list, at)))
}

/** „Zrobione” (D528): the sprawy done now – a task that repeats gets its next one, as for one (D465); one done already is left out. */
export function doneCases(ids: readonly string[]): Promise<GroupResult> {
  return changeRecords(ids, doneStep)
}

/**
 * „Przywróć” (D528): the done sprawy back on `list` (default „Skrzynka”: a done sprawa has no list of before), without a block, as
 * moving one out of „Zrobione” does; one not done is left out.
 */
export function restoreCases(ids: readonly string[], list: Exclude<CaseList, 'done'> = 'inbox'): Promise<GroupResult> {
  return changeRecords(ids, (raw, at) => restoredStep(raw, list, at))
}

/** The category of the tasks (D528); a request has none – it is left out as „prośba”. */
export function categoryCases(ids: readonly string[], categoryId: string): Promise<GroupResult> {
  return changeRecords(ids, (raw, at) => categoryStep(raw, categoryId, at))
}

/** The estimate in minutes (D528); out of its range – nothing written, the reason as the field of one sprawa says it (`patchedRaw`). */
export async function estimateCases(ids: readonly string[], estimateMin: number): Promise<GroupResult> {
  const refusal = estimateRefusal(estimateMin)
  if (refusal) return resultOf(await change(() => refusal), 0, [])
  return changeRecords(ids, (raw, at) => estimateStep(raw, estimateMin, at))
}

/** Removed (D528) – as `removeCase` for each, in one edit; its one „Cofnij” (`undoGroup`) brings all the files back. */
export async function removeCases(ids: readonly string[]): Promise<GroupResult> {
  let skipped: GroupSkip[] = []
  let changed = 0
  const r = await change((put) => {
    skipped = []
    changed = 0
    for (const id of new Set(ids)) {
      const rel = relOf(id)
      const before = rawRecord(rel)
      if (!before) {
        skipped.push({ id, reason: SKIP.gone })
        continue
      }
      put(rel, before, null)
      changed++
    }
    return null
  })
  return resultOf(r, changed, skipped)
}

/** What the sprawy put on the axis made (`planCases`): the blocks in the order of the list, the starts pushed apart (D367). */
export interface GroupPlanResult extends GroupResult {
  blocks: Array<{ id: string; block: PlanBlock }>
  moved: number
}

/**
 * The sprawy `ids` put on the axis of `date`, one after another from `startMin` – the first there, each next right after the end of
 * the one before (D530: „Zaplanuj…” of the menu and the drop of a group from the panel „Sprawy”) – in the order of `ids`. Each as
 * „Zaplanuj” of one sprawa is (`casePlan`: a flexible block of its category as long as its estimate, a request – a block of requests;
 * one already „zaplanowane” is planned again, its old block not begun leaves its day), all of them in one edit of the day's file (as
 * `planMorning`) and the records; `push` – the blocks the whole group pushes apart (D367), counted by the window on the day with all the
 * new blocks (`planGroupOnAxis`). A done one is left out as „zrobiona” (D72); `copy` (Ctrl, D513) plans a new sprawa of the same content
 * for each (`copiedCase`) and leaves the originals as they are (nothing is left out then). What is left out is decided before any day is
 * read – the days are read only for the sprawy to plan; a day not readable now, or the log of an old block not read in full – nothing
 * written (`DAY_UNREADABLE`). „Cofnij” – `undoGroup(result.undo)` takes all the blocks and the copies away.
 */
export async function planCases(ids: readonly string[], date: string, startMin: number, o: { push?: CasePush; seen?: (date: string) => RawRecord | null | undefined; copy?: boolean } = {}): Promise<GroupPlanResult> {
  const unique = [...new Set(ids)]
  // D513: the new sprawy's ids are made before the turn – a turn that runs again makes the same ones.
  const copyIds = new Map(unique.map((id) => [id, newId()] as const))
  let skipped: GroupSkip[] = []
  let blocks: Array<{ id: string; block: PlanBlock }> = []
  let moved = 0
  const r = await change(async (put) => {
    skipped = []
    blocks = []
    moved = 0
    const at = Date.now()
    const today = logicalDayOf(at)
    const subjects: Array<{ id: string; original: RawRecord; before: RawRecord; record: RequestRecord; copyId: string | null }> = []
    for (const id of unique) {
      const original = rawRecord(relOf(id))
      const copyId = o.copy ? copyIds.get(id)! : null
      const before = original ? (copyId ? copiedCase(original, copyId, at) : original) : null
      const record = before ? requestFrom(before) : null
      if (!original || !before || !record) skipped.push({ id, reason: SKIP.gone })
      else if (!copyId && listOf(record, today) === 'done') skipped.push({ id, reason: SKIP.done })
      else subjects.push({ id, original, before, record, copyId })
    }
    if (!subjects.length) return null
    const read = await readPlanDays(
      subjects.map((s) => s.record),
      date,
      o.seen
    )
    if (!read) return DAY_UNREADABLE
    const { days, begunOf } = read
    const rules = settingsOn(useData.getState().rd.settings, date).categories
    // Now – in the turn of the write; each sprawa after the one before it: the files after it are the next one's.
    const files: Record<string, RawRecord | null> = { ...days }
    const touched = new Set<string>()
    const made: Array<{ s: (typeof subjects)[number]; record: RawRecord }> = []
    let from = startMin
    for (const s of subjects) {
      const p = casePlan({ record: s.before, date, startMin: from, files, rules, at, begun: begunOf })
      if (!p) {
        skipped.push({ id: s.id, reason: SKIP.gone })
        continue
      }
      // Its old block today or later, its log not known: whether it began is not known – no write (T774).
      if ('refused' in p) return DAY_UNREADABLE
      for (const [d, after] of Object.entries(p.days)) {
        files[d] = after
        touched.add(d)
      }
      made.push({ s, record: p.record })
      blocks.push({ id: s.id, block: p.block })
      from += p.block.durationMin
    }
    for (const d of touched) {
      let next = files[d]!
      if (d === date && o.push) {
        const pushed = pushedInto(next, d, o.push)
        next = pushed.next
        moved = pushed.moved
      }
      put(paths.day(d), days[d] ?? null, next)
    }
    // A copy is a new file that goes with the day holding its block (T923); a sprawa planned – its own file.
    for (const m of made) {
      if (m.s.copyId) put(relOf(m.s.copyId), null, m.record, paths.day(date))
      else put(relOf(m.s.id), m.s.original, m.record)
    }
    return null
  })
  const out = resultOf(r, blocks.length, skipped)
  return { ...out, blocks: r.saved ? blocks : [], moved: r.saved ? moved : 0 }
}

/** What „Cofnij” of a group change did: how many sprawy went back, and how many stayed because they changed since (D529, D313). */
export interface GroupUndoResult extends CaseResult {
  /** The sprawy whose fields went back (a copy taken away, a removed one brought back count too). */
  restored: number
  /** The sprawy left as they are – changed since the change (here, or on another computer) or tied to a file that is; the line says it. */
  kept: number
  /** The days' files left as they are for the same reason (a block of the group moved or removed since). */
  daysKept: number
}

/**
 * „Cofnij” of one group change (D529, D313): the records go back field by field – only the fields the change set, only while they have
 * the value it gave them (`revertedRaw`); a sprawa changed since stays and is counted in `kept` (said, never silent). A day's file goes
 * back whole, only while it stands as the change left it (`daysKept` – as for one sprawa, `undoCase`); the sprawy of a day whose file
 * stayed (the day the change planned them in, and the copies it made there) stay with it and are counted in `kept` – never a block of
 * the group left on the axis with its sprawa gone, nor a sprawa „zaplanowane” in a block that is gone. A record the change made is taken away
 * only while it stands as it was made – the next task of a tick (`owner`) only with the tick taken back; one the change removed is
 * brought back only while there is none. One edit for all of it.
 */
export async function undoGroup(undo: readonly CaseUndoFile[]): Promise<GroupUndoResult> {
  let restored = 0
  let kept = 0
  let daysKept = 0
  const r = await change(async (put) => {
    restored = 0
    kept = 0
    daysKept = 0
    const dates = undo.flatMap((u) => {
      const c = classify(u.rel)
      return c?.kind === 'day' && c.date ? [c.date] : []
    })
    const days = dates.length ? await daysNow(dates) : {}
    if (!days) return DAY_UNREADABLE
    // The days first: whether each file stands as the change left it decides for the sprawy that stand in it.
    const dayBack = new Map<string, boolean>()
    for (const u of undo) {
      const c = classify(u.rel)
      if (c?.kind !== 'day' || c.conflict) continue
      const now = days[c.date!] ?? null
      const stands = now == null ? u.after == null : u.after != null && isRaw(now) && sameContentAs(now, u.after)
      dayBack.set(u.rel, stands)
      if (stands) put(u.rel, now, u.before, u.owner)
      else daysKept++
    }
    // The day a record's change tied it to: where its block was put, or the day a copy was made with.
    const dayOf = (u: CaseUndoFile): string | null => {
      if (u.owner != null && classify(u.owner)?.kind === 'day') return u.owner
      const now = u.after?.day
      return typeof now === 'string' && (u.before?.day !== now || u.before?.block !== u.after?.block) ? paths.day(now) : null
    }
    // A record the change wrote for another record (the next of a tick) is not a sprawa of its own in the count.
    const owned = new Set(undo.filter((u) => u.owner != null && classify(u.owner)?.kind === 'request').map((u) => u.rel))
    const back = new Set<string>()
    for (const u of undo) {
      const c = classify(u.rel)
      if (!c || c.conflict || c.kind !== 'request') continue
      const count = !owned.has(u.rel)
      const tied = dayOf(u)
      if (tied != null && dayBack.get(tied) === false) {
        if (count) kept++
        continue
      }
      // The next task goes only with its tick: the tick left as it is, the next one stays too.
      if (u.owner != null && classify(u.owner)?.kind === 'request' && !back.has(u.owner)) continue
      const now = rawRecord(u.rel)
      if (u.before && u.after) {
        const reverted = isRaw(now) ? revertedRaw(now, u.before, u.after) : 'kept'
        if (reverted === 'same') continue
        if (reverted === 'kept') {
          if (count) kept++
          continue
        }
        put(u.rel, now!, reverted.raw, u.owner)
      } else if (!u.before) {
        // Made by the change: taken away only while it stands as it was made (gone already – nothing to take).
        if (!now) continue
        if (!(u.after && isRaw(now) && sameContentAs(now, u.after))) {
          if (count) kept++
          continue
        }
        put(u.rel, now, null, u.owner)
      } else if (!now) put(u.rel, null, u.before, u.owner)
      else {
        if (!sameContentAs(now, u.before) && count) kept++
        continue
      }
      back.add(u.rel)
      if (count) restored++
    }
    return null
  })
  return { ...r, restored: r.saved ? restored : 0, kept: r.saved ? kept : 0, daysKept: r.saved ? daysKept : 0 }
}
