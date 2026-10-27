/**
 * The closing ritual (spec „Rytuał zamknięcia”, D246, D249, D254, D266, D272, T383): the rows of a day that wait for you
 * – the end of work, the boundary, blocks without an answer to „Dalej?” with their time to explain (one summary row),
 * absences, blocks away from the computer ended by a limit or the bedtime, blocks broken off by a close of the app,
 * minutes of fixed blocks after the boundary without „Potwierdź”, skipped blocks, parked blocks anchored to ones that
 * passed, requests with „osoba: ?”, and the evening's rest – each with its choices. An answer is written as the events
 * the bar's questions write (`question.answer`, `block.end`, `work.end` …); a row's own `question.answer` (id
 * `ritual:<day>:<kind>:<key>`) marks it touched. Closing the day (`ritual.close`) takes untouched rows as written.
 *
 * The effect of a ✓ is the day's outcome as it would be frozen (as written) with the row's ✓ against without it – in
 * the evening with the plan's forecast to the bedtime (spec „skutek ✓ dla dnia liczy ta sama funkcja oceny co
 * zamrożenie”). Pure: the main process writes what it returns.
 */
import { CLOSE_HOWS, isKnown, RULES_VERSION, type AnyEvent, type CloseHow } from '../model/events'
import { questionId } from '../model/ids'
import { dayStart } from '../time/day'
import { addDays } from '../time/zone'
import { answerEvents, type Question } from './auto'
import { plannedSpan } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import type { Explain } from './explain'
import { OPEN, type BlockFact } from './facts'
import { atOf } from './grid'
import { dayOutcome, outcomeChanges, type OutcomeChange } from './outcome'
import { plannedEndOf, type TimerDraft } from './timer'

const HOUR = 3_600_000
/** A day not closed waits in the morning at most this long after its end (spec „Okno korekty … najwyżej 72 h”). */
export const CLOSE_WINDOW_H = 72

/** A block of the summary row (D246): from its planned end to the end of the use of the computer after it. */
export interface SilentItem {
  block: string
  /** Indices. */
  plannedEnd: number
  end: number
  /** Minutes after the planned end as written. */
  extraMin: number
  /** When „Dalej?” was first seen (ms) and on which computer – „widziane 18:10 na laptopie”. */
  seenAt: number | null
  seenOn: string | null
  rule: string
  explain: Explain | null
}

interface RowBase {
  /** `ritual:<day>:<kind>:<key>`. */
  id: string
  /** Something the morning's line shows: it came after the day was closed (spec). */
  afterClose: boolean
}

export type RitualRow = RowBase &
  (
    | { kind: 'workEnd'; end: number; confirmed: boolean; explain: Explain | null }
    | { kind: 'boundary'; proposal: number | null; approved: number | null }
    | { kind: 'silent'; items: SilentItem[]; extraMin: number; explainMin: number; answered: boolean }
    | { kind: 'absence'; block: string; mode: 'ended' | 'counted'; away: number; back: number | null; question: string; explain: Explain | null; answered: boolean }
    | { kind: 'away'; block: string; rule: string; start: number; end: number; plannedEnd: number; question: string; answered: boolean }
    | { kind: 'shutdown'; block: string; at: number; question: string; answered: boolean }
    | { kind: 'fixedMinutes'; block: string; minutes: number; answered: boolean }
    | { kind: 'skipped'; block: string; fixed: boolean; from: number; to: number }
    | { kind: 'parkedAnchored'; block: string; anchor: string }
    | { kind: 'person'; request: string; from: number; to: number }
    | { kind: 'rest'; from: number; to: number; marked: Array<{ from: number; to: number }>; answered: boolean }
  )

export type RitualKind = RitualRow['kind']
/** A choice's value: an instant (ms), a person, a stretch (ms). */
export type RitualValue = number | string | { from: number; to: number } | null

