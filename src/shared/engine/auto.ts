/**
 * What the app does by itself and what it asks (spec „Działania automatyczne”, „Timer”, „Bezczynność i nieobecność”):
 * pure functions of the day, its log and the activity of every computer. The leader writes the automatic actions –
 * each with an id derived from the day, the rule, the block and the instant, so two leaders after a pause of sync write
 * the same event – and only for instants every computer with a fresh presence has caught up with (the gate). Every one
 * is on the list „zrobione automatycznie” with „Cofnij” (an event `undo`).
 *
 * The questions („Dalej?”, its second silent ask, „Koniec pracy?”, after a return, after an absence, after the app was
 * closed) have stable ids too: shown once, also after a restart or another computer taking the lead; an answer on one
 * computer closes them on all. A question counts as seen only when a computer wrote that it showed it (D231).
 */
import type { Place } from '../model/categories'
import { derivedId, questionId } from '../model/ids'
import { lastInputAt, firstUseAfter, firstUseFrom, lastOutsideBefore, type Activity, type Interval } from './activity'
import { isBoundaryWork, plannedSpan, type BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import { blockAt, isRunning, OPEN, resumedWith, type BlockFact } from './facts'
import { atOf, idxOf } from './grid'
import { requestAutoEnds, requestEndOf, requestLimit, requestQuestionId } from './requests'
import { plannedEndOf, timerNow, workEndParking, type TimerDraft, type TimerNow } from './timer'

const MIN = 60_000
/** The rules of a request's end without „Koniec” (`requestEndOf`). */
const REQUEST_END_RULES: readonly string[] = ['firstUse', 'limit', 'bedtime']
/** „Dalej?” is asked again this long after it was seen, and the block ends this long after the second one was seen. */
export const QUESTION_GAP_MIN = 30
/** A fixed block in the foreground without a reaction this long after its end ends at its planned end. */
export const FIXED_REACTION_MIN = 10
/** A session ends at the last input once no computer had presence this long (D193 – a constant). */
export const SESSION_IDLE_MIN = 30
/** A block away from the computer ends at the first use after at least this long without input. */
export const AWAY_GAP_MIN = 2
/** A meal, a routine and home affairs last without your answer at most their length plus this (D258). */
export const AWAY_LIMIT_EXTRA_MIN = 30
/** „Skończył się o …” among the answers when the question was first seen at least this long after the planned end. */
export const LATE_SEEN_MIN = 10

export interface AutoInput {
  ctx: DayContext
  state: DayState
  activity: Activity
  /** ms. */
  now: number
  /** The leader writes nothing due after this (ms; spec „bramka”). */
  gate: number
}

export interface AutoEvent extends TimerDraft {
  id: string
  autoRule: string
}

export interface Answer {
  id: string
  label: string
}

export interface Question {
  id: string
  kind: 'next' | 'next2' | 'workEnd' | 'return' | 'absence' | 'shutdown' | 'request'
  /** The block it is about (a request's question: the request). */
  block: string | null
  /** When it was asked (ms). */
  askedAt: number
  seenAt: number | null
  text: string
  answers: Answer[]
  /** Something stands without your click (D240): the icon's dot. */
  dot: boolean
  /** Shown quietly in the bar only (the second ask, the questions with a default answer). */
  silent: boolean
}

/** Where a block happens: its variant's place, else its category's. */
export function placeOf(b: BlockInfo): Place {
  return b.rules.variants.find((v) => v.id === b.variantId)?.place ?? b.rules.place
}

/** Fixed by the plan (a session too): no pause, no „Dalej?” – it ends by its plan (a weekly analysis is flexible once begun). */
const isFixedLike = (b: BlockInfo) => b.fixed || b.rules.kind === 'session'

/** The moments the user reacted to a running block (start, resume, „Przedłuż”, „Potwierdź”) – the last answer (ms). */
function lastAnswerAt(state: DayState, f: BlockFact): number {
  let last = atOf(state.grid, f.startedAt ?? 0)
  for (const r of f.runs) last = Math.max(last, atOf(state.grid, r.from))
  for (const x of f.extends) last = Math.max(last, atOf(state.grid, x.at))
  for (const c of f.confirms) last = Math.max(last, atOf(state.grid, c.at))
  return last
}

export { questionId }

/** The two asks of „Dalej?” of the foreground block now, with when each was asked and seen (ms), or null. */
export function nextQuestions(state: DayState, t: TimerNow): { block: BlockInfo; plannedEnd: number; q1: { id: string; at: number; seen: number | null }; q2: { id: string; at: number; seen: number | null } | null; passive: boolean } | null {
  const fg = t.fg
  if (!fg || isFixedLike(fg.info) || placeOf(fg.info) === 'away') return null
  if (state.now < fg.plannedEnd) return null
  const date = state.grid.date
  const endAt = atOf(state.grid, fg.plannedEnd)
  const id1 = questionId(date, 'next', fg.info.id, fg.plannedEnd)
  const seen1 = state.facts.seen.get(id1)?.at ?? null
  const passive = placeOf(fg.info) === 'passive'
  // A passive block counts its questions from their asking (D239); an active one from their seeing (D231).
  const from1 = passive ? endAt : seen1
  if (from1 == null) return { block: fg.info, plannedEnd: fg.plannedEnd, q1: { id: id1, at: endAt, seen: null }, q2: null, passive }
  const at2 = from1 + QUESTION_GAP_MIN * MIN
  const id2 = questionId(date, 'next2', fg.info.id, fg.plannedEnd)
  const seen2 = state.facts.seen.get(id2)?.at ?? null
  return { block: fg.info, plannedEnd: fg.plannedEnd, q1: { id: id1, at: endAt, seen: seen1 }, q2: at2 <= atOf(state.grid, state.now) + 30_000 ? { id: id2, at: at2, seen: seen2 } : null, passive }
}

/** The last planned work block before the second shift: „Dalej?” then has „Dalej” and „Koniec pracy” (spec „Timer”). */
function isLastWork(state: DayState, b: BlockInfo): boolean {
  if (!isBoundaryWork(b) || b.rules.afterWorkAsProject) return false
  const second = Math.min(...state.blocks.filter((x) => x.secondShift && x.start != null).map((x) => x.start!), Number.POSITIVE_INFINITY)
  return !state.forecast.some((p) => p.block.id !== b.id && !p.running && isBoundaryWork(p.block) && p.from < second)
}

/** An automatic event with its derived id. */
function auto(date: string, rule: string, draft: TimerDraft & { block?: string }): AutoEvent {
  return { ...draft, id: derivedId(date, 'auto', rule, draft.k, draft.block ?? '-', draft.at), autoRule: rule }
}

/** A block's fact without its end (to judge again whether an automatic end still holds). */
function unended(f: BlockFact): BlockFact {
  const runs = f.runs.map((r, i) => (i === f.runs.length - 1 && f.endedAt != null && r.to === f.endedAt ? { ...r, to: OPEN } : r))
  return { ...f, runs, endedAt: null, done: null, endRule: null, endId: null }
}

interface Ctx {
  inp: AutoInput
  date: string
  nowIdx: number
  byId: Map<string, BlockInfo>
  idle: (from: number) => Interval | null
}

/**
 * The end of a block „przy komputerze” whose „Dalej?” nobody saw, by the idle threshold (D231): no input on any computer
 * for the threshold – at the last input, not before the planned end. Null while it holds on.
 */
function idleEnd(c: Ctx, info: BlockInfo, f: BlockFact): { at: number; due: number } | null {
  const { state, activity } = c.inp
  if (isFixedLike(info) || placeOf(info) !== 'computer' || f.startedAt == null) return null
  const plannedEnd = atOf(state.grid, plannedEndOf(state, info, f))
  const threshold = state.settings.idleThresholdMin * MIN
  const start = atOf(state.grid, f.runs.at(-1)?.from ?? f.startedAt)
  for (const x of activity.idle) {
    const from = Math.max(x.from, start)
    if (x.to - from < threshold || x.to < plannedEnd) continue
    // The end at the last input, never before the planned end (nor the start of the run) – due once the threshold has
    // passed and the planned end has come.
    return { at: Math.max(from, plannedEnd), due: Math.max(from + threshold, plannedEnd) }
  }
  return null
}

/** The first-use end of a block away from the computer, with its limit (D258, D259), or null while it holds on. */
function awayEnd(c: Ctx, info: BlockInfo, f: BlockFact): { at: number; rule: string } | null {
  const { state, activity } = c.inp
  if (f.startedAt == null || placeOf(info) !== 'away') return null
  // A commute and stationary classes end by their plan or „Tak” (D224); regeneration waiting before a fixed block too.
  if (info.rules.kind === 'commute') return null
  const start = atOf(state.grid, f.startedAt)
  const length = (f.planned?.durationMin ?? info.durationMin) + f.extends.reduce((s, x) => s + x.minutes, 0)
  const limited = info.rules.kind === 'meal' || info.rules.kind === 'routine' || info.categoryId === 'sprawy'
  const listening = info.isWork || info.isProject
  const limit = limited ? start + (length + AWAY_LIMIT_EXTRA_MIN) * MIN : listening ? start + length * MIN : null
  const use = firstUseAfter(activity, start, AWAY_GAP_MIN)
  if (use) {
    if (limit != null && use.use > limit) return { at: limit, rule: 'limit' }
    return { at: use.use, rule: 'firstUse' }
  }
  // Nobody used a computer up to the bedtime: it ends after its planned length (D261).
  const bedtime = atOf(state.grid, state.bedtime.effective)
  if (c.inp.now >= bedtime && !info.isRegen) return { at: Math.min(start + length * MIN, bedtime), rule: 'bedtime' }
  return null
}

/**
 * The absences (spec „Bezczynność i nieobecność”) during a work or project block at the computer, in order: from the
 * threshold of the question without input on all computers, since the block's last start or resume.
 */
export function absencesOf(state: DayState, activity: Activity, info: BlockInfo, f: BlockFact): Array<{ away: number; back: number | null }> {
  if (f.startedAt == null || isFixedLike(info) || placeOf(info) !== 'computer' || !(info.isWork || info.isProject)) return []
  const threshold = state.settings.absenceQuestionMin * MIN
  const start = atOf(state.grid, f.runs.at(-1)?.from ?? f.startedAt)
  const out: Array<{ away: number; back: number | null }> = []
  for (const x of activity.idle) {
    if (x.to <= start) continue
    const away = Math.max(x.from, start)
    const back = x.to < activity.now ? x.to : null
    if ((back ?? activity.now) - away >= threshold) out.push({ away, back })
  }
  return out
}

/** The first absence of a block, or null. */
export function absenceOf(state: DayState, activity: Activity, info: BlockInfo, f: BlockFact): { away: number; back: number | null } | null {
  return absencesOf(state, activity, info, f)[0] ?? null
}

/**
 * A session's end at the last input (D193, D210): once no computer had presence for 30 min since its start or resume,
 * at the last input outside the app before that – due 30 min after the input stopped.
 */
function sessionLastInputEnd(activity: Activity, start: number, now: number): { at: number; due: number } | null {
  const x = activity.idle.find((i) => i.to - Math.max(i.from, start) >= SESSION_IDLE_MIN * MIN && i.from < now)
  if (!x) return null
  const from = Math.max(x.from, start)
  return { at: Math.max(start, Math.min(lastOutsideBefore(activity, x.from) ?? x.from, x.from)), due: from + SESSION_IDLE_MIN * MIN }
}

/**
 * The first use of the computer in the day (spec „Użycie komputera”): the first use from an hour before the wake (not
 * before 04:00) – night coding after 04:00 is not it. Null while nobody has used a computer yet.
 */
export function dayFirstUse(state: DayState, activity: Activity): number | null {
  return firstUseFrom(activity, Math.max(state.grid.start, atOf(state.grid, state.wake) - 60 * MIN))
}

/** The automatic actions due now (each written once – derived ids – and only up to the gate). */
export function autoActions(inp: AutoInput): AutoEvent[] {
  const { state, ctx, activity, gate } = inp
  const date = state.grid.date
  const nowIdx = state.now
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const out: AutoEvent[] = []
  const t = timerNow(state)
  const at = (idx: number) => atOf(state.grid, idx)
  const due = (ms: number) => ms <= gate && ms <= inp.now
  const c: Ctx = { inp, date, nowIdx, byId, idle: () => null }
  const written = new Set(ctx.events.map((e) => e.id))
  /**
   * A rule's events: undone by „Cofnij” – the rule was overruled, the next rules judge the block (false); written
   * already or new – this rule decides the block now (true), the new ones are written.
   */
  const take = (list: AutoEvent[]): boolean => {
    if (list.some((e) => state.facts.undone.has(e.id))) return false
    for (const e of list) {
      if (written.has(e.id)) continue
      written.add(e.id)
      out.push(e)
    }
    return true
  }

  // The boundary approves itself at the start of the first work block (spec „Granica i koniec pracy”): written once, so
  // the list shows it and „Cofnij” opens it again.
  if (state.boundary.approved != null && state.boundary.auto && !state.facts.approvals.length && state.boundary.approvedAt != null && !state.facts.undos.length) {
    const when = at(state.boundary.approvedAt)
    if (due(when)) take([auto(date, 'boundary', { k: 'boundary.approve', at: when, boundary: at(state.boundary.approved), auto: true, plan: ctx.plan.map((b) => b.id) } as TimerDraft)])
  }

  // „Odcinam się” lasts at the latest to 04:00 (spec „Odcinam się”): the day that ended closes it – information only.
  const openCut = state.facts.disconnect.find((d) => d.to === OPEN)
  const dayEnd = state.grid.start + state.grid.length * MIN
  if (openCut && inp.now >= dayEnd && due(dayEnd)) take([auto(date, 'disconnect04', { k: 'disconnect.end', at: dayEnd })])

  // Fixed blocks start by themselves at their planned time (sessions and blocks marked as second shift or weekly
  // analysis wait for „Zacznij”); in „Odcinam się” they do not; behind a running regeneration they wait for its end.
  const disconnected = state.facts.disconnect.some((d) => d.to === OPEN)
  const fg = t.fg
  const firstUse = dayFirstUse(state, activity)
  for (const b of state.blocks) {
    if (!b.fixed || b.waits || !b.inPlan || disconnected) continue
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) continue
    const span = plannedSpan(b, byId)
    if (!span || nowIdx < span.start || nowIdx >= span.end) continue
    let from = at(span.start)
    // Before the day's first use a fixed block at the computer is „do potwierdzenia” (spec „Bloki”): it starts at the use.
    if (placeOf(b) !== 'away') {
      if (firstUse == null) continue
      from = Math.max(from, firstUse)
    }
    if (!b.bg && fg?.info.isRegen) continue
    // Held by a regeneration that has ended since its planned start: it starts at that end (spec „Bloki”).
    for (const r of state.blocks) {
      const rf = r.isRegen ? state.facts.blocks.get(r.id) : undefined
      if (rf?.endedAt != null && rf.endedAt > span.start && rf.endedAt <= nowIdx && !(rf.runs.at(-1)?.bg ?? false)) from = Math.max(from, at(rf.endedAt))
    }
    if (!due(from)) continue
    let bg = b.bg
    const list: AutoEvent[] = []
    if (!bg && fg) {
      if (fg.info.protectedLife || isFixedLike(fg.info)) bg = true
      else list.push(auto(date, 'fixedStart', { k: 'block.pause', block: fg.info.id, at: from }))
    }
    list.push(
      auto(date, 'fixedStart', {
        k: 'block.start',
        block: b.id,
        at: from,
        bg,
        planned: { categoryId: b.categoryId, variantId: b.variantId, durationMin: b.durationMin, tag: b.secondShift ? 'secondShift' : b.weeklyAnalysis ? 'weeklyAnalysis' : null, fixed: true, costs: b.costs, bgCostPct: b.bgCostPct },
        confirmUntil: null,
        how: 'auto'
      })
    )
    take(list)
  }

  // Running blocks.
  for (const tb of [...(fg ? [fg] : []), ...t.bg]) {
    const b = tb.info
    const f = tb.fact
    const endAt = at(tb.plannedEnd)
    // The app was closed (or crashed) with the block running and no computer observed since: it ended at the close (D252).
    const runFrom = at(f.runs.at(-1)?.from ?? f.startedAt ?? 0)
    const closed = activity.unobserved.find((x) => x.from >= runFrom && x.to < inp.now && x.to - x.from >= MIN && closedThere(inp, x.from))
    if (closed) {
      if (!due(closed.to)) continue
      if (take([auto(date, 'shutdown', { k: 'block.end', block: b.id, at: Math.max(runFrom, closed.from), done: null, rule: 'shutdown' })])) continue
    }
    if (b.fixed || b.rules.kind === 'session') {
      // A fixed block in the background, a session (also in the foreground) and a second shift end at their planned end;
      // a fixed block in the foreground 10 min after it without a reaction – at its planned end.
      const inFg = tb === fg
      const session = b.rules.kind === 'session'
      const when = !inFg || session ? endAt : endAt + FIXED_REACTION_MIN * MIN
      const rule = inFg && !session ? 'fixedNoReaction' : 'plan'
      if (due(when) && nowIdx >= tb.plannedEnd && take([auto(date, rule, { k: 'block.end', block: b.id, at: endAt, done: null, rule })])) continue
      // A session ends at the last input outside the app once no computer had presence for 30 min (D193, D210).
      if (session) {
        const end = sessionLastInputEnd(activity, runFrom, inp.now)
        if (end && due(end.due)) take([auto(date, 'lastInput', { k: 'block.end', block: b.id, at: end.at, done: null, rule: 'lastInput' })])
      }
      continue
    }
    if (tb !== fg) continue
    // Away from the computer: the first use after at least 2 min without input, a limit, the bedtime.
    const away = awayEnd(c, b, f)
    if (away) {
      if (!due(away.at)) continue
      if (take([auto(date, away.rule, { k: 'block.end', block: b.id, at: away.at, done: null, rule: away.rule })])) continue
    }
    // An absence from the threshold of its question during a work or project block (one overruled by „Cofnij” or an
    // answer is passed over – a later one is judged).
    let decided = false
    for (const abs of absencesOf(state, activity, b, f)) {
      if (abs.back == null || abs.back > endAt) {
        // The planned end has passed (or will before any return): the block ends when you left (D256).
        if (inp.now < endAt || !due(abs.away + state.settings.absenceQuestionMin * MIN)) {
          decided = true
          break
        }
        if (take([auto(date, 'absence', { k: 'block.end', block: b.id, at: Math.max(abs.away, at(f.startedAt ?? 0)), done: null, rule: 'absence' })])) {
          decided = true
          break
        }
      } else if (due(abs.back)) {
        // Back before the planned end: the block goes on, the absence counted out as time without a block (D260).
        if (take([auto(date, 'absence', { k: 'block.pause', block: b.id, at: abs.away }), auto(date, 'absence', { k: 'block.resume', block: b.id, at: abs.back, confirmUntil: null })])) {
          decided = true
          break
        }
      }
    }
    if (decided) continue
    const q = nextQuestions(state, t)
    if (q && q.block.id === b.id) {
      // Two asks without an answer: an hour after the first was seen (D238; the second ask 30 min after it, the end 30
      // min after that), at the last answer, not before the planned end and – an active block – not before the first ask
      // was seen; a passive block counts from the asking and ends at its planned end.
      if (q.q2) {
        const when = q.q2.at + QUESTION_GAP_MIN * MIN
        const end = q.passive ? endAt : Math.max(lastAnswerAt(state, f), endAt, q.q1.seen ?? endAt)
        if (due(when) && take([auto(date, 'twoQuestions', { k: 'block.end', block: b.id, at: end, done: null, rule: 'twoQuestions' })])) continue
      }
      // Nobody saw it: a block at the computer ends by the idle threshold, at the last input (D231).
      if (q.q1.seen == null) {
        const end = idleEnd(c, b, f)
        if (end != null && due(end.due)) take([auto(date, 'idle', { k: 'block.end', block: b.id, at: end.at, done: null, rule: 'idle' })])
      }
    }
  }

  // Requests without „Koniec”: the first use after 2 min without input, the limit, the bedtime (spec „Prośba”).
  for (const e of requestAutoEnds(state, activity, inp.now, gate)) take([e])

  // Automatic ends that a later log shows wrong (input within the threshold, an earlier first use): undone, and the rule
  // judges the block again (spec „log, który przyjdzie później i pokaże wejście w tym progu, go unieważnia”).
  for (const a of state.facts.autos) {
    if (a.k !== 'block.end' || !a.block || !['idle', 'firstUse', 'limit', 'absence', 'lastInput'].includes(a.rule)) continue
    const f = state.facts.blocks.get(a.block)
    const info = byId.get(a.block)
    if (!f || !info || f.endId !== a.id) continue
    const open = unended(f)
    const revalidate = (reason: string): AutoEvent => ({ id: derivedId(date, 'auto', 'revalidate', a.id), k: 'undo', at: inp.now, target: a.id, reason, autoRule: 'revalidate' })
    let still: number | null = null
    if (a.rule === 'idle') {
      // An absence longer than its question's threshold that began before the planned end wins over the idle threshold
      // (spec „ten koniec wygrywa z końcem progiem bezczynności”): the end moves to when you left.
      const abs = absenceOf(state, activity, info, open)
      const plannedEnd = atOf(state.grid, plannedEndOf(state, info, open))
      if (abs && abs.away < plannedEnd && due(abs.away + state.settings.absenceQuestionMin * MIN)) {
        take([revalidate('absence'), auto(date, 'absence', { k: 'block.end', block: a.block, at: Math.max(abs.away, at(f.startedAt ?? 0)), done: null, rule: 'absence' })])
        continue
      }
      still = idleEnd(c, info, open)?.at ?? null
    } else if (a.rule === 'firstUse' || a.rule === 'limit') {
      const r = awayEnd(c, info, open)
      still = r && r.rule === a.rule ? r.at : null
    } else if (a.rule === 'absence') {
      still = absencesOf(state, activity, info, open).some((x) => idxOf(state.grid, Math.max(x.away, at(f.startedAt ?? 0))) === f.endedAt) ? at(f.endedAt!) : null
    } else {
      // The session's end at the last input: input within the 30 min that justified it (a later log) undoes it (T311, T330).
      still = sessionLastInputEnd(activity, at(open.runs.at(-1)?.from ?? open.startedAt ?? 0), inp.now)?.at ?? null
    }
    if (still == null || idxOf(state.grid, still) !== f.endedAt) take([revalidate('later log')])
  }
  // The same for a request's end by input (the first use, the limit, the bedtime), with the block it resumed (the rule
  // resumes it again at the new end).
  for (const a of state.facts.autos) {
    if (a.k !== 'request.end' || !a.request || !REQUEST_END_RULES.includes(a.rule)) continue
    const r = state.facts.requests.find((x) => x.id === a.request)
    if (!r || r.endId !== a.id) continue
    const still = requestEndOf(state, activity, r)
    if (still && still.rule === a.rule && idxOf(state.grid, still.at) === r.to) continue
    take([a, ...resumedWith(state.facts, r)].map((x) => ({ id: derivedId(date, 'auto', 'revalidate', x.id), k: 'undo', at: inp.now, target: x.id, reason: 'later log', autoRule: 'revalidate' })))
  }
  return out
}

