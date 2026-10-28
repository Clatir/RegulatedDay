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
import { POOLS, type Costs, type Pool, type PoolValues } from './categories'
import type { PlanBlock } from './plan'
import { settingsFrom, type DayTypeId, type RulesSettings } from './settings'

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
  /** An automatic action (spec „Działania automatyczne”): the rule that did it – listed with „Cofnij”. */
  autoRule?: string
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
  /**
   * A second snapshot of the day from `at` on: settings changed „od dziś”, or the day's type changed (spec „Zmiana typu w
   * trakcie dnia”). A change of type may fix the day's maximum from then on (`max`, an instant: the new type's maximum,
   * moved by the running and kept blocks within the old one) and the minimum of regeneration it asks (`minRegen`, counted
   * once at the switch to a regeneration day).
   */
  | (EventBase & { k: 'day.snapshot'; at: number; dayType: DayTypeId; settings: RulesSettings; reason: 'today' | 'type' | 'reissue'; max?: number | null; minRegen?: number | null })
  | (EventBase & {
      k: 'block.start'
      block: string
      at: number
      bg: boolean
      /** What the plan said at the start – a later edit of the plan never changes it (spec); costs since E2. */
      planned: { categoryId: string; variantId: string | null; durationMin: number; tag: PlanBlock['tag']; fixed: boolean; costs?: Costs | null; bgCostPct?: number | null }
      /** Minutes after the boundary confirmed in advance up to this instant (two clicks, „Dodaj bez wymiany”). */
      confirmUntil: number | null
      /** 'plan' – it happened at its planned time, said afterwards (the ritual): its times are no measure. */
      how: 'click' | 'auto' | 'start' | 'plan'
    })
  | (EventBase & { k: 'block.pause'; block: string; at: number })
  | (EventBase & { k: 'block.resume'; block: string; at: number; confirmUntil: number | null })
  | (EventBase & { k: 'block.end'; block: string; at: number; done: boolean | null; rule: string | null })
  | (EventBase & { k: 'block.extend'; block: string; at: number; minutes: number })
  | (EventBase & { k: 'block.confirm'; block: string; at: number })
  | (EventBase & { k: 'block.park'; block: string; at: number; rule: string })
  | (EventBase & { k: 'block.cancel'; block: string; at: number; rule: string })
  /**
   * „Dodaj bez wymiany” (spec „Wymiana”): the block's minutes after the boundary are confirmed in advance – when they
   * come nothing asks again, and the block starts with the first click.
   */
  | (EventBase & { k: 'block.addConfirm'; block: string; at: number })
  | (EventBase & { k: 'block.fg'; block: string; at: number; bg: boolean })
  /** `plan` – the blocks of the plan then (the game: a block that gives way in an exchange was planned before the approval). */
  | (EventBase & { k: 'boundary.approve'; at: number; boundary: number; auto: boolean; plan?: string[] })
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
      /** The block it interrupted (paused, or a fixed one sent to the background) – resumed at its end (spec „Przerwania”). */
      interrupts?: string | null
      /** Written in after the fact: the flexible blocks it splits – their runs lose its minutes (spec „Prośba”). */
      splits?: string[]
    })
  | (EventBase & { k: 'request.end'; request: string; at: number })
  | (EventBase & { k: 'disconnect.start'; at: number })
  | (EventBase & { k: 'disconnect.end'; at: number })
  | (EventBase & { k: 'bedtime.recalc'; at: number; base: number })
  | (EventBase & { k: 'minutes'; from: number; to: number; cls: MinuteClass; upfront: boolean; know: Record<string, number> })
  | (EventBase & { k: 'hardend.pass'; at: number; basis: string })
  /** „Cofnij” (spec „korekta”): the event `target` (an automatic action) is folded as if never written. */
  | (EventBase & { k: 'undo'; at: number; target: string; reason?: string })
  /**
   * A question or a message seen (spec „Zobaczenie zapisuje w logu dnia komputer, na którym je widać”): in the open
   * icon's panel, the main window in the foreground with presence, a clicked notification, a click of the desktop bar.
   */
  | (EventBase & { k: 'question.seen'; at: number; question: string; how: 'panel' | 'main' | 'notification' | 'bar' })
  /** An answer that is no action of the timer („Przerwa” of „Koniec pracy?”, an absence …), with a value when it has one. */
  | (EventBase & { k: 'question.answer'; at: number; question: string; answer: string; value?: number | null })
  /** „Zacznij jeszcze raz” (D207): another stretch of a session (or a weekly analysis) that ended before its planned end. */
  | (EventBase & { k: 'block.restart'; block: string; at: number })
  /** „Mniej pytań” (spec „Cisza”): a state of the day on every computer, until „Jest lepiej” (or 04:00). */
  | (EventBase & { k: 'fewer.start'; at: number })
  | (EventBase & { k: 'fewer.end'; at: number })
  /** „Wypite” (spec „Woda”). */
  | (EventBase & { k: 'water.drink'; at: number })
  /** A Windows notification shown by the leader (spec: its stable id in the day's log – shown once, also after a restart). */
  | (EventBase & { k: 'notice.shown'; at: number; notice: string })
  /**
   * The day closed up to `at` (spec „Rytuał zamknięcia”): the evening ritual, or in the morning „Jak zapisano”, „Wolne”,
   * „Nie pamiętam”. Rows left untouched are taken as written; what comes after `at` is taken as written too.
   */
  | (EventBase & { k: 'ritual.close'; at: number; how: CloseHow })
  /** „Korekta” of a block's real times (spec „Poprawka czasu w rytuale albo w edycji to zdarzenie „korekta””). */
  | (EventBase & { k: 'block.fix'; block: string; at: number; start: number | null; end: number | null })
  /** A block marked done or not done after its end (the ritual). */
  | (EventBase & { k: 'block.mark'; block: string; at: number; done: boolean })
  /** The person of a request named later (the ritual's „osoba: ?”). */
  | (EventBase & { k: 'request.person'; request: string; at: number; person: string })
  /** A stretch that was no rest (spec „W rytuale możesz oznaczyć odcinek, który odpoczynkiem nie był”): [from, to). */
  | (EventBase & { k: 'rest.not'; at: number; from: number; to: number })
  /** The felt cost of a category of the day, in the ritual (D319, optional): against its cost in the settings. */
  | (EventBase & { k: 'cost.felt'; at: number; category: string; feel: FeltCost })
  /**
   * The day frozen by the leader (spec „Ocena dnia”): the last event of every computer it counted (`know` – the grade
   * counts only up to them), the computers whose records were missing (frozen without waiting after 72 h), and the grade.
   */
  | (EventBase & { k: 'day.freeze'; at: number; how: 'ready' | 'timeout'; know: Record<string, number>; missing: string[]; grade: Record<string, unknown> })