/** The ✓ of each row kind that has one (what clicking it does – spec). */
const CHECK: Partial<Record<RitualKind, string>> = { workEnd: 'ok', silent: 'ok', absence: 'ok', away: 'ok', shutdown: 'ok', fixedMinutes: 'ok', rest: 'ok' }

export const ritualRowId = (date: string, kind: RitualKind, key: string): string => `ritual:${date}:${kind}:${key}`

const SILENT_RULES = ['twoQuestions', 'idle']
const AWAY_RULES = ['limit', 'bedtime']

/** The rows of a day's ritual, in the order the ritual shows them. */
export function ritualRows(state: DayState): RitualRow[] {
  const g = state.grid
  const date = g.date
  const f = state.facts
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const explainOf = new Map(state.explains.map((x) => [x.block, x]))
  const closedAt = f.closed?.at ?? null
  const after = (idx: number) => closedAt != null && idx > closedAt
  const touched = (id: string) => f.answers.has(id)
  const out: RitualRow[] = []

  // The end of work: one click „Koniec pracy o … ✓”, with „Pracowałem do …” when time to explain after a work block
  // follows it (spec „Dzień bez potwierdzonego końca pracy ma w tym wierszu jedno kliknięcie”).
  const last = state.ends.at(-1)
  const running = [...f.blocks.values()].some((b) => b.endedAt == null && b.runs.some((r) => r.to === OPEN) && byId.get(b.id)?.isWork)
  if (!state.noWorkDay && last && !running) {
    const explain = state.explains.find((x) => x.kind === 'work' && x.from >= last.at) ?? null
    out.push({ id: ritualRowId(date, 'workEnd', 'day'), kind: 'workEnd', end: last.at, confirmed: last.confirmed && state.workEnd != null, explain, afterClose: after(last.at) })
  }
  // The boundary open for approval (its automatic approval undone, spec „Cofnij … otwiera granicę do zatwierdzenia”).
  if (state.firstWorkStart != null && state.boundary.approved == null) out.push({ id: ritualRowId(date, 'boundary', 'day'), kind: 'boundary', proposal: state.boundary.proposal, approved: null, afterClose: false })

  // Blocks without an answer to „Dalej?” and the time to explain after them: one summary row (D246). A block written
  // with its end at its planned end and no time to explain is not in it.
  const items: SilentItem[] = []
  for (const b of f.blocks.values()) {
    if (b.endedAt == null || !b.endRule || !SILENT_RULES.includes(b.endRule)) continue
    const info = byId.get(b.id)
    if (!info) continue
    const plannedEnd = plannedEndOf(state, info, b)
    const explain = explainOf.get(b.id) ?? null
    const hasExplain = explain != null && Math.min(explain.to, state.now) > explain.from
    if (b.endedAt <= plannedEnd && !hasExplain) continue
    const seen = f.seen.get(questionId(date, 'next', b.id, plannedEnd)) ?? null
    items.push({ block: b.id, plannedEnd, end: b.endedAt, extraMin: Math.max(0, b.endedAt - plannedEnd), seenAt: seen?.at ?? null, seenOn: seen?.c ?? null, rule: b.endRule, explain })
  }
  if (items.length) {
    items.sort((a, b) => a.plannedEnd - b.plannedEnd)
    const id = ritualRowId(date, 'silent', 'day')
    const explainMin = items.reduce((s, x) => s + (x.explain ? explainLength(x.explain, state.now) : 0), 0)
    const answered = touched(id) || items.every((x) => !x.explain || x.explain.answer?.how === 'answer')
    out.push({ id, kind: 'silent', items, extraMin: items.reduce((s, x) => s + x.extraMin, 0), explainMin, answered, afterClose: items.every((x) => after(x.plannedEnd)) })
  }

  for (const a of f.autos) {
    if (!a.block) continue
    const b = f.blocks.get(a.block)
    const info = byId.get(a.block)
    if (!b || !info) continue
    // Ended when you left (without an answer, D256) – the time from the return to explain; counted out (D260).
    if (a.rule === 'absence' && a.k === 'block.end' && b.endId === a.id) {
      const question = questionId(date, 'absence', a.block, a.at)
      if (f.answers.get(question)?.answer === 'keep') continue // „Zakończyć” – nothing waits (D276)
      const explain = explainOf.get(a.block) ?? null
      const id = ritualRowId(date, 'absence', `${a.block}:${a.at}`)
      out.push({ id, kind: 'absence', block: a.block, mode: 'ended', away: a.at, back: explain?.from ?? null, question, explain, answered: touched(id) || touched(question) || explain?.answer?.how === 'answer', afterClose: after(a.at) })
    }
    if (a.rule === 'absence' && a.k === 'block.pause') {
      const question = questionId(date, 'absence', a.block, a.at)
      const resume = f.autos.find((x) => x.block === a.block && x.rule === 'absence' && x.k === 'block.resume' && x.at >= a.at)
      const id = ritualRowId(date, 'absence', `${a.block}:${a.at}`)
      out.push({ id, kind: 'absence', block: a.block, mode: 'counted', away: a.at, back: resume?.at ?? null, question, explain: null, answered: touched(id) || touched(question), afterClose: after(a.at) })
    }
    // Away from the computer, ended without your answer by its limit or at the bedtime (D251, D258, D261).
    if (a.k === 'block.end' && AWAY_RULES.includes(a.rule) && b.endId === a.id && b.startedAt != null) {
      const question = questionId(date, 'return', a.block, a.at)
      const id = ritualRowId(date, 'away', a.block)
      out.push({ id, kind: 'away', block: a.block, rule: a.rule, start: b.startedAt, end: a.at, plannedEnd: plannedEndOf(state, info, b), question, answered: touched(id) || touched(question), afterClose: after(a.at) })
    }
    // Broken off by a close of the app, no answer at the start (spec „skończył się przy wyłączeniu”).
    if (a.k === 'block.end' && a.rule === 'shutdown' && b.endId === a.id) {
      const question = questionId(date, 'shutdown', a.block, a.at)
      const id = ritualRowId(date, 'shutdown', a.block)
      out.push({ id, kind: 'shutdown', block: a.block, at: a.at, question, answered: touched(id) || touched(question), afterClose: after(a.at) })
    }
  }

  // Minutes of fixed blocks after the boundary without „Potwierdź” (they count as an extension at the freeze).
  for (const b of f.blocks.values()) {
    const info = byId.get(b.id)
    if (!info?.fixed || !info.isWork) continue
    let minutes = 0
    for (const r of b.runs) for (let k = r.from; k < Math.min(r.to, state.now); k++) {
      const m = state.minutes.get(k)
      if (m && m.cls !== 'in' && !m.upfront) minutes++
    }
    if (minutes > 0) {
      const id = ritualRowId(date, 'fixedMinutes', b.id)
      out.push({ id, kind: 'fixedMinutes', block: b.id, minutes, answered: touched(id), afterClose: b.startedAt != null && after(b.startedAt) })
    }
  }

  // Blocks of the plan whose time has passed and that did not start (fixed ones „do potwierdzenia”), and parked blocks
  // anchored to a block that passed (on the ritual's list, with no day).
  for (const info of state.blocks) {
    const b = f.blocks.get(info.id)
    const span = plannedSpan(info, byId)
    if (info.inPlan && span && span.end <= state.now && b?.startedAt == null && b?.parkedAt == null && b?.cancelledAt == null) {
      out.push({ id: ritualRowId(date, 'skipped', info.id), kind: 'skipped', block: info.id, fixed: info.fixed, from: span.start, to: span.end, afterClose: after(span.end) })
    }
    if (b?.parkedAt != null && info.anchor) {
      const anchor = f.blocks.get(info.anchor)
      const anchorSpan = byId.get(info.anchor) ? plannedSpan(byId.get(info.anchor)!, byId) : null
      if (anchor?.endedAt != null || (anchorSpan && anchorSpan.end <= state.now)) out.push({ id: ritualRowId(date, 'parkedAnchored', info.id), kind: 'parkedAnchored', block: info.id, anchor: info.anchor, afterClose: false })
    }
  }

  // Requests with „osoba: ?”.
  for (const r of f.requests) if (r.person == null) out.push({ id: ritualRowId(date, 'person', r.id), kind: 'person', request: r.id, from: r.from, to: r.to, afterClose: after(r.from) })

  // „Po końcu pracy · odpoczynek ✓ · zaznacz odcinek” (spec: no numbers, no new question).
  if (state.firstEnd != null && state.firstEnd < state.now) {
    const id = ritualRowId(date, 'rest', 'day')
    out.push({ id, kind: 'rest', from: state.firstEnd, to: Math.min(state.now, state.bedtime.effective), marked: f.notRest, answered: touched(id) || f.notRest.length > 0, afterClose: false })
  }
  return out
}

