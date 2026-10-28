/**
 * Time to explain (spec „Model dnia” – „Czas do wyjaśnienia”, D238, D243, D246, D249, D250, D254, D255, D262, D264–D266,
 * D271, D275, D276, D280, D281): after a work or project block that ended by itself – after two questions without an
 * answer (from its recorded end), by the idle threshold or when you left without an answer to the absence question (from
 * the return, once a computer is used again) – the further use of the computers is neither work, nor a project, nor
 * regeneration until you say what it was. It lasts to the earliest of: a break in the use of every computer longer than
 * 10 min (after a project only one from 30 min, a shorter one from 10 min is rest and the time goes on after it), the
 * start of a block in the foreground or a request (a block in the background and one that keeps regeneration do not end
 * it), „Odcinam się”, a switch to a regeneration day, a click of „Koniec pracy”, the effective bedtime, 04:00.
 *
 * After a work block (and a passive block counted as a project – lecture, watching, listening, D266) „Koniec pracy”,
 * „Odcinam się” and the switch to a regeneration day answer it „odpoczynek”; after a project they do not (D254). Your
 * own answer („praca”, „projekt”, „odpoczynek”, „Pracowałem do …”, „Projekt do …”) is a `question.answer` with the id of
 * the time to explain – the last one written counts. A day closed (the ritual, „Jak zapisano”) answers an untouched one
 * with its row's ✓. Pure: the input and use come from the day's records, the same on every computer once the logs have
 * arrived.
 */
import { placeOf } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import { questionId } from '../model/ids'
import type { Activity } from './activity'
import type { BlockInfo } from './blocks'
import { OPEN, type DayFacts } from './facts'
import { atOf, idxOf, type Grid } from './grid'

const MIN = 60_000
/** The rules of a block's end that leave time to explain after a work or project block. */
export const EXPLAIN_END_RULES: readonly string[] = ['twoQuestions', 'idle', 'absence']
/** After a work block a break in use longer than this ends it (D250). */
export const EXPLAIN_WORK_BREAK_MIN = 10
/** After a project only a break from this long ends it (D281) … */
export const EXPLAIN_PROJECT_BREAK_MIN = 30
/** … and a break from this long up to it is rest, the time to explain going on after it. */
export const EXPLAIN_PROJECT_REST_MIN = 10

/** „po bloku pracy” (also a passive block counted as a project, D266) or „po projekcie” (spec, D254). */
export type ExplainKind = 'work' | 'project'
export type ExplainClass = 'work' | 'project' | 'rest'
/** What ended it. */
export type ExplainUntil = 'break' | 'block' | 'request' | 'disconnect' | 'regenDay' | 'workEnd' | 'bedtime' | 'dayEnd'

export interface ExplainAnswer {
  cls: ExplainClass
  /** „Pracowałem do …”, „Projekt do …”: the class up to this index, rest after it; null – the whole time. */
  until: number | null
  /** When it was given (index): minutes before it were judged without it (T413). */
  at: number
  /** Your answer; „Koniec pracy”, „Odcinam się”, a regeneration day (after a work block); the day closed with it untouched. */
  how: 'answer' | 'workEnd' | 'disconnect' | 'regenDay' | 'close'
}

export interface Explain {
  /** The id of its answers: `explain:<date>:<block>:<the block's end>`. */
  id: string
  block: string
  kind: ExplainKind
  /** The block is a project or counted as one (D195, D209): the second answer reads „Projekt do …”. */
  asProject: boolean
  /** How the block ended (its rule). */
  endRule: string
  /** The block's recorded end (index). */
  blockEnd: number
  /** From (index): the block's end after two questions, else the first use after the return. */
  from: number
  /** To (index, exclusive); OPEN while it goes on. */
  to: number
  until: ExplainUntil | null
  /** After a project: breaks of 10–30 min inside it, which are rest (D281). */
  rests: Array<{ from: number; to: number }>
  answer: ExplainAnswer | null
}

export interface ExplainInput {
  grid: Grid
  facts: DayFacts
  blocks: readonly BlockInfo[]
  /** The blocks counted as projects (D195, D209). */
  projects: ReadonlySet<string>
  /** The day's events (any order). */
  events: readonly AnyEvent[]
  activity: Activity
  /** Index of now. */
  now: number
  /** The effective bedtime in force at index k (index). */
  bedtime: (k: number) => number
}

