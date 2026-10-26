/**
 * Input and use of the computers as the day's logs record them (spec „Użycie komputera”, „Bezczynność i nieobecność”):
 * every computer writes its observed stretches („obserwacja od”, „trwa” every 5 min, „do”) and its gaps in input and in
 * use from 2 min. Time outside the stretches is never input nor use; an open stretch counts only up to its last „trwa”
 * (this computer's own open stretch: up to now). Between gaps a computer had input (and use).
 *
 * The rules that need input or use of other computers (the idle threshold, the session's end at the last input, the end
 * of a block „poza komputerem” at the first use, an absence) read these records, never the presence – so they come out
 * the same on every computer once the logs have arrived. Instants in ms.
 */
import { compareEvents, isKnown, type AnyEvent } from '../model/events'

export interface Interval {
  from: number
  to: number
}

export interface ComputerActivity {
  c: string
  observed: Interval[]
  /** No input: gaps in input from 2 min and the time outside the observed stretches. */
  noInput: Interval[]
  /** No use: gaps in use from 2 min and the time outside the observed stretches. */
  noUse: Interval[]
  /** The last input outside the app before each gap in input (the session's end at the last input, D210). */
  lastOutside: Array<{ at: number; gapFrom: number }>
}

export interface Activity {
  from: number
  now: number
  computers: ComputerActivity[]
  /** No input on any computer (merged, sorted). */
  idle: Interval[]
  /** No use on any computer. */
  unused: Interval[]
  /** Nothing observed on any computer (the app closed, a sleep, a crash). */
  unobserved: Interval[]
}

/** Sorted and merged; empty and reversed intervals dropped. */
export function merge(list: readonly Interval[]): Interval[] {
  const s = list.filter((x) => x.to > x.from).sort((a, b) => a.from - b.from)
  const out: Interval[] = []
  for (const x of s) {
    const last = out.at(-1)
    if (last && x.from <= last.to) last.to = Math.max(last.to, x.to)
    else out.push({ ...x })
  }
  return out
}

/** The complement of merged intervals within [from, to). */
function complement(list: readonly Interval[], from: number, to: number): Interval[] {
  const out: Interval[] = []
  let at = from
  for (const x of merge(list)) {
    if (x.to <= from || x.from >= to) continue
    if (x.from > at) out.push({ from: at, to: Math.min(x.from, to) })
    at = Math.max(at, x.to)
  }
  if (at < to) out.push({ from: at, to })
  return out
}

/** The intersection of two merged lists. */
function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const from = Math.max(a[i]!.from, b[j]!.from)
    const to = Math.min(a[i]!.to, b[j]!.to)
    if (to > from) out.push({ from, to })
    if (a[i]!.to < b[j]!.to) i++
    else j++
  }
  return out
}

/**
 * The activity of [from, now) from the events of a day (and the day before, for stretches running through 04:00).
 * `self` is this computer while its observation is open: its stretch runs up to now.
 */
