/**
 * The hint of a short night (D571, N2 – spec „Pierwszy check-in”): the last input on any computer last night – keyboard or mouse,
 * the gaps in input of the day's logs, never the computer merely on nor the time outside its observed stretches – at least
 * `SHORT_NIGHT_MIN` past the bedtime the engine had for that day (`DayState.bedtime.effective`, the one the ritual and the bar show),
 * within [bedtime, 04:00). Input after 04:00 is in the next day's log and is not counted. Only a hint: the morning plan shows it at
 * „Spałem krócej niż zwykle?” with „tak” chosen beforehand; nothing is written until the check-in is saved.
 *
 * The stretches come from `activityOf`; the gaps are read here once more, with rules of their own (T2523, T2524, T2529) that the
 * other readers of `activityOf` (idleness, the session's end, a block „poza komputerem”) do not have:
 * - a gap open without its close lasts from the stretch it begins in (or, begun outside every stretch – a gap split at 04:00 before
 *   the day's first „trwa”, the last input before a sleep nobody announced – the first stretch after it, when that one began without
 *   `observe.from` or by a wake; a stretch of a new start of the app is another run: the gap ends there) through each next stretch
 *   the same run of the app woke into (`observe.from` „resume” – only that reason), up to a newer gap of that computer;
 * - a newer gap while an older one is still open means the older's close got lost: its start is an instant of input (the
 *   tracker's last input), counted when it lies in a stretch the older gap reached (T2529);
 * - input of less than `START_GRACE_MS` from the very start of a stretch begun by the app's start (`observe.from` „start” – only
 *   that reason) is none: the observation starts when the folder opens, the tracker later (after the folder's own numbers are read –
 *   on OneDrive up to tens of seconds), and its first gap begins only from its own start (a restart by the night's install at 23:41 is
 *   no input). 90 s of real typing right after a start is lost with it – accepted. After a wake it is input.
 * An `observe.from` without a known reason – neither rule.
 */
import { isKnown, type AnyEvent } from '../model/events'
import { MINUTE } from '../time/zone'
import { activityOf, merge, type Interval } from './activity'
import type { DayState } from './day'
import { atOf } from './grid'

/** From this many minutes of input after the bedtime the check-in hints at a short night (fixed – no setting). */
export const SHORT_NIGHT_MIN = 30

/**
 * The tracker of input starts after the observation (`DataFolder.open` writes it before `continueOwnNumbers` – on OneDrive up to tens
 * of seconds –, then the service's `InputTracker`), and its first gap begins at its own start: input shorter than this from a start of
 * the app is that lag, not input (T2524). The tracker's own `GAP_MS` (2 min, `main/engine/input.ts`): a longer lag would have a gap.
 */
const START_GRACE_MS = 2 * MINUTE

export interface ShortNight {
  /** The last input on any computer before the end of the day (ms). */
  lastInput: number
  /** The day's bedtime (ms). */
  bedtime: number
}

interface Gap {
  from: number
  to: number | null
}

/** [s.from, s.to) without the merged intervals `out`. */
function without(s: Interval, out: readonly Interval[]): Interval[] {
  const res: Interval[] = []
  let at = s.from
  for (const x of out) {
    if (x.to <= at || x.from >= s.to) continue
    if (x.from > at) res.push({ from: at, to: x.from })
    at = Math.max(at, x.to)
  }
  if (at < s.to) res.push({ from: at, to: s.to })
  return res
}

/**
 * What an open gap covers (`gap`, empty when no stretch is at or after it) and the instant of input its lost close proves (`input`):
 * the rules of T2523 and T2529 above. `newer` – the start of the next gap of the computer (∞: none); `woke` – the starts of the
 * stretches begun by a wake; `begun` – the starts of every `observe.from` of the computer.
 */
