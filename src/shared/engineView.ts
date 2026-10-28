/**
 * The widget's view from the engine (spec „Widget”, „Cisza”, „Odcinam się”, „Woda”, D232, D240): what the bar at the top
 * of the main window, the icon's panel and the desktop bar show, and the icon's colour, dot and drop – one pure function
 * of the day, the activity of the computers and this computer's settings, so every window shows the same.
 *
 * The colour is the class of the block in the foreground (the reserve's when a pool is at the reserve), warmer 15 min
 * before the end of the block or the start of a fixed block, a step darker at 5 and at 0 min (D225). The dot lights only
 * for what stands without your click; the drop is the water. „Odcinam się” hides the widget (a grey icon, the panel only
 * with its line); the quiet modes make the bar compact; the night's quiet leaves only the time and the running block.
 */
import { questionsOf, type Question } from './engine/auto'
import type { Activity } from './engine/activity'
import { isBoundaryWork, plannedSpan } from './engine/blocks'
import { answered, contactEnded, waterDue, workRunStart, type CareSettings } from './engine/care'
import type { DayContext, DayState } from './engine/day'
import type { EnergyState } from './engine/energy'
import { reserveMessageId } from './engine/game'
import { suggestRegen } from './engine/reserve'
import { REGEN_CATEGORY, type Pool } from './model/categories'
import { OPEN, type AutoAction, type RequestFact } from './engine/facts'
import { atOf, type Grid } from './engine/grid'
import { isRunningRequest } from './engine/requests'
import { ritualDue } from './engine/ritual'
import { ROUTINE_LINE_MIN, routinesDue } from './engine/routineCheck'
import { logicalDayOf } from './time/day'
import { modesOf, type ModePrefs, type Modes } from './engine/modes'
import { plannedEndOf, secondShiftStart, timerNow, type TimerNow } from './engine/timer'
import { workedUntilOf } from './engine/explain'
import type { PlanBlock } from './model/plan'
import type { Routine } from './model/routines'
import { ENGINE_TONE_SET, iconColor, toneColor, type Tone, type WarnStep } from './theme'
import { NO_VARIANTS, type BarLine, type BarPending, type BarRoutine, type RunningRequest, type WidgetView } from './widget'

const MIN = 60_000

export interface EngineInput {
  ctx: DayContext
  state: DayState
  energy: EnergyState | null
  activity: Activity
  now: number
  /** A block's name (its routine, its requests' people, its variant or category – never an id; shared/blockName.ts). */
  name: (b: Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'requests' | 'note'>) => string
  care: CareSettings
  modePrefs: ModePrefs
  pending: BarPending | null
  /** This computer (the recording computer of a lecture plays no sound and shows no notification then). */
  computer?: string
  /** „Prośba ▸”: the 3 people asked most often (D311). */
  people?: Array<{ id: string; name: string }>
  /** A person's name by id (null: „osoba: ?”). */
  person?: (id: string | null) => string
  /** A request still running from the day before (through 04:00, D312): its line, its day for „Koniec”. */
  carried?: RunningRequest | null
  /** The first day of the ritual (D320): from it the bar has „Rytuał” after the end of work. */
  ritualFrom?: string | null
  /** The routines (D328): a routine of a block begun today and not ticked off has its line. */
  routines?: readonly Routine[]
}

/** A request without a person (spec „osoba: ?”). */
const NO_PERSON = 'osoba: ?'

/** A request running now as the bar shows it (D312): its line and the day its „Koniec” goes to. */
export function runningRequestOf(r: RequestFact, grid: Grid, person: (id: string | null) => string): RunningRequest {
  return { id: r.id, day: grid.date, mode: r.mode === 'urgent' ? 'urgent' : 'now', person: person(r.person), from: atOf(grid, r.from), estimateMin: r.estimateMin }
}

