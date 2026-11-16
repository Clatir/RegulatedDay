/**
 * The timer (spec „Timer”, „Bloki”, „Przedłużenie i przekroczenie”): what runs now in the foreground and in the
 * background, what „Dalej” would start, which blocks wait for „Zacznij”, and every click of the widget as the events it
 * writes – Start (also „Zacznij” and „Wznów”), Pauza, Dalej, Przedłuż, Koniec pracy, Skończyłem, „Zakończ teraz”,
 * Odwołaj, Zaparkuj, Potwierdź, the end of a running block dragged on the axis (D365). Pure: the main process validates a click against the day as it knows it and writes the
 * events; the main window shows the same view from the same day.
 *
 * An action that creates minutes of work after the approved boundary that nobody confirmed (start or resume of a work
 * block, Dalej to one, Przedłuż) is done only by a second click: the first returns the cost (spec: „pierwszym
 * kliknięciem pokazuje koszt …, a drugim w ciągu 10 s je wykonuje”) – except „Dalej”, whose first click already ends the
 * running block.
 */
import { placeOf } from '../model/categories'
import { DRAG_STEP_MIN, MAX_BLOCK_MIN, MIN_BLOCK_MIN } from '../model/plan'
import { ROUTINE_VERSIONS, type RoutineVersion } from '../model/routines'
import { isBoundaryWork, ownHourBlock, plannedSpan, setsWorkEndBlock, startPlanned, zjazdRemoteClass, type BlockInfo } from './blocks'
import type { DayContext, DayState } from './day'
import { workedUntilOf } from './explain'
import { OPEN, compareOrder, endShiftOf, type EventOrder, isRunning, type AutoAction, isRunningRequest, lastRunEnd, ranMinutes, resumedWith, runShift, workSince, type BlockFact } from './facts'
import { activityOf, firstUseAfter } from './activity'
import { atOf, idxOf } from './grid'
import { groupOf } from './parallel'

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
  /** Minutes of its „Przedłuż” (a shortening dragged on the axis is not in them – it is in `plannedEnd`). */
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
  /**
   * The end of a running block of its own hour dragged on the axis to `to` (ms, D365): later – „Przedłuż” by the difference
   * (its cost and second click); earlier – `block.shorten`, never before now; the end it has – nothing.
   */
  | { a: 'resize'; block: string; to: number; confirm?: boolean }
  | { a: 'workEnd' }
  | { a: 'finish'; block?: string }
  | { a: 'cancel'; block: string }
  | { a: 'park'; block: string }
  | { a: 'confirm'; block: string }
  /** „Cofnij” of an automatic action (spec: it writes an event „korekta”; the boundary's own approval opens it again). */
  | { a: 'undo'; target: string }
  /** „Cofnij zatwierdzenie” of the morning plan: the boundary opens again from now (A6-11). */
  | { a: 'undoApproval' }
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
  /** That answer taken back (`undo` of its event): the gap's „Przesuń” whose edit failed after its answers (D368, T602). */
  | { a: 'unmark'; question: string }
  /** „Pracowałem do teraz” on the bar: the time to explain after a work block answered „praca” to now, the end of work then. */
  | { a: 'workedUntil'; explain: string }
  /** A routine's steps ticked off with its version (D328), and its „Cofnij”. */
  | { a: 'routineDone'; block: string; version: RoutineVersion; steps: string[] }
  | { a: 'routineUndo'; block: string }
  /** D494: another block of a parallel group running behind comes to the foreground; the one in front goes behind it. */
  | { a: 'front'; block: string }
  /** „Usuń” a block that has begun (D336): it ends now (the window takes it out of the plan), and „Cofnij” of that. */
  | { a: 'removeBegun'; block: string }
  | { a: 'undoRemove'; block: string }
  /** The last step of a block ticked off (D474): it ends now, done („Skończono: … · Cofnij”), and „Cofnij” of that (T1104, T1105). */
  | { a: 'stepsFinish'; block: string }
  | { a: 'undoStepsFinish'; block: string }

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

/**
 * Why a click found nothing to do, for a caller that must tell it from another refusal (D336) – never read from the text; the
 * ends of a list of steps say these by no word (D474, D328 – `quietRefusal`, T1109).
 */
export type ResultCode = 'alreadyOver' | 'notBegun' | 'notRunning' | 'routineSaved' | 'noRoutine'

export type ActionResult =
  | { ok: true; events: TimerDraft[]; confirm: ActionCost | null }
  | { ok: false; why: string; confirm: ActionCost | null; code?: ResultCode }

/** Fixed by the plan (a session too): never paused, ends by its plan. */
const isFixedLike = (b: BlockInfo) => b.fixed || b.rules.kind === 'session'

/** The planned end (index) of a started block now. */
export function plannedEndOf(state: DayState, info: BlockInfo, f: BlockFact, now = state.now): number {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const extended = endShiftOf(f)
  const span = plannedSpan(info, byId)
  if (info.fixed && span) return Math.max(span.end, f.startedAt ?? span.end) + extended
  const planned = f.planned?.durationMin ?? info.durationMin
  const until = f.endedAt ?? now
  const paused = Math.max(0, until - (f.startedAt ?? until) - ranMinutes(f, until))
  return (f.startedAt ?? now) + planned + paused + extended
}

/**
 * When a running block's planned end comes for the bar (ms, E4a.1 – only the view, the day counts in minutes, T412): its
 * planned end moved by as much as its running stretch began off its minute (`runShift`) – a 15-minute block clicked at
 * 10:46:32 counts down from 15:00 to 11:01:32, its steps 15 · 5 · 0 and „Dalej?” with it. A fixed block ends with its
 * window. `byId` – the day's blocks by id, when the caller has them.
 */
export function endsAtOf(state: DayState, tb: TimerBlock, byId: Map<string, BlockInfo> = new Map(state.blocks.map((b) => [b.id, b]))): number {
  const fixed = tb.info.fixed && plannedSpan(tb.info, byId) != null
  return atOf(state.grid, tb.plannedEnd) + (fixed ? 0 : runShift(state.grid, tb.fact))
}

/** The end of work is confirmed now (a „Koniec pracy” or „Odcinam się” after the last work, with no work running). */
function workEndConfirmed(state: DayState): boolean {
  return state.workEnd != null && state.ends.length > 0 && state.ends.at(-1)!.confirmed
}

/**
 * Work that sets the end of work now (`setsWorkEndBlock` – the rule of `day.ts`) by a block's id: it decides where the
 * work stopped (`lastWorkOf`) and whether work came back after „Koniec pracy” for „Odwołaj” (`workSince`, D216). Built
 * once per state – pass it on.
 */
export function setsWorkEnd(state: DayState): (id: string) => boolean {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const projects = new Set(state.asProject)
  return (id) => setsWorkEndBlock(byId.get(id), projects)
}

/**
 * Where the day's work stopped (D165, G1): of the blocks that set the end of work (`setsWorkEnd`) the one whose work
 * stopped last – at its end, or a paused one's at its last run's end – with that instant (index), up to `until`; null –
 * none yet (no work, or only running work). A tie goes to the block whose last run began later.
 */