/** The stretch nobody observed began with a close or a crash (not a sleep): the observation ended there without „suspend”. */
function closedThere(inp: AutoInput, from: number): boolean {
  for (const e of inp.ctx.events) {
    const k = (e as { k?: string }).k
    if (k === 'observe.to' && (e as unknown as { at: number }).at === from) return (e as unknown as { why: string }).why !== 'suspend'
  }
  // A crash leaves no „do” of its own: the next start writes it from the last life marker with „crash”.
  return false
}

/** The questions open now (none of them answered), for the bar – in the order the bar shows them. */
export function questionsOf(inp: Omit<AutoInput, 'gate'>): Question[] {
  const { state, activity } = inp
  const date = state.grid.date
  const t = timerNow(state)
  const out: Question[] = []
  const at = (idx: number) => atOf(state.grid, idx)
  const clock = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

  const q = nextQuestions(state, t)
  if (q) {
    const last = isLastWork(state, q.block)
    const late = q.q1.seen != null && q.q1.seen - at(q.plannedEnd) >= LATE_SEEN_MIN * MIN
    const answers: Answer[] = [{ id: 'next', label: 'Dalej' }, { id: 'extend', label: 'Przedłuż' }]
    if (last) answers.push({ id: 'workEnd', label: 'Koniec pracy' })
    if (late) answers.push({ id: 'endedAt', label: `Skończył się o ${clock(at(q.plannedEnd))}` })
    const second = q.q2 != null
    out.push({ id: second ? q.q2!.id : q.q1.id, kind: second ? 'next2' : 'next', block: q.block.id, askedAt: second ? q.q2!.at : q.q1.at, seenAt: second ? q.q2!.seen : q.q1.seen, text: 'Dalej?', answers, dot: true, silent: second })
  }

  // „Koniec pracy?” – once, after the last work block, when the end is not confirmed and no fixed work block is left.
  const end = state.ends.at(-1)
  if (end && !end.confirmed && end.at <= state.now && !t.workEndConfirmed) {
    const workRuns = [t.fg, ...t.bg].some((x) => x?.info.isWork && !x.info.rules.keepsRegen)
    const lastWork = [...state.facts.blocks.values()].filter((f) => f.endedAt != null && f.endedAt <= end.at && byIdWork(state, f.id)).sort((a, b) => b.endedAt! - a.endedAt!)[0]
    const silentEnd = lastWork && ['twoQuestions', 'idle', 'absence', 'shutdown'].includes(lastWork.endRule ?? '')
    const id = questionId(date, 'workEnd', null, end.at)
    if (!workRuns && !silentEnd && !state.facts.answers.has(id) && fixedWorkLeft(state) === 0) {
      out.push({ id, kind: 'workEnd', block: null, askedAt: at(end.at), seenAt: state.facts.seen.get(id)?.at ?? null, text: 'Koniec pracy?', answers: [{ id: 'yes', label: 'Tak' }, { id: 'break', label: 'Przerwa' }, { id: 'working', label: 'Pracuję' }], dot: true, silent: true })
    }
  }

  // After a return from a block away from the computer, after an absence, after the app was closed: the default answer
  // stands, „popraw” changes it (no dot, D252).
  for (const a of state.facts.autos) {
    if (a.k !== 'block.end' || !a.block) continue
    const f = state.facts.blocks.get(a.block)
    if (!f || f.endId !== a.id) continue
    const kind = a.rule === 'firstUse' || a.rule === 'limit' || a.rule === 'bedtime' ? 'return' : a.rule === 'absence' ? 'absence' : a.rule === 'shutdown' ? 'shutdown' : null
    if (!kind) continue
    const id = questionId(date, kind, a.block, a.at)
    if (state.facts.answers.has(id)) continue
    const answers: Answer[] =
      kind === 'return'
        ? [{ id: 'keep', label: a.rule === 'firstUse' ? 'Trwał do teraz' : 'Tak zostaje' }, { id: 'endedAt', label: 'Skończył się o …' }]
        : kind === 'absence'
          ? [{ id: 'keep', label: 'Zakończyć w chwili odejścia' }, { id: 'subtract', label: 'Odliczyć nieobecność' }, { id: 'leave', label: 'Zostawić' }]
          : [{ id: 'keep', label: 'Skończył się przy wyłączeniu' }, { id: 'untilNow', label: 'Trwał do teraz' }, { id: 'endedAt', label: 'Skończył się o …' }]
    out.push({ id, kind, block: a.block, askedAt: at(a.at), seenAt: state.facts.seen.get(id)?.at ?? null, text: '', answers, dot: false, silent: true })
  }
  // A request ended without „Koniec” (spec „Po powrocie pasek pyta krótko”, D263, T372): at the first use – „trwała do
  // teraz”, „skończyła się o…”, before its limit „jeszcze trwa” (it then lasts to „Koniec”, at most its limit); at its
  // limit or the bedtime – „tak zostaje”, „trwała do teraz” (the limit goes), „skończyła się o…”.
  for (const a of state.facts.autos) {
    if (a.k !== 'request.end' || !a.request || !REQUEST_END_RULES.includes(a.rule)) continue
    const r = state.facts.requests.find((x) => x.id === a.request)
    if (!r || r.endId !== a.id) continue
    const id = requestQuestionId(date, a.request)
    if (state.facts.answers.has(id)) continue
    const answers: Answer[] =
      a.rule === 'firstUse'
        ? [{ id: 'keep', label: 'Trwała do teraz' }, { id: 'endedAt', label: 'Skończyła się o …' }]
        : [{ id: 'keep', label: 'Tak zostaje' }, { id: 'untilNow', label: 'Trwała do teraz' }, { id: 'endedAt', label: 'Skończyła się o …' }]
    if (a.rule === 'firstUse' && inp.now < requestLimit(r, state.grid)) answers.push({ id: 'ongoing', label: 'Jeszcze trwa' })
    out.push({ id, kind: 'request', block: a.request, askedAt: at(a.at), seenAt: state.facts.seen.get(id)?.at ?? null, text: '', answers, dot: false, silent: true })
  }
  // An absence counted out while the block went on (back before its planned end): „Zostawić”, „Zakończyć” change it.
  for (const a of state.facts.autos) {
    if (a.rule !== 'absence' || a.k !== 'block.pause' || !a.block) continue
    const id = questionId(date, 'absence', a.block, a.at)
    if (state.facts.answers.has(id) || out.some((x) => x.id === id)) continue
    out.push({ id, kind: 'absence', block: a.block, askedAt: at(a.at), seenAt: state.facts.seen.get(id)?.at ?? null, text: '', answers: [{ id: 'keep', label: 'Odliczyć nieobecność' }, { id: 'end', label: 'Zakończyć w chwili odejścia' }, { id: 'leave', label: 'Zostawić' }], dot: false, silent: true })
  }
  void activity
  return out
}

