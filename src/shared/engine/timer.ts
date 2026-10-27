/**
 * The timer (spec „Timer”, „Bloki”, „Przedłużenie i przekroczenie”): what runs now in the foreground and in the
 * background, what „Dalej” would start, which blocks wait for „Zacznij”, and every click of the widget as the events it
 * writes – Start (also „Zacznij” and „Wznów”), Pauza, Dalej, Przedłuż, Koniec pracy, Skończyłem, „Zakończ teraz”,
 * Odwołaj, Zaparkuj, Potwierdź. Pure: the main process validates a click against the day as it knows it and writes the
 * events; the main window shows the same view from the same day.
 *
 * An action that creates minutes of work after the approved boundary that nobody confirmed (start or resume of a work
 * block, Dalej to one, Przedłuż) is done only by a second click: the first returns the cost (spec: „pierwszym
 * kliknięciem pokazuje koszt …, a drugim w ciągu 10 s je wykonuje”) – except „Dalej”, whose first click already ends the
 * running block.
 */
import { isBoundaryWork, plannedSpan, startPlanned, type BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import { OPEN, isRunning, ranMinutes, resumedWith, type BlockFact } from './facts'
import { atOf, idxOf } from './grid'

/** „Przedłuż” of a fixed block works up to this long after its planned end (spec „Timer”, D227). */
export const FIXED_EXTEND_WINDOW_MIN = 30
/** Two clicks within this count as one (spec „Potwierdzenie przedłużenia”). */
export const DOUBLE_CLICK_MS = 500

export interface TimerBlock {
  info: BlockInfo
  fact: BlockFact
  bg: boolean
  /** Running (false: paused). */
  running: boolean
  /** Index of its start. */
  startedAt: number
  /** Its planned end now (index): fixed blocks at their window's end, others after their length, pauses and „Przedłuż”. */
  plannedEnd: number
  ranMin: number
  extendedMin: number
}

export interface TimerNow {
  /** Index of now. */
  now: number
  fg: TimerBlock | null
  bg: TimerBlock[]
  /** Foreground blocks paused (they wait as the next in the plan). */
  paused: TimerBlock[]
  /** What „Dalej” starts now (a paused block is resumed), null: nothing. */
  next: BlockInfo | null
  /** Blocks waiting for „Zacznij” whose time has come („NY 14:00 · Zacznij · Odwołaj”). */
  waiting: BlockInfo[]
  /** Fixed blocks of the foreground whose time has come but did not start (a regeneration runs): „do potwierdzenia”. */
  held: BlockInfo[]
  /** The end of work is confirmed and no work runs. */
  workEndConfirmed: boolean
}

/** What one event of the timer says (the main process adds the day, the domain and the base fields). */
export interface TimerDraft {
  k: string
  at: number
  [field: string]: unknown
}

export type TimerAction =
  | { a: 'start'; block: string; confirm?: boolean }
  /** A block outside the plan from now („Pracuję” – 30 min of „Inne obowiązki”, a break of the bar, a block begun by hand). */
  | { a: 'startNew'; block: string; categoryId: string; durationMin: number; variantId?: string | null; confirm?: boolean }
  | { a: 'pause' }
  | { a: 'next'; done?: boolean; confirm?: boolean }
  | { a: 'extend'; block?: string; minutes: number; confirm?: boolean }
  | { a: 'workEnd' }
  | { a: 'finish'; block?: string }
  | { a: 'cancel'; block: string }
  | { a: 'park'; block: string }
  | { a: 'confirm'; block: string }
  /** „Cofnij” of an automatic action (spec: it writes an event „korekta”; the boundary's own approval opens it again). */
  | { a: 'undo'; target: string }
  /** „Odcinam się” and „Wracam” (spec „Odcinam się”). */
  | { a: 'cutOff' }
  | { a: 'back' }
  /** „Mniej pytań” and „Jest lepiej” (spec „Cisza”). */
  | { a: 'fewer' }
  | { a: 'better' }
  /** „Wypite” (spec „Woda”). */
  | { a: 'drink' }
  /** „Zacznij jeszcze raz” of a session ended before its planned end (D207). */
  | { a: 'restart'; block: string }
  /** An answer to a proposal of the bar (the break, the solitude): recorded, so it is shown once. */
  | { a: 'mark'; question: string; answer: string }

/** The cost a first click shows (spec: „przedłużenie · −40 min puli”, „pora snu +40 min”, „przekroczenie”). */
export interface ActionCost {
  /** The block the second click starts, resumes or extends. */
  block: string
  /** Minutes of work after the boundary nobody confirmed. */
  minutes: number
  /** Some of them are past the maximum: an overrun (the same second click is both confirmations). */
  overrun: boolean
  /** The pool of projects is empty: they move the bedtime. */
  bedtime: boolean
}

export type ActionResult =
  | { ok: true; events: TimerDraft[]; confirm: ActionCost | null }
  | { ok: false; why: string; confirm: ActionCost | null }

/** Fixed by the plan (a session too): never paused, ends by its plan; a weekly analysis is flexible once begun. */
const isFixedLike = (b: BlockInfo) => b.fixed || b.rules.kind === 'session'

/** The planned end (index) of a started block now. */
export function plannedEndOf(state: DayState, info: BlockInfo, f: BlockFact, now = state.now): number {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const extended = f.extends.reduce((s, x) => s + x.minutes, 0)
  const span = plannedSpan(info, byId)
  if (info.fixed && span) return Math.max(span.end, f.startedAt ?? span.end) + extended
  const planned = f.planned?.durationMin ?? info.durationMin
  const until = f.endedAt ?? now
  const paused = Math.max(0, until - (f.startedAt ?? until) - ranMinutes(f, until))
  return (f.startedAt ?? now) + planned + paused + extended
}

/** The first instant of the second shift (index), or the end of the grid. */
function secondShiftStart(state: DayState): number {
  const s = state.blocks.filter((b) => b.secondShift && b.start != null).map((b) => b.start!)
  return s.length ? Math.min(...s) : Number.POSITIVE_INFINITY
}

/** The end of work is confirmed now (a „Koniec pracy” or „Odcinam się” after the last work, with no work running). */
function workEndConfirmed(state: DayState): boolean {
  return state.workEnd != null && state.ends.length > 0 && state.ends.at(-1)!.confirmed
}

export function timerNow(state: DayState): TimerNow {
  const now = state.now
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const started: TimerBlock[] = []
  for (const [id, f] of state.facts.blocks) {
    if (f.startedAt == null || f.endedAt != null) continue
    const info = byId.get(id)
    if (!info) continue
    const open = f.runs.find((r) => r.to === OPEN)
    started.push({
      info,
      fact: f,
      bg: open ? open.bg : (f.runs.at(-1)?.bg ?? info.bg),
      running: isRunning(f),
      startedAt: f.startedAt,
      plannedEnd: plannedEndOf(state, info, f, now),
      ranMin: ranMinutes(f, now),
      extendedMin: f.extends.reduce((s, x) => s + x.minutes, 0)
    })
  }
  // One block in the foreground: the latest started or resumed (two after a pause of sync – the later wins the place).
  const lastRun = (t: TimerBlock) => t.fact.runs.at(-1)?.from ?? t.startedAt
  const fgRunning = started.filter((t) => t.running && !t.bg).sort((a, b) => lastRun(b) - lastRun(a))
  const fg = fgRunning[0] ?? null
  const bg = started.filter((t) => t.running && (t.bg || (fg != null && t !== fg && !t.bg)))
  const paused = started.filter((t) => !t.running && !t.bg)

  const gone = (b: BlockInfo) => {
    const f = state.facts.blocks.get(b.id)
    return f != null && (f.parkedAt != null || f.cancelledAt != null) && f.startedAt == null
  }
  const notStarted = (b: BlockInfo) => (state.facts.blocks.get(b.id)?.startedAt ?? null) == null && !gone(b)
  const waiting = state.blocks.filter((b) => {
    if (!b.waits || !b.inPlan || !notStarted(b)) return false
    const span = plannedSpan(b, byId)
    if (!span) return false
    const until = b.waitUntil ?? span.end
    return now >= span.start && now < until
  })
  const held = state.blocks.filter((b) => {
    if (!b.fixed || b.waits || b.bg || !b.inPlan || !notStarted(b)) return false
    const span = plannedSpan(b, byId)
    return span != null && now >= span.start && now < span.end
  })
  const confirmed = workEndConfirmed(state)
  return { now, fg, bg, paused, next: nextBlock(state, fg, paused, held, confirmed), waiting, held, workEndConfirmed: confirmed }
}

/**
 * What „Dalej” starts: after a regeneration with a fixed block waiting behind it, that fixed block; otherwise the next
 * flexible block of the plan in the forecast's order (a paused one first when it comes first). Never a fixed block
 * before its time, never a work block after a confirmed end of work, never a block anchored to one not ended yet.
 */
function nextBlock(state: DayState, fg: TimerBlock | null, paused: TimerBlock[], held: BlockInfo[], workEnded: boolean): BlockInfo | null {
  if (fg?.info.isRegen && held.length) return held[0]!
  const ended = (id: string) => state.facts.blocks.get(id)?.endedAt != null || fg?.info.id === id
  const pausedIds = new Set(paused.map((p) => p.info.id))
  for (const p of [...state.forecast].sort((a, b) => a.from - b.from)) {
    const b = p.block
    if (p.running || p.bg || b.bg || isFixedLike(b) || b.id === fg?.info.id) continue
    if (!b.inPlan && !pausedIds.has(b.id)) continue
    if (b.anchor && !ended(b.anchor)) continue
    if (workEnded && b.isWork && !b.rules.afterWorkAsProject) continue
    return b
  }
  return null
}

/**
 * The cost of work in [from, to) (indexes) after the approved boundary that nobody confirmed: none before the approval,
 * none for blocks that do not set the boundary, the plan of lectures, a „zjazd”, or a block added without an exchange.
 */
export function workCost(state: DayState, info: BlockInfo, from: number, to: number): ActionCost | null {
  const boundary = state.boundary.approved
  if (boundary == null || !isBoundaryWork(info) || info.lectureOrCommute || to <= from) return null
  if (state.facts.blocks.get(info.id)?.addConfirmedAt != null) return null
  const minutes = Math.max(0, to - Math.max(from, boundary))
  if (minutes <= 0) return null
  return { block: info.id, minutes, overrun: to > state.boundary.max, bedtime: state.pool.empty }
}

/** What is left of a block's length from `at` (a paused one: its remaining length). */
function leftOf(state: DayState, info: BlockInfo, at: number): number {
  const f = state.facts.blocks.get(info.id)
  if (!f || f.startedAt == null) {
    if (info.fixed) {
      const span = plannedSpan(info, new Map(state.blocks.map((b) => [b.id, b])))
      if (span) return Math.max(0, span.end - at)
    }
    return info.durationMin
  }
  return Math.max(0, (f.planned?.durationMin ?? info.durationMin) + f.extends.reduce((s, x) => s + x.minutes, 0) - ranMinutes(f, at))
}

/** The instant a block ends at when clicked now: a fixed block past its planned end without „Przedłuż” – its planned end. */
function endInstant(state: DayState, t: TimerBlock, at: number): number {
  if (isFixedLike(t.info) && t.info.fixed && idxOf(state.grid, at) > t.plannedEnd) return atOf(state.grid, t.plannedEnd)
  return at
}

/** The events of starting (or resuming) `info` at `at`, with what happens to the block in the foreground. */
function startEvents(ctx: DayContext, state: DayState, t: TimerNow, info: BlockInfo, at: number, confirmed: boolean): TimerDraft[] {
  const out: TimerDraft[] = []
  const f = state.facts.blocks.get(info.id)
  const fg = t.fg
  const toBg = info.bg
  if (!toBg && fg && fg.info.id !== info.id) {
    if (fg.info.fixed || fg.info.waits) {
      // A fixed block is never paused: it goes on in the background (spec „Przerwania”).
      out.push({ k: 'block.fg', block: fg.info.id, at, bg: true })
    } else if (((info.waits || info.fixed) && !fg.info.isRegen) || (info.isRegen && !fg.info.isRegen)) {
      // A waiting or fixed block pauses the running flexible one; it waits as the next in the plan (spec „Bloki”) – so
      // does a break (a regeneration begun now never ends the work it interrupts).
      out.push({ k: 'block.pause', block: fg.info.id, at })
    } else {
      // Another flexible block (or the start ends a regeneration): the running one ends here, done.
      out.push({ k: 'block.end', block: fg.info.id, at, done: fg.info.fixed ? null : true, rule: null })
    }
  }
  const left = leftOf(state, info, idxOf(state.grid, at))
  const confirmUntil = confirmed ? at + left * 60_000 : null
  if (f?.startedAt != null) out.push({ k: 'block.resume', block: info.id, at, confirmUntil })
  else out.push({ k: 'block.start', block: info.id, at, bg: toBg, planned: startPlanned(info, ctx.plan), confirmUntil, how: 'click' })
  return out
}

/** The cost of starting (or resuming) `info` now and running it for what is left of it. */
export function startCost(state: DayState, info: BlockInfo, at: number): ActionCost | null {
  const m = idxOf(state.grid, at)
  return workCost(state, info, m, m + leftOf(state, info, m))
}

/** One click of the timer at `at` (ms): the events to write, or why it does nothing, or the cost of a second click. */
export function timerAction(ctx: DayContext, state: DayState, act: TimerAction, at: number): ActionResult {
  const t = timerNow(state)
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const no = (why: string, confirm: ActionCost | null = null): ActionResult => ({ ok: false, why, confirm })
  const yes = (events: TimerDraft[], confirm: ActionCost | null = null): ActionResult => ({ ok: true, events, confirm })
  const m = idxOf(state.grid, at)

  switch (act.a) {
    case 'start': {
      const info = byId.get(act.block)
      if (!info) return no('nie ma takiego bloku w planie dnia')
      const f = state.facts.blocks.get(info.id)
      if (f?.endedAt != null) return no('ten blok już się skończył')
      if (f && isRunning(f)) return no('ten blok już biegnie')
      const cost = startCost(state, info, at)
      if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
      return yes(startEvents(ctx, state, t, info, at, cost != null))
    }
    case 'startNew': {
      const rules = state.settings.categories[act.categoryId]
      if (!rules) return no('nie ma takiej kategorii')
      if (state.facts.blocks.get(act.block)?.startedAt != null || byId.has(act.block)) return no('ten blok już jest w dniu')
      if (!(act.durationMin > 0 && act.durationMin <= 24 * 60)) return no('długość bloku')
      const variantId = act.variantId && rules.variants.some((v) => v.id === act.variantId) ? act.variantId : null
      const info: BlockInfo = {
        id: act.block,
        categoryId: act.categoryId,
        variantId,
        rules,
        inPlan: false,
        fixed: false,
        bg: false,
        start: m,
        anchor: null,
        durationMin: act.durationMin,
        waits: false,
        secondShift: false,
        weeklyAnalysis: false,
        waitUntil: null,
        lectureOrCommute: rules.kind === 'commute' || rules.kind === 'lecture',
        origin: 'user',
        sourceId: null,
        isWork: rules.cls === 'work',
        isLife: rules.cls === 'life',
        isRegen: rules.kind === 'regen',
        isProject: rules.kind === 'project',
        isRequestCat: rules.kind === 'request',
        afterWorkMark: false,
        protectedLife: rules.cls === 'life' && rules.protected,
        costs: null,
        bgCostPct: null
      }
      const cost = workCost(state, info, m, m + act.durationMin)
      if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
      const events = startEvents(ctx, state, t, info, at, cost != null)
      const start = events.at(-1)!
      start.planned = { categoryId: act.categoryId, variantId, durationMin: act.durationMin, tag: null, fixed: false, costs: null, bgCostPct: null }
      if (cost) start.confirmUntil = at + act.durationMin * 60_000
      return yes(events)
    }
    case 'pause': {
      const fg = t.fg
      if (!fg) return no('nic nie biegnie na pierwszym planie')
      if (isFixedLike(fg.info)) return no('blok stały się nie pauzuje')
      return yes([{ k: 'block.pause', block: fg.info.id, at }])
    }
    case 'next': {
      const events: TimerDraft[] = []
      const fg = t.fg
      if (fg) events.push({ k: 'block.end', block: fg.info.id, at: endInstant(state, fg, at), done: isFixedLike(fg.info) ? null : (act.done ?? true), rule: null })
      const next = t.next
      if (!next) return events.length ? yes(events) : no('w planie nie ma następnego bloku')
      const cost = startCost(state, next, at)
      // The first click ends the running block; what comes next waits for the second (spec „Dalej kończy wtedy …”).
      if (cost && !act.confirm) return events.length ? yes(events, cost) : no('koszt do potwierdzenia', cost)
      const after: TimerNow = { ...t, fg: null }
      return yes([...events, ...startEvents(ctx, state, after, next, at, cost != null)])
    }
    case 'extend': {
      if (!(act.minutes > 0 && act.minutes <= 24 * 60)) return no('długość przedłużenia')
      const target = act.block ? [t.fg, ...t.bg].find((x) => x?.info.id === act.block) ?? null : t.fg
      const ended = act.block ? state.facts.blocks.get(act.block) : null
      if (!target) {
        // A fixed block ended by its plan may still be extended within 30 min of its planned end (D227).
        const info = act.block ? byId.get(act.block) : undefined
        if (info?.fixed && ended?.endedAt != null && ended.endId && (ended.endRule === 'plan' || ended.endRule === 'fixedNoReaction')) {
          const end = plannedEndOf(state, info, ended)
          if (m > end + FIXED_EXTEND_WINDOW_MIN) return no('po 30 min od planowanego końca blok stały się nie przedłuża')
          const cost = workCost(state, info, Math.max(end, m), end + act.minutes)
          if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
          return yes([
            { k: 'undo', at, target: ended.endId, reason: 'extend' },
            { k: 'block.extend', block: info.id, at, minutes: act.minutes }
          ])
        }
        return no('nie ma biegnącego bloku do przedłużenia')
      }
      if (target.info.fixed && m > target.plannedEnd + FIXED_EXTEND_WINDOW_MIN) return no('po 30 min od planowanego końca blok stały się nie przedłuża')
      const from = Math.max(target.plannedEnd, m)
      const cost = workCost(state, target.info, from, from + act.minutes - Math.max(0, m - target.plannedEnd))
      if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
      return yes([{ k: 'block.extend', block: target.info.id, at, minutes: act.minutes }])
    }
    case 'workEnd': {
      const events: TimerDraft[] = []
      const fg = t.fg
      let end: number
      if (fg?.info.isWork) {
        end = endInstant(state, fg, at)
        events.push({ k: 'block.end', block: fg.info.id, at: end, done: isFixedLike(fg.info) ? null : true, rule: null })
      } else {
        // Clicked when no work runs: it only confirms the earlier end (the last work block's real end).
        let last: number | null = null
        for (const b of state.blocks) {
          const f = state.facts.blocks.get(b.id)
          if (!f || f.endedAt == null || !isBoundaryWork(b)) continue
          last = Math.max(last ?? 0, f.endedAt)
        }
        end = last != null ? Math.min(at, atOf(state.grid, last)) : at
      }
      events.push({ k: 'work.end', at, end })
      events.push(...workEndParking(state, fg?.info.id ?? null, at))
      return yes(events)
    }
    case 'finish': {
      const target = act.block ? [t.fg, ...t.bg].find((x) => x?.info.id === act.block) ?? null : t.fg?.info.rules.kind === 'session' ? t.fg : (t.bg.find((x) => x.info.rules.kind === 'session') ?? null)
      if (!target) return no('nie ma biegnącego bloku do zakończenia')
      return yes([{ k: 'block.end', block: target.info.id, at: endInstant(state, target, at), done: isFixedLike(target.info) ? null : true, rule: target.info.rules.kind === 'session' ? 'finished' : 'endNow' }])
    }
    case 'cancel': {
      const info = byId.get(act.block)
      const f = state.facts.blocks.get(act.block)
      if (!info) return no('nie ma takiego bloku w planie dnia')
      if (f?.startedAt != null) return no('ten blok już się zaczął')
      return yes([{ k: 'block.cancel', block: info.id, at, rule: 'user' }])
    }
    case 'park': {
      const info = byId.get(act.block)
      const f = state.facts.blocks.get(act.block)
      if (!info) return no('nie ma takiego bloku w planie dnia')
      if (f?.endedAt != null) return no('ten blok już się skończył')
      // A paused block parked: what ran of it stays, the rest is not done (its continuation goes to the ritual).
      if (f?.startedAt != null) return isRunning(f) ? no('ten blok biegnie – najpierw „Dalej” albo „Pauza”') : yes([{ k: 'block.end', block: info.id, at, done: false, rule: 'park' }])
      return yes([{ k: 'block.park', block: info.id, at, rule: 'user' }])
    }
    case 'confirm': {
      const tb = [t.fg, ...t.bg].find((x) => x?.info.id === act.block)
      if (!tb) return no('ten blok nie biegnie')
      return yes([{ k: 'block.confirm', block: tb.info.id, at }])
    }
    case 'undo': {
      const a = state.facts.autos.find((x) => x.id === act.target)
      if (!a) return no('tego działania nie ma już na liście')
      // The boundary's own approval: the boundary opens again for the plan or the ritual (and never approves itself a
      // second time that day); the approval leaves the list.
      if (a.k === 'boundary.approve') return yes([{ k: 'undo', at, target: a.id, reason: 'user' }, { k: 'boundary.undo', at }])
      // A request's end: the block it resumed waits again with it.
      const r = a.k === 'request.end' ? state.facts.requests.find((x) => x.id === a.request && x.endId === a.id) : undefined
      return yes([a, ...(r ? resumedWith(state.facts, r) : [])].map((x) => ({ k: 'undo', at, target: x.id, reason: 'user' })))
    }
    case 'cutOff': {
      if (state.facts.disconnect.some((d) => d.to === OPEN)) return no('„Odcinam się” już trwa')
      // A flexible block in the foreground pauses (after „Wracam” it waits as „Wznów · Zaparkuj”); a running block waiting
      // for „Zacznij” (a session, the second shift, a weekly analysis) ends at the click (D206). Nothing is parked.
      const events: TimerDraft[] = [{ k: 'disconnect.start', at }]
      for (const tb of [t.fg, ...t.bg]) {
        if (!tb) continue
        if (tb.info.waits) events.push({ k: 'block.end', block: tb.info.id, at, done: null, rule: 'disconnect', autoRule: 'disconnect' })
        else if (tb === t.fg && !isFixedLike(tb.info)) events.push({ k: 'block.pause', block: tb.info.id, at, autoRule: 'disconnect' })
      }
      return yes(events)
    }
    case 'back':
      if (!state.facts.disconnect.some((d) => d.to === OPEN)) return no('„Odcinam się” nie trwa')
      return yes([{ k: 'disconnect.end', at }])
    case 'fewer':
      return yes([{ k: 'fewer.start', at }])
    case 'better':
      return yes([{ k: 'fewer.end', at }])
    case 'drink':
      return yes([{ k: 'water.drink', at }])
    case 'mark':
      if (state.facts.answers.has(act.question)) return no('już odpowiedziane')
      return yes([{ k: 'question.answer', at, question: act.question, answer: act.answer, value: null }])
    case 'restart': {
      const info = byId.get(act.block)
      const f = state.facts.blocks.get(act.block)
      if (!info || !f || f.endedAt == null) return no('ten blok się nie skończył')
      const span = plannedSpan(info, byId)
      if (!info.waits || !span || m >= span.end) return no('po planowanym końcu blok nie zaczyna się jeszcze raz')
      // Like a start: a flexible block in the foreground pauses, a fixed one goes on in the background.
      const events: TimerDraft[] = []
      if (t.fg && !info.bg) events.push(isFixedLike(t.fg.info) || t.fg.info.protectedLife ? { k: 'block.fg', block: t.fg.info.id, at, bg: true } : { k: 'block.pause', block: t.fg.info.id, at })
      events.push({ k: 'block.restart', block: info.id, at })
      return yes(events)
    }
  }
}

/**
 * „Koniec pracy” parks the rest of the day's flexible work blocks before the second shift and the blocks anchored to the
 * one it ends – but not blocks of „po końcu pracy jak projekt” (D195), and nothing while a fixed work block is left in
 * the plan before the second shift (D216).
 */
export function workEndParking(state: DayState, ending: string | null, at: number): TimerDraft[] {
  const second = secondShiftStart(state)
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const open = (b: BlockInfo) => {
    const f = state.facts.blocks.get(b.id)
    return b.inPlan && (!f || (f.startedAt == null && f.parkedAt == null && f.cancelledAt == null))
  }
  const placed = new Map(state.forecast.map((p) => [p.block.id, p]))
  const before = (b: BlockInfo) => {
    const p = placed.get(b.id)
    const span = plannedSpan(b, byId)
    const from = p?.from ?? span?.start ?? null
    return from != null && from < second
  }
  if (state.blocks.some((b) => open(b) && b.fixed && isBoundaryWork(b) && before(b))) return []
  const out: TimerDraft[] = []
  for (const b of state.blocks) {
    if (!open(b) || b.fixed || b.waits || b.rules.afterWorkAsProject) continue
    const anchoredToEnding = ending != null && b.anchor === ending
    if ((isBoundaryWork(b) && before(b)) || anchoredToEnding) out.push({ k: 'block.park', block: b.id, at, rule: 'workEnd', autoRule: 'workEnd' })
  }
  return out
}