/** How a day was closed: the evening ritual, or the morning's „Jak zapisano”, „Wolne”, „Nie pamiętam”. */
export type CloseHow = 'ritual' | 'asWritten' | 'free' | 'unknown'
/** The felt cost of a category against its settings (D319): lighter, as usual, heavier. */
export const FELT_COSTS = ['lighter', 'usual', 'heavier'] as const
export type FeltCost = (typeof FELT_COSTS)[number]

export const CLOSE_HOWS: readonly CloseHow[] = ['ritual', 'asWritten', 'free', 'unknown']

export type PresenceEvent =
  | (EventBase & { k: 'presence.first'; at: number })
  /** A gap in input (any input) or in use (spec „Użycie komputera”) from 2 min: opened when it reaches 2 min, closed at the next input. */
  | (EventBase & { k: 'gap.open'; gap: string; kind: 'input' | 'use'; from: number; lastOutside: number | null })
  | (EventBase & { k: 'gap.close'; gap: string; to: number })
  /** Observed stretches: „from” at the start and wake, „alive” every 5 min, „to” at the quit and sleep. */
  | (EventBase & { k: 'observe.from'; at: number; why: 'start' | 'resume' | 'unlock' })
  | (EventBase & { k: 'observe.alive'; at: number })
  | (EventBase & { k: 'observe.to'; at: number; why: 'quit' | 'suspend' | 'crash' | 'system' })