function byIdWork(state: DayState, id: string): boolean {
  const b = state.blocks.find((x) => x.id === id)
  return !!b && isBoundaryWork(b) && !b.rules.afterWorkAsProject
}

/** Fixed work blocks still open before the second shift (D216: „Koniec pracy” parks nothing then, „Koniec pracy?” waits). */
function fixedWorkLeft(state: DayState): number {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const second = Math.min(...state.blocks.filter((x) => x.secondShift && x.start != null).map((x) => x.start!), Number.POSITIVE_INFINITY)
  let n = 0
  for (const b of state.blocks) {
    if (!b.fixed || !isBoundaryWork(b) || !b.inPlan) continue
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) continue
    const span = plannedSpan(b, byId)
    if (span && span.end > state.now && span.start < second) n++
  }
  return n
}

/** What an answer to a question writes (the main process adds the base fields); null: the answer is a timer action. */
export function answerEvents(state: DayState, q: Question, answer: string, at: number, value: number | null = null): TimerDraft[] | null {
  const f = q.block ? state.facts.blocks.get(q.block) : undefined
  const mark: TimerDraft = { k: 'question.answer', at, question: q.id, answer, value }
  switch (q.kind) {
    case 'next':
    case 'next2':
      if (answer === 'endedAt' && q.block) return [{ k: 'block.end', block: q.block, at: value ?? at, done: true, rule: null }]
      return null
    case 'workEnd':
      if (answer === 'yes') return [{ k: 'work.end', at, end: q.askedAt }, ...workEndParking(state, null, at), mark]
      // „Przerwa” (T261): the later of the click plus 60 min and the planned end of the work left before the second shift
      // (what it puts the 15-minute rule off to – its effect on the end of work comes with the ritual, T463).
      if (answer === 'break') return [{ ...mark, value: Math.max(at + 60 * MIN, state.forecastWorkEnd != null ? atOf(state.grid, state.forecastWorkEnd) : 0) }]
      return null
    case 'request': {
      const r = q.block ? state.facts.requests.find((x) => x.id === q.block) : undefined
      if (answer === 'keep' || !r?.endId) return [mark]
      // „Jeszcze trwa”: the request runs again (to „Koniec”, at most its limit) and the block it resumed waits again;
      // „trwała do teraz” after the limit, „skończyła się o…”: the end moves, and the block resumes then.
      const resumed = resumedWith(state.facts, r)
      const undo = [r.endId, ...resumed.map((x) => x.id)].map((target): TimerDraft => ({ k: 'undo', at, target, reason: answer }))
      if (answer === 'ongoing') return [...undo, mark]
      const end = answer === 'untilNow' ? at : answer === 'endedAt' ? value : null
      if (end == null) return [mark]
      const again = resumed.map((x): TimerDraft => (x.k === 'block.fg' ? { k: 'block.fg', block: x.block!, at: end, bg: false, autoRule: 'requestResume' } : { k: 'block.resume', block: x.block!, at: end, confirmUntil: null, autoRule: 'requestResume' }))
      return [...undo, { k: 'request.end', request: r.id, at: end }, ...again, mark]
    }
    case 'return':
    case 'shutdown':
      if (answer === 'keep') return [mark]
      if (!f?.endId || !q.block) return [mark]
      if (answer === 'untilNow') return [{ k: 'undo', at, target: f.endId, reason: answer }, { k: 'block.end', block: q.block, at, done: true, rule: null }, mark]
      if (answer === 'endedAt' && value != null) return [{ k: 'undo', at, target: f.endId, reason: answer }, { k: 'block.end', block: q.block, at: value, done: true, rule: null }, mark]
      return [mark]
    case 'absence': {
      if (!q.block || !f) return [mark]
      // Only this absence's actions: the end when you left, or the pause and the resume that counted it out.
      const askedIdx = idxOf(state.grid, q.askedAt)
      const mine = state.facts.autos.filter((a) => a.block === q.block && a.rule === 'absence')
      const pause = mine.find((a) => a.k === 'block.pause' && a.at === askedIdx)
      const resume = pause ? mine.filter((a) => a.k === 'block.resume' && a.at >= pause.at).sort((a, b) => a.at - b.at)[0] : undefined
      const end = !pause ? mine.find((a) => a.k === 'block.end' && a.id === f.endId && a.at === askedIdx) : undefined
      const undoAll = [pause, resume, end].filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ k: 'undo', at, target: a.id, reason: answer }) as TimerDraft)
      const away = pause ? atOf(state.grid, pause.at) : f.endedAt != null ? atOf(state.grid, f.endedAt) : at
      if (answer === 'keep') return [mark]
      if (answer === 'leave') return [...undoAll, mark]
      if (answer === 'end') return [...undoAll, { k: 'block.end', block: q.block, at: away, done: null, rule: 'absenceAnswer' }, mark]
      if (answer === 'subtract' && f.endId && f.endedAt != null) {
        // Counted out: from the return the block goes on (a work block that would create unconfirmed minutes waits, T463).
        const back = resume ? atOf(state.grid, resume.at) : at
        return [...undoAll, { k: 'block.pause', block: q.block, at: away }, { k: 'block.resume', block: q.block, at: back, confirmUntil: null }, mark]
      }
      return [mark]
    }
  }
  return null
}

