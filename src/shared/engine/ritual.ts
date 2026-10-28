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
import { REQUEST_CATEGORY } from '../model/categories'
import { CLOSE_HOWS, isKnown, RULES_VERSION, type AnyEvent, type CloseHow, type FeltCost } from '../model/events'
import { questionId } from '../model/ids'
import { dayStart } from '../time/day'
import { addDays } from '../time/zone'
import { activityOf, merge, useWithin, type Activity } from './activity'
import { answerEvents, type Question } from './auto'
import { isBoundaryWork, plannedSpan, startPlanned } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import { explainMinutes, inExplain, type Explain } from './explain'
import { foldFacts, OPEN, ranMinutes, type BlockFact } from './facts'
import { atOf, gridOf } from './grid'
import { dayOutcome, outcomeChanges, type DayOutcome, type OutcomeChange } from './outcome'
import { plannedEndOf, timerNow, type TimerDraft } from './timer'

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
    | {
        kind: 'skipped'
        block: string
        fixed: boolean
        from: number
        to: number
        /** A session: the use of the computers within its window (ms) – its times when it happened, null: the plan's. */
        used: { from: number; to: number } | null
      }
    | { kind: 'parkedAnchored'; block: string; anchor: string; answered: boolean }
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

/** The use of the computers as the engine reads it from a day's log (`computeDay` does the same): what rows measure. */
export const ritualActivity = (ctx: DayContext, state: DayState): Activity => activityOf(ctx.events, state.grid.start, ctx.now)

/**
 * The end of work: one click „Koniec pracy o … ✓”, with „Pracowałem do …” when time to explain after a work block follows
 * it (spec „Dzień bez potwierdzonego końca pracy ma w tym wierszu jedno kliknięcie”); null while work runs or without it.
 */
function workEndRow(state: DayState): Extract<RitualRow, { kind: 'workEnd' }> | null {
  const last = state.ends.at(-1)
  const running = [...state.facts.blocks.values()].some((b) => b.endedAt == null && b.runs.some((r) => r.to === OPEN) && state.blocks.find((x) => x.id === b.id)?.isWork)
  if (state.noWorkDay || !last || running) return null
  const closedAt = state.facts.closed?.at ?? null
  const explain = state.explains.find((x) => x.kind === 'work' && x.from >= last.at) ?? null
  return { id: ritualRowId(state.grid.date, 'workEnd', 'day'), kind: 'workEnd', end: last.at, confirmed: last.confirmed && state.workEnd != null, explain, afterClose: closedAt != null && last.at > closedAt }
}

/**
 * The rows of a day's ritual, in the order the ritual shows them. `activity` – the use of the computers from the day's log
 * (`ritualActivity`): a skipped session that happened takes its times from it; null – not known, the plan's times.
 */