const explainLength = (x: Explain, now: number) => Math.max(0, Math.min(x.to, now) - x.from) - x.rests.reduce((s, r) => s + Math.max(0, Math.min(r.to, now) - r.from), 0)

/** A question of the bar as the ritual answers it (the same events as there). */
function question(state: DayState, id: string, kind: Question['kind'], block: string, askedIdx: number): Question {
  return { id, kind, block, askedAt: atOf(state.grid, askedIdx), seenAt: null, text: '', answers: [], dot: false, silent: true }
}

const answerDraft = (at: number, questionId: string, answer: string, value: number | null = null): TimerDraft => ({ k: 'question.answer', at, question: questionId, answer, value })

/** The ✓ of a time to explain: after a work block „odpoczynek”, after a project „projekt” (D249, D254, D266). */
const explainCheck = (x: Explain, at: number): TimerDraft[] => (x.answer?.how === 'answer' ? [] : [answerDraft(at, x.id, x.kind === 'work' ? 'rest' : 'project')])

/** The end of a block corrected: an automatic end goes („Cofnij”) and yours is written; your own end gets a „korekta”. */
function endAt(state: DayState, b: BlockFact, at: number, end: number): TimerDraft[] {
  if (b.endId && state.facts.autos.some((a) => a.id === b.endId)) return [{ k: 'undo', at, target: b.endId, reason: 'ritual' }, { k: 'block.end', block: b.id, at: end, done: true, rule: null }]
  return [{ k: 'block.fix', block: b.id, at, start: null, end }]
}