/** An answer of the check-in: no, a little, yes (spec „Pierwszy check-in”). */
export type Answer = 0 | 1 | 2
/** „Okulary”, „Zatyczki”, „Więcej bujania”, „Drażnią pytania” (spec „Sygnały w ciągu dnia”). */
export type Signal = 'glasses' | 'earplugs' | 'rocking' | 'questions'
export const SIGNALS: readonly Signal[] = ['glasses', 'earplugs', 'rocking', 'questions']

/**
 * Energy (spec „Model energii”). A check-in and the signals are anchors: a signal carries the exact state before it as
 * its computer knew it, so corrections of times before it never change the state after it.
 */
export type EnergyEvent =
  | (EventBase & { k: 'energy.checkin'; at: number; answers: Record<Pool, [Answer, Answer]> })
  | (EventBase & { k: 'energy.signal'; at: number; signal: Signal; before: PoolValues | null })
  /** The relative assessment: a pool worse, the same or better. */
  | (EventBase & { k: 'energy.relative'; at: number; pool: Pool; delta: -10 | 0 | 10; before: PoolValues | null })
  /** A descent to the reserve as the leader registered it: it stays whatever later corrections say. */
  | (EventBase & { k: 'energy.reserve'; at: number; pool: Pool; silent: boolean })
  /** The energy module switched on or off (a shared setting that works at once), with the state before. */
  | (EventBase & { k: 'energy.module'; at: number; on: boolean; was?: boolean })

/** An event of a kind this version does not know: kept, skipped by the rules. */
export type UnknownEvent = EventBase & { k: string; unknown: true; raw: Record<string, unknown> }

/**
 * A module switched on or off (spec „Moduły”: it works at once; its rewards of that day count neither way) – the day's
 * record of it (energy has its own `energy.module`, which the energy engine reads).
 */
export type MetaEvent = EventBase & { k: 'module.set'; at: number; module: string; on: boolean; was: boolean }

/**
 * The game's facts that are no action of the timer. „Wymień” (spec „Wymiana”): the block added and the blocks that gave
 * way to it, each with its planned length then (the yielding ones are parked by their own `block.park`).
 */
export type GameEvent = EventBase & { k: 'block.exchange'; at: number; block: string; minutes: number; yielding: Array<{ block: string; minutes: number }> }

export type LogEvent = TimerEvent | PresenceEvent | EnergyEvent | MetaEvent | GameEvent
export type AnyEvent = LogEvent | UnknownEvent

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const DOMAINS = new Set(['timer', 'energy', 'game', 'meta'])
const isPool = (v: unknown): v is Pool => (POOLS as readonly unknown[]).includes(v)
/** A planned length: whole minutes, at most a day. */
const isLength = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 24 * 60
const isAnswers = (v: unknown) => isPlain(v) && POOLS.every((p) => Array.isArray(v[p]) && (v[p] as unknown[]).length === 2 && (v[p] as unknown[]).every((a) => a === 0 || a === 1 || a === 2))
const isValues = (v: unknown) => v == null || (isPlain(v) && POOLS.every((p) => isNum(v[p]) && (v[p] as number) >= 0 && (v[p] as number) <= 100))