const CLASS_TONE: Record<string, Tone> = { work: 'praca', life: 'zycie', free: 'wolne' }
const CLASS_NAME: Record<string, string> = { work: 'praca', life: 'życie i opieka', free: 'wolne' }
/** Automatic actions that are information only (spec: no „Cofnij”). */
const INFO_RULES = new Set(['disconnect04'])

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** What an automatic action did, in words („Zajęcia zdalne zaczęte o 09:00 (blok stały według planu)”). */
export function autoText(a: AutoAction, blockName: string, clock: string): string {
  // A request's end names the request (it has no block).
  const name = a.k === 'request.end' ? 'Prośba' : blockName
  switch (a.rule) {
    case 'fixedStart':
      return a.k === 'block.pause' ? `${name} – pauza o ${clock} (blok stały według planu)` : `${name} zaczęty o ${clock} (blok stały według planu)`
    case 'plan':
      return `${name} skończony o ${clock} (według planu)`
    case 'fixedNoReaction':
      return `${name} skończony o ${clock} (10 min po końcu bez reakcji)`
    case 'lastInput':
      return `${name} skończona o ${clock} (ostatnie wejście, 30 min bez obecności)`
    case 'twoQuestions':
      return `${name} skończony o ${clock} (dwa pytania bez odpowiedzi)`
    case 'idle':
      return `${name} skończony o ${clock} (próg bezczynności)`
    case 'firstUse':
      return `${name} do ${clock} (pierwsze użycie komputera)`
    case 'limit':
      return `${name} do ${clock} (najdłuższy czas bez odpowiedzi)`
    case 'bedtime':
      return `${name} do ${clock} (pora snu bez użycia komputera)`
    case 'absence':
      return a.k === 'block.end' ? `${name} skończony o ${clock} (w chwili odejścia)` : a.k === 'block.pause' ? `${name}: nieobecność od ${clock} odliczona` : `${name}: powrót o ${clock}`
    case 'shutdown':
      return `${name} skończony o ${clock} (zamknięcie aplikacji)`
    case 'absenceMeal':
      return `${name} zjedzony do ${clock} (nieobecność)`
    case 'absenceRegen':
      return `${name} do ${clock} (nieobecność jako regeneracja)`
    case 'workEnd':
      return `${name} zaparkowany („Koniec pracy”)`
    case 'disconnect':
      return a.k === 'block.pause' ? `${name} – pauza („Odcinam się” o ${clock})` : `${name} skończony („Odcinam się” o ${clock})`
    case 'disconnect04':
      return `„Odcinam się” skończone o ${clock} (nowy dzień)`
    case 'boundary':
      return `granica zatwierdzona sama o ${clock} (start pierwszego bloku pracy)`
    case 'requestResume':
      return a.k === 'block.fg' ? `${name} znów na pierwszym planie o ${clock} (po prośbie)` : `${name} wznowiony o ${clock} (po prośbie)`
    default:
      return `${name}: ${a.rule} o ${clock}`
  }
}

/** The warning step: 15 · 5 · 0 min before the end of the block in the foreground or the start of a fixed block. */
function warnOf(state: DayState, t: TimerNow, now: number): WarnStep {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const deadlines: number[] = []
  if (t.fg) deadlines.push(atOf(state.grid, t.fg.plannedEnd))
  for (const b of state.blocks) {
    if (!(b.fixed || b.waits) || !b.inPlan) continue
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) continue
    const span = plannedSpan(b, byId)
    if (span && atOf(state.grid, span.start) > now) deadlines.push(atOf(state.grid, span.start))
  }
  if (!deadlines.length) return 'none'
  const left = (Math.min(...deadlines) - now) / MIN
  return left <= 0 ? 'zero' : left <= 5 ? 'five' : left <= 15 ? 'warm' : 'none'
}