/**
 * What an answer of a row writes (null: not a choice of that row). `item` – a block of the summary row; `value` – an
 * instant (ms) for „skończył się o …”, „Pracowałem do …”, a person, a stretch for „zaznacz odcinek”.
 */
export function ritualAnswer(state: DayState, row: RitualRow, choice: string, at: number, value: RitualValue = null, item: string | null = null): TimerDraft[] | null {
  const g = state.grid
  const f = state.facts
  const ms = typeof value === 'number' ? value : null
  const mark = answerDraft(at, row.id, choice)
  switch (row.kind) {
    case 'workEnd': {
      if (choice === 'ok') return [{ k: 'work.end', at, end: atOf(g, row.end) }]
      if ((choice === 'workedUntil' || choice === 'projectUntil') && ms != null) {
        // „Pracowałem do …” answers the time to explain „praca” and confirms the end then; „Projekt do …” (after a passive
        // block counted as a project) answers it „projekt” and confirms the end of the work before it.
        if (!row.explain) return choice === 'workedUntil' ? [{ k: 'work.end', at, end: ms }] : null
        return choice === 'workedUntil' ? [answerDraft(at, row.explain.id, 'work', ms), { k: 'work.end', at, end: ms }] : [answerDraft(at, row.explain.id, 'project', ms), { k: 'work.end', at, end: atOf(g, row.end) }]
      }
      return null
    }
    case 'boundary':
      if (choice !== 'approve') return null
      return [{ k: 'boundary.approve', at, boundary: ms ?? (row.proposal != null ? atOf(g, row.proposal) : at), auto: false }]
    case 'silent': {
      if (choice === 'ok') return [...row.items.flatMap((x) => (x.explain ? explainCheck(x.explain, at) : [])), mark]
      const x = row.items.find((i) => i.block === item)
      if (!x) return null
      if (choice === 'endedAt' && ms != null) return endAt(state, f.blocks.get(x.block)!, at, ms)
      if ((choice === 'work' || choice === 'project' || choice === 'rest') && x.explain) return [answerDraft(at, x.explain.id, choice, choice === 'rest' ? null : ms)]
      return null
    }
    case 'absence': {
      const q = question(state, row.question, 'absence', row.block, row.away)
      if (choice === 'ok') {
        // Counted out: „odlicz” (the note for accuracy and the calibration come back, D272); ended when you left: the time
        // from the return – after a project „projekt”, after a work block „odpoczynek”.
        if (row.mode === 'counted') return [...(answerEvents(state, q, 'keep', at) ?? []), mark]
        return [...(row.explain ? explainCheck(row.explain, at) : []), mark]
      }
      if (choice === 'end' || choice === 'leave' || choice === 'subtract') return answerEvents(state, q, choice, at)
      if ((choice === 'work' || choice === 'project' || choice === 'rest') && row.explain) return [answerDraft(at, row.explain.id, choice, choice === 'rest' ? null : ms)]
      return null
    }
    case 'away':
    case 'shutdown': {
      const asked = row.kind === 'away' ? row.end : row.at
      const q = question(state, row.question, row.kind === 'away' ? 'return' : 'shutdown', row.block, asked)
      if (choice === 'ok') return [...(answerEvents(state, q, 'keep', at) ?? []), mark]
      if (choice === 'endedAt' && ms != null) return answerEvents(state, q, 'endedAt', at, ms)
      return null
    }
    case 'fixedMinutes':
      if (choice === 'ok') return [mark]
      if (choice === 'endedAt' && ms != null) return endAt(state, f.blocks.get(row.block)!, at, ms)
      return null
    case 'skipped': {
      if (choice === 'cancel') return [{ k: 'block.cancel', block: row.block, at, rule: 'ritual' }]
      if (choice === 'park' && !row.fixed) return [{ k: 'block.park', block: row.block, at, rule: 'ritual' }]
      if (choice === 'happened') {
        // It happened at its planned time (a correction of times can follow).
        const info = state.blocks.find((b) => b.id === row.block)!
        const planned = { categoryId: info.categoryId, variantId: info.variantId, durationMin: info.durationMin, tag: info.secondShift ? 'secondShift' : info.weeklyAnalysis ? 'weeklyAnalysis' : null, fixed: info.fixed, costs: info.costs, bgCostPct: info.bgCostPct }
        return [
          { k: 'block.start', block: row.block, at: atOf(g, row.from), bg: info.bg, planned, confirmUntil: null, how: 'click' },
          { k: 'block.end', block: row.block, at: atOf(g, row.to), done: true, rule: null }
        ]
      }
      return null
    }
    case 'parkedAnchored':
      return null
    case 'person':
      return choice === 'person' && typeof value === 'string' && value.trim() ? [{ k: 'request.person', request: row.request, at, person: value.trim() }] : null
    case 'rest':
      if (choice === 'ok') return [mark]
      if (choice === 'notRest' && value != null && typeof value === 'object' && value.to > value.from) return [{ k: 'rest.not', at, from: value.from, to: value.to }]
      return null
  }
}

