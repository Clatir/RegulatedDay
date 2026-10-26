/**
 * Requests in the day (spec „Prośba”, „Przerwania”, „Bezczynność i nieobecność”): „zrobione teraz” (one click with the
 * person, no estimate), urgent (an interruption with an estimate), written in after the fact. A request „zrobione teraz”
 * and an urgent one pause the flexible block in the foreground – a fixed block is never paused: it goes on in the
 * background with its full cost; after „Koniec” the interrupted block resumes by itself (on the list „zrobione
 * automatycznie”), unless resuming it would create unconfirmed minutes after the boundary – then it waits in the bar
 * as „Wznów · Zaparkuj”. A request written in after the fact over a running flexible block splits it in two.
 *
 * Without „Koniec” a request ends by the rule of blocks away from the computer (D258, T372): at the first use of a
 * computer after at least 2 min without input – first used after its limit (60 min; with an estimate over 30 min the
 * estimate plus 30 min), at the limit – or, nobody at a computer up to the effective bedtime, at the earlier of the
 * limit and the bedtime. The answer „jeszcze trwa” keeps it to „Koniec”, at most to its limit. Counters: how many and
 * how long – today, this week, for each person. Pure: the bar's buttons come with E5's interface (D296).
 */
import type { AnyEvent } from '../model/events'
import { derivedId } from '../model/ids'
import { firstUseAfter, type Activity } from './activity'
import type { BlockInfo } from './blocks'
import type { DayState } from './day'
import { foldFacts, OPEN, type RequestFact } from './facts'
import { atOf, gridOf, idxOf } from './grid'
import { startCost, timerNow, type ActionResult, type TimerDraft, type TimerNow } from './timer'

const MIN = 60_000
/** A request without „Koniec” lasts at most this long… */
export const REQUEST_LIMIT_MIN = 60
/** …or, with an estimate over this, the estimate plus this. */
export const REQUEST_LONG_ESTIMATE_MIN = 30
/** It ends at the first use after at least this long without input. */
export const REQUEST_AWAY_MIN = 2
/** An urgent request's estimate: by default, and at most. */
export const REQUEST_ESTIMATE_MIN = 15
export const REQUEST_ESTIMATE_MAX_MIN = 8 * 60

/** A block a request never pauses (spec „Przerwania”): a fixed one, one waiting for „Zacznij” – it goes on in the background. */
const goesOn = (b: BlockInfo) => b.fixed || b.waits

/** A request that runs now (not one written in after the fact). */
const runs = (r: RequestFact) => r.to === OPEN && r.mode !== 'after'

export type RequestMode = 'now' | 'urgent' | 'queue' | 'evening' | 'after'

export type RequestAction =
  | { a: 'requestNow'; request: string; person: string | null; urgent?: boolean; estimateMin?: number | null }
  | { a: 'requestEnd'; request: string }
  /** Written in after the fact, [from, to) (ms). */
  | { a: 'requestAfter'; request: string; person: string | null; from: number; to: number }

/** The limit of a request without „Koniec” (ms). */
export function requestLimit(r: Pick<RequestFact, 'from' | 'estimateMin'>, grid: DayState['grid']): number {
  return atOf(grid, r.from) + limitMinOf(r.estimateMin) * MIN
}

/** The length of a request's limit (min): 60, or with an estimate over 30 min the estimate plus 30. */
export const limitMinOf = (estimateMin: number | null): number => ((estimateMin ?? 0) > REQUEST_LONG_ESTIMATE_MIN ? estimateMin! + REQUEST_LONG_ESTIMATE_MIN : REQUEST_LIMIT_MIN)

const no = (why: string): ActionResult => ({ ok: false, why, confirm: null })
const yes = (events: TimerDraft[]): ActionResult => ({ ok: true, events, confirm: null })

/**
 * What resumes when a request ends (spec „Przerwania”): the block it interrupted, still paused – resumed, unless that
 * would create unconfirmed minutes after the boundary (then it waits as „Wznów · Zaparkuj”); a fixed block sent to the
 * background – back in the foreground while it still runs. Nothing while another request runs (it took the block over;
 * `ending` – requests ended with this one, the one ending last resumes it) or something else took the foreground.
 */