/** Lines of the questions with a default answer and „Koniec pracy?” (the „Dalej?” has its own place). */
function questionLine(q: Question, blockName: string, clock: (ms: number) => string): BarLine {
  const text =
    q.kind === 'workEnd'
      ? 'Koniec pracy?'
      : q.kind === 'request'
        ? 'Prośba – po powrocie:'
        : q.kind === 'return'
        ? `${blockName} – po powrocie:`
        : q.kind === 'absence'
          ? `${blockName} – nieobecność od ${clock(q.askedAt)}:`
          : `${blockName} – przerwany zamknięciem aplikacji o ${clock(q.askedAt)}:`
  return { id: q.id, text, actions: q.answers.map((a) => ({ id: a.id, label: a.label })), dot: q.dot, at: q.askedAt }
}

/** The pools as the bar and the notifications name them. */
export const POOL_TEXT: Record<Pool, string> = { head: 'Głowa', emotions: 'Emocje', senses: 'Bodźce' }

/** How long the regeneration „Zacznij” of the reserve's message starts (D326). */
export const RESERVE_REGEN_MIN = 15

/**
 * The reserve's message (D326, spec „Model energii”): a short line for the first descent of the day of each pool still
 * at the reserve – the way of regeneration cheapest in it, „Zacznij” and „nie dziś” (which hides it until the day ends).
 * In a session or a class it waits for their end; with „mniej pytań” it is quiet (no dot).
 */
function reserveLines(i: EngineInput, modes: Modes): BarLine[] {
  const e = i.energy
  if (!e?.known || !e.enabled || modes.session || modes.classMode) return []
  const out: BarLine[] = []
  for (const d of e.descents) {
    if (!d.message || !e.atReserve[d.pool]) continue
    const id = reserveMessageId(i.state.grid.date, d.pool, d.at)
    if (answered(i.ctx.events, id)) continue
    const wayId = suggestRegen(i.state.settings, d.pool)
    const way = i.state.settings.categories[REGEN_CATEGORY]?.variants.find((v) => v.id === wayId)?.name
    out.push({ id, text: `${POOL_TEXT[d.pool]} na rezerwie – może ${RESERVE_REGEN_MIN} min regeneracji${way ? ` (${way})` : ''}?`, actions: [{ id: 'start', label: 'Zacznij' }, { id: 'notToday', label: 'nie dziś' }], dot: !modes.fewer })
  }
  return out
}

/** A fixed block ended by its plan may still be extended within this long after its planned end (D227). */
const NOT_EXTENDED_MIN = 30

/**
 * The lines of the day's moments (A1-12; spec „Sesje tradingowe”, „Granica i koniec pracy”, Timer):
 * - `anchor:<id>` – a block anchored to one that ended: „Zacznij · Zaparkuj · Koniec pracy”, with the dot (D194);
 * - `fixedLeft:<id>` – after „Koniec pracy” a fixed block of work still ahead: „NY o 14:00 zostaje · Odwołaj” (D216);
 * - `notExtended:<id>` – a fixed block ended by its plan, within 30 min: „Nie przedłużono · Przedłuż” (D227);
 * - `workedUntil:<explain>` – time to explain after a work block now: „Koniec pracy o 17:30 · Pracowałem do teraz” (D254).
 */
