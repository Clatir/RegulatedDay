/**
 * The log of a day (spec „Pliki na OneDrive”, log/RRRR/RRRR-MM-DD/<komputer>.jsonl): every computer appends its own
 * events, the logs of all computers join as a sum of events by id. Every event has two clocks – the computer's clock
 * corrected by the monotonic clock (`t`, used for lengths) and the logical clock (`l`, used only for order); the full
 * order is the logical clock, the computer's id and the event's number. Every event says what it concerns (timer, energy,
 * game): an older version skips unknown events of other computers and stays able to write its own log.
 *
 * Facts you and the main process set (the start and end of a block, the approved boundary) live only here, never in the
 * day's file. Instants are ms UTC.
 */
import { isIsoDate } from '../time/zone'
import type { PlanBlock } from './plan'
import type { DayTypeId, RulesSettings } from './settings'

export type Domain = 'timer' | 'energy' | 'game' | 'meta'

/** The rules version of this build (spec „wersja reguł”): a newer one wins segments and automatic actions. */
export const RULES_VERSION = 1

export interface EventBase {
  /** Unique: `<computer>-<n>` for your actions, derived from the data for automatic ones (both computers write the same). */
  id: string
  /** The computer that wrote it. */
  c: string
  /** The computer's own number of the event (grows by one, never reused). */
  n: number
  /** The computer's clock, corrected by the monotonic clock while the app runs. */
  t: number
  /** The logical clock: max(own clock, last event seen + 1 ms). Only for order. */
  l: number
  /** The rules version it was written by. */
  v: number
  /** The logical day it concerns (a fix made in the morning goes to yesterday's log). */
  day: string
  dom: Domain
}

/** What a day was created with (spec „Dzień tworzy jedna deterministyczna funkcja”). */
export interface DaySnapshot {
  dayType: DayTypeId
  settings: RulesSettings
  templateId: string | null
  templateFrom: string | null
  /** The day's own budget and maximum when its template overrides its type's. */
  budgetMin: number
  maxMin: number
  wakeMin: number
  /** The wake time from the template and type (without the day's own wake): what blocks before the first fixed one follow. */
  templateWakeMin: number
  blocks: PlanBlock[]
  /** The rd.json changes laid on (their ids): a later-arriving older change re-issues the snapshot. */
  changes: string[]
  /** Holidays of the day by market, as the calendar of this build knew them. */
  holidays: Array<{ market: string; closed: boolean; earlyCloseAt: number | null; names: string[] }>
}

/** A part of the minutes of work, classified once by the computer leading in that minute (spec „odcinki klasyfikacji”). */
export type MinuteClass = 'in' | 'after' | 'max' | 'empty'

export type TimerEvent =
  | (EventBase & { k: 'day.create'; snapshot: DaySnapshot })
  /** The snapshot issued again (an older rd.json arrived after the creation, before any minute was classified). */
  | (EventBase & { k: 'day.reissue'; snapshot: DaySnapshot })
  | (EventBase & { k: 'day.snapshot'; at: number; dayType: DayTypeId; settings: RulesSettings; reason: 'today' | 'type' | 'reissue' })
  | (EventBase & {
      k: 'block.start'
      block: string
      at: number
      bg: boolean
      /** What the plan said at the start – a later edit of the plan never changes it (spec). */
      planned: { categoryId: string; variantId: string | null; durationMin: number; tag: PlanBlock['tag']; fixed: boolean }
      /** Minutes after the boundary confirmed in advance up to this instant (two clicks, „Dodaj bez wymiany”). */
      confirmUntil: number | null
      how: 'click' | 'auto' | 'start'
    })
  | (EventBase & { k: 'block.pause'; block: string; at: number })
  | (EventBase & { k: 'block.resume'; block: string; at: number; confirmUntil: number | null })
  | (EventBase & { k: 'block.end'; block: string; at: number; done: boolean | null; rule: string | null })
  | (EventBase & { k: 'block.extend'; block: string; at: number; minutes: number })
  | (EventBase & { k: 'block.confirm'; block: string; at: number })
  | (EventBase & { k: 'block.park'; block: string; at: number; rule: string })
  | (EventBase & { k: 'block.cancel'; block: string; at: number; rule: string })
  | (EventBase & { k: 'block.fg'; block: string; at: number; bg: boolean })
  | (EventBase & { k: 'boundary.approve'; at: number; boundary: number; auto: boolean })
  | (EventBase & { k: 'boundary.undo'; at: number })
  | (EventBase & { k: 'boundary.exception'; at: number; minutes: number; reason: string })
  | (EventBase & { k: 'work.end'; at: number; end: number })
  | (EventBase & {
      k: 'request.start'
      request: string
      at: number
      mode: 'now' | 'urgent' | 'queue' | 'evening' | 'after'
      person: string | null
      estimateMin: number | null
      /** The hard end in force at its start (spec: it decides whether a request is justified, written in the log). */
      hardEndAt: number | null
    })
  | (EventBase & { k: 'request.end'; request: string; at: number })
  | (EventBase & { k: 'disconnect.start'; at: number })
  | (EventBase & { k: 'disconnect.end'; at: number })
  | (EventBase & { k: 'bedtime.recalc'; at: number; base: number })
  | (EventBase & { k: 'minutes'; from: number; to: number; cls: MinuteClass; upfront: boolean; know: Record<string, number> })
  | (EventBase & { k: 'hardend.pass'; at: number; basis: string })