/**
 * The next instant (ms) the timer has something due: a fixed block's planned start, a waiting block's window, a running
 * block's planned end (a fixed one in the foreground also 10 min after it), the second ask of „Dalej?” and the end after
 * it. The main process sets its exact timer on it; everything else waits for the 15-second check.
 */
export function nextDeadline(state: DayState): number | null {
  const now = atOf(state.grid, state.now)
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const t = timerNow(state)
  const out: number[] = []
  for (const b of state.blocks) {
    if (!(b.fixed || b.waits) || !b.inPlan) continue
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) continue
    const span = plannedSpan(b, byId)
    if (span) out.push(atOf(state.grid, span.start))
  }
  for (const tb of [...(t.fg ? [t.fg] : []), ...t.bg]) {
    const end = atOf(state.grid, tb.plannedEnd)
    out.push(end, end + FIXED_REACTION_MIN * MIN)
  }
  const q = nextQuestions(state, t)
  if (q) {
    const from1 = q.passive ? q.q1.at : q.q1.seen
    if (from1 != null) out.push(from1 + QUESTION_GAP_MIN * MIN)
    if (q.q2) out.push(q.q2.at + QUESTION_GAP_MIN * MIN)
  }
  const next = out.filter((x) => x > now).sort((a, b) => a - b)[0]
  return next ?? null
}

/** Is the block (by its fact) running now. */
export const runningNow = (f: BlockFact | undefined, m: number): boolean => !!f && isRunning(blockAt(f, m + 1))

/** The last input on any computer before now (for the bar's „bezczynność”). */
export const lastInput = (a: Activity): number => lastInputAt(a, a.now)