function dayLines(i: EngineInput, t: TimerNow, modes: Modes, nameOf: (id: string) => string, clockOf: (ms: number) => string): BarLine[] {
  const { state } = i
  const at = (idx: number) => atOf(state.grid, idx)
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const fact = (id: string) => state.facts.blocks.get(id)
  const untouched = (id: string) => {
    const f = fact(id)
    return !f || (f.startedAt == null && f.parkedAt == null && f.cancelledAt == null)
  }
  const running = new Set([t.fg?.info.id, ...t.bg.map((b) => b.info.id)].filter((x): x is string => !!x))
  // The latest „Koniec pracy” (or „Pracowałem do …”) with no work begun since: the bar asks once – work that came back
  // after it takes its lines away (spec „raz cicho pyta”).
  const lastEnd = state.facts.workEnds.at(-1)
  const workSince = lastEnd != null && state.blocks.some((b) => b.isWork && (fact(b.id)?.runs.some((r) => r.from >= lastEnd.at) ?? false))
  const afterWorkEnd = lastEnd != null && !workSince && !t.fg?.info.isWork
  const second = secondShiftStart(state)
  const out: BarLine[] = []
  for (const b of state.blocks) {
    if (!b.inPlan) continue
    // Anchored to a block that ended (not to a session of the layer): its own moment came. It waits through a session or
    // a class; its dot only while nothing runs, never in „mniej pytań” (D194).
    if (!b.waits && b.anchor && !b.anchor.startsWith('session:') && untouched(b.id) && fact(b.anchor)?.endedAt != null && !running.has(b.id)) {
      if (!modes.session && !modes.classMode)
        out.push({ id: `anchor:${b.id}`, text: nameOf(b.id), actions: [{ id: 'start', label: 'Zacznij' }, { id: 'park', label: 'Zaparkuj' }, ...(b.isWork ? [{ id: 'workEnd', label: 'Koniec pracy' }] : [])], dot: !modes.fewer && !t.fg })
      continue
    }
    const span = plannedSpan(b, byId)
    if (!span) continue
    // After „Koniec pracy”: a fixed block of work still ahead before the second shift – the one that makes the click a
    // break (D216; never the second shift, a block after work or one that keeps regeneration) – stays, or one click
    // cancels it.
    if (afterWorkEnd && b.fixed && isBoundaryWork(b) && !state.asProject.includes(b.id) && span.start < second && untouched(b.id) && state.now < span.start)
      out.push({ id: `fixedLeft:${b.id}`, text: `${nameOf(b.id)} o ${clockOf(at(span.start))} zostaje`, actions: [{ id: 'cancel', label: 'Odwołaj' }], dot: false })
    // A fixed block – a session too (D227) – ended by its plan (with its confirmed extensions): „Przedłuż” still possible
    // for 30 min after that end.
    const f = fact(b.id)
    if (b.fixed && f?.endedAt != null && (f.endRule === 'plan' || f.endRule === 'fixedNoReaction') && state.now < plannedEndOf(state, b, f) + NOT_EXTENDED_MIN)
      out.push({ id: `notExtended:${b.id}`, text: `${nameOf(b.id)} – nie przedłużono`, actions: [{ id: 'extend', label: 'Przedłuż' }], dot: false })
  }
  // Time to explain after a work block: going on now – „Pracowałem do teraz”; answered „odpoczynek” by „Koniec pracy” –
  // „Pracowałem do <its end>” while no work came since (D254); after a passive block counted as a project „Projekt do …”.
  for (const x of state.explains) {
    const until = workedUntilOf(x, state.now)
    if (until == null || (x.to !== OPEN && !afterWorkEnd)) continue
    out.push({ id: `workedUntil:${x.id}`, text: `Koniec pracy o ${clockOf(at(x.blockEnd))}`, actions: [{ id: 'now', label: `${x.asProject ? 'Projekt do' : 'Pracowałem do'} ${x.to === OPEN ? 'teraz' : clockOf(at(until))}` }], dot: false })
  }
  return out
}

