/**
 * Kopia Ctrl + przeciągnięciem (D513) – the one place for what a copy of an item is: a block (`blockCopy`, with the sprawy it is
 * for copied as new ones), a sprawa or a request (`copiedCase`), an all-day event (`copiedAllDay`). A copy never takes the
 * original's history (starts, ticks, being done): it takes the content – the note, the steps, the name; the attachments' files are
 * copied by the main process (`main/data/attachments.ts` `prepareCopies`). Pure: the window writes them.
 */
import type { AllDayEvent } from '../model/allDay'
import { newId } from '../model/ids'
import type { PlanBlock } from '../model/plan'
import { requestFrom } from '../model/requests'
import { addDays, daysBetween } from '../time/zone'
import { scheduledRaw } from './cases'
import { copiedBlock } from './planEdit'

type Raw = Record<string, unknown>

/**
 * A sprawa (a task or a request) copied (D513): a new one with the same content – the title, the person, the estimate, the
 * category, the note, the dates, the priority, the steps and fields this version does not know – and a state of its own: not done
 * (a done one goes to „Skrzynka”), planned nowhere, none of its steps ticked, made now; a task that repeats (D465) is copied as a task
 * of one time (no „Powtarzaj”: never a second run of its repeats). Null – the file is no sprawa.
 */
export function copiedCase(raw: Raw, id: string, at: number): Raw | null {
  const r = requestFrom(raw)
  if (!r) return null
  const { stepsDone: _ticks, repeat: _repeat, ...content } = raw
  const done = r.state === 'done' || r.state === 'dropped' || r.list === 'done'
  const list = done ? { list: 'inbox', listDay: null, listSetDay: null } : {}
  return { ...content, id, createdAt: at, state: 'queued', day: null, block: null, doneAt: null, ...list }
}

/** A block copied (D513) and the sprawy it is for, copied as new ones (their files, planned in the copy). */
export interface BlockCopy {
  block: PlanBlock
  cases: Array<{ id: string; raw: Raw }>
}

/**
 * Block `b` copied into the day `date` at `startMin` (D513, `copiedBlock`): the task and each request of the block copied too
 * (`copiedCase`, by the files `caseOf` gives – one not there any more is left out: the copy is a block of its category alone),
 * each planned in the copy (`scheduledRaw`). `id` – how new ids are made (tests); `at` – now.
 */
export function blockCopy(b: PlanBlock, startMin: number, o: { date: string; at: number; caseOf: (id: string) => Raw | null; id?: () => string }): BlockCopy {
  const make = o.id ?? (() => newId())
  const blockId = make()
  const cases: BlockCopy['cases'] = []
  const copyOf = (from: string): string | null => {
    const raw = o.caseOf(from)
    if (!raw) return null
    const id = make()
    const c = copiedCase(raw, id, o.at)
    if (!c) return null
    cases.push({ id, raw: scheduledRaw(c, o.date, blockId, o.at) })
    return id
  }
  const task = b.task ? copyOf(b.task) : null
  const requests = b.requests.map(copyOf).filter((x): x is string => x != null)
  return { block: copiedBlock(b, startMin, { id: blockId, task, requests }), cases }
}

/** An all-day event copied (D513): a new id, the same title, note, colour, calendar and „To wolne”, as many days long from `startDate`. */
export function copiedAllDay(e: AllDayEvent, id: string, startDate: string): AllDayEvent {
  return { ...e, id, startDate, endDate: addDays(startDate, daysBetween(e.startDate, e.endDate)) }
}