export function lastWorkOf(state: DayState, until = OPEN, isWork: (id: string) => boolean = setsWorkEnd(state)): { fact: BlockFact; stop: number } | null {
  let best: { fact: BlockFact; stop: number } | null = null
  for (const [id, f] of state.facts.blocks) {
    if (!isWork(id)) continue
    const stop = f.endedAt ?? lastRunEnd(f)
    if (stop == null || stop > until) continue
    if (!best || stop > best.stop || (stop === best.stop && (f.runs.at(-1)?.from ?? 0) > (best.fact.runs.at(-1)?.from ?? 0))) best = { fact: f, stop }
  }
  return best
}

/**
 * Where the day's work stopped (index), null – none yet: the later of the last block's stop (`lastWorkOf`) and the last
 * end of the engine not confirmed – work without a run of a block counts too (time to explain answered „praca”, G1). The
 * button, its click and the close of the day confirm this one.
 */
export function lastWorkStop(state: DayState, isWork: (id: string) => boolean = setsWorkEnd(state)): number | null {
  const block = lastWorkOf(state, OPEN, isWork)?.stop ?? null
  const last = state.ends.at(-1)
  // Only on a day with work: a session that never began gives the engine an end, not work.
  const worked = block != null || state.explains.some((x) => x.answer?.cls === 'work')
  const engine = worked && last && !last.confirmed ? last.at : null
  return block == null ? engine : engine == null ? block : Math.max(block, engine)
}

/**
 * The blocks a running request interrupted that are still to come back at its end (T503): started, not ended (one ended
 * or parked meanwhile comes back no more).
 */
export function heldByRequests(state: DayState): string[] {
  const out: string[] = []
  for (const r of state.facts.requests) {
    const f = r.interrupts != null && isRunningRequest(r) ? state.facts.blocks.get(r.interrupts) : undefined
    if (f?.startedAt != null && f.endedAt == null) out.push(f.id)
  }
  return out
}

/**
 * A request that interrupted work (`setsWorkEnd`) runs and the work comes back at its end (T503): no „Koniec pracy?”
 * meanwhile (`workRuns` in `questionsOf`), no „Koniec pracy” beside the request's „Koniec” and no end of work at the
 * close of the day (G1).
 */
export function requestHoldsWork(state: DayState, isWork: (id: string) => boolean = setsWorkEnd(state), held: readonly string[] = heldByRequests(state)): boolean {
  return held.some(isWork)
}

/**
 * A „Koniec pracy” (or what writes one) reaches the stop – as the engine judges it: its end at the stop or later and no
 * work begun after it up to the stop (`workSince`, an empty run in the stop's minute too) – not by the minute alone.
 */
export function workEndReaches(state: DayState, stop: number, isWork: (id: string) => boolean = setsWorkEnd(state)): boolean {
  return state.facts.workEnds.some((w) => w.end >= stop && !workSince(state.facts, w, isWork, stop))
}

/**
 * Work begun in the foreground at `from` or later (`setsWorkEnd`): a time to explain from before it is no longer the
 * time after the day's last work (G1, obs. 866) – its line in the bar and its „Pracowałem do …” click find nothing; a
 * session going on in the background takes nothing.
 */
export function laterWork(state: DayState, from: number, isWork: (id: string) => boolean = setsWorkEnd(state)): boolean {
  for (const [id, f] of state.facts.blocks) if (isWork(id) && f.runs.some((r) => !r.bg && r.from >= from)) return true
  return false
}

/**
 * A fixed work block is still left (D216): in the plan, not begun, parked or cancelled (nor `cancelling`), its window
 * not over yet – a waiting one (a session) while it may still begin, to its planned end – as `workEnds` in `day.ts`
 * counts it; a session skipped is no longer one. „Koniec pracy” is then only a break that parks and ends nothing,
 * „Koniec pracy?” waits, the close of the day ends nothing either.
 */
export function fixedWorkLeft(state: DayState, cancelling: string | null = null): boolean {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  return state.blocks.some((b) => {
    if (!b.fixed || !isBoundaryWork(b) || !b.inPlan || b.id === cancelling) return false
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) return false
    const span = plannedSpan(b, byId)
    return span != null && span.end > state.now
  })
}

/**
 * Whether „Koniec pracy” is shown with no work in the foreground (spec „Granica i koniec pracy”: „kliknięte później, gdy
 * żaden blok pracy już nie biegnie, tylko potwierdza wcześniejszy koniec”, T152, G1): the end of work is not confirmed
 * now, no work runs (`setsWorkEnd` in the foreground or the background) nor waits for a request's end
 * (`requestHoldsWork`), work stopped today (`lastWorkStop` – a paused block too, at once, not 15 min later as the end
 * counts it, T514; an end of the engine without a block, e.g. time to explain answered „praca”) and no `work.end` reaches
 * that stop – the close of the day hides it only so (by its own `work.end`). It is shown in a break between work too – a
 * click then ends the work of the day there.
 */
export function workEndOpen(state: DayState, t: TimerNow = timerNow(state), isWork: (id: string) => boolean = setsWorkEnd(state)): boolean {
  if (t.workEndConfirmed || [t.fg, ...t.bg].some((x) => x != null && isWork(x.info.id)) || requestHoldsWork(state, isWork)) return false
  const stop = lastWorkStop(state, isWork)
  return stop != null && !workEndReaches(state, stop, isWork)
}

/**
 * The pair a fixed start made (rule `fixedStart`): the pause of the flexible block in front and the start of the fixed one,
 * written together (the same instant). `null`: the action is no part of one (a fixed start with nothing in front, other
 * rules). `alive`: while the fixed block still runs as it began and the flexible one stands in that pause – no later click
 * of the user on either – a „Cofnij” of either takes both back; after it the two rows are only information.
 */
export function fixedStartPair(state: DayState, a: AutoAction): { ids: string[]; alive: boolean } | null {
  if (a.rule !== 'fixedStart') return null
  const autos = state.facts.autos.filter((x) => x.rule === 'fixedStart' && x.at === a.at)
  // The pauses of that start – of the block in front and of its parallel group (T1195, T1209): they go back together.
  const pauses = autos.filter((x) => x.k === 'block.pause')
  const pause = pauses[0]
  const start = autos.find((x) => x.k === 'block.start' && state.facts.blocks.get(x.block ?? '')?.runs[0]?.bg === false)
  if (!pause || !start || (a.id !== start.id && !pauses.some((p) => p.id === a.id))) return null
  const fixed = state.facts.blocks.get(start.block ?? '')
  const flexible = state.facts.blocks.get(pause.block ?? '')
  const mates = pauses.slice(1).map((p) => ({ p, f: state.facts.blocks.get(p.block ?? '') }))
  const alive =
    mates.every(({ p, f }) => f != null && f.endedAt == null && f.runs.at(-1)?.to === p.at) &&
    fixed != null &&
    flexible != null &&
    fixed.startedAt != null &&
    fixed.endedAt == null &&
    fixed.runs.length === 1 &&
    fixed.runs[0]!.to === OPEN &&
    // A later click on it – „Przedłuż” or a shortening dragged on the axis (D365).
    fixed.endChanges.length === 0 &&
    flexible.endedAt == null &&
    flexible.runs.at(-1)?.to === pause.at
  return { ids: [...pauses.map((p) => p.id), start.id], alive }
}

