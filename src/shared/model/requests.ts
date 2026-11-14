/**
 * „Sprawy” (D383, D384, D402; spec „Prośba”, „Prawdziwy Backlog i Skrzynka Spraw”): a task of your own or a request – a
 * person from the list, an estimate of time and a note, its modes and the cost of contact as before. One file per sprawa
 * in requests/<id>.json – the files the requests had: a file written before „Sprawy” reads as a sprawa as it is, nothing
 * is migrated in place (T750). The lists (Skrzynka · Dziś · W tym tygodniu · Kiedyś / Może · Zrobione) are read from the
 * file with the day (`engine/cases.ts`); `state` stays the field the versions before „Sprawy” read and write – the new
 * version keeps it in step, so an older version on another computer still shows and changes it without losing a field.
 * „Zrobione teraz”, urgent and evening requests are started in the widget (E5) – they are events of the log.
 * HKU2 (D409, D451): „Termin” (`dueDate`) and „Wykonać” (`doDate`) of every sprawa, and the day of the last move by hand
 * (`listSetDay`) – the date of doing puts it on „Dziś” on its day, counted like the lists (never written at 04:00).
 * HKU3 (D450): the quarter of the Eisenhower matrix (`priority`) of every sprawa – none by default.
 * D465: a task may repeat (`repeat`, `taskRepeat.ts`) – ticked off, the next one is made at once (`engine/caseRepeat.ts`).
 */
import { isIsoDate } from '../time/zone'
import { doneSetFrom, stepsFrom, type Step } from './steps'
import { taskRepeatFrom, type TaskRepeat } from './taskRepeat'

export const REQUEST_SCHEMA = 1

/**
 * As the versions before „Sprawy” write it: queued – waiting; planned – chosen into a day's block; done; dropped – will
 * not be done. It decides whether a sprawa is done (`done`, `dropped`) – an older version's „Zrobiona” and „Do kolejki” keep working.
 */
export type RequestState = 'queued' | 'planned' | 'done' | 'dropped'
export const REQUEST_STATES: readonly RequestState[] = ['queued', 'planned', 'done', 'dropped']
/** The states by their names in the interface (the list, the search). */
export const REQUEST_STATE_NAMES: Record<RequestState, string> = { queued: 'w kolejce', planned: 'w planie', done: 'zrobione', dropped: 'porzucone' }
/** The order the list shows states in (the order of `REQUEST_STATES`). */
export const requestStateOrder = (state: RequestState): number => REQUEST_STATES.indexOf(state)

/** A task of your own, or a request (with a person – D383). */
export type CaseKind = 'task' | 'request'

/** The lists of „Sprawy” (D383). */
export type CaseList = 'inbox' | 'today' | 'week' | 'someday' | 'done'
export const CASE_LISTS: readonly CaseList[] = ['inbox', 'today', 'week', 'someday', 'done']
/** The lists not done, in their order. */
export const OPEN_LISTS: readonly CaseList[] = ['inbox', 'today', 'week', 'someday']
export const CASE_LIST_NAMES: Record<CaseList, string> = { inbox: 'Skrzynka', today: 'Dziś', week: 'W tym tygodniu', someday: 'Kiedyś / Może', done: 'Zrobione' }
export const isCaseList = (v: unknown): v is CaseList => (CASE_LISTS as readonly unknown[]).includes(v)

/**
 * The quarter of the Eisenhower matrix (D450): P1 „Ważne i pilne”, P2 „Ważne”, P3 „Pilne”, P4 „Ani to, ani to”; null – none
 * (the default). The order of this list is the order the lists show them in (`caseGroupOf`).
 */