export type PresenceEvent =
  | (EventBase & { k: 'presence.first'; at: number })
  /** A gap in input (any input) or in use (spec „Użycie komputera”) from 2 min: opened when it reaches 2 min, closed at the next input. */
  | (EventBase & { k: 'gap.open'; gap: string; kind: 'input' | 'use'; from: number; lastOutside: number | null })
  | (EventBase & { k: 'gap.close'; gap: string; to: number })
  /** Observed stretches: „from” at the start and wake, „alive” every 5 min, „to” at the quit and sleep. */
  | (EventBase & { k: 'observe.from'; at: number; why: 'start' | 'resume' | 'unlock' })
  | (EventBase & { k: 'observe.alive'; at: number })
  | (EventBase & { k: 'observe.to'; at: number; why: 'quit' | 'suspend' | 'crash' | 'system' })

/** An event of a kind this version does not know: kept, skipped by the rules. */
export type UnknownEvent = EventBase & { k: string; unknown: true; raw: Record<string, unknown> }

export type LogEvent = TimerEvent | PresenceEvent
export type AnyEvent = LogEvent | UnknownEvent

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const DOMAINS = new Set(['timer', 'energy', 'game', 'meta'])

/** The fields every kind needs beyond the base: name → check. */
const NEEDS: Record<string, Record<string, (v: unknown) => boolean>> = {
  'day.create': { snapshot: isPlain },
  'day.reissue': { snapshot: isPlain },
  'day.snapshot': { at: isNum, dayType: isStr, settings: isPlain },
  'block.start': { block: isStr, at: isNum, planned: isPlain },
  'block.pause': { block: isStr, at: isNum },
  'block.resume': { block: isStr, at: isNum },
  'block.end': { block: isStr, at: isNum },
  'block.extend': { block: isStr, at: isNum, minutes: (v) => isNum(v) && v > 0 && v <= 24 * 60 },
  'block.confirm': { block: isStr, at: isNum },
  'block.park': { block: isStr, at: isNum },
  'block.cancel': { block: isStr, at: isNum },
  'block.fg': { block: isStr, at: isNum },
  'boundary.approve': { at: isNum, boundary: isNum },
  'boundary.undo': { at: isNum },
  'boundary.exception': { at: isNum, minutes: (v) => isNum(v) && v > 0 && v <= 24 * 60 },
  'work.end': { at: isNum, end: isNum },
  'request.start': { request: isStr, at: isNum },
  'request.end': { request: isStr, at: isNum },
  'disconnect.start': { at: isNum },
  'disconnect.end': { at: isNum },
  'bedtime.recalc': { at: isNum, base: isNum },
  minutes: { from: isNum, to: isNum, cls: (v) => v === 'in' || v === 'after' || v === 'max' || v === 'empty', know: isPlain },
  'hardend.pass': { at: isNum },
  'presence.first': { at: isNum },
  'gap.open': { gap: isStr, kind: (v) => v === 'input' || v === 'use', from: isNum },
  'gap.close': { gap: isStr, to: isNum },
  'observe.from': { at: isNum },
  'observe.alive': { at: isNum },
  'observe.to': { at: isNum }
}

export const KNOWN_KINDS: ReadonlySet<string> = new Set(Object.keys(NEEDS))

export type Parsed = { ok: true; event: AnyEvent } | { ok: false; why: string }

/**
 * One line of a log. A line that is not an event of the base shape is broken (the reader reports it and goes on); an
 * event of a known kind with a wrong field is broken too; an unknown kind is kept as unknown.
 */
export function parseEvent(line: string): Parsed {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return { ok: false, why: 'składnia' }
  }
  if (!isPlain(raw)) return { ok: false, why: 'nie obiekt' }
  const { id, c, n, t, l, v, day, k, dom } = raw
  if (!isStr(id) || !isStr(c) || !Number.isInteger(n) || !isNum(t) || !isNum(l) || !Number.isInteger(v) || !isIsoDate(day) || !isStr(k)) return { ok: false, why: 'pola zdarzenia' }
  if (!DOMAINS.has(dom as string)) return { ok: false, why: 'dziedzina' }
  const needs = NEEDS[k]
  if (!needs) return { ok: true, event: { id, c, n: n as number, t, l, v: v as number, day, k, dom: dom as Domain, unknown: true, raw } }
  for (const [field, check] of Object.entries(needs)) if (!check(raw[field])) return { ok: false, why: `pole ${field}` }
  return { ok: true, event: raw as unknown as LogEvent }
}

export function isKnown(e: AnyEvent): e is LogEvent {
  return !('unknown' in e)
}

/** The full order of events (spec): logical clock, computer id, event number. */
export function compareEvents(a: EventBase, b: EventBase): number {
  return a.l - b.l || (a.c < b.c ? -1 : a.c > b.c ? 1 : 0) || a.n - b.n
}

/** The day's snapshot in force: the last issued (a re-issue replaces the creation's), in the full order; null before. */
export function daySnapshotOf(events: readonly AnyEvent[]): DaySnapshot | null {
  let found: { e: EventBase; s: DaySnapshot } | null = null
  for (const e of events) {
    if (!isKnown(e) || (e.k !== 'day.create' && e.k !== 'day.reissue')) continue
    if (!found || compareEvents(e, found.e) > 0) found = { e, s: e.snapshot }
  }
  return found?.s ?? null
}

/** The kind's own instant (`at`, `from` …) – what the rules place the event at. */
export function eventAt(e: AnyEvent): number {
  const r = e as unknown as Record<string, unknown>
  for (const f of ['at', 'from', 'to']) if (isNum(r[f])) return r[f] as number
  return e.t
}
