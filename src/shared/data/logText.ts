/**
 * The text of a day's log (spec „Każde zdarzenie trafia najpierw do lokalnego dziennika …”): one event per line. The
 * reader skips a cut last line (OneDrive may hand over a file mid-write), skips a broken line in the middle and lists it
 * as a problem – the file stays writable. Logs of all computers (and their conflict copies) join as a sum of events by
 * id; two lines with one id and different content (an automatic action two computers wrote) keep the one by the newer
 * rules version, then the smaller logical clock (spec „Działania automatyczne mają identyfikatory wyliczone…”).
 */
import { parseEvent, type AnyEvent } from '../model/events'

export interface ReadLog {
  events: AnyEvent[]
  /** Broken lines in the middle (1-based line numbers and why). */
  problems: Array<{ line: number; why: string }>
  /** The last line was cut (no newline at the end and not an event): it was skipped. */
  cutTail: boolean
  /** The text ends with a newline (an append needs none before it). */
  endsWithNewline: boolean
}

export function readLogText(text: string): ReadLog {
  const events: AnyEvent[] = []
  const problems: ReadLog['problems'] = []
  const endsWithNewline = text.length === 0 || text.endsWith('\n')
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  let cutTail = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.replace(/\r$/, '')
    if (!raw.trim()) continue
    const r = parseEvent(raw)
    if (r.ok) events.push(r.event)
    else if (i === lines.length - 1 && !endsWithNewline) cutTail = true
    else problems.push({ line: i + 1, why: r.why })
  }
  return { events, problems, cutTail, endsWithNewline }
}

/** One event as a line of the log (with its newline). */
export function eventLine(e: AnyEvent): string {
  const { unknown: _u, raw, ...rest } = e as AnyEvent & { unknown?: true; raw?: Record<string, unknown> }
  return `${JSON.stringify(raw ?? rest)}\n`
}

/** Of two events with one id, the one that stays: newer rules version, then the smaller logical clock, then the text. */
export function preferEvent(a: AnyEvent, b: AnyEvent): AnyEvent {
  if (a.v !== b.v) return a.v > b.v ? a : b
  if (a.l !== b.l) return a.l < b.l ? a : b
  return eventLine(a) <= eventLine(b) ? a : b
}

/** The sum of events by id. */
export function mergeEvents(...lists: ReadonlyArray<readonly AnyEvent[]>): AnyEvent[] {
  const byId = new Map<string, AnyEvent>()
  for (const list of lists) {
    for (const e of list) {
      const had = byId.get(e.id)
      byId.set(e.id, had ? preferEvent(had, e) : e)
    }
  }
  return [...byId.values()]
}
