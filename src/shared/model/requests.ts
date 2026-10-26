/**
 * Requests (spec „Prośba”, requests/<id>.json): a person from the list, an estimate of time and a note. A request in the
 * queue waits to be chosen in the morning plan; chosen, it goes into a block of the day (several chosen together are one
 * block and one contact). „Zrobione teraz”, urgent and evening requests are started in the widget (E5) – they are events
 * of the log; the queue is records.
 */
import { isIsoDate } from '../time/zone'

export const REQUEST_SCHEMA = 1

/** queued – waiting in the queue; planned – chosen into a day's block; done – done; dropped – will not be done. */
export type RequestState = 'queued' | 'planned' | 'done' | 'dropped'
export const REQUEST_STATES: readonly RequestState[] = ['queued', 'planned', 'done', 'dropped']

export interface RequestRecord {
  id: string
  person: string | null
  estimateMin: number | null
  note: string
  createdAt: number
  state: RequestState
  /** The day and block it was chosen into (planned, done). */
  day: string | null
  block: string | null
}

/** The estimate's range (a field of whole minutes, like a block's length). */
export const ESTIMATE_RANGE = [1, 8 * 60] as const
/** The estimate a request without one counts with in the plan (the urgent request's default in the widget, spec). */
export const DEFAULT_ESTIMATE_MIN = 15

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function requestFrom(v: unknown): RequestRecord | null {
  if (!isPlain(v) || typeof v.id !== 'string' || !v.id) return null
  const est = v.estimateMin
  return {
    id: v.id,
    person: typeof v.person === 'string' && v.person ? v.person : null,
    estimateMin: typeof est === 'number' && Number.isInteger(est) && est >= ESTIMATE_RANGE[0] && est <= ESTIMATE_RANGE[1] ? est : null,
    note: typeof v.note === 'string' ? v.note.slice(0, 500) : '',
    createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : 0,
    state: (REQUEST_STATES as readonly unknown[]).includes(v.state) ? (v.state as RequestState) : 'queued',
    day: isIsoDate(v.day) ? v.day : null,
    block: typeof v.block === 'string' && v.block ? v.block : null
  }
}

/** The new record's fields (as written: the queue creates the file). */
export function newRequest(id: string, at: number, p: { person: string | null; estimateMin: number | null; note: string }): Record<string, unknown> {
  return { schema: REQUEST_SCHEMA, id, person: p.person, estimateMin: p.estimateMin, note: p.note, createdAt: at, state: 'queued', day: null, block: null }
}