export const explainId = (date: string, block: string, blockEnd: number): string => `explain:${date}:${block}:${blockEnd}`

/** Minutes of a time to explain up to `now` and from `after` on (indices), without the rests inside it. */
export function explainMinutes(x: Explain, now: number, after = Number.NEGATIVE_INFINITY): number {
  const from = Math.max(x.from, after)
  const to = Math.min(x.to, now)
  if (to <= from) return 0
  return to - from - x.rests.reduce((s, r) => s + Math.max(0, Math.min(r.to, to) - Math.max(r.from, from)), 0)
}

/** An instant (ms) inside a time to explain, up to now – what „Pracowałem do …” and „… do” may say. */
export const inExplain = (x: Explain, grid: Grid, now: number, at: number): boolean => at >= atOf(grid, x.from) && at <= atOf(grid, Math.min(x.to, now))

/** A question id of a time to explain. */
export const isExplainId = (id: string): boolean => id.startsWith('explain:')

/**
 * The first use after the stretch without input on every computer in which `at` falls (the return, D264, D271): the
 * return itself when a computer is used from it. Null while nobody is back or nobody uses a computer yet. `slack` – how
 * far `at` may be from the stretch: a block's end on the minute grid is rounded, its gap began at any second (T412).
 */
export function useAfter(a: Activity, at: number, slack = 0): number | null {
  const away = a.idle.find((i) => i.from <= at + slack && at - slack <= i.to)
  const back = away ? away.to : at
  if (away && back >= a.now) return null
  const unused = a.unused.find((u) => u.from <= back && back < u.to)
  if (!unused) return back
  return unused.to >= a.now ? null : unused.to
}

/** Your answers to times to explain: the last one written (not undone) of each. */
function explicitAnswers(grid: Grid, facts: DayFacts, events: readonly AnyEvent[]): Map<string, ExplainAnswer> {
  const out = new Map<string, ExplainAnswer>()
  for (const e of [...events].sort(compareEvents)) {
    if (!isKnown(e) || e.k !== 'question.answer' || facts.undone.has(e.id) || !isExplainId(e.question)) continue
    if (e.answer !== 'work' && e.answer !== 'project' && e.answer !== 'rest') continue
    out.set(e.question, { cls: e.answer, until: e.answer !== 'rest' && e.value != null ? idxOf(grid, e.value) : null, at: idxOf(grid, e.at), how: 'answer' })
  }
  return out
}

/**
 * „Pracowałem do …” on the bar (D254, A1-12): the index a time to explain after a work block is answered „praca” up to
 * – now while it goes on unanswered, its end once „Koniec pracy” answered it „odpoczynek”; null – none (after a project,
 * after your own answer). After a passive block counted as a project it reads „Projekt do …”.
 */
export function workedUntilOf(x: Explain, now: number): number | null {
  if (x.kind !== 'work') return null
  if (x.to === OPEN) return !x.answer && now >= x.from ? now : null
  return x.answer?.how === 'workEnd' ? x.to : null
}