/** Drafts as log events for a simulation (after every event of the day). */
function simEvents(ctx: DayContext, drafts: readonly TimerDraft[], at: number): AnyEvent[] {
  let l = at
  for (const e of ctx.events) l = Math.max(l, e.l)
  return drafts.map((d, i) => ({ id: `sim-ritual-${i}`, c: '~sim', n: i, t: at, l: l + 1 + i, v: RULES_VERSION, day: ctx.date, dom: 'timer', ...d }) as unknown as AnyEvent)
}

export interface RitualEffect {
  changes: OutcomeChange[]
  /** In the evening: counted with the plan's forecast to the bedtime („prognoza”). */
  forecast: boolean
}

/** The outcome of the day as it would be frozen now, with some more events. */
function frozenOutcome(ctx: DayContext, extra: readonly AnyEvent[], forecast: boolean) {
  return dayOutcome(computeDay({ ...ctx, events: extra.length ? [...ctx.events, ...extra] : ctx.events, asWritten: true }), { forecast })
}

/** What a row's ✓ changes in the day's outcome against the day with it untouched (spec); null – no ✓. */
export function ritualEffect(ctx: DayContext, state: DayState, row: RitualRow, at: number): RitualEffect | null {
  const check = CHECK[row.kind]
  const drafts = check ? ritualAnswer(state, row, check, at) : null
  if (!drafts) return null
  const forecast = state.now < state.bedtime.effective
  return { changes: outcomeChanges(frozenOutcome(ctx, [], forecast), frozenOutcome(ctx, simEvents(ctx, drafts, at), forecast)), forecast }
}