export type Priority = 'p1' | 'p2' | 'p3' | 'p4'
export const PRIORITIES: readonly Priority[] = ['p1', 'p2', 'p3', 'p4']
/** The names of the quarters in one place: in full (headings, the choice) and short (a tight place). */
export const PRIORITY_NAMES: Record<Priority, { name: string; short: string }> = {
  p1: { name: 'Ważne i pilne', short: 'P1' },
  p2: { name: 'Ważne', short: 'P2' },
  p3: { name: 'Pilne', short: 'P3' },
  p4: { name: 'Ani to, ani to', short: 'P4' }
}
/** What stands for the lack of a quarter (the choice, the matrix's field). */
export const NO_PRIORITY_NAME = 'Bez priorytetu'
export const isPriority = (v: unknown): v is Priority => (PRIORITIES as readonly unknown[]).includes(v)
/** A priority from a file or a patch: a quarter or null – anything else reads as none (D450). */
export const priorityFrom = (v: unknown): Priority | null => (isPriority(v) ? v : null)

export interface RequestRecord {
  id: string
  kind: CaseKind
  /** A task's title (required – D384); a request is named by its person and its note ('' then). */
  title: string
  person: string | null
  estimateMin: number | null
  /** A task's category – the category of its block (D384); null: „Inne” (`DEFAULT_TASK_CATEGORY`). */
  categoryId: string | null
  note: string
  createdAt: number
  /** As written (see `RequestState`). */
  state: RequestState
  /** The day and the block it was put into, as written („zaplanowane” while the block is there – `engine/cases.ts`). */
  day: string | null
  block: string | null
  /** The list as written; null – a file from before „Sprawy” (its list comes from `state`, D402). */
  list: CaseList | null
  /** The logical day it was put on „Dziś” (D383: not done, it is back in „W tym tygodniu” at 04:00 after it). */
  listDay: string | null
  /** When it was marked done; null – not done, or done before „Sprawy” (`doneDayOf`). */
  doneAt: number | null
  /** „Termin” (D409): the day it has to be done by – a task and a request alike; null – none. */
  dueDate: string | null
  /** „Wykonać” (D409, D451): the day it is to be done on – on that day it is on „Dziś” (`engine/cases.ts`); null – none. */
  doDate: string | null
  /**
   * The logical day it was last moved to a list by hand (T851) – a move on its date of doing or after it wins over the
   * date (D451); null – never moved since the date was set (setting the date clears it), or a file written before HKU2.
   */
  listSetDay: string | null
  /** The quarter of the Eisenhower matrix (D450); null – none. A done sprawa keeps it but lists do not order it by it. */
  priority: Priority | null
  /**
   * A task's list „Kroki” (D440, T786): in the file `steps` (the list) and `stepsDone` (step id → true); its block gets a
   * copy of the list, and a tick in the block ticks it here too (`engine/steps.ts`). A version that does not know them keeps them.
   */
  steps: Step[]
  /** „Powtarzaj” of a task (D465); null – it does not repeat (a request never does). */
  repeat: TaskRepeat | null
}

/** The week a weekly repeat without its own counts from when the file lost it: the task's date, else a fixed Monday (the same on every computer). */
const REPEAT_ANCHOR = '2026-01-05'

/** The estimate's range (a field of whole minutes, like a block's length). */
export const ESTIMATE_RANGE = [1, 8 * 60] as const
/** The estimate a request without one counts with in the plan (the urgent request's default in the widget, spec). */
export const DEFAULT_ESTIMATE_MIN = 15
/** A new task's estimate and category (D384). */
export const DEFAULT_TASK_MIN = 30
export const DEFAULT_TASK_CATEGORY = 'inne'
/** The longest title of a task, and of a note (as the requests had it). */
export const TITLE_MAX = 200
export const CASE_NOTE_MAX = 500

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const estimateFrom = (est: unknown): number | null => (typeof est === 'number' && Number.isInteger(est) && est >= ESTIMATE_RANGE[0] && est <= ESTIMATE_RANGE[1] ? est : null)
/** A day of the record ('RRRR-MM-DD'); anything else – none (a broken date reads as no date, D409). */
export const dateFrom = (v: unknown): string | null => (isIsoDate(v) ? v : null)
/** A title as stored: one line, trimmed, at most `TITLE_MAX`. */
export const titleOf = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : '')