export function resumeAfter(state: DayState, r: RequestFact, at: number, autoRule: string | null, t: TimerNow = timerNow(state), ending: ReadonlyMap<string, number> = new Map()): TimerDraft[] {
  if (!r.interrupts) return []
  const endsFirst = (x: RequestFact) => {
    const e = ending.get(x.id)
    return e != null && (e < at || (e === at && x.id < r.id))
  }
  if (state.facts.requests.some((x) => x.id !== r.id && runs(x) && !endsFirst(x))) return []
  const f = state.facts.blocks.get(r.interrupts)
  const info = state.blocks.find((b) => b.id === r.interrupts)
  if (!f || !info || f.endedAt != null) return []
  if (t.fg && t.fg.info.id !== r.interrupts) return []
  const open = f.runs.find((x) => x.to === OPEN)
  const tag = autoRule ? { autoRule } : {}
  if (open?.bg && goesOn(info)) return [{ k: 'block.fg', block: info.id, at, bg: false, ...tag }]
  if (open || startCost(state, info, at)) return []
  return [{ k: 'block.resume', block: info.id, at, confirmUntil: null, ...tag }]
}

/**
 * The flexible blocks a request written in after the fact splits (spec „nachodzi na blok elastyczny”): each with a run
 * in the foreground over [from, to) (indexes) – the facts take its minutes out of their runs. A fixed block, one waiting
 * for „Zacznij” and a block of requests go on with their full cost.
 */
function splitsOf(state: DayState, from: number, to: number): string[] {
  const out: string[] = []
  for (const f of state.facts.blocks.values()) {
    const info = state.blocks.find((b) => b.id === f.id)
    if (!info || goesOn(info) || info.isRequestCat) continue
    if (f.runs.some((r) => !r.bg && r.from < to && (r.to === OPEN ? state.now : r.to) > from)) out.push(f.id)
  }
  return out
}

/** One click of a request at `at` (ms). */
export function requestAction(state: DayState, act: RequestAction, at: number): ActionResult {
  const t = timerNow(state)
  switch (act.a) {
    case 'requestNow': {
      if (state.facts.requests.some((r) => r.id === act.request)) return no('ta prośba już jest w dniu')
      const est = act.urgent ? (act.estimateMin ?? REQUEST_ESTIMATE_MIN) : null
      if (est != null && !(Number.isInteger(est) && est >= 1 && est <= REQUEST_ESTIMATE_MAX_MIN)) return no('szacunek prośby: 1–480 min')
      const events: TimerDraft[] = []
      const fg = t.fg
      // A request during another one takes over the block that one interrupted (it resumes after the last of them).
      let interrupts: string | null = fg ? null : ([...state.facts.requests].reverse().find((r) => runs(r) && r.interrupts)?.interrupts ?? null)
      if (fg && !fg.info.isRequestCat) {
        interrupts = fg.info.id
        // A fixed block is never paused: it goes on in the background, with its full cost (spec „Przerwania”).
        events.push(goesOn(fg.info) ? { k: 'block.fg', block: fg.info.id, at, bg: true } : { k: 'block.pause', block: fg.info.id, at })
      }
      events.push({ k: 'request.start', request: act.request, at, mode: act.urgent ? 'urgent' : 'now', person: act.person, estimateMin: est, hardEndAt: null, interrupts })
      return yes(events)
    }
    case 'requestEnd': {
      const r = state.facts.requests.find((x) => x.id === act.request)
      if (!r || r.to !== OPEN) return no('ta prośba nie trwa')
      const end: TimerDraft = { k: 'request.end', request: r.id, at }
      return yes([end, ...resumeAfter(state, r, at, 'requestResume', t)])
    }
    case 'requestAfter': {
      if (!(act.to > act.from) || act.to > at || act.from < state.grid.start) return no('czas prośby')
      if (state.facts.requests.some((r) => r.id === act.request)) return no('ta prośba już jest w dniu')
      const f0 = idxOf(state.grid, act.from)
      const t0 = idxOf(state.grid, act.to)
      if (state.facts.requests.some((r) => r.from < t0 && (r.to === OPEN ? state.now : r.to) > f0)) return no('w tym czasie jest już prośba')
      return yes([
        { k: 'request.start', request: act.request, at: act.from, mode: 'after', person: act.person, estimateMin: null, hardEndAt: null, interrupts: null, splits: splitsOf(state, f0, t0) },
        { k: 'request.end', request: act.request, at: act.to }
      ])
    }
  }
}

export type RequestEndRule = 'firstUse' | 'limit' | 'bedtime'

/**
 * The end of a request without „Koniec” by the log now, as a block away from the computer ends (D258, T372) – the first
 * rule whose end nobody undid („Cofnij”, a later log): at the first use after at least 2 min without input (not after
 * „jeszcze trwa”), first used after the limit – at the limit (written only then); after „jeszcze trwa” or an undone end
 * at the first use, the limit; nobody at a computer up to the effective bedtime – the earlier of the limit and the
 * bedtime. `at` – the end (ms), `due` – when it is written.
 */