export function ritualRows(state: DayState, activity: Activity | null): RitualRow[] {
  const g = state.grid
  const date = g.date
  const f = state.facts
  const useOf = (from: number, to: number) => (activity ? useWithin(activity, atOf(g, from), atOf(g, to)) : null)
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const explainOf = new Map(state.explains.map((x) => [x.block, x]))
  const closedAt = f.closed?.at ?? null
  const after = (idx: number) => closedAt != null && idx > closedAt
  const touched = (id: string) => f.answers.has(id)
  const out: RitualRow[] = []

  const workEnd = workEndRow(state)
  if (workEnd) out.push(workEnd)
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
    const explainMin = items.reduce((s, x) => s + (x.explain ? explainMinutes(x.explain, state.now) : 0), 0)
    // Answered by its ✓, or when every block has a time to explain you answered yourself (minutes over the plan with
    // nothing to explain wait for the ✓ or „skończył się o …”).
    const answered = touched(id) || items.every((x) => x.explain?.answer?.how === 'answer')
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
      const used = info.rules.kind === 'session' ? useOf(span.start, span.end) : null
      out.push({ id: ritualRowId(date, 'skipped', info.id), kind: 'skipped', block: info.id, fixed: info.fixed, from: span.start, to: span.end, used, afterClose: after(span.end) })
    }
    if (b?.parkedAt != null && b.cancelledAt == null && info.anchor) {
      const anchor = f.blocks.get(info.anchor)
      const anchorSpan = byId.get(info.anchor) ? plannedSpan(byId.get(info.anchor)!, byId) : null
      const id = ritualRowId(date, 'parkedAnchored', info.id)
      if (anchor?.endedAt != null || (anchorSpan && anchorSpan.end <= state.now)) out.push({ id, kind: 'parkedAnchored', block: info.id, anchor: info.anchor, answered: touched(id), afterClose: false })
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

/** A question of the bar as the ritual answers it (the same events as there). */
function question(state: DayState, id: string, kind: Question['kind'], block: string, askedIdx: number): Question {
  return { id, kind, block, askedAt: atOf(state.grid, askedIdx), seenAt: null, text: '', answers: [], dot: false, silent: true }
}

const answerDraft = (at: number, questionId: string, answer: string, value: number | null = null): TimerDraft => ({ k: 'question.answer', at, question: questionId, answer, value })

/** The ✓ of a time to explain: after a work block „odpoczynek”, after a project „projekt” (D249, D254, D266). */
const explainCheck = (x: Explain, at: number): TimerDraft[] => (x.answer?.how === 'answer' ? [] : [answerDraft(at, x.id, x.kind === 'work' ? 'rest' : 'project')])

/**
 * Your answer to a time to explain („praca”, „projekt”, „odpoczynek”; with an instant – „… do”, inside it): null when
 * there is none or the instant lies outside it.
 */
function explainAnswer(state: DayState, x: Explain | null, choice: string, at: number, ms: number | null): TimerDraft[] | null {
  if (!x || (choice !== 'work' && choice !== 'project' && choice !== 'rest')) return null
  if (choice !== 'rest' && ms != null && !inExplain(x, state.grid, state.now, ms)) return null
  return [answerDraft(at, x.id, choice, choice === 'rest' ? null : ms)]
}

/**
 * The end of a block corrected: an automatic end goes („Cofnij”) and yours is written; your own end gets a „korekta”.
 * Null outside the block's start and now (later would paint work into the future, earlier a block of no length).
 */
function endAt(state: DayState, b: BlockFact, at: number, end: number): TimerDraft[] | null {
  if (b.startedAt == null || end <= atOf(state.grid, b.startedAt) || end > atOf(state.grid, state.now)) return null
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
        // „Pracowałem do …” answers the time to explain „praca” and confirms the end then; „Projekt do …” (only after a
        // block counted as a project, D266) answers it „projekt” and confirms the end of the work before it. The instant
        // lies in the time to explain (without one: from the end of work to now).
        if (!row.explain) return choice === 'workedUntil' && ms >= atOf(g, row.end) && ms <= atOf(g, state.now) ? [{ k: 'work.end', at, end: ms }] : null
        if (!inExplain(row.explain, g, state.now, ms) || (choice === 'projectUntil' && !row.explain.asProject)) return null
        return choice === 'workedUntil' ? [answerDraft(at, row.explain.id, 'work', ms), { k: 'work.end', at, end: ms }] : [answerDraft(at, row.explain.id, 'project', ms), { k: 'work.end', at, end: atOf(g, row.end) }]
      }
      return null
    }
    case 'boundary':
      if (choice !== 'approve') return null
      return [{ k: 'boundary.approve', at, boundary: ms ?? (row.proposal != null ? atOf(g, row.proposal) : at), auto: false, plan: state.blocks.filter((b) => b.inPlan).map((b) => b.id) }]
    case 'silent': {
      if (choice === 'ok') return [...row.items.flatMap((x) => (x.explain ? explainCheck(x.explain, at) : [])), mark]
      const x = row.items.find((i) => i.block === item)
      if (!x) return null
      if (choice === 'endedAt' && ms != null) return endAt(state, f.blocks.get(x.block)!, at, ms)
      return explainAnswer(state, x.explain, choice, at, ms)
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
      return explainAnswer(state, row.explain, choice, at, ms)
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
        // It happened (a correction of times can follow): a session while the computers were used within its window, else
        // at its planned time – times never given by you, so never a sample nor a note (T500).
        const info = state.blocks.find((b) => b.id === row.block)!
        return [
          { k: 'block.start', block: row.block, at: row.used?.from ?? atOf(g, row.from), bg: info.bg, planned: startPlanned(info), confirmUntil: null, how: 'plan' },
          { k: 'block.end', block: row.block, at: row.used?.to ?? atOf(g, row.to), done: true, rule: null }
        ]
      }
      return null
    }
    case 'parkedAnchored':
      // „Usuń” – it goes off the list (cancelled); „zostaw” – it stays parked, without a day (spec).
      if (choice === 'drop') return [{ k: 'block.cancel', block: row.block, at, rule: 'ritual' }]
      if (choice === 'ok') return [mark]
      return null
    case 'person':
      return choice === 'person' && typeof value === 'string' && value.trim() ? [{ k: 'request.person', request: row.request, at, person: value.trim() }] : null
    case 'rest': {
      if (choice === 'ok') return [mark]
      if (choice !== 'notRest' || value == null || typeof value !== 'object' || !(value.to > value.from)) return null
      // Only a stretch of the evening or of „Odcinam się” (spec): one reaching outside them is refused with its message –
      // never cut in silence – so a mistaken 12:00–18:00 never takes the day's regeneration before the end of work (A2-05).
      const markable = merge([{ from: row.from, to: row.to }, ...f.disconnect.map((d) => ({ from: d.from, to: Math.min(d.to, state.now) }))])
      const inside = markable.some((x) => value.from >= atOf(g, x.from) && value.to <= atOf(g, x.to))
      return inside ? [{ k: 'rest.not', at, from: value.from, to: value.to }] : null
    }
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
function frozenOutcome(ctx: DayContext, extra: readonly AnyEvent[], forecast: boolean): DayOutcome {
  return dayOutcome(computeDay({ ...ctx, events: extra.length ? [...ctx.events, ...extra] : ctx.events, asWritten: true }), { forecast })
}