/** A sprawa from its file – a file of any version (unknown fields stay in the file; nothing here writes it). */
export function requestFrom(v: unknown): RequestRecord | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id) return null
  return {
    id: v.id,
    kind: v.kind === 'task' ? 'task' : 'request',
    title: titleOf(v.title),
    person: typeof v.person === 'string' && v.person ? v.person : null,
    estimateMin: estimateFrom(v.estimateMin),
    categoryId: typeof v.categoryId === 'string' && v.categoryId ? v.categoryId : null,
    note: typeof v.note === 'string' ? v.note.slice(0, CASE_NOTE_MAX) : '',
    createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : 0,
    state: (REQUEST_STATES as readonly unknown[]).includes(v.state) ? (v.state as RequestState) : 'queued',
    day: isIsoDate(v.day) ? v.day : null,
    block: typeof v.block === 'string' && v.block ? v.block : null,
    list: isCaseList(v.list) ? v.list : null,
    listDay: isIsoDate(v.listDay) ? v.listDay : null,
    doneAt: typeof v.doneAt === 'number' && Number.isFinite(v.doneAt) && v.doneAt > 0 ? v.doneAt : null,
    dueDate: dateFrom(v.dueDate),
    doDate: dateFrom(v.doDate),
    listSetDay: dateFrom(v.listSetDay),
    priority: priorityFrom(v.priority),
    steps: stepsFrom(v.steps, doneSetFrom(v.stepsDone)),
    repeat: v.kind === 'task' ? taskRepeatFrom(v.repeat, dateFrom(v.doDate) ?? dateFrom(v.dueDate) ?? REPEAT_ANCHOR) : null
  }
}

/** The new request's fields (as written: the queue creates the file) – in „Skrzynka”, as a request „w kolejce” was. */
export function newRequest(id: string, at: number, p: { person: string | null; estimateMin: number | null; note: string; dueDate?: string | null; doDate?: string | null; priority?: Priority | null }): Record<string, unknown> {
  return { schema: REQUEST_SCHEMA, id, kind: 'request', person: p.person, estimateMin: p.estimateMin, note: p.note, createdAt: at, state: 'queued', day: null, block: null, list: 'inbox', listDay: null, doneAt: null, dueDate: dateFrom(p.dueDate), doDate: dateFrom(p.doDate), priority: priorityFrom(p.priority) }
}

/** What a new task is made of (D384): the title required, the rest from the defaults. */
export interface NewTask {
  title: string
  estimateMin?: number | null
  categoryId?: string | null
  note?: string
  /** Its list (default „Skrzynka” – the quick capture, D385). */
  list?: CaseList
  /** „Termin” and „Wykonać” (D409; the quick capture's „!jutro” / „@pt” – `parseQuickDates`); none by default. */
  dueDate?: string | null
  doDate?: string | null
  /** Its quarter of the matrix (D450); none by default. */
  priority?: Priority | null
}

/**
 * The new task's fields (as written); null – no title. `today` is the logical day of `at` (a task put on „Dziś” keeps it).
 */
export function newTask(id: string, at: number, today: string, p: NewTask): Record<string, unknown> | null {
  const title = titleOf(p.title)
  if (!title) return null
  const list = p.list ?? 'inbox'
  return {
    schema: REQUEST_SCHEMA,
    id,
    kind: 'task',
    title,
    person: null,
    estimateMin: estimateFrom(p.estimateMin) ?? DEFAULT_TASK_MIN,
    categoryId: p.categoryId || DEFAULT_TASK_CATEGORY,
    note: (p.note ?? '').slice(0, CASE_NOTE_MAX),
    createdAt: at,
    state: list === 'done' ? 'done' : 'queued',
    day: null,
    block: null,
    list,
    listDay: list === 'today' ? today : null,
    doneAt: list === 'done' ? at : null,
    dueDate: dateFrom(p.dueDate),
    doDate: dateFrom(p.doDate),
    priority: priorityFrom(p.priority)
  }
}