export function engineView(i: EngineInput): WidgetView {
  const { state, now } = i
  const t = timerNow(state)
  const events = i.ctx.events
  const modes: Modes = modesOf(state, t, events, now, i.modePrefs)
  const at = (idx: number) => atOf(state.grid, idx)
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const nameOf = (id: string) => {
    const p = i.ctx.plan.find((x) => x.id === id)
    if (p) return i.name(p)
    const b = byId.get(id)
    return i.name({ categoryId: b?.categoryId ?? state.facts.blocks.get(id)?.planned?.categoryId ?? 'inne', variantId: b?.variantId ?? null, routine: null, requests: [], note: '' })
  }
  const hidden = modes.disconnect != null
  const questions = hidden ? [] : questionsOf({ ctx: i.ctx, state, activity: i.activity, now })
  const reserve = !!i.energy && i.energy.known && i.energy.enabled && Object.values(i.energy.atReserve).some(Boolean)
  const fg = t.fg
  const tone: Tone = reserve ? 'rezerwa' : fg ? (CLASS_TONE[fg.info.rules.cls] ?? 'brak') : 'brak'
  const warn = hidden ? 'none' : warnOf(state, t, now)

  // „Dalej?” in its fixed place at the start.
  const next = questions.find((q) => q.kind === 'next' || q.kind === 'next2')
  const question: BarLine | null = next
    ? { id: next.id, text: next.kind === 'next2' ? 'Dalej? (drugi raz)' : 'Dalej?', actions: next.answers.map((a) => ({ id: a.id, label: a.label })), dot: true, at: fg ? at(fg.plannedEnd) : null }
    : null

  // The request running now – the latest – in the bar (D312); without one today, one from before 04:00.
  const open = state.facts.requests.filter(isRunningRequest).sort((a, b) => a.from - b.from)
  const live = open.at(-1)
  const running: RunningRequest | null = live ? runningRequestOf(live, state.grid, i.person ?? ((id) => id ?? NO_PERSON)) : (i.carried ?? null)
  // The block it interrupted waits for its end – paused, or a fixed one in the background: a quiet line, never „Wznów ·
  // Zaparkuj” with a dot (D312, D247). Resumed, ended or parked meanwhile, it waits for nothing.
  const interruptedId = [...open].reverse().find((r) => r.interrupts)?.interrupts ?? null
  const waits = !interruptedId ? null : t.paused.some((p) => p.info.id === interruptedId) ? 'pauza' : t.bg.some((b) => b.info.id === interruptedId) ? 'w tle' : null
  const interrupted = interruptedId && waits && !hidden ? `${nameOf(interruptedId)} – ${waits}, wróci po „Koniec”` : null

  const lines: BarLine[] = []
  if (!hidden && !modes.night) {
    for (const b of t.waiting) lines.push({ id: `wait:${b.id}`, text: `${nameOf(b.id)} ${b.start != null ? clockOf(at(b.start)) : ''}`.trim(), actions: [{ id: 'start', label: 'Zacznij' }, { id: 'cancel', label: 'Odwołaj' }], dot: true })
    // A session ended before its planned end: „Zacznij jeszcze raz” to the planned end (D207), a quiet line.
    for (const b of state.blocks) {
      const f = state.facts.blocks.get(b.id)
      const span = b.waits ? plannedSpan(b, byId) : null
      if (!f || f.endedAt == null || !span || state.now >= span.end || f.endedAt >= span.end || fg?.info.id === b.id) continue
      lines.push({ id: `restart:${b.id}`, text: `${nameOf(b.id)} · do ${clockOf(at(span.end))}`, actions: [{ id: 'restart', label: 'Zacznij jeszcze raz' }], dot: false })
    }
    // Paused blocks waiting with nothing in the foreground („Wznów · Zaparkuj”) – not one a running request will resume.
    if (!fg) for (const p of t.paused) if (p.info.id !== interruptedId) lines.push({ id: `paused:${p.info.id}`, text: nameOf(p.info.id), actions: [{ id: 'start', label: 'Wznów' }, { id: 'park', label: 'Zaparkuj' }], dot: true })
    for (const q of questions) if (q !== next) lines.push(questionLine(q, q.block && q.kind !== 'request' ? nameOf(q.block) : '', clockOf))
    // The break after 90 min of continuous work (D234: a dot, no notification); in a session or a class it waits.
    const run = i.care.breakAfterMin > 0 ? workRunStart(state, now) : null
    if (run != null && now - run >= i.care.breakAfterMin * MIN && !modes.session && !modes.classMode) {
      const id = `break:${state.grid.date}:${Math.round((run - state.grid.start) / MIN)}`
      if (!answered(events, id)) lines.push({ id, text: `Przerwa? ${Math.round((now - run) / MIN)} min pracy ciągiem`, actions: [{ id: 'break', label: 'Przerwa' }, { id: 'continue', label: 'Kontynuuję' }], dot: !modes.fewer })
    }
    // „Włączyć mniej pytań?” after a signal of overload: once a day for each kind, one at a time, hidden after 15 min; a
    // signal while one is shown or within 60 min after it hid counts as shown (spec „Cisza”).
    if (!modes.fewer) {
      let lastShown: number | null = null
      const proposed = new Set<string>()
      for (const e of [...events].sort((a, b) => a.t - b.t)) {
        if (e.k !== 'energy.signal') continue
        const s = e as unknown as { at: number; signal: string }
        if (proposed.has(s.signal)) continue
        proposed.add(s.signal)
        if (lastShown != null && s.at < lastShown + 75 * MIN) continue
        lastShown = s.at
        const id = `fewerOffer:${state.grid.date}:${s.signal}`
        if (now - s.at < 15 * MIN && !answered(events, id)) lines.push({ id, text: 'Włączyć mniej pytań?', actions: [{ id: 'yes', label: 'Tak' }, { id: 'no', label: 'Nie' }], dot: false })
      }
    }
    // The solitude after contact longer than 30 min, once, when it ended (not during a class).
    const contact = i.care.solitudeAfterMin > 0 && !modes.classMode ? contactEnded(state, t, now, i.care.solitudeAfterMin) : null
    if (contact != null) {
      const id = `solitude:${state.grid.date}:${Math.round((contact - state.grid.start) / MIN)}`
      if (!answered(events, id)) lines.push({ id, text: 'Po rozmowach – chwila samotności?', actions: [{ id: 'solitude', label: 'Chwila ciszy' }, { id: 'dismiss', label: 'Nie teraz' }], dot: false })
    }
    lines.push(...reserveLines(i, modes))
    lines.push(...dayLines(i, t, modes, nameOf, clockOf))
  }
  // Routines to tick off (D328): quiet lines after all the others (no dot – in a quiet mode they fold into „⋯”), today,
  // for 3 h after the routine; the card in „Dziś” keeps them to the day's end (T520).
  const routines: BarRoutine[] = []
  if (!hidden && !modes.night && state.grid.date === logicalDayOf(now))
    for (const r of routinesDue(i.ctx, state, i.routines ?? [])) {
      if (state.now >= r.to + ROUTINE_LINE_MIN) continue
      const line = `routine:${state.grid.date}:${r.block}`
      routines.push({ line, block: r.block, name: nameOf(r.block), normal: r.normal, worse: r.worse })
      lines.push({ id: line, text: nameOf(r.block), actions: [{ id: 'all', label: '✓ Wszystkie' }, { id: 'steps', label: 'Kroki ▸' }, ...(r.worse.length ? [{ id: 'worse', label: 'gorsze dni' }] : [])], dot: false })
    }

  const water = waterDue(events, state, t, now, i.care, { night: modes.night, disconnect: hidden })
  const session = !!fg && fg.info.rules.kind === 'session'
  const sessionAny = session || t.bg.some((b) => b.info.rules.kind === 'session')
  // While a request runs, its „Koniec” is the bar's action: no „Start” nor „Wznów” of a block beside it.
  const start = !fg && t.next && !running ? `${t.paused.some((p) => p.info.id === t.next!.id) ? 'Wznów' : 'Start'}: ${nameOf(t.next.id)}` : null
  const fixedFg = !!fg && (fg.info.fixed || fg.info.rules.kind === 'session')

  // „Zrobione automatycznie”: the actions as the plan said them in one row, the rest each with „Cofnij”.
  const planned = state.facts.autos.filter((a) => a.rule === 'fixedStart' || a.rule === 'plan')
  const groups = planned.length ? [`bloki stałe według planu: ${planned.length}`] : []
  const items = state.facts.autos
    // A meal or a regeneration of an absence: one line, at its end (its „Cofnij” takes the start back too).
    .filter((a) => !(a.rule === 'fixedStart' || a.rule === 'plan') && !(a.k === 'block.start' && (a.rule === 'absenceMeal' || a.rule === 'absenceRegen')))
    .map((a) => ({ id: a.id, text: autoText(a, a.block ? nameOf(a.block) : '', clockOf(at(a.at))), undo: !INFO_RULES.has(a.rule) }))
    .reverse()

  const block = fg ? { name: nameOf(fg.info.id), className: `${CLASS_NAME[fg.info.rules.cls] ?? ''}${reserve ? ' · rezerwa energii' : ''}`, endsAt: at(fg.plannedEnd) } : null
  const nextFixed = state.blocks
    .filter((b) => (b.fixed || b.waits) && b.inPlan && b.start != null && at(b.start) > now && state.facts.blocks.get(b.id)?.startedAt == null)
    .sort((a, b) => a.start! - b.start!)[0]
  const tooltip = hidden
    ? `Odcinam się od ${clockOf(modes.disconnect!)}`
    : [block ? `${block.name} · do ${clockOf(block.endsAt)} (${Math.max(0, Math.round((block.endsAt - now) / MIN))} min)` : 'bez bloku', nextFixed ? `Następny stały: ${nameOf(nextFixed.id)} ${clockOf(at(nextFixed.start!))}` : ''].filter(Boolean).join('\n')
  const dot = !hidden && (!!question || lines.some((l) => l.dot))
  // Sounds (spec „Powiadomienia i dźwięki”): never in „mniej pytań” nor „Odcinam się”, never on a day of stationary
  // classes, never on the recording computer during a lecture.
  const dayType = state.facts.snapshots.at(-1)?.dayType ?? i.ctx.snapshot.dayType
  // The computers recording a lecture running now – of every lecture running (no tones there, nor notifications on this
  // one; never chosen for the tones, A8-04).
  const recorders = [...new Set([...(fg ? [fg] : []), ...t.bg].flatMap((x) => (x.info.rules.kind === 'lecture' ? [i.ctx.plan.find((p) => p.id === x.info.id)?.recorder ?? null] : [])).filter((x): x is string => x != null))]
  const recording = !!i.computer && recorders.includes(i.computer)
  const soundOk = !hidden && !modes.fewer && dayType !== 'zjazd-stacjonarny' && !recording
  return {
    soundOk,
    recording,
    recorders,
    hidden,
    quiet: !hidden && modes.quiet,
    tone,
    warn,
    color: toneColor(tone, warn),
    iconColor: iconColor(tone, warn, modes.quiet, hidden),
    dot,
    drop: !hidden && water.due,
    muted: false,
    block: hidden ? null : block,
    question: hidden ? null : question,
    lines,
    session: sessionAny,
    stateLine: hidden ? `Odcinam się od ${clockOf(modes.disconnect!)}` : null,
    tooltip,
    barNote: null,
    buttons: {
      next: !!fg,
      pause: !!fg && !fixedFg && !modes.night,
      extend: !!fg,
      workEnd: (!!fg && fg.info.isWork) || (!fg && state.ends.length > 0 && !t.workEndConfirmed),
      finished: sessionAny && !modes.night,
      cutOff: !hidden && !modes.night,
      start: modes.night ? null : start
    },
    background: hidden || modes.night ? [] : t.bg.map((b) => ({ id: b.info.id, name: nameOf(b.info.id), endsAt: at(b.plannedEnd) })),
    autos: hidden ? { groups: [], items: [] } : { groups, items },
    fewer: modes.fewer,
    signals: !!i.energy?.enabled,
    night: modes.night,
    pending: i.pending && i.pending.until > now ? i.pending : null,
    day: state.grid.date,
    toneSet: ENGINE_TONE_SET,
    note: null,
    requests: { people: i.people ?? [], running, interrupted },
    variants: NO_VARIANTS,
    // Today's ritual due and not closed, not in the night – also in „Odcinam się” (D318, T505).
    ritual: !modes.night && !state.facts.closed && state.grid.date === logicalDayOf(now) && ritualDue(state, logicalDayOf(now), i.ritualFrom ?? null),
    routines
  }
}