export function requestEndOf(state: DayState, activity: Activity, r: RequestFact): { at: number; due: number; rule: RequestEndRule } | null {
  if (r.mode === 'after') return null
  const date = state.grid.date
  const start = atOf(state.grid, r.from)
  const limit = requestLimit(r, state.grid)
  const bedtime = atOf(state.grid, state.bedtime.effective)
  const ongoing = state.facts.answers.get(requestQuestionId(date, r.id))?.answer === 'ongoing'
  const use = ongoing ? null : firstUseAfter(activity, start, REQUEST_AWAY_MIN)
  const rules: Array<{ at: number; due: number; rule: RequestEndRule }> = []
  if (use) rules.push(use.use > limit ? { at: limit, due: use.use, rule: 'limit' } : { at: use.use, due: use.use, rule: 'firstUse' })
  if (use || ongoing) rules.push({ at: limit, due: limit, rule: 'limit' })
  // Begun after the bedtime: its limit.
  const atBed = bedtime >= start ? Math.min(limit, bedtime) : limit
  rules.push({ at: atBed, due: Math.max(bedtime, atBed), rule: 'bedtime' })
  return rules.find((x) => !state.facts.undone.has(requestEndId(date, r.id, x.rule, x.at))) ?? null
}

const requestEndId = (date: string, request: string, rule: string, at: number) => derivedId(date, 'auto', rule, 'request.end', request, at)

/** The leader's ends of requests without „Koniec” (each with a derived id, up to the gate) – and the interrupted block resumed. */
export function requestAutoEnds(state: DayState, activity: Activity, now: number, gate: number): Array<TimerDraft & { id: string; autoRule: string }> {
  const out: Array<TimerDraft & { id: string; autoRule: string }> = []
  const date = state.grid.date
  const ends = new Map<string, { r: RequestFact; at: number; rule: RequestEndRule }>()
  for (const r of state.facts.requests) {
    if (!runs(r)) continue
    const first = requestEndOf(state, activity, r)
    if (first && first.due <= now && first.due <= gate) ends.set(r.id, { r, at: first.at, rule: first.rule })
  }
  if (!ends.size) return out
  const t = timerNow(state)
  const ending = new Map([...ends].map(([id, e]) => [id, e.at]))
  for (const { r, at, rule } of ends.values()) {
    out.push({ id: requestEndId(date, r.id, rule, at), k: 'request.end', request: r.id, at, autoRule: rule })
    for (const d of resumeAfter(state, r, at, 'requestResume', t, ending)) out.push({ ...d, id: derivedId(date, 'auto', 'requestResume', d.k, r.id, at), autoRule: 'requestResume' })
  }
  return out
}

/** The question after a request ended without „Koniec” („trwał do teraz”, „skończył się o…”, „jeszcze trwa”). */
export const requestQuestionId = (date: string, request: string): string => `request:${date}:${request}:0`

export interface RequestCount {
  count: number
  minutes: number
}

/**
 * The counters of requests (spec „Licznik liczby i minut: dziś, w tygodniu i dla każdej osoby”) from the logs of the
 * days given (one still open counts up to `now`, at most to its limit).
 */
export function requestCounters(days: ReadonlyArray<{ date: string; events: readonly AnyEvent[] }>, today: string, weekFrom: string, now: number): { today: RequestCount; week: RequestCount; byPerson: Record<string, RequestCount> } {
  const add = (c: RequestCount, min: number) => ((c.count += 1), (c.minutes += min))
  const out = { today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {} as Record<string, RequestCount> }
  for (const d of days) {
    if (!d.events.some((e) => e.k === 'request.start')) continue
    const grid = gridOf(d.date)
    // The facts as the day counts them („Cofnij” and answers included); one still open – up to now, at most its limit.
    for (const r of foldFacts(grid, d.events).requests) {
      const end = r.to === OPEN ? Math.min(now, requestLimit(r, grid)) : atOf(grid, r.to)
      const min = Math.max(0, Math.round((end - atOf(grid, r.from)) / MIN))
      if (d.date === today) add(out.today, min)
      if (d.date >= weekFrom && d.date <= today) add(out.week, min)
      const p = r.person ?? '?'
      out.byPerson[p] ??= { count: 0, minutes: 0 }
      add(out.byPerson[p]!, min)
    }
  }
  return out
}