/** The fields every kind needs beyond the base: name → check. */
const NEEDS: Record<string, Record<string, (v: unknown) => boolean>> = {
  'day.create': { snapshot: isPlain },
  'day.reissue': { snapshot: isPlain },
  'day.snapshot': { at: isNum, dayType: isStr, settings: isPlain, max: (v) => v == null || isNum(v), minRegen: (v) => v == null || (isNum(v) && v >= 0 && v <= 24 * 60) },
  'block.start': { block: isStr, at: isNum, planned: isPlain },
  'block.pause': { block: isStr, at: isNum },
  'block.resume': { block: isStr, at: isNum },
  'block.end': { block: isStr, at: isNum },
  'block.extend': { block: isStr, at: isNum, minutes: (v) => isNum(v) && v > 0 && v <= 24 * 60 },
  'block.confirm': { block: isStr, at: isNum },
  'block.park': { block: isStr, at: isNum },
  'block.cancel': { block: isStr, at: isNum },
  'block.addConfirm': { block: isStr, at: isNum },
  'block.exchange': { at: isNum, block: isStr, minutes: isLength, yielding: (v) => Array.isArray(v) && v.length > 0 && v.every((y) => isPlain(y) && isStr(y.block) && isLength(y.minutes)) },
  'module.set': { at: isNum, module: isStr, on: (v) => typeof v === 'boolean', was: (v) => typeof v === 'boolean' },
  'block.fg': { block: isStr, at: isNum },
  'boundary.approve': { at: isNum, boundary: isNum, plan: (v) => v === undefined || (Array.isArray(v) && v.length <= 500 && v.every(isStr)) },
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
  undo: { at: isNum, target: isStr },
  'question.seen': { at: isNum, question: isStr, how: (v) => v === 'panel' || v === 'main' || v === 'notification' || v === 'bar' },
  'question.answer': { at: isNum, question: isStr, answer: isStr, value: (v) => v == null || isNum(v) },
  'block.restart': { block: isStr, at: isNum },
  'fewer.start': { at: isNum },
  'fewer.end': { at: isNum },
  'water.drink': { at: isNum },
  'notice.shown': { at: isNum, notice: isStr },
  'ritual.close': { at: isNum, how: (v) => (CLOSE_HOWS as readonly unknown[]).includes(v) },
  'block.fix': { block: isStr, at: isNum, start: (v) => v == null || isNum(v), end: (v) => v == null || isNum(v) },
  'block.mark': { block: isStr, at: isNum, done: (v) => typeof v === 'boolean' },
  'request.person': { request: isStr, at: isNum, person: isStr },
  'rest.not': { at: isNum, from: isNum, to: isNum },
  'cost.felt': { at: isNum, category: isStr, feel: (v) => (FELT_COSTS as readonly unknown[]).includes(v) },
  'day.freeze': { at: isNum, how: (v) => v === 'ready' || v === 'timeout', know: isPlain, missing: Array.isArray, grade: isPlain },
  'presence.first': { at: isNum },
  'gap.open': { gap: isStr, kind: (v) => v === 'input' || v === 'use', from: isNum },
  'gap.close': { gap: isStr, to: isNum },
  'observe.from': { at: isNum },
  'observe.alive': { at: isNum },
  'observe.to': { at: isNum },
  'energy.checkin': { at: isNum, answers: isAnswers },
  'energy.signal': { at: isNum, signal: (v) => (SIGNALS as readonly unknown[]).includes(v), before: isValues },
  'energy.relative': { at: isNum, pool: isPool, delta: (v) => v === -10 || v === 0 || v === 10, before: isValues },
  'energy.reserve': { at: isNum, pool: isPool },
  'energy.module': { at: isNum, on: (v) => typeof v === 'boolean', was: (v) => v === undefined || typeof v === 'boolean' }
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
  // Settings written by an older version lack the fields added since: they take their defaults (tolerant schemas).
  return found ? { ...found.s, settings: settingsFrom(found.s.settings) } : null
}

/** The kind's own instant (`at`, `from` …) – what the rules place the event at. */
export function eventAt(e: AnyEvent): number {
  const r = e as unknown as Record<string, unknown>
  for (const f of ['at', 'from', 'to']) if (isNum(r[f])) return r[f] as number
  return e.t
}