/** The day's outcome as it would be frozen now – what every effect compares with (counted once for all rows). */
export interface EffectBase {
  outcome: DayOutcome
  forecast: boolean
}

export function effectBase(ctx: DayContext, state: DayState): EffectBase {
  const forecast = state.now < state.bedtime.effective
  return { outcome: frozenOutcome(ctx, [], forecast), forecast }
}

/** What a row's ✓ changes in the day's outcome against the day with it untouched (spec); null – no ✓. */
export function ritualEffect(ctx: DayContext, state: DayState, row: RitualRow, at: number, base: EffectBase = effectBase(ctx, state)): RitualEffect | null {
  const check = CHECK[row.kind]
  const drafts = check ? ritualAnswer(state, row, check, at) : null
  if (!drafts) return null
  return { changes: outcomeChanges(base.outcome, frozenOutcome(ctx, simEvents(ctx, drafts, at), base.forecast)), forecast: base.forecast }
}

/** A day that cannot be closed now (a text: why), or null. A day closed once stays closed – its rows can still change. */
export function closeRefusal(state: DayState, how: string): string | null {
  if (!(CLOSE_HOWS as readonly string[]).includes(how)) return 'nieznany sposób zamknięcia dnia'
  if (state.facts.closed) return 'ten dzień jest już zamknięty'
  return null
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
    const row = workEndRow(state)
    if (row && !row.confirmed) out.push({ k: 'work.end', at, end: atOf(state.grid, row.end) })
  }
  out.push({ k: 'ritual.close', at, how })
  return out
}

/** What „Jak zapisano” changes for the day (the morning's row shows it before the click). */
export function closeEffect(ctx: DayContext, state: DayState, at: number, base: EffectBase = effectBase(ctx, state)): RitualEffect {
  return { changes: outcomeChanges(base.outcome, frozenOutcome(ctx, simEvents(ctx, closeEvents(state, 'asWritten', at), at), base.forecast)), forecast: base.forecast }
}

/**
 * The ritual is due (D318, T505) – one rule for the bar and the window: from its first day; today after the end of work
 * (confirmed, or counted) while no work runs – a day without work any time, a day whose planned work never began from
 * the planned end of its last work block (D329); a day before while it is not frozen.
 */