/**
 * May „Cofnij” take back a start of a block away from the computer that began by itself (D475, T1136): only while
 * nothing but the app touched it since – one run, running or ended by an automatic end, no „Przedłuż” nor shortening.
 * Afterwards the row is information (a click ended, paused or extended the block – taking the start back would leave those
 * events without a start). Every other action: true.
 */
/** The start of a block the app began by itself (D475, rule `awayStart`), or undefined: begun by you, or not begun. */
export function awayStartOf(state: Pick<DayState, 'facts'>, block: string): AutoAction | undefined {
  return state.facts.autos.find((a) => a.k === 'block.start' && a.rule === 'awayStart' && a.block === block)
}

/** The starts of the rest of a parallel group written with block start `a` (rule `groupStart`, the same instant and group, T1204). */
export function groupStartsWith(state: DayState, a: AutoAction): AutoAction[] {
  const group = a.block ? state.facts.blocks.get(a.block)?.group : null
  if (!group) return []
  const out: AutoAction[] = []
  for (const x of state.facts.autos) {
    if (x.rule !== 'groupStart' || x.k !== 'block.start' || x.at !== a.at || x.block == null || state.facts.blocks.get(x.block)?.group !== group) continue
    // A mate you touched since (ended, paused, extended) stays (T1209) – as its lead's start, only while the app alone ran it.
    if (!untouched(state, x.block)) continue
    out.push(x)
    const end = state.facts.blocks.get(x.block)?.endId
    const auto = end ? state.facts.autos.find((y) => y.id === end) : undefined
    if (auto) out.push(auto)
  }
  return out
}

/**
 * A block begun by the app that only the app ran since (T1136, T1209, T1250): no break in its runs except where the app
 * brought it to the front (`groupFront`), running or ended by an automatic end, no „Przedłuż” nor shortening.
 */
export function untouched(state: DayState, block: string): boolean {
  const f = state.facts.blocks.get(block)
  if (!f || f.startedAt == null || !f.runs.length || f.endChanges.length) return false
  for (let i = 1; i < f.runs.length; i++) {
    const r = f.runs[i]!
    if (f.runs[i - 1]!.to !== r.from || !state.facts.autos.some((x) => x.k === 'block.fg' && x.rule === 'groupFront' && x.block === block && x.at === r.from)) return false
  }
  return f.endedAt == null ? f.runs.at(-1)!.to === OPEN : state.facts.autos.some((x) => x.id === f.endId)
}

/**
 * „Jednym ciągiem” (D555, T1964): what goes back with a block's end by the plan (`awayChain`, `a`) – every block the app
 * began by itself from that end up to your return (`awayStart`, with the rest of its group and its automatic end, the next
 * ones of the chain too): the block goes on to the return or its limit, so they would run beside it. Null – one of them
 * changed since its start (the chain stays as it is).
 */
export function awayChainUndo(ctx: Pick<DayContext, 'events'>, state: DayState, a: AutoAction, now: number): AutoAction[] | null {
  const f = a.block ? state.facts.blocks.get(a.block) : undefined
  if (a.rule !== 'awayChain' || a.k !== 'block.end' || !f || f.startedAt == null) return []
  // The return the block's usual end counts (`awayEnd`: the first use after 2 min without input from its start or last run).
  const from = atOf(state.grid, f.group != null ? (f.runs.at(-1)?.from ?? f.startedAt) : f.startedAt)
  const back = firstUseAfter(activityOf(ctx.events, state.grid.start, now), from)
  const out: AutoAction[] = []
  for (const x of state.facts.autos) {
    if (x.k !== 'block.start' || x.rule !== 'awayStart' || !x.block || x.block === a.block || x.at < a.at || state.facts.undone.has(x.id)) continue
    if (back && atOf(state.grid, x.at) >= back.use) continue
    if (!untouched(state, x.block)) return null
    const end = state.facts.blocks.get(x.block)?.endId
    out.push(x, ...state.facts.autos.filter((y) => y.id === end), ...groupStartsWith(state, x))
  }
  return out
}

export function awayStartUndoable(state: DayState, a: AutoAction): boolean {
  if (a.rule !== 'awayStart' || a.k !== 'block.start' || !a.block) return true
  return untouched(state, a.block)
}

/**
 * The block of a parallel group that takes the foreground when nothing else is in front (D493, T1191): of the blocks running
 * in the background as blocks of a group (begun with `group`, not planned in the background), the one whose last run began
 * last – the same order the timer's foreground keeps. Null – none.
 */