/** The times to explain of a day, in the order of their start. */
export function explainsOf(inp: ExplainInput): Explain[] {
  const { grid, facts, activity } = inp
  const byId = new Map(inp.blocks.map((b) => [b.id, b]))
  const answers = explicitAnswers(grid, facts, inp.events)
  const out: Explain[] = []
  for (const f of facts.blocks.values()) {
    if (f.endedAt == null || !f.endRule || !EXPLAIN_END_RULES.includes(f.endRule)) continue
    const b = byId.get(f.id)
    if (!b || !((b.isWork && !b.rules.keepsRegen) || b.isProject)) continue
    // „Zakończyć” given to the absence question: the time from the return counts by the usual rules (D276).
    if (f.endRule === 'absence' && facts.answers.get(questionId(grid.date, 'absence', f.id, f.endedAt))?.answer === 'keep') continue
    const endMs = atOf(grid, f.endedAt)
    let from = f.endedAt
    if (f.endRule !== 'twoQuestions') {
      const use = useAfter(activity, endMs, MIN / 2)
      if (use == null) continue
      from = Math.max(f.endedAt, idxOf(grid, use))
    }
    if (from >= inp.now) continue
    const asProject = b.isProject || inp.projects.has(b.id)
    const kind: ExplainKind = asProject && placeOf(b.rules, b.variantId) !== 'passive' ? 'project' : 'work'

    // The earliest of the moments that end it.
    let to = OPEN
    let until: ExplainUntil | null = null
    const end = (idx: number, why: ExplainUntil) => {
      if (idx >= from && idx < to) {
        to = idx
        until = why
      }
    }
    for (const g of facts.blocks.values()) {
      const gi = byId.get(g.id)
      if (gi?.rules.keepsRegen) continue
      for (const r of g.runs) if (!r.bg && r.from >= from) end(r.from, 'block')
    }
    for (const r of facts.requests) if (r.from >= from) end(r.from, 'request')
    for (const d of facts.disconnect) if (d.from >= from) end(d.from, 'disconnect')
    for (const s of facts.snapshots) if (s.reason === 'type' && s.dayType === 'regeneracyjny' && s.at >= from) end(s.at, 'regenDay')
    for (const w of facts.workEnds) if (w.at >= from) end(w.at, 'workEnd')
    end(Math.max(from, inp.bedtime(from)), 'bedtime')
    end(grid.length, 'dayEnd')
    // A break in the use of every computer (an open one counts as long as it has lasted).
    const rests: Array<{ from: number; to: number }> = []
    const fromMs = atOf(grid, from)
    const breakMin = kind === 'work' ? EXPLAIN_WORK_BREAK_MIN : EXPLAIN_PROJECT_BREAK_MIN
    for (const u of activity.unused) {
      if (u.to <= fromMs) continue
      const at = Math.max(u.from, fromMs)
      if (idxOf(grid, at) >= to) break
      const len = Math.min(u.to, activity.now) - u.from
      const ends = kind === 'work' ? len > breakMin * MIN : len >= breakMin * MIN
      if (ends) {
        end(idxOf(grid, at), 'break')
        break
      }
      if (kind === 'project' && len >= EXPLAIN_PROJECT_REST_MIN * MIN) rests.push({ from: idxOf(grid, at), to: idxOf(grid, Math.min(u.to, activity.now)) })
    }
    if (to > inp.now) {
      to = OPEN
      until = null
    }
    const id = explainId(grid.date, b.id, f.endedAt)
    let answer = answers.get(id) ?? null
    if (!answer && kind === 'work') {
      // „Koniec pracy”, „Odcinam się”, the switch to a regeneration day: „odpoczynek” (D249, D254).
      const implicit: Array<{ at: number; how: ExplainAnswer['how'] }> = [
        ...facts.workEnds.filter((w) => w.at >= from).map((w) => ({ at: w.at, how: 'workEnd' as const })),
        ...facts.disconnect.filter((d) => d.from >= from).map((d) => ({ at: d.from, how: 'disconnect' as const })),
        ...facts.snapshots.filter((s) => s.reason === 'type' && s.dayType === 'regeneracyjny' && s.at >= from).map((s) => ({ at: s.at, how: 'regenDay' as const }))
      ].sort((x, y) => x.at - y.at)
      if (implicit[0]) answer = { cls: 'rest', until: null, at: implicit[0].at, how: implicit[0].how }
    }
    // Closed by the ritual or „Jak zapisano” with its row untouched: the row's ✓ – after a work block „odpoczynek”, after a
    // project „projekt” (D249, D254); one that began after the close stays for the morning's line.
    const closed = facts.closed
    if (!answer && closed && (closed.how === 'ritual' || closed.how === 'asWritten') && closed.at >= from) answer = { cls: kind === 'work' ? 'rest' : 'project', until: null, at: closed.at, how: 'close' }
    out.push({ id, block: b.id, kind, asProject, endRule: f.endRule, blockEnd: f.endedAt, from, to, until, rests: rests.filter((r) => r.from < to && r.to > r.from), answer })
  }
  return out.sort((a, b) => a.from - b.from)
}