export function activityOf(events: readonly AnyEvent[], from: number, now: number, self: string | null = null): Activity {
  const byComputer = new Map<string, AnyEvent[]>()
  for (const e of events) {
    if (!isKnown(e)) continue
    if (e.k !== 'observe.from' && e.k !== 'observe.alive' && e.k !== 'observe.to' && e.k !== 'gap.open' && e.k !== 'gap.close') continue
    const list = byComputer.get(e.c) ?? []
    list.push(e)
    byComputer.set(e.c, list)
  }
  const computers: ComputerActivity[] = []
  for (const [c, list] of byComputer) {
    list.sort(compareEvents)
    const observed: Interval[] = []
    let open: { from: number; last: number } | null = null
    const gaps = new Map<string, { kind: 'input' | 'use'; from: number; to: number | null; lastOutside: number | null }>()
    for (const e of list) {
      if (!isKnown(e)) continue
      if (e.k === 'observe.from') {
        if (open) observed.push({ from: open.from, to: open.last })
        open = { from: e.at, last: e.at }
      } else if (e.k === 'observe.alive') {
        if (open) open.last = Math.max(open.last, e.at)
        else open = { from: e.at, last: e.at }
      } else if (e.k === 'observe.to') {
        if (open) observed.push({ from: open.from, to: Math.max(open.last, e.at) })
        open = null
      } else if (e.k === 'gap.open') {
        if (!gaps.has(e.gap)) gaps.set(e.gap, { kind: e.kind, from: e.from, to: null, lastOutside: e.lastOutside ?? null })
      } else if (e.k === 'gap.close') {
        const g = gaps.get(e.gap)
        if (g && g.to == null) g.to = Math.max(g.from, e.to)
      }
    }
    if (open) observed.push({ from: open.from, to: c === self ? now : open.last })
    const obs = merge(observed)
    // An open gap lasts to the end of the stretch it is in (the time after that is unobserved anyway).
    const endOfStretch = (t: number) => obs.find((x) => t >= x.from && t < x.to)?.to ?? t
    const gapList = (kind: 'input' | 'use') => [...gaps.values()].filter((g) => g.kind === kind).map((g) => ({ from: g.from, to: g.to ?? endOfStretch(g.from) }))
    const unobserved = complement(obs, from, now)
    computers.push({
      c,
      observed: obs,
      noInput: merge([...gapList('input'), ...unobserved]),
      noUse: merge([...gapList('use'), ...unobserved]),
      lastOutside: [...gaps.values()].filter((g) => g.kind === 'input' && g.lastOutside != null).map((g) => ({ at: g.lastOutside!, gapFrom: g.from }))
    })
  }
  const all = (pick: (c: ComputerActivity) => Interval[]): Interval[] => {
    let acc: Interval[] = [{ from, to: now }]
    for (const c of computers) acc = intersect(acc, merge(pick(c)).map((x) => ({ from: Math.max(x.from, from), to: Math.min(x.to, now) })).filter((x) => x.to > x.from))
    return acc
  }
  return {
    from,
    now,
    computers,
    idle: all((c) => c.noInput),
    unused: all((c) => c.noUse),
    unobserved: all((c) => complement(c.observed, from, now))
  }
}

/** The interval of `list` containing t (from ≤ t < to), or the one ending exactly at t (t = now). */
function around(list: readonly Interval[], t: number): Interval | null {
  return list.find((x) => t >= x.from && (t < x.to || t === x.to)) ?? null
}

/** The last input on any computer at or before t (t itself when some computer had input then). */
export function lastInputAt(a: Activity, t: number): number {
  const x = around(a.idle, t)
  return x ? x.from : t
}

/** Minutes without input on any computer up to t (0 when some computer had input at t). */
export function idleMinAt(a: Activity, t: number): number {
  const x = around(a.idle, t)
  return x ? (t - x.from) / 60_000 : 0
}

/**
 * The first use of a computer after a stretch of at least `gapMin` minutes without input on any computer that began
 * after `after` (spec „kończy się wstępnie przy pierwszym użyciu komputera po co najmniej 2 min bez wejścia”): the
 * return (`back`, the first input) and the first use (`use`), or null while nobody came back.
 */
export function firstUseAfter(a: Activity, after: number, gapMin = 2): { away: number; back: number; use: number } | null {
  for (const x of a.idle) {
    const from = Math.max(x.from, after)
    if (x.to <= from || x.to - from < gapMin * 60_000) continue
    if (x.to >= a.now) return null
    // The first use from the return: the end of the stretch without use the return falls in.
    const u = a.unused.find((y) => x.to >= y.from && x.to < y.to)
    if (u && u.to >= a.now) return null
    return { away: x.from, back: x.to, use: u ? u.to : x.to }
  }
  return null
}

/** The first use of the day from `from` (the first instant not in a stretch without use on every computer). */
export function firstUseFrom(a: Activity, from: number): number | null {
  let t = from
  for (const x of a.unused) {
    if (x.to <= t) continue
    if (x.from > t) return t
    t = x.to
  }
  // A stretch without use that reaches now: nobody has used a computer yet.
  if (t > a.now || (t === a.now && t !== from)) return null
  return t
}

/** The last input outside the app on any computer before t (spec D210: the session's end at the last input). */
export function lastOutsideBefore(a: Activity, t: number): number | null {
  let best: number | null = null
  for (const c of a.computers) for (const x of c.lastOutside) if (x.gapFrom <= t && x.at <= t) best = Math.max(best ?? Number.NEGATIVE_INFINITY, x.at)
  return best
}