export function groupFront<T extends { info: BlockInfo; fact: BlockFact; running: boolean; bg: boolean }>(blocks: readonly T[]): T | null {
  const lastRun = (t: T) => t.fact.runs.at(-1)?.from ?? t.fact.startedAt ?? 0
  const begun = (t: T) => t.fact.runs.at(-1)?.begun
  let best: T | null = null
  for (const t of blocks) {
    if (!t.running || !t.bg || t.fact.group == null || t.info.bg) continue
    if (!best || lastRun(t) > lastRun(best) || (lastRun(t) === lastRun(best) && compareOrder(begun(t)!, begun(best)!) > 0)) best = t
  }
  return best
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
  // D493 (T1191): nothing in the foreground – the block in front ended – and blocks of a parallel group run behind: the one
  // begun last is in front (`groupFront`, the same rule energy counts by). Not while a request or „Odcinam się” holds the
  // foreground (T1200): the block it interrupted comes back after it.
  const frontHeld = state.facts.requests.some((r) => r.to === OPEN) || state.facts.disconnect.some((d) => d.to === OPEN)
  const fg = fgRunning[0] ?? (frontHeld ? null : groupFront(started))
  if (fg && fg.bg) fg.bg = false
  const bg = started.filter((t) => t.running && (t.bg || (fg != null && t !== fg && !t.bg)))
  // A block of a parallel group paused behind (the whole group paused) waits too (T1201).
  const paused = started.filter((t) => !t.running && (!t.bg || (t.fact.group != null && !t.info.bg)))

  const gone = (b: BlockInfo) => {
    const f = state.facts.blocks.get(b.id)
    return f != null && (f.parkedAt != null || f.cancelledAt != null) && f.startedAt == null
  }
  const notStarted = (b: BlockInfo) => (state.facts.blocks.get(b.id)?.startedAt ?? null) == null && !gone(b)
  const waiting = state.blocks.filter((b) => {
    if (!b.waits || !b.inPlan || !notStarted(b)) return false
    const span = plannedSpan(b, byId)
    if (!span) return false
    return now >= span.start && now < span.end
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
 * before its time, never one waiting for „Zacznij” (only its own line starts it), never a work block after a confirmed
 * end of work, never a block anchored to one not ended yet.
 */
function nextBlock(state: DayState, fg: TimerBlock | null, paused: TimerBlock[], held: BlockInfo[], workEnded: boolean): BlockInfo | null {
  if (fg?.info.isRegen && held.length) return held[0]!
  const ended = (id: string) => state.facts.blocks.get(id)?.endedAt != null || fg?.info.id === id
  const pausedIds = new Set(paused.map((p) => p.info.id))
  for (const p of [...state.forecast].sort((a, b) => a.from - b.from)) {
    const b = p.block
    if (p.running || p.bg || b.bg || isFixedLike(b) || (b.waits && !pausedIds.has(b.id)) || b.id === fg?.info.id) continue
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
export function workCost(state: DayState, info: BlockInfo, from: number, to: number, extend = false): ActionCost | null {
  const boundary = state.boundary.approved
  if (boundary == null || to <= from) return null
  // „Dodaj bez wymiany” confirms the block up to its planned length only – an extension past it has its cost (spec „Przedłużenie i przekroczenie”).
  if (!extend && state.facts.blocks.get(info.id)?.addConfirmedAt != null) return null
  if (!isBoundaryWork(info) || info.lectureOrCommute) return null
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
  return Math.max(0, (f.planned?.durationMin ?? info.durationMin) + endShiftOf(f) - ranMinutes(f, at))
}

/** The instant a block ends at when clicked now: a fixed block past its planned end without „Przedłuż” – its planned end. */
function endInstant(state: DayState, t: TimerBlock, at: number): number {
  if (isFixedLike(t.info) && t.info.fixed && idxOf(state.grid, at) > t.plannedEnd) return atOf(state.grid, t.plannedEnd)
  return at
}

/** The end rule of a block taken out of the plan after it began (D336). */
export const REMOVED_RULE = 'removed'
/** The end rule of a block ended by its last step ticked off (D474, `stepsFinish`). */
export const STEPS_RULE = 'steps'

/**
 * Whether anything has begun since the end of `f` (its place among the events, not minutes – as G1): another block, a request
 * or „Odcinam się” – a block whose end is taken back would run beside it („Cofnij” of a removal, `undoRemove`, and of an end
 * by the steps, `undoStepsFinish`).
 */
function begunSinceEnd(state: DayState, f: { id: string; endOrder: EventOrder | null }): boolean {
  const end = f.endOrder
  if (!end) return false
  const later = (o: EventOrder) => compareOrder(o, end) > 0
  return [...state.facts.blocks.values()].some((x) => x.id !== f.id && x.runs.some((r) => later(r.begun))) || state.facts.requests.some((r) => later(r.begun)) || state.facts.disconnect.some((d) => later(d.begun))
}
/** The refusal of a click on a block that is over (with the code `alreadyOver`: „Usuń” then only takes it out of the plan). */
export const ALREADY_OVER = 'ten blok już się skończył'
/** … and one whose start was taken back meanwhile (`notBegun`: it leaves the plan as one that never began). */
export const NOT_BEGUN = 'ten blok się nie zaczął'

/**
 * The running flexible block a start of another one swaps with (D478, T1130): not a regeneration (a break the start ends)
 * nor a block away from the computer (clicking means you are back – it ends, as its first use would end it); and only
 * before its planned end – at it or past it nothing of it is left to stand elsewhere: it ends, done, as „Dalej” ends it.
 */
const swaps = (b: BlockInfo) => !b.isRegen && placeOf(b.rules, b.variantId) !== 'away'

/** The first block of the parallel group of block `id` of the plan (D476), null – a block of no group (alone). */
export function groupRootIn(plan: DayContext['plan'], id: string): string | null {
  const g = groupOf(plan, id)
  return g.length > 1 ? g[0]! : null
}

/**
 * The other blocks of `lead`'s parallel group begun with it (D493, T1193): behind, as blocks of the group (`group` – its
 * first block); a paused one resumes behind; one running, ended, parked or cancelled stays as it is. Every block of the
 * group, also over the limit of blocks at once (D499 – the limit holds where blocks are put together, `parallel.ts`). `auto`
 * – the rule of an automatic start (the leader's derived ids), none for a click.
 */
export function groupStarts(ctx: DayContext, state: DayState, lead: string, at: number, by: 'click' | 'auto', confirmed = false): TimerDraft[] {
  const ids = groupOf(ctx.plan, lead)
  if (ids.length < 2) return []
  const root = ids[0]!
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const out: TimerDraft[] = []
  for (const id of ids) {
    const info = byId.get(id)
    if (id === lead || !info) continue
    const f = state.facts.blocks.get(id)
    // A session waits for its own „Zacznij” (D192); a fixed block never begins before its window (spec „Timer”, T1208).
    if (!mayJoin(state, info, f, at, byId)) continue
    // Work past the approved boundary nobody confirmed (T1205): with the click's second click (its cost is the group's,
    // `groupCost`); begun by itself – it waits for its own „Zacznij”.
    const cost = startCost(state, info, at)
    if (cost && (by === 'auto' || !confirmed)) continue
    const confirmUntil = cost ? at + leftOf(state, info, idxOf(state.grid, at)) * 60_000 : null
    if (f?.startedAt != null) {
      out.push({ k: 'block.resume', block: id, at, confirmUntil })
      if (!(f.runs.at(-1)?.bg ?? false)) out.push({ k: 'block.fg', block: id, at, bg: true })
      continue
    }
    // Not your click (the game and the calibration take no measure of it, T1252) – the group began it with the clicked one.
    out.push({ k: 'block.start', block: id, at, bg: true, planned: startPlanned(info, ctx.plan), confirmUntil, how: 'auto', group: root })
  }
  return out
}

/** The first cost of the other blocks of `lead`'s group a click starts with it (T1205), null – none. */
export function groupCost(ctx: DayContext, state: DayState, lead: string, at: number): ActionCost | null {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  for (const id of groupOf(ctx.plan, lead)) {
    const info = byId.get(id)
    const f = state.facts.blocks.get(id)
    if (id === lead || !info || !mayJoin(state, info, f, at, byId)) continue
    const cost = startCost(state, info, at)
    if (cost) return cost
  }
  return null
}

/**
 * Whether a block of a group begins (or resumes) with its group now (T1193, T1208, T1209): not over, not running, not parked
 * nor cancelled before its start; not a session (its own „Zacznij”), not a fixed block outside its window.
 */
function mayJoin(state: DayState, info: BlockInfo, f: BlockFact | undefined, at: number, byId: Map<string, BlockInfo>): boolean {
  if (f?.endedAt != null || (f && isRunning(f))) return false
  if (f?.startedAt == null && f && (f.parkedAt != null || f.cancelledAt != null)) return false
  if (f?.startedAt == null && info.waits) return false
  if (f?.startedAt == null && info.fixed) {
    const span = plannedSpan(info, byId)
    const m = idxOf(state.grid, at)
    if (!span || m < span.start || m >= span.end) return false
  }
  return true
}

/** The running blocks of the parallel group `group` (the one in front and those behind). */
export const runningOfGroup = (t: TimerNow, group: string): TimerBlock[] => [t.fg, ...t.bg].filter((x): x is TimerBlock => x != null && x.fact.group === group)

/** A running block of a group that pauses and ends with it (T1195): not fixed (never paused), not planned in the background. */
export const groupMate = (x: TimerBlock): boolean => !isFixedLike(x.info) && !x.info.bg

/**
 * Whether `id` is in the group of the running block `fg` (T1251): by the plan's group of `id` now – it holds `fg`, the group's
 * first block at the start (`fact.group`), or a block beside that one; so also when that first block left the plan.
 */
export function inGroupOf(plan: DayContext['plan'], fg: TimerBlock, id: string): boolean {
  const root = fg.fact.group
  if (root == null) return false
  const ids = groupOf(plan, id)
  return ids.includes(fg.info.id) || ids.includes(root) || ids.some((x) => plan.find((p) => p.id === x)?.alongside === root)
}

/** The events of starting (or resuming) `info` at `at`, with what happens to the block in the foreground. */
function startEvents(ctx: DayContext, state: DayState, t: TimerNow, info: BlockInfo, at: number, confirmed: boolean): TimerDraft[] {
  const out: TimerDraft[] = []
  const f = state.facts.blocks.get(info.id)
  const fg = t.fg
  const toBg = info.bg
  // A block of the running parallel group in front (D476): the clicked one of the same group comes to the front, the one in
  // front goes behind it (T1194); a block outside the group pauses the whole group (D499, T1195).
  const fgGroup = fg?.fact.group ?? null
  const sameGroup = fg != null && inGroupOf(ctx.plan, fg, info.id)
  // The group the clicked block begins with: the running one it belongs to, else its group in the plan (T1251).
  const clickedGroup = sameGroup ? fgGroup : groupRootIn(ctx.plan, info.id)
  const groupMates = fg && fgGroup != null && !sameGroup && !toBg ? runningOfGroup(t, fgGroup).filter((x) => x !== fg && groupMate(x)) : []
  let matePlace: number | null = null
  if (!toBg && fg && fg.info.id !== info.id && sameGroup) {
    out.push({ k: 'block.fg', block: fg.info.id, at, bg: true })
  } else if (!toBg && fg && fg.info.id !== info.id) {
    if (fg.info.fixed || fg.info.waits) {
      // A fixed block is never paused: it goes on in the background (spec „Przerwania”).
      out.push({ k: 'block.fg', block: fg.info.id, at, bg: true })
    } else if (((info.waits || info.fixed) && !fg.info.isRegen) || (info.isRegen && !fg.info.isRegen) || (info.isLife && fg.info.isWork)) {
      // A waiting or fixed block pauses the running flexible one; it waits as the next in the plan (spec „Bloki”) – so
      // does a break (a regeneration begun now never ends the work it interrupts) and a block of life and care begun
      // over running work, a meal for one (D335).
      out.push({ k: 'block.pause', block: fg.info.id, at })
    } else if (swaps(fg.info) && idxOf(state.grid, at) < fg.plannedEnd) {
      // Another flexible block (D478): the two change places – the clicked one begins now, the running one pauses, not
      // done, and stands at the clicked one's planned place (`place`; none – a block begun outside the plan: it waits as
      // the next in the plan, its own place).
      // Its planned place: its own hour; without one (anchored, a paused block's rest) – where the forecast shows it.
      const place = !info.inPlan ? null : (info.start ?? state.forecast.find((p) => p.block.id === info.id && !p.running)?.from)
      out.push({ k: 'block.pause', block: fg.info.id, at, ...(place != null ? { place: atOf(state.grid, place) } : {}) })
      // The whole group goes there, each block of it paused, not done (D499).
      matePlace = place ?? null
    } else {
      // The start ends a regeneration (a break), or a block away from the computer – a click there means you are back: the
      // running one ends here, done.
      out.push({ k: 'block.end', block: fg.info.id, at, done: fg.info.fixed ? null : true, rule: null, fin: true })
    }
  }
  // The rest of the group in front pauses with it, whatever happened to the block in front (D499, T1195): sent behind
  // (fixed), paused, swapped (at the clicked one's place) or ended; a fixed block of it is never paused.
  for (const x of groupMates) out.push({ k: 'block.pause', block: x.info.id, at, ...(matePlace != null ? { place: atOf(state.grid, matePlace) } : {}) })
  const left = leftOf(state, info, idxOf(state.grid, at))
  const confirmUntil = confirmed ? at + left * 60_000 : null
  // A block of a group paused behind resumes in front – the clicked one is in front (T1201).
  if (f?.startedAt != null) {
    out.push({ k: 'block.resume', block: info.id, at, confirmUntil })
    if ((f.runs.at(-1)?.bg ?? false) && !toBg) out.push({ k: 'block.fg', block: info.id, at, bg: false })
  }
  else out.push({ k: 'block.start', block: info.id, at, bg: toBg, planned: startPlanned(info, ctx.plan), confirmUntil, how: 'click', ...(clickedGroup != null ? { group: clickedGroup } : {}) })
  // D493: the rest of its group begins with it, behind; a resumed block of a running group needs none.
  if (clickedGroup != null && !sameGroup) out.push(...groupStarts(ctx, state, info.id, at, 'click', confirmed))
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
  const no = (why: string, confirm: ActionCost | null = null, code?: ResultCode): ActionResult => ({ ok: false, why, confirm, ...(code ? { code } : {}) })
  const yes = (events: TimerDraft[], confirm: ActionCost | null = null): ActionResult => ({ ok: true, events, confirm })
  const m = idxOf(state.grid, at)

  switch (act.a) {
    case 'start': {
      const info = byId.get(act.block)
      if (!info) return no('nie ma takiego bloku w planie dnia')
      const f = state.facts.blocks.get(info.id)
      if (f?.endedAt != null) return no(ALREADY_OVER)
      if (f && isRunning(f)) return no('ten blok już biegnie')
      // The blocks of its group begun with it may cost too (T1205): one second click for all.
      // Joining the group in front begins none of its others (T1253): only its own cost.
      const cost = startCost(state, info, at) ?? (t.fg && inGroupOf(ctx.plan, t.fg, info.id) ? null : groupCost(ctx, state, info.id, at))
      if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
      return yes(startEvents(ctx, state, t, info, at, cost != null))
    }
    case 'startNew': {
      const rules = state.settings.categories[act.categoryId]
      if (!rules) return no('nie ma takiej kategorii')
      if (state.facts.blocks.get(act.block)?.startedAt != null || byId.has(act.block)) return no('ten blok już jest w dniu')
      if (!(act.durationMin > 0 && act.durationMin <= MAX_BLOCK_MIN)) return no('długość bloku')
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
        alongside: null,
        anchor: null,
        durationMin: act.durationMin,
        waits: false,
        // A remote class begun now on a day of „zjazd” is a block of the „zjazd” (D359), as the day counts it once begun.
        lectureOrCommute: rules.kind === 'commute' || rules.kind === 'lecture' || zjazdRemoteClass(rules, state.dayType),
        recorded: false,
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
        routineCosts: null,
        bgCostPct: null
      }
      const cost = workCost(state, info, m, m + act.durationMin)
      if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
      const events = startEvents(ctx, state, t, info, at, cost != null)
      const start = events.at(-1)!
      start.planned = { categoryId: act.categoryId, variantId, durationMin: act.durationMin, fixed: false, costs: null, bgCostPct: null }
      if (cost) start.confirmUntil = at + act.durationMin * 60_000
      return yes(events)
    }
    case 'front': {
      // D494 (T1192): only a block of a parallel group running behind; the one in front – of a group or not – goes behind
      // as a block of the group (it costs no energy there), the chosen one to the foreground.
      const target = t.bg.find((x) => x.info.id === act.block)
      if (!target || target.fact.group == null || target.info.bg) return no('ten blok nie biegnie w tle grupy')
      const events: TimerDraft[] = []
      // Only within the group in front (T1206): another group's block behind, or one in front outside the group – refused.
      if (t.fg && t.fg.fact.group !== target.fact.group) return no('na pierwszym planie biegnie blok spoza tej grupy')
      if (t.fg) events.push({ k: 'block.fg', block: t.fg.info.id, at, bg: true })
      events.push({ k: 'block.fg', block: target.info.id, at, bg: false })
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
      // „Dalej” (D484, T1121): done explicitly – unless as not done.
      if (fg) events.push({ k: 'block.end', block: fg.info.id, at: endInstant(state, fg, at), done: isFixedLike(fg.info) ? null : (act.done ?? true), rule: null, fin: act.done !== false })
      // Other blocks of its parallel group still run: the foreground falls to the one begun last, nothing else begins (D499,
      // T1196).
      if (fg?.fact.group != null && runningOfGroup(t, fg.fact.group).some((x) => x !== fg && !x.info.bg)) return yes(events)
      const next = t.next
      if (!next) return events.length ? yes(events) : no('w planie nie ma następnego bloku')
      const cost = startCost(state, next, at) ?? groupCost(ctx, state, next.id, at)
      // The first click ends the running block; what comes next waits for the second (spec „Dalej kończy wtedy …”).
      if (cost && !act.confirm) return events.length ? yes(events, cost) : no('koszt do potwierdzenia', cost)
      const after: TimerNow = { ...t, fg: null }
      return yes([...events, ...startEvents(ctx, state, after, next, at, cost != null)])
    }
    case 'extend': {
      if (!(act.minutes > 0 && act.minutes <= MAX_BLOCK_MIN)) return no('długość przedłużenia')
      const target = act.block ? [t.fg, ...t.bg].find((x) => x?.info.id === act.block) ?? null : t.fg
      const ended = act.block ? state.facts.blocks.get(act.block) : null
      if (!target) {
        // A fixed block ended by its plan may still be extended within 30 min of its planned end (D227).
        const info = act.block ? byId.get(act.block) : undefined
        if (info?.fixed && ended?.endedAt != null && ended.endId && (ended.endRule === 'plan' || ended.endRule === 'fixedNoReaction')) {
          const end = plannedEndOf(state, info, ended)
          if (m > end + FIXED_EXTEND_WINDOW_MIN) return no('po 30 min od planowanego końca blok stały się nie przedłuża')
          const cost = workCost(state, info, Math.max(end, m), end + act.minutes, true)
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
      const cost = workCost(state, target.info, from, from + act.minutes - Math.max(0, m - target.plannedEnd), true)
      if (cost && !act.confirm) return no('koszt do potwierdzenia', cost)
      return yes([{ k: 'block.extend', block: target.info.id, at, minutes: act.minutes }])
    }
    case 'resize': {
      // D365: later is „Przedłuż” itself – the same cost, the same second click (up to the boundary none: at once), the same
      // event, a fixed block at most 30 min past its planned end; earlier moves the planned end back, never before now.
      // The end goes on the 5-min grid (index 0 is 04:00, a whole hour) and leaves the block at least 5 min long – the
      // window's rules, again here for a click from elsewhere; „before now” only by the minute, so a „Potwierdź” 10 s
      // after the drag still holds (T562). The end it already has writes nothing (a second „Potwierdź” finds it there).
      const target = [t.fg, ...t.bg].find((x) => x?.info.id === act.block) ?? null
      if (!target) return no('ten blok nie biegnie')
      if (!ownHourBlock(target.info)) return no('tego bloku nie zmienia się przeciągnięciem – „Przedłuż” w pasku')
      if (typeof act.to !== 'number' || !Number.isFinite(act.to)) return no('koniec bloku')
      const end = Math.round(idxOf(state.grid, act.to) / DRAG_STEP_MIN) * DRAG_STEP_MIN
      if (end < target.startedAt + MIN_BLOCK_MIN) return no(`najkrótszy blok to ${MIN_BLOCK_MIN} min`)
      const minutes = end - target.plannedEnd
      if (minutes > 0) return timerAction(ctx, state, { a: 'extend', block: target.info.id, minutes, ...(act.confirm ? { confirm: true } : {}) }, at)
      if (minutes === 0) return yes([])
      if (end < m) return no('koniec bloku przed teraz')
      if (-minutes > MAX_BLOCK_MIN) return no('długość skrócenia')
      return yes([{ k: 'block.shorten', block: target.info.id, at, minutes: -minutes }])
    }
    case 'workEnd': {
      const events: TimerDraft[] = []
      const fg = t.fg
      let end: number
      if (fg?.info.isWork) {
        end = endInstant(state, fg, at)
        events.push({ k: 'block.end', block: fg.info.id, at: end, done: isFixedLike(fg.info) ? null : true, rule: null, fin: true })
      } else {
        // Clicked when no work runs: it only confirms the earlier end – where the work stopped (`lastWorkStop`: a paused
        // block's too, which ends with the parking below; an end of the engine without a block).
        const last = lastWorkStop(state)
        end = last != null ? Math.min(at, atOf(state.grid, last)) : at
      }
      // The work of the parallel groups running ends with it (T1202, T1254) – done, as „Skończyłem”, whoever is in front (a meal
      // of the group, a request); a meal beside it goes on.
      for (const x of t.bg) if (x !== fg && x.fact.group != null && x.info.isWork && groupMate(x)) events.push({ k: 'block.end', block: x.info.id, at, done: true, rule: null })
      events.push({ k: 'work.end', at, end })
      // Blocks anchored to the one ending go with it – only a work block ends here (a meal in the foreground goes on).
      events.push(...workEndParking(state, fg?.info.isWork ? fg.info.id : null, at))
      return yes(events)
    }
    case 'finish': {
      const target = act.block ? [t.fg, ...t.bg].find((x) => x?.info.id === act.block) ?? null : t.fg?.info.rules.kind === 'session' ? t.fg : (t.bg.find((x) => x.info.rules.kind === 'session') ?? null)
      if (!target) return no('nie ma biegnącego bloku do zakończenia')
      return yes([{ k: 'block.end', block: target.info.id, at: endInstant(state, target, at), done: isFixedLike(target.info) ? null : true, rule: target.info.rules.kind === 'session' ? 'finished' : 'endNow', fin: true }])
    }
    case 'cancel': {
      const info = byId.get(act.block)
      const f = state.facts.blocks.get(act.block)
      if (!info) return no('nie ma takiego bloku w planie dnia')
      if (f?.startedAt != null) return no('ten blok już się zaczął')
      // After „Koniec pracy” that was only a break: cancelling the last fixed block of work left confirms the end, and
      // only then the flexible work is parked (D216).
      const lastEnd = state.facts.workEnds.at(-1)
      const after = lastEnd != null && info.fixed && isBoundaryWork(info) && !workSince(state.facts, lastEnd, setsWorkEnd(state))
      return yes([{ k: 'block.cancel', block: info.id, at, rule: 'user' }, ...(after ? workEndParking(state, null, at, info.id) : [])])
    }
    case 'park': {
      const info = byId.get(act.block)
      const f = state.facts.blocks.get(act.block)
      if (!info) return no('nie ma takiego bloku w planie dnia')
      if (f?.endedAt != null) return no(ALREADY_OVER)
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
      // A meal or a regeneration an answer to an absence made: its start and its end go back together (A1-09).
      let pair = a.rule === 'absenceMeal' || a.rule === 'absenceRegen' ? state.facts.autos.filter((x) => x.rule === a.rule && x.block === a.block && x.id !== a.id) : []
      // A block away from the computer begun by itself (D475): the automatic end of it goes back with its start (T1136) –
      // it never began.
      if (a.rule === 'awayStart' && a.k === 'block.start') {
        if (!awayStartUndoable(state, a)) return no('tego już nie cofniesz – blok zmienił się po starcie')
        pair = [...state.facts.autos.filter((x) => x.k === 'block.end' && x.block === a.block && state.facts.blocks.get(a.block!)?.endId === x.id), ...groupStartsWith(state, a)]
      }
      // „Jednym ciągiem” (D555): an end by the plan goes back with the blocks the app began after it before your return.
      if (a.rule === 'awayChain' && a.k === 'block.end') {
        const chained = awayChainUndo(ctx, state, a, at)
        if (chained == null) return no('tego już nie cofniesz – kolejny blok zmienił się po starcie')
        pair = chained
      }
      // A fixed start's pause and that start go back together, either way, while the fixed block runs and the flexible one
      // stands in that pause (the flexible block goes on as before, the fixed one stays unstarted – it can be started by
      // hand); afterwards the two are only information (D350).
      const fixedPair = fixedStartPair(state, a)
      if (fixedPair) {
        if (!fixedPair.alive) return no('tego już nie cofniesz – blok stały ruszył dalej według planu')
        pair = state.facts.autos.filter((x) => fixedPair.ids.includes(x.id) && x.id !== a.id)
      }
      // A fixed block that began its group (T1255): the rest of the group begun with it goes back too.
      const fixedLead = a.rule === 'fixedStart' && a.k === 'block.start' ? a : fixedPair ? state.facts.autos.find((x) => fixedPair.ids.includes(x.id) && x.k === 'block.start') : undefined
      if (fixedLead) pair = [...pair, ...groupStartsWith(state, fixedLead)]
      // One block of a group begun with it (T1256): its automatic end goes back with its start – while only the app ran it.
      if (a.rule === 'groupStart' && a.k === 'block.start' && a.block) {
        if (!untouched(state, a.block)) return no('tego już nie cofniesz – blok zmienił się po starcie')
        const end = state.facts.blocks.get(a.block)?.endId
        pair = state.facts.autos.filter((x) => x.id === end)
      }
      return yes([a, ...pair, ...(r ? resumedWith(state.facts, r) : [])].map((x) => ({ k: 'undo', at, target: x.id, reason: 'user' })))
    }
    case 'undoApproval': {
      // The boundary opens again from now on: the approvals stay written, so the minutes before keep the boundary they
      // had (the past of the day never changes); after it the proposal decides and the day never approves itself again
      // (A6-11 review). An approval in force is needed – the button is shown only then.
      if (state.boundary.approved == null) return no('granica nie jest zatwierdzona')
      return yes([{ k: 'boundary.undo', at }])
    }
    case 'cutOff': {
      if (state.facts.disconnect.some((d) => d.to === OPEN)) return no('„Odcinam się” już trwa')
      // A flexible block in the foreground pauses (after „Wracam” it waits as „Wznów · Zaparkuj”); a running block waiting
      // for „Zacznij” (a session) ends at the click (D206). Nothing is parked.
      const events: TimerDraft[] = [{ k: 'disconnect.start', at }]
      for (const tb of [t.fg, ...t.bg]) {
        if (!tb) continue
        if (tb.info.waits) events.push({ k: 'block.end', block: tb.info.id, at, done: null, rule: 'disconnect', autoRule: 'disconnect' })
        else if (tb === t.fg && !isFixedLike(tb.info)) events.push({ k: 'block.pause', block: tb.info.id, at, autoRule: 'disconnect' })
        // The parallel groups running pause with it, whoever is in front (T1203, T1254).
        else if (tb.fact.group != null && groupMate(tb)) events.push({ k: 'block.pause', block: tb.info.id, at, autoRule: 'disconnect' })
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
    case 'workedUntil': {
      // The time to explain as the bar shows it now (a stale click finds nothing): „praca” to now while it goes on, to its
      // end after „Koniec pracy” – and the end of work then; after a passive block counted as a project „projekt”, the
      // end of work stays the block's (D254, as the ritual's „Projekt do …”).
      const x = state.explains.find((e) => e.id === act.explain && !laterWork(state, e.from))
      const until = x ? workedUntilOf(x, m) : null
      if (!x || until == null) return no('nie ma czasu do wyjaśnienia po bloku pracy')
      const ms = x.to === OPEN ? at : atOf(state.grid, until)
      if (x.asProject) return yes([{ k: 'question.answer', at, question: x.id, answer: 'project', value: ms }, { k: 'work.end', at, end: atOf(state.grid, x.blockEnd) }])
      return yes([{ k: 'question.answer', at, question: x.id, answer: 'work', value: ms }, { k: 'work.end', at, end: ms }])
    }
    case 'mark':
      if (state.facts.answers.has(act.question)) return no('już odpowiedziane')
      return yes([{ k: 'question.answer', at, question: act.question, answer: act.answer, value: null }])
    case 'unmark': {
      const answer = state.facts.answers.get(act.question)
      if (!answer) return no('nie ma tej odpowiedzi')
      return yes([{ k: 'undo', at, target: answer.id, reason: 'answer' }])
    }
    case 'routineDone': {
      // The bar and „Dziś” save one state (D328): the first save closes both, a second one finds it saved.
      const routine = ctx.plan.find((p) => p.id === act.block)?.routine
      if (!routine) return no('ten blok nie ma rutyny', null, 'noRoutine')
      if (state.facts.routines.has(act.block)) return no('ta rutyna jest już zapisana', null, 'routineSaved')
      if (!ROUTINE_VERSIONS.includes(act.version)) return no('nieznana wersja rutyny')
      const steps = [...new Set(Array.isArray(act.steps) ? act.steps : [])].filter((s) => typeof s === 'string' && s.length > 0)
      if (!steps.length) return no('zaznacz co najmniej jeden krok')
      return yes([{ k: 'routine.done', dom: 'meta', at, block: act.block, routine, version: act.version, steps }])
    }
    case 'routineUndo': {
      const done = state.facts.routines.get(act.block)
      if (!done) return no('ta rutyna nie jest zapisana')
      return yes([{ k: 'undo', at, target: done.id, reason: 'user' }])
    }
    case 'removeBegun': {
      const f = state.facts.blocks.get(act.block)
      if (!f || f.startedAt == null) return no(NOT_BEGUN, null, 'notBegun')
      if (f.endedAt != null) return no(ALREADY_OVER, null, 'alreadyOver')
      // Ended as „Dalej” and „Skończyłem” end it (a fixed block past its window ends in its window); not done, and no
      // continuation for the ritual: the run so far stays in the day outside the plan.
      const running = [t.fg, ...t.bg, ...t.paused].find((x) => x?.info.id === act.block)
      return yes([{ k: 'block.end', block: act.block, at: running ? endInstant(state, running, at) : at, done: false, rule: REMOVED_RULE }])
    }
    case 'undoRemove': {
      const f = state.facts.blocks.get(act.block)
      if (!f?.endId || f.endRule !== REMOVED_RULE || f.endedAt == null) return no('tego bloku nie zdjęto z planu')
      // Only while nothing has begun since the removal itself (its place among the events, not minutes – as G1): another
      // block, a request or „Odcinam się” – the block would run beside it.
      if (begunSinceEnd(state, f)) return no('tego już nie cofniesz – po usunięciu zaczął się inny blok, prośba albo „Odcinam się”')
      return yes([{ k: 'undo', at, target: f.endId, reason: 'user' }])
    }
    case 'stepsFinish': {
      // D474: the last step ticked off ends the block now, done – a block that runs (in the foreground or the background) or
      // waits paused; ended as „Skończyłem” ends it (a fixed block past its window – in its window). One not begun: nothing.
      const f = state.facts.blocks.get(act.block)
      if (!f || f.startedAt == null) return no(NOT_BEGUN, null, 'notBegun')
      if (f.endedAt != null) return no(ALREADY_OVER, null, 'alreadyOver')
      const open = [t.fg, ...t.bg, ...t.paused].find((x) => x?.info.id === act.block)
      if (!open) return no('ten blok nie biegnie', null, 'notRunning')
      return yes([{ k: 'block.end', block: act.block, at: endInstant(state, open, at), done: isFixedLike(open.info) ? null : true, rule: STEPS_RULE, fin: true }])
    }
    case 'undoStepsFinish': {
      // Its „Cofnij” (T1105): the end taken back – the block runs on – while nothing has begun since (as „Cofnij” of a removal).
      const f = state.facts.blocks.get(act.block)
      if (!f?.endId || f.endRule !== STEPS_RULE || f.endedAt == null) return no('ten blok nie skończył się odhaczeniem kroków')
      if (begunSinceEnd(state, f)) return no('tego już nie cofniesz – po zakończeniu zaczął się inny blok, prośba albo „Odcinam się”')
      return yes([{ k: 'undo', at, target: f.endId, reason: 'user' }])
    }
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
 * „Koniec pracy” parks the rest of the day's flexible work blocks and the blocks anchored to the one it ends – but not
 * blocks of „po końcu pracy jak projekt” (D195), and nothing while a fixed work block is left in the plan (D216). A paused work block ends there, not done, as „Zaparkuj” ends it.
 */
export function workEndParking(state: DayState, ending: string | null, at: number, cancelling: string | null = null): TimerDraft[] {
  if (fixedWorkLeft(state, cancelling)) return []
  const scope = workEndScope(state, cancelling)
  const out: TimerDraft[] = []
  for (const b of state.blocks) {
    if (b.id === ending) continue
    if (pausedWork(state, b)) {
      out.push(pausedWorkEnd(b, at))
      continue
    }
    if (b.fixed || b.waits || b.rules.afterWorkAsProject || !scope.open(b)) continue
    const anchoredToEnding = ending != null && b.anchor === ending
    if ((isBoundaryWork(b) && scope.before(b)) || anchoredToEnding) out.push({ k: 'block.park', block: b.id, at, rule: 'workEnd', autoRule: 'workEnd' })
  }
  return out
}

/**
 * What „Koniec pracy” parks: blocks open in the plan (not begun, parked or cancelled; `cancelling` – a block cancelled
 * with these events) with a place in the forecast or the plan.
 */
function workEndScope(state: DayState, cancelling: string | null): { open: (b: BlockInfo) => boolean; before: (b: BlockInfo) => boolean } {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const open = (b: BlockInfo) => {
    const f = state.facts.blocks.get(b.id)
    return b.inPlan && b.id !== cancelling && (!f || (f.startedAt == null && f.parkedAt == null && f.cancelledAt == null))
  }
  const placed = new Map(state.forecast.map((p) => [p.block.id, p]))
  const before = (b: BlockInfo) => {
    const p = placed.get(b.id)
    const span = plannedSpan(b, byId)
    const from = p?.from ?? span?.start ?? null
    return from != null
  }
  return { open, before }
}

/**
 * A paused flexible work block – begun, not ended, not running (paused by you, „Odcinam się”, a request – a conscious
 * „Koniec pracy” in a request ends the block it interrupted, as in 1.0.0), not one of „po końcu pracy jak projekt”
 * (D195): what „Koniec pracy” ends (T514) and the close of the day.
 */
function pausedWork(state: DayState, b: BlockInfo): boolean {
  if (b.fixed || b.waits || b.rules.afterWorkAsProject || !isBoundaryWork(b)) return false
  const f = state.facts.blocks.get(b.id)
  return f?.startedAt != null && f.endedAt == null && !isRunning(f)
}

const pausedWorkEnd = (b: BlockInfo, at: number): TimerDraft => ({ k: 'block.end', block: b.id, at, done: false, rule: 'workEnd', autoRule: 'workEnd' })

/**
 * The close of the day (the ritual, „Jak zapisano”, G1) ends the paused work blocks as „Tak” on „Koniec pracy?” does
 * (`pausedWork`, not done, rule `workEnd` with „Cofnij”) – never while a request holds work (it writes nothing then).
 */
export function closePausedEnds(state: DayState, at: number): TimerDraft[] {
  return state.blocks.filter((b) => pausedWork(state, b)).map((b) => pausedWorkEnd(b, at))
}