export function ritualDue(state: DayState, today: string, ritualFrom: string | null): boolean {
  const date = state.grid.date
  if (!ritualFrom || date < ritualFrom || state.facts.frozen || date > today) return false
  if (date < today || state.noWorkDay) return true
  const t = timerNow(state)
  if ([t.fg, ...t.bg].some((x) => x?.info.isWork)) return false
  return state.workEnd != null || state.ends.length > 0 || unbegunWorkOver(state)
}

/**
 * The planned work never began and the plan's last work block (by its own planned times – the forecast keeps moving
 * an unstarted flexible block on) has ended (D329). A block parked or cancelled before it began is no work of the plan.
 */
function unbegunWorkOver(state: DayState): boolean {
  // The work that sets the end of work (as `anyWork` in day.ts): an evening block „po pracy”, a recorded lecture or the
  // second shift begun since is no work begun.
  if (state.blocks.some((b) => isBoundaryWork(b) && state.facts.blocks.get(b.id)?.startedAt != null)) return false
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  let last: number | null = null
  for (const b of state.blocks) {
    const f = state.facts.blocks.get(b.id)
    if (!b.inPlan || !isBoundaryWork(b) || f?.parkedAt != null || f?.cancelledAt != null) continue
    const span = plannedSpan(b, byId)
    if (span) last = Math.max(last ?? span.end, span.end)
  }
  return last != null && state.now >= last
}

/** A category of the day for its felt cost (D319): the minutes it ran, the answer given (the last one), null – none. */
export interface FeltRow {
  category: string
  minutes: number
  feel: FeltCost | null
}

/**
 * The felt cost of the ritual (D319, optional): one row for every category that ran in the day, in the order of its
 * first start, with its last answer.
 */
export function feltRows(ctx: DayContext, state: DayState): FeltRow[] {
  // The blocks run and the requests done (now, urgent, after the fact – facts of their own, under „Prośby domowe”,
  // A2-08), in the order of their first start.
  const ran: Array<{ at: number; category: string; minutes: number }> = []
  for (const b of state.facts.blocks.values()) if (b.startedAt != null && b.planned?.categoryId) ran.push({ at: b.startedAt, category: b.planned.categoryId, minutes: ranMinutes(b, state.now) })
  for (const r of state.facts.requests) ran.push({ at: r.from, category: REQUEST_CATEGORY, minutes: Math.max(0, Math.min(r.to, state.now) - r.from) })
  const minutes = new Map<string, number>()
  for (const x of ran.sort((a, b) => a.at - b.at)) minutes.set(x.category, (minutes.get(x.category) ?? 0) + x.minutes)
  const feel = new Map<string, FeltCost>()
  for (const e of [...ctx.events].filter((x) => isKnown(x) && x.k === 'cost.felt').sort((a, b) => a.l - b.l)) {
    const f = e as unknown as { category: string; feel: FeltCost }
    feel.set(f.category, f.feel)
  }
  return [...minutes].filter(([, m]) => m > 0).map(([category, m]) => ({ category, minutes: m, feel: feel.get(category) ?? null }))
}

/** A day's ritual as the window shows it: its rows, what each ✓ changes, what „Jak zapisano” changes, how it was closed. */
export interface RitualView {
  rows: RitualRow[]
  effects: Record<string, RitualEffect>
  asWritten: RitualEffect
  closed: { at: number; how: CloseHow } | null
  felt: FeltRow[]
}

/** The ritual of a day (several full counts of the day – the main process gives it to its helper process, T190). */
export function ritualView(ctx: DayContext, at: number): RitualView {
  const state = computeDay(ctx)
  const rows = ritualRows(state, ritualActivity(ctx, state))
  const base = effectBase(ctx, state)
  const effects: Record<string, RitualEffect> = {}
  for (const r of rows) {
    const e = ritualEffect(ctx, state, r, at, base)
    if (e) effects[r.id] = e
  }
  return { rows, effects, asWritten: closeEffect(ctx, state, at, base), closed: state.facts.closed, felt: feltRows(ctx, state) }
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
    // Closed as the facts say (a close undone by „Cofnij” is none); a freeze (E6, part two) closes it too.
    if (foldFacts(gridOf(d.date), d.events).closed || d.events.some((e) => e.k === 'day.freeze')) continue
    out.push({ date: d.date, presence: d.events.some((e) => isKnown(e) && e.k === 'presence.first') })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