/**
 * Closing the day (`how`): the evening ritual and „Jak zapisano” confirm the end of work (spec „Jak zapisano … potwierdza
 * koniec pracy jak „Koniec pracy o … ✓””) and take untouched rows as written; „Nie pamiętam” confirms nothing (a day
 * without data); „Wolne” marks the day free.
 */
export function closeEvents(state: DayState, how: CloseHow, at: number): TimerDraft[] {
  if (!CLOSE_HOWS.includes(how)) return []
  const out: TimerDraft[] = []
  if (how === 'ritual' || how === 'asWritten') {
    const row = ritualRows(state).find((r) => r.kind === 'workEnd')
    if (row && row.kind === 'workEnd' && !row.confirmed) out.push({ k: 'work.end', at, end: atOf(state.grid, row.end) })
  }
  out.push({ k: 'ritual.close', at, how })
  return out
}

/** What „Jak zapisano” changes for the day (the morning's row shows it before the click). */
export function closeEffect(ctx: DayContext, state: DayState, at: number): RitualEffect {
  const forecast = state.now < state.bedtime.effective
  return { changes: outcomeChanges(frozenOutcome(ctx, [], forecast), frozenOutcome(ctx, simEvents(ctx, closeEvents(state, 'asWritten', at), at), forecast)), forecast }
}

export interface DayLog {
  date: string
  events: readonly AnyEvent[]
}

/**
 * The days the morning shows to close (spec „Rano aplikacja pokazuje wszystkie niezamknięte dni naraz”): before today,
 * from the first day with the ritual (`ritualFrom`; earlier ones close themselves as written), not closed, not frozen,
 * at most 72 h after their end. `presence` – a day with your presence on some computer (one without it is free unless
 * you say otherwise, spec „Dzień bez obecności”).
 */
export function unclosedDays(days: readonly DayLog[], today: string, now: number, ritualFrom: string | null): Array<{ date: string; presence: boolean }> {
  if (ritualFrom == null) return []
  const out: Array<{ date: string; presence: boolean }> = []
  for (const d of days) {
    if (d.date >= today || d.date < ritualFrom) continue
    if (now >= dayStart(addDays(d.date, 1)) + CLOSE_WINDOW_H * HOUR) continue
    // A freeze (E6, part two) closes it too – also one written by a newer version.
    if (d.events.some((e) => e.k === 'ritual.close' || e.k === 'day.freeze')) continue
    out.push({ date: d.date, presence: d.events.some((e) => isKnown(e) && e.k === 'presence.first') })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