function openGap(from: number, newer: number, stretches: readonly Interval[], woke: ReadonlySet<number>, begun: ReadonlySet<number>): { gap: Interval; input: number | null } {
  const none = { gap: { from, to: from }, input: null }
  let k = stretches.findIndex((s) => from >= s.from && from < s.to)
  if (k < 0) {
    // Begun outside every stretch: the next stretch carries it only when it is the same run of the app – begun without
    // `observe.from` (a stretch through 04:00) or by a wake; a new start (or an unknown reason) is another tracker.
    k = stretches.findIndex((s) => s.to > from)
    if (k < 0 || (begun.has(stretches[k]!.from) && !woke.has(stretches[k]!.from))) return none
  }
  const first = k
  const begin = Math.max(from, stretches[k]!.from)
  for (;;) {
    const s = stretches[k]!
    if (newer < s.to) {
      // The newer gap begins in this stretch (or in the time unobserved before it): the older ends before it.
      const input = newer >= s.from ? newer : null
      if (k === first) return { gap: { from: begin, to: Math.max(begin, newer) }, input }
      return { gap: { from: begin, to: stretches[k - 1]!.to }, input }
    }
    const next = stretches[k + 1]
    if (!next || !woke.has(next.from)) return { gap: { from: begin, to: s.to }, input: null }
    k++
  }
}

/** The last input on any computer within [from, to) by the rules above; null – none. */
function lastInput(events: readonly AnyEvent[], from: number, to: number): number | null {
  const resumed = new Map<string, Set<number>>()
  const started = new Map<string, Set<number>>()
  const begun = new Map<string, Set<number>>()
  const gaps = new Map<string, Map<string, Gap>>()
  const add = (m: Map<string, Set<number>>, c: string, at: number) => m.set(c, (m.get(c) ?? new Set<number>()).add(at))
  for (const e of events) {
    if (!isKnown(e)) continue
    if (e.k === 'observe.from') {
      add(begun, e.c, e.at)
      // Only the reasons this version writes and knows: an unknown one (an older log, another version) starts no rule.
      if (e.why === 'resume') add(resumed, e.c, e.at)
      else if (e.why === 'start') add(started, e.c, e.at)
    } else if (e.k === 'gap.open' && e.kind === 'input') {
      const own = gaps.get(e.c) ?? new Map<string, Gap>()
      if (!own.has(e.gap)) own.set(e.gap, { from: e.from, to: null })
      gaps.set(e.c, own)
    }
  }
  for (const e of events) {
    if (!isKnown(e) || e.k !== 'gap.close') continue
    const g = gaps.get(e.c)?.get(e.gap)
    if (g && g.to == null) g.to = Math.max(g.from, e.to)
  }
  let best: number | null = null
  const latest = (at: number) => (best = Math.max(best ?? at, at))
  for (const c of activityOf(events, from, to).computers) {
    const stretches = c.observed
    const woke = resumed.get(c.c) ?? new Set<number>()
    const fresh = started.get(c.c) ?? new Set<number>()
    const anyFrom = begun.get(c.c) ?? new Set<number>()
    const own = [...(gaps.get(c.c)?.values() ?? [])].sort((a, b) => a.from - b.from)
    const noInput = own.map((g, i): Interval => {
      if (g.to != null) return { from: g.from, to: g.to }
      const newer = own.slice(i + 1).find((x) => x.from > g.from)?.from ?? Number.POSITIVE_INFINITY
      const open = openGap(g.from, newer, stretches, woke, anyFrom)
      // An instant of input: within the window only (an instant at 04:00 is the next day's).
      if (open.input != null && open.input >= from && open.input < to) latest(open.input)
      return open.gap
    })
    const gapsMerged = merge(noInput)
    for (const s of stretches) {
      for (const x of without(s, gapsMerged)) {
        if (x.from === s.from && fresh.has(s.from) && x.to - x.from < START_GRACE_MS) continue
        // A stretch of input: its end within the window (input up to 04:00 – 04:00).
        const end = Math.min(x.to, to)
        if (end > Math.max(x.from, from)) latest(end)
      }
    }
  }
  return best
}

/**
 * The short night of a day gone, from its state (its bedtime) and its events (every computer's log of that day); null – no input
 * from `SHORT_NIGHT_MIN` past the bedtime (also nothing observed, the bedtime at the end of the day).
 */
export function shortNightOf(day: Pick<DayState, 'grid' | 'bedtime'>, events: readonly AnyEvent[]): ShortNight | null {
  const bedtime = atOf(day.grid, day.bedtime.effective)
  const end = atOf(day.grid, day.grid.length)
  if (!(bedtime < end)) return null
  const last = lastInput(events, bedtime, end)
  if (last == null || last - bedtime < SHORT_NIGHT_MIN * MINUTE) return null
  return { lastInput: last, bedtime }
}
