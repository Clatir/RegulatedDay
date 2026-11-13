/**
 * The widget in the main process (spec „Widget”, „Akcje widgetu wykonuje proces główny”): the view of the engine for the
 * bar at the top of the main window, the icon's panel and the desktop bar, and the icon; every click of the bar as an
 * action of the timer (a first click with a cost waits 10 s for the second, shown in place of its button; two clicks
 * within 0.5 s are one); the Windows notifications on by default (D230) – shown only by the leader, each once by its
 * stable id in the day's log.
 *
 * Until a data folder is open the widget shows one neutral line („Brak folderu danych · Otwórz okno”, D327).
 */
import type { EditEntry, EditGuard, EditOutcome, RawRecord, TimerIn, TimerResult, ViewKind } from '@shared/api'
import { blockName, nameById } from '@shared/blockName'
import { namingOf } from '@shared/engine/context'
import { costText } from '@shared/costText'
import { dayRaw, putBlock } from '@shared/data/dayEdits'
import { inverseEdit, recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { engineView, POOL_TEXT, RESERVE_REGEN_MIN, warnDeadlines } from '@shared/engineView'
import { plannedSpan, type BlockInfo } from '@shared/engine/blocks'
import { reserveMessageId } from '@shared/engine/game'
import { closeGap, gapId, gapNow, gapsNow, gapText } from '@shared/engine/gaps'
import { atOf } from '@shared/engine/grid'
import { hardEndCurrent, hardEndMessage, type HardEndNow } from '@shared/engine/hardEnd'
import { classModeEnd, fewerAt, modesOf, type ModePrefs, type Modes } from '@shared/engine/modes'
import { suggestRegen } from '@shared/engine/reserve'
import { timerNow, type TimerNow } from '@shared/engine/timer'
import { pushedText } from '@shared/engine/pushApart'
import { energyOrderVariant } from '@shared/engine/energyOrder'
import { casesFrom, isDone, taskAnswerRaw } from '@shared/engine/cases'
import { tickEdits } from '@shared/engine/steps'
import { dayPlan } from '@shared/engine/createDay'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { applyVariant, keepPlan, markerCause, planCause, variantCauses, variantsFor, type Variant, type VariantCause, type VariantTrigger } from '@shared/engine/variants'
import type { NoticeKind } from '@shared/machine'
import { POOLS, REGEN_CATEGORY, type Pool } from '@shared/model/categories'
import { newId } from '@shared/model/ids'
import { dayFileFrom } from '@shared/model/plan'
import { personName } from '@shared/model/rd'
import { allDayFrom, type AllDayEvent } from '@shared/model/allDay'
import { ROUTINE_VERSION_NAMES, ROUTINE_VERSIONS, routineFrom, type Routine, type RoutineVersion } from '@shared/model/routines'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { answered } from '@shared/engine/care'
import { batteryLine, NO_SYNC, syncLines } from '@shared/sync/syncLines'
import { noFolderView, SEEN_LINE, UNDO_LINE_MS, type BarPending, type BarRoutine, type WidgetView } from '@shared/widget'
import type { DataFolder } from './data/folder'

const CONFIRM_MS = 10_000
/** Two clicks within this count as one (spec „Potwierdzenie przedłużenia”). */
export const DOUBLE_MS = 500
const REFRESH_MS = 15_000
/** A refused or failed click says why in the bar this long. */
const NOTE_MS = 6_000
const MIN = 60_000
/** The questions of the engine (their ids: rule:day:block:threshold) – only they are marked seen. */
const QUESTION_ID = SEEN_LINE
/** The bar shows this many lines (one in the quiet modes); the rest gathers in „⋯”. */
export const shownLineCount = (v: Pick<WidgetView, 'quiet'>): number => (v.quiet ? 1 : 2)

export interface NotifyIn {
  id: string
  title: string
  body: string
  line: string | null
  day: string | null
}

export interface WidgetDeps {
  folder: () => DataFolder | null
  /** Without an open folder: none chosen, one opening, one failing (the bar says which – the window says the same). */
  folderStatus?: () => 'none' | 'opening' | 'failed'
  timer: (click: TimerIn) => Promise<TimerResult>
  /** Edits of records as the window writes them (the hub tells the windows at once). */
  edit: (entries: EditEntry[]) => Promise<EditOutcome[]>
  answer: (id: string, answer: string, value: number | null) => Promise<TimerResult>
  seen: (ids: string[], how: 'panel' | 'main' | 'notification' | 'bar') => Promise<unknown>
  clickedApp: () => void
  modePrefs: () => ModePrefs
  notices: () => Record<NoticeKind, boolean>
  /** A notification shown (false: not shown at all); `onFailed` – Windows did not take it after all. */
  notify: (n: NotifyIn, onFailed?: () => void) => boolean
  /** The notification state of Windows from the helper (`accepts`, `busy`, `quietTime`…; `unknown` – not read, A4-07);
   *  undefined: always `accepts`. */
  notificationState?: () => Promise<string>
  /** You are at the computer now: a notification Windows did not take comes again only then (A4-07); undefined: always. */
  present?: () => boolean
  showMain: (page?: string) => void
  emit: (view: WidgetView) => void
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  now?: () => number
  /** The monotonic clock (ms): the double click and the cost waiting for its second click never follow a clock set back or forward (raport 751). */
  mono?: () => number
  /** The battery saver is on, on a battery, with the data folder in OneDrive (spec „Kilka komputerów”, once a day). */
  batterySaver?: () => boolean
  /** The backups as the data service knows them (its last daily backup failed – A3-06). */
  backup?: () => { failed: { error: string } | null } | null
  /** The quick capture (D385, D402): a task of your own into „Skrzynka” – the field of the bar; why, when not saved. */
  quickAdd?: (title: string) => Promise<{ ok: boolean; error: string | null }>
  /** „+” of the desktop bar (T756): it takes no keys – the icon's panel opens at the cursor with the field. */
  openQuick?: () => void
}

/** `until` here is on the monotonic clock (`WidgetEngine.mono`); the view gets what is left of it (`left`). */
interface Pending extends Omit<BarPending, 'left'> {
  until: number
  redo: () => Promise<TimerResult>
  /** „Przedłuż”: the length waiting for the second click (changed in steps of 15 min – T289), and its block (none: the one in front). */
  minutes?: number
  block?: string
}

/** The longest extension of „Przedłuż” by its steps. */
export const EXTEND_MAX_MIN = 180

/** Windows shows a notification in this state (A4-07): it accepts them, or the state could not be read. */
const takesNotifications = (state: string): boolean => state === 'accepts' || state === 'unknown'

/**
 * The tone of a warning (spec: quiet at 5 and 0 min): only when the step of the same block (and plan) changes to 5 or 0
 * – never at the start of the app, nor when the view comes back from no folder with a block already over its end.
 */
export function toneOnChange(prev: { block: string; warn: string } | null, view: WidgetView): { next: { block: string; warn: string } | null; play: 'five' | 'zero' | null } {
  const next = view.day ? { block: `${view.day}|${view.block?.name ?? ''}|${view.block?.endsAt ?? ''}`, warn: view.warn } : null
  const changed = !!next && !!prev && prev.block === next.block && prev.warn !== next.warn
  return { next, play: changed && view.soundOk && (view.warn === 'five' || view.warn === 'zero') ? view.warn : null }
}

/**
 * How long until the next warning step (ms) – 15 · 5 · 0 min before each of `warnDeadlines`: the countdown's 0:00 of the
 * block in front („Dalej?” too, E4a.1) and the start of a fixed block – when it comes before the next refresh, else null:
 * the view is counted again at that instant, not up to 15 s after the countdown reached it. The next step after the
 * view's own instant (`viewAt`), from `now` – one that passed while the view was being counted comes at once (0).
 */
export function stepDelay(deadlines: readonly number[], viewAt: number, now = viewAt): number | null {
  const at = Math.min(...deadlines.flatMap((d) => [d - 15 * MIN, d - 5 * MIN, d]).filter((x) => x > viewAt))
  return Number.isFinite(at) && at - viewAt <= REFRESH_MS ? Math.max(0, at - now) : null
}

/** What the bar says of a click of a block that is not in the day's plan any more (a step's tick – T793). */
const BLOCK_GONE = 'Tego bloku już nie ma w planie.'

/** „Zapisano: … · Cofnij” of a routine saved from the bar stays this long. */
const ROUTINE_UNDO_MS = 60_000

/**
 * What the window says it pushed apart (D367, IPC `planPushed`): a day, how many blocks, the one edit of that day's file it
 * saved (never a removal) and the file it created – anything else is not taken.
 */
export function pushedIn(day: unknown, count: unknown, entry: unknown, made: unknown): { day: string; count: number; edit: { entry: EditEntry; made: RawRecord | null } } | null {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 1000) return null
  const e = entry as Partial<EditEntry> | null
  if (!e || typeof e !== 'object' || e.rel !== paths.day(day) || e.remove || !Array.isArray(e.edits) || !e.edits.every((x) => x && Array.isArray(x.path))) return null
  const created = e.create === true
  const file = created && made && typeof made === 'object' && !Array.isArray(made) ? (made as RawRecord) : null
  return { day, count, edit: { entry: { rel: e.rel, edits: e.edits, ...(created ? { create: true } : {}) }, made: file } }
}

/**
 * The IPC `planPushed` (D367): what the window pushed apart is taken at once – the line and the marker's trigger – and the
 * bar is counted again in the background: the window's save (its „Dodaj”, its drop) never waits for the bar.
 */
export function planPushedIpc(w: Pick<WidgetEngine, 'pushed'>, log: WidgetDeps['log'], day: unknown, count: unknown, entry: unknown, made: unknown, line?: unknown): void {
  const p = pushedIn(day, count, entry, made)
  if (p) void w.pushed(p.day, p.count, p.edit, line !== false).catch((e) => log('warn', 'pasek nie przeliczył się po przesunięciu bloków', e))
}

/** The bar's note when a variant picked finds the plan as it would make it (D378). */
export const PLAN_ALREADY = 'Plan już jest tak ułożony.'

/** The longest label of a variant the window may give the bar (its line „Przestawiono: …”). */
const ARRANGED_LABEL_MAX = 200

/**
 * What the window says it arranged (D369, IPC `planArranged`): a day, the variant's label and the one edit of that day's
 * file it saved (as `pushedIn` takes it) – anything else is not taken.
 */
export function arrangedIn(day: unknown, label: unknown, entry: unknown, made: unknown): { day: string; label: string; edit: { entry: EditEntry; made: RawRecord | null } } | null {
  if (typeof label !== 'string' || !label.trim() || label.length > ARRANGED_LABEL_MAX) return null
  const p = pushedIn(day, 1, entry, made)
  return p ? { day: p.day, label, edit: p.edit } : null
}

/** The IPC `planArranged` (D369): the bar's line at once, the bar counted again in the background (the window never waits). */
export function planArrangedIpc(w: Pick<WidgetEngine, 'arranged'>, log: WidgetDeps['log'], day: unknown, label: unknown, entry: unknown, made: unknown): void {
  const a = arrangedIn(day, label, entry, made)
  if (a) void w.arranged(a.day, a.label, a.edit).catch((e) => log('warn', 'pasek nie przeliczył się po ułożeniu pod energię', e))
}

/** A line of a change of the plan with its own „Cofnij” (T502): its edits, the files it created, the regeneration it started. */
interface Moved {
  text: string
  day: string
  edits: Array<{ entry: EditEntry; made: RawRecord | null }>
  started: string | null
  until: number
  /** Counts the lines: the newest first. */
  seq: number
}

/** The bar while the day cannot be counted (a file not readable now): no actions, one line why. */
function unknownView(): WidgetView {
  return { ...noFolderView(), lines: [{ id: 'unknown', text: 'Dnia nie da się teraz policzyć (plik jeszcze nieczytelny) – pasek wróci sam.', actions: [], dot: false }], tooltip: 'Dzień nieznany – czekam na pliki' }
}

export class WidgetEngine {
  private view: WidgetView | null = null
  private pending: Pending | null = null
  /** The monotonic clock like every term of the bar (`until`): a wall clock set meanwhile changes none of them. */
  private note: { text: string; until: number } | null = null

  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<void> | null = null
  private again = false
  /** The block „Start: …” would start (from the last view). */
  private nextBlock: string | null = null
  private failing = false
  private lastClick = { key: '', at: Number.NEGATIVE_INFINITY }
  private model: Awaited<ReturnType<DataFolder['widgetModel']>> | null = null
  /** The names of the last view's day (the variants' labels). */
  private names: Parameters<typeof blockName>[1] | null = null
  /**
   * The marker of variants (D313, spec „Dla jednej przyczyny znacznik pojawia się raz”): the causes whose marker was in
   * the bar, those closed or no longer holding (never again), the session or class mode now and the last one (a trigger
   * in it is checked at its end), the marker's cause now.
   */
  private readonly markerShown = new Set<string>()
  private readonly markerDone = new Set<string>()
  private quietFrom: number | null = null
  private lastQuiet: { from: number; to: number } | null = null
  private markerNow: VariantCause | null = null
  /** The causes holding now: closing the panel closes all of them (the marker never comes back for another of them). */
  private causesNow: VariantCause[] = []
  /** The open panel of variants – one for every window (the main process owns it): its cause and its variants. */
  private panel: { cause: VariantCause | null; variants: Variant[] } | null = null
  /**
   * The lines of changes of the plan, each with its own „Cofnij” for 15 min (line `moved:<kind>`): „Przestawiono: …” after
   * a variant (D313, T502) and „Przesunięto N bloków” after blocks pushed apart in the main window (D367). A variant
   * replaces only the variant's line, a push only the push's.
   */
  private readonly moved = new Map<'variant' | 'push', Moved>()
  private movedSeq = 0
  /** Blocks pushed apart today (D367): triggers of the marker of variants the log does not hold (this computer's bar). */
  private pushes: Array<{ day: string; trigger: VariantTrigger }> = []
  /** „Zapisano: … · Cofnij” after a routine saved from the bar (D328). */
  private routineSaved: { block: string; day: string; text: string; until: number } | null = null

  constructor(private readonly d: WidgetDeps) {}

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  private get mono(): number {
    return this.d.mono?.() ?? performance.now()
  }

  /** The view now (the neutral bar until the engine has one). */
  current(): WidgetView {
    const v = this.view
    if (!v) return noFolderView(this.d.folderStatus?.() ?? 'none')
    if (!v.pending && !v.note) return v
    // The terms (the cost waiting, the note) say what is left of them when the view is sent – each time, also for the view
    // sent again to a window that opens (the window counts them from the moment it receives it).
    const mono = this.mono
    const pending = v.pending && this.pending && this.pending.until > mono ? { ...v.pending, left: this.pending.until - mono } : null
    const note = v.note && this.note && this.note.until > mono ? { ...v.note, left: this.note.until - mono } : null
    return { ...v, pending, note }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.stepAt([], 0)
  }

  /** The refresh at the next warning step (`stepDelay`) – only while the engine runs (`start`). */
  private step: ReturnType<typeof setTimeout> | null = null

  /** The steps after the view's instant (`viewAt`), waited for from the instant the timer is set (a slow refresh). */
  private stepAt(deadlines: readonly number[], viewAt: number): void {
    if (this.step) clearTimeout(this.step)
    this.step = null
    const delay = this.timer ? stepDelay(deadlines, viewAt, this.now) : null
    if (delay == null) return
    // A few ms past the step: the refresh never comes just before it.
    this.step = setTimeout(() => void this.refresh(), delay + 5)
    this.step.unref?.()
  }

  /** The view counted again (after a check of the folder, a click, a change of a setting); one at a time. */
  refresh(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.refreshNow().finally(() => {
      this.running = null
      if (this.again) {
        this.again = false
        void this.refresh()
      }
    })
    return this.running
  }

  private async refreshNow(): Promise<void> {
    const folder = this.d.folder()
    if (!folder) {
      this.view = null
      this.stepAt([], 0)
      this.d.emit(this.current())
      return
    }
    const now = this.now
    const mono = this.mono
    let notices: (() => Promise<void>) | null = null
    try {
      const m = await folder.widgetModel(now)
      this.model = m
      const rd = m.rd
      const routines = (await folder.collection('routine').catch(() => [])).map(routineFrom).filter((x): x is Routine => !!x)
      // The records of „Sprawy” – the tasks and the requests (their names, „Zadanie zrobione?”).
      const requests = casesFrom(await folder.collection('request').catch(() => []))
      // A collection not readable now leaves the bar without the label, never without the bar (D405).
      const allDay = (await folder.collection('allDay').catch(() => [])).map(allDayFrom).filter((x): x is AllDayEvent => !!x)
      const names = { rd, settings: m.state.settings, routines, requests }
      if (this.pending && this.pending.until <= mono) this.pending = null
      if (this.note && this.note.until <= mono) this.note = null
      const timer = timerNow(m.state)
      const modePrefs = this.d.modePrefs()
      const modes = modesOf(m.state, timer, m.ctx.events, now, modePrefs)
      const hardEnd = hardEndCurrent(m.state, timer)
      this.nextBlock = timer.next?.id ?? null
      this.view = {
        ...engineView({
          ctx: m.ctx,
          state: m.state,
          energy: m.energy,
          activity: m.activity,
          now,
          name: (b) => blockName(b, names),
          care: { waterOn: rd.general.modules.water, waterEveryMin: rd.general.waterEveryMin, breakAfterMin: rd.general.breakAfterMin, solitudeAfterMin: rd.general.solitudeAfterMin },
          modePrefs,
          timer,
          modes,
          hardEnd,
          // Only what the windows show (the view goes over IPC – no function in it).
          pending: this.pending ? { button: this.pending.button, text: this.pending.text, left: this.pending.until - mono, ...(this.pending.minutes != null ? { steps: true } : {}) } : null,
          computer: folder.computers[0]?.id,
          people: m.people,
          person: (id) => personName(rd, id),
          carried: m.carried,
          ritualFrom: await folder.ritualDay(),
          routines,
          cases: requests,
          allDay
        }),
        note: this.note ? { text: this.note.text, left: this.note.until - mono } : null
      }
      this.names = names
      this.gapView(m, now, modes)
      this.variantsView(m, now, mono, modes)
      this.syncView(folder, now)
      this.linesLast()
      if (this.failing) this.d.log('info', 'widget: dzień znów policzony')
      this.failing = false
      // Notifications are the leader's, and only once settled – after a start or a wake the other computers' logs (their
      // shown notices) come first, so nothing is shown twice (spec „Kilka komputerów”, A8-03). After the view is out: a
      // slow helper (the state of notifications) never holds the bar back.
      if (folder.leader.iLead && !folder.unavailable && folder.settle.settled(folder.clock.now())) notices = () => this.notices(folder, m, (b) => blockName(b, names), now, modes, timer, hardEnd, modePrefs)
    } catch (e) {
      // The day cannot be counted now: a bar without actions says so (never the last view with a stale countdown).
      if (!this.failing) this.d.log('warn', 'widok widgetu nie policzył się', e)
      this.failing = true
      this.model = null
      this.view = unknownView()
      this.awayView(folder)
    }
    // The warning steps of the view's own day (none while the widget is hidden or the day not counted).
    const v = this.current()
    this.stepAt(this.model && !v.hidden ? warnDeadlines(this.model.state, v.block?.endsAt ?? null, now) : [], now)
    this.d.emit(v)
    if (notices) await notices().catch((e) => this.d.log('warn', 'powiadomienia nie policzyły się', e))
  }

  /**
   * „Luka N min · Przesuń resztę wcześniej · Zostaw” (D368, D373): a quiet line (no dot, no notification, no sound) for
   * the nearest gap before a flexible block – only today; never in a session, classes, the night or „Odcinam się”, after
   * them while the gap is there (`gapNow`: the triggers of the day's log – also the window's `plan.freed`, D375).
   */
  private gapView(m: NonNullable<WidgetEngine['model']>, now: number, modes: Modes): void {
    const v = this.view!
    const date = m.state.grid.date
    if (v.hidden || v.night || modes.session || modes.classMode || date !== logicalDayOf(now)) return
    const gap = gapNow(m.ctx, m.state)
    if (gap)
      v.lines = [
        ...v.lines,
        {
          id: gap.id,
          text: gapText(gap.minutes),
          actions: [
            { id: 'close', label: 'Przesuń resztę wcześniej' },
            { id: 'leave', label: 'Zostaw' }
          ],
          dot: false
        }
      ]
  }

  /**
   * The line's gap counted again on the day as it is at the click: the gap whose triggers hold the line's own (its id –
   * `gap:<day>:<key>`; another gap may stand nearer now). Null: gone (a block begun meanwhile, a plan changed).
   */
  private async gapOfLine(line: string, day: string | undefined) {
    const folder = this.d.folder()
    const m = folder ? await folder.widgetModel(this.now) : null
    if (!folder || !m || !day || day !== m.state.grid.date || !line.startsWith(`gap:${day}:`)) return null
    const key = line.slice(`gap:${day}:`.length)
    const gap = gapsNow(m.ctx, m.state).find((x) => x.keys.includes(key))
    return gap ? { folder, m, gap, day } : null
  }

  /**
   * „Zostaw” (D368): an answer for each trigger of the line's gap – the line's own first (refused – answered on another
   * computer meanwhile – says why); its gap gone, the line's own only. The question never comes back for them.
   */
  private async leaveGap(line: string, day: string | undefined): Promise<void> {
    const now = await this.gapOfLine(line, day)
    const r = await this.d.timer({ a: 'mark', question: line, answer: 'leave', day })
    if (!r.ok && r.why) this.say(r.why)
    if (now) for (const k of now.gap.keys) if (gapId(now.day, k) !== line) await this.d.timer({ a: 'mark', question: gapId(now.day, k), answer: 'leave', day: now.day })
    return this.refresh()
  }

  /**
   * „Przesuń resztę wcześniej” (D368, T602): the gap counted again on the day as it is at the click (gone – nothing
   * written); the answers first – one for each trigger of the gap, so no other view, refresh or computer moves it a second
   * time (the line's own refused – answered elsewhere meanwhile: nothing moves) – then the new starts of its blocks as one
   * edit of the day's file with „Przesunięto N bloków · Cofnij” as after a push (D367, D313 – the same line and „Cofnij”).
   * An edit refused, in conflict or failed takes the answers back (`unmark` – an `undo` of each): the question stays.
   */
  private async closeGapNow(line: string, day: string | undefined): Promise<void> {
    const now = await this.gapOfLine(line, day)
    const out = now ? closeGap(now.m.ctx, now.m.state, now.gap) : []
    if (!now || !out.length) {
      this.say('Tej luki już nie ma.')
      return this.refresh()
    }
    const { folder, m, gap } = now
    const questions = [line, ...gap.keys.map((k) => gapId(now.day, k)).filter((q) => q !== line)]
    const answered: string[] = []
    for (const q of questions) {
      const r = await this.d.timer({ a: 'mark', question: q, answer: 'close', day: now.day })
      if (r.ok) answered.push(q)
      else if (q === line) {
        if (r.why) this.say(r.why)
        return this.refresh()
      }
    }
    const takeBack = async () => {
      for (const q of answered) {
        const r = await this.d.timer({ a: 'unmark', question: q, day: now.day }).catch((e: unknown) => ({ ok: false, why: e instanceof Error ? e.message : String(e) }))
        if (!r.ok) this.d.log('warn', `luka ${q}: odpowiedź nie cofnęła się po nieudanym przesunięciu (${r.why ?? 'bez powodu'})`)
      }
    }
    try {
      const rel = paths.day(now.day)
      const before = ((await folder.recordView(rel)) as RawRecord | undefined) ?? null
      let after = dayRaw(before, now.day)
      for (const p of out) {
        const b = dayFileFrom(after, now.day).blocks.find((x) => x.id === p.id) ?? m.ctx.plan.find((x) => x.id === p.id)
        if (b) after = putBlock(after, { ...b, startMin: p.startMin })
      }
      const entry = recordEdit(rel, before, after)
      if (!entry) {
        await takeBack()
        this.say('Tej luki już nie ma.')
        return this.refresh()
      }
      const res = await this.d.edit([entry])
      if (res.some((o) => o.status !== 'applied' && o.status !== 'waiting')) {
        await takeBack()
        this.say('Przesunięcie spotkało się ze zmianą z innego komputera – odpowiedz na pytanie w oknie głównym.')
        return this.refresh()
      }
      this.moved.set('push', { text: pushedText(out.length), day: now.day, edits: [{ entry, made: entry.create ? after : null }], started: null, until: this.mono + UNDO_LINE_MS, seq: ++this.movedSeq })
    } catch (e) {
      await takeBack()
      throw e
    }
    return this.refresh()
  }

  /** The marker and the open panel of variants in the view, and the line „Przestawiono: … · Cofnij” (D313). */
  private variantsView(m: NonNullable<WidgetEngine['model']>, now: number, mono: number, modes: Modes): void {
    const v = this.view!
    const date = m.state.grid.date
    const quiet = modes.session || modes.classMode
    if (quiet) this.quietFrom ??= now
    else if (this.quietFrom != null) {
      this.lastQuiet = { from: this.quietFrom, to: now }
      this.quietFrom = null
    }
    // The causes are the day's (their ids carry it): those of another day are no longer needed.
    for (const set of [this.markerShown, this.markerDone]) for (const id of [...set]) if (!id.startsWith(`variants:${date}:`)) set.delete(id)
    // A push of another day is no trigger of this one. The day's pushes stay all day, as the log's triggers do: a marker
    // shown for one stays while its condition holds (`markerCause` brings a new one only within its 5 min).
    this.pushes = this.pushes.filter((p) => p.day === date)
    const causes = variantCauses(m.state, m.energy, this.pushes.map((p) => p.trigger))
    this.causesNow = causes
    // A cause whose marker was shown and no longer holds is done: its marker never comes back.
    for (const id of [...this.markerShown]) {
      if (causes.some((c) => c.id === id)) continue
      this.markerShown.delete(id)
      this.markerDone.add(id)
    }
    this.markerNow = markerCause(causes, { shown: this.markerShown, done: this.markerDone, quiet, lastQuiet: this.lastQuiet, now })
    if (this.markerNow) this.markerShown.add(this.markerNow.id)
    v.variants = { marker: !!this.markerNow && !v.hidden && !v.night, open: this.panel && !v.hidden ? this.panel.variants.map((x) => ({ id: x.id, label: x.label, ...(x.details?.length ? { details: x.details } : {}) })) : null }
    for (const [kind, mv] of [...this.moved]) if (mv.until <= mono) this.moved.delete(kind)
    // The newest first; after every line of the day (`linesLast`): the bar shows one of them at most, the other waits in
    // „⋯” with its „Cofnij” (`barLines`).
    const movedLines = [...this.moved].sort((a, b) => b[1].seq - a[1].seq).map(([kind, mv]) => ({ id: `moved:${kind}`, text: mv.text, actions: [{ id: 'undo', label: 'Cofnij' }], dot: false }))
    if (movedLines.length && !v.hidden) v.lines = [...v.lines, ...movedLines]
    // A routine saved from the bar (D328): its „Cofnij” for a while, in place of its line.
    if (this.routineSaved && (this.routineSaved.until <= mono || this.routineSaved.day !== date)) this.routineSaved = null
    if (this.routineSaved && !v.hidden) v.lines = [...v.lines, { id: `routineSaved:${this.routineSaved.block}`, text: this.routineSaved.text, actions: [{ id: 'undo', label: 'Cofnij' }], dot: false }]
  }

  /**
   * The quiet lines of the computers and their files (A8-02, A8-07, A3-06, A3-07) after the day's own: changes waiting
   * for a folder that is not there, a failed backup, OneDrive, questions on another computer too, a computer taken for
   * asleep, a clock ahead, the battery once a day („OK” hides it to the day's end).
   */
  private syncView(folder: DataFolder, now: number): void {
    const v = this.view!
    if (v.hidden || v.night || v.day == null) return
    // Its „OK” is the day's answer in the log (per computer): never again that day, also after a start of the app.
    const battery = (this.d.batterySaver?.() ?? false) && !answered(this.model?.ctx.events ?? [], batteryLine(v.day, folder.presence.own.computer))
    v.lines = [...v.lines, ...syncLines({ ...folder.syncState(now), battery, backupFailed: this.d.backup?.()?.failed != null }, now, v.day, folder.presence.own.computer)]
  }

  /**
   * The order of the lines at the end: the hard end's line after the day's other lines (the routine saved, the lines of
   * the computers and the battery), and the lines of changes with their „Cofnij” (`moved:`, D367) after all of the day's –
   * the bar shows one of them at most (`barLines`), never in place of a question or a warning.
   */
  private linesLast(): void {
    const v = this.view!
    const moved = (l: { id: string }) => l.id.startsWith('moved:')
    const hard = (l: { id: string }) => l.id.startsWith('hardEnd:')
    v.lines = [...v.lines.filter((l) => !hard(l) && !moved(l)), ...v.lines.filter(hard), ...v.lines.filter(moved)]
  }

  /** A day not counted now while the folder is away: the changes waiting for it still say so (A3-07). */
  private awayView(folder: DataFolder): void {
    const v = this.view!
    const s = folder.syncState(this.now)
    if (!s.unsynced) return
    v.lines = [...v.lines, ...syncLines({ ...NO_SYNC, unsynced: s.unsynced, folderAway: s.folderAway }, this.now, logicalDayOf(this.now))]
  }

  /** The marker closed – „Zostaw” or a variant done: every cause holding now with it (it never comes back for them). */
  private closeCauses(cause: VariantCause): void {
    for (const c of [cause, ...this.causesNow]) {
      this.markerShown.delete(c.id)
      this.markerDone.add(c.id)
    }
  }

  /**
   * The panel of variants opened (the marker, or „Przestaw plan” without it): counted now for its cause, with „Ułóż pod
   * energię” before its last „Zostaw” when today's order can clearly raise the lowest energy (D369, D374, T612) – also without
   * a cause (then with „Zostaw plan”). Neither – the plan fits.
   */
  private async openVariants(): Promise<void> {
    const m = this.model
    const names = this.names
    if (!m || !names) return
    const cause = this.markerNow ?? planCause(m.state, m.energy, this.now)
    const naming = namingOf(m.ctx, m.state.facts)
    const nameOf = (b: BlockInfo) => nameById(b.id, naming, names)
    // Only the day that is today (a bar still on yesterday's block through 04:00 has none).
    const order = m.state.grid.date === logicalDayOf(this.now) ? energyOrderVariant(m.ctx, m.state, m.energy, nameOf) : null
    if (!cause && !order) {
      this.say('Plan się mieści – nie ma czego przestawiać.')
      return this.refresh()
    }
    const variants = cause ? variantsFor(m.ctx, m.state, cause, nameOf) : [keepPlan(m.ctx, m.state)]
    if (order) variants.splice(variants.length - 1, 0, order)
    this.panel = { cause, variants }
    return this.refresh()
  }

  /**
   * A variant clicked by its id (D313): the plan changes at once – the days' files as edits through the hub (the windows
   * see it at once; a block moved to tomorrow goes there, a regeneration of a variant of energy starts) – and the bar keeps
   * „Przestawiono: … · Cofnij”; „Zostaw” (no change) closes the panel and the marker. Its causes are done once the plan
   * changed (a refused edit leaves the marker) – not by a variant that mends none of them (`mends: false` – „Ułóż pod
   * energię”, D379, T614: the marker stays while its cause holds). A variant whose edit came out empty (the plan already
   * so, made elsewhere) writes nothing and leaves the line of an earlier change with its „Cofnij”: one of the cause closes
   * its causes as before (D313, T623), „Ułóż pod energię” says „Plan już jest tak ułożony.” (D378, T618).
   */
  private async pickVariant(id: string | undefined): Promise<void> {
    const p = this.panel
    const m = this.model
    const folder = this.d.folder()
    const v = p?.variants.find((x) => x.id === id)
    if (!p || !v || !m || !folder) return
    this.panel = null
    if (!v.changes.length) {
      if (p.cause) this.closeCauses(p.cause)
      return this.refresh()
    }
    const day = m.state.grid.date
    const next = addDays(day, 1)
    const rels = [paths.day(day), paths.day(next)] as const
    const before = await Promise.all(rels.map(async (rel) => ((await folder.recordView(rel)) as RawRecord | undefined) ?? null))
    const after = applyVariant(m.ctx, before[0]!, before[1]!, v, next)
    const made = [after.today, after.tomorrow]
    const edits = rels.flatMap((rel, k) => {
      const entry = recordEdit(rel, before[k]!, made[k]!)
      return entry ? [{ entry, made: made[k]! }] : []
    })
    if (!edits.length) {
      if (v.mends === false) this.say(PLAN_ALREADY)
      else if (p.cause) this.closeCauses(p.cause)
      return this.refresh()
    }
    const out = await this.d.edit(edits.map((x) => x.entry))
    if (out.some((o) => o.status !== 'applied' && o.status !== 'waiting')) {
      this.say('Wariant spotkał się ze zmianą z innego komputera – odpowiedz na pytanie w oknie głównym.')
      return this.refresh()
    }
    if (p.cause && v.mends !== false) this.closeCauses(p.cause)
    let started: string | null = null
    if (after.start) {
      const r = await this.d.timer({ a: 'start', block: after.start, day })
      if (r.ok) started = after.start
      else if (r.why) this.say(r.why)
    }
    this.moved.set('variant', { text: `Przestawiono: ${v.label}`, day, edits, started, until: this.mono + UNDO_LINE_MS, seq: ++this.movedSeq })
    return this.refresh()
  }

  /**
   * Blocks pushed apart in the main window (D367) – `count` blocks, written by the window as one edit of the day's file
   * (`edit`, `made` – the file it created): the bar keeps „Przesunięto N bloków · Cofnij” as after a variant (D313), its
   * „Cofnij” taking that edit back the same way (T502) – beside a variant's line, which stays – and the push checks the
   * marker of variants of today by its own conditions (`variantCauses`). The state is set before the bar is counted again
   * (the promise is that count). `line` false (D400, a „Dodaj” of the week – its one „Cofnij” is in the window): the
   * trigger of the marker only, no line.
   */
  pushed(day: string, count: number, edit: { entry: EditEntry; made: RawRecord | null }, line = true): Promise<void> {
    if (count < 1) return Promise.resolve()
    const now = this.now
    if (line) this.moved.set('push', { text: pushedText(count), day, edits: [edit], started: null, until: this.mono + UNDO_LINE_MS, seq: ++this.movedSeq })
    this.pushes.push({ day, trigger: { id: `push:${now}`, at: now } })
    return this.refresh()
  }

  /**
   * „Ułóż pod energię” clicked in the morning plan (D369): the window saved the new order as one edit of today's file
   * (`edit`, `made` – the file it created); the bar keeps „Przestawiono: <label> · Cofnij” as after a variant picked in it
   * (D313) – its „Cofnij” takes that edit back the same way (T502). No trigger of the marker: after the approval the variant
   * adds no extension, before it the end of work stays within the day's maximum (T617) – the marker's own conditions are
   * checked at its usual triggers. An open panel of variants closes (D379, T614): its variants were counted on the plan before
   * the change.
   */
  arranged(day: string, label: string, edit: { entry: EditEntry; made: RawRecord | null }): Promise<void> {
    this.panel = null
    this.moved.set('variant', { text: `Przestawiono: ${label}`, day, edits: [edit], started: null, until: this.mono + UNDO_LINE_MS, seq: ++this.movedSeq })
    return this.refresh()
  }

  /**
   * „Cofnij” of a variant (T502) or of a push (D367): its own edits taken back (a field changed since is a question, a file
   * it created goes only while it is as it made it); a regeneration a variant started ends now. The other line stays.
   */
  private async undoMoved(kind: 'variant' | 'push'): Promise<void> {
    const mv = this.moved.get(kind)
    const folder = this.d.folder()
    if (!mv || !folder) return
    this.moved.delete(kind)
    if (mv.started) await this.d.timer({ a: 'finish', block: mv.started, day: mv.day })
    const back: EditEntry[] = []
    let kept = false
    for (const x of mv.edits) {
      const inv = inverseEdit(x.entry, ((await folder.recordView(x.entry.rel)) as RawRecord | undefined) ?? null, x.made)
      if (inv) back.push(inv)
      else kept = true
    }
    const out = await this.d.edit(back)
    if (kept || out.some((o) => o.status !== 'applied' && o.status !== 'waiting')) this.say(`Część planu zmieniła się od ${kind === 'push' ? 'przesunięcia' : 'wariantu'} – zostaje tak, jak jest teraz.`)
    return this.refresh()
  }

  /**
   * The notifications on by default (D230): 5 min before a block waiting for „Zacznij” and before classes and the commute
   * (not before an online lecture, D237; none in the class mode, D236, nor during stationary classes and the commute),
   * the hard end of projects (a project runs, or it passed in a project or in time to explain after one within the hour),
   * a pool at the reserve (the message of its first descent of the day).
   * Each once: its id goes to the day's log.
   */
  private async notices(folder: DataFolder, m: Awaited<ReturnType<DataFolder['widgetModel']>>, name: (b: Parameters<typeof blockName>[0]) => string, now: number, modes: Modes, t: TimerNow, current: HardEndNow | null, prefs: ModePrefs): Promise<void> {
    const on = this.d.notices()
    const view = this.view
    if (!view || view.hidden || view.night || view.recording) return
    const { state } = m
    const date = state.grid.date
    const shown = new Set(m.ctx.events.filter((e) => e.k === 'notice.shown').map((e) => (e as unknown as { notice: string }).notice))
    const running = [t.fg, ...t.bg].filter((x) => x != null)
    const inClass = running.some((x) => x!.info.rules.classMode || x!.info.rules.kind === 'commute')
    const out: NotifyIn[] = []
    const byId = new Map(state.blocks.map((b) => [b.id, b]))
    if (on.start5 && !inClass) {
      for (const b of state.blocks) {
        const f = state.facts.blocks.get(b.id)
        if (!b.inPlan || (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null))) continue
        const classLike = b.rules.kind === 'remoteClass' || b.rules.kind === 'commute'
        if (!b.waits && !classLike) continue
        const span = plannedSpan(b, byId)
        if (!span) continue
        const start = atOf(state.grid, span.start)
        if (now < start - 5 * MIN || now >= start) continue
        const clock = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start)
        const p = m.ctx.plan.find((x) => x.id === b.id)
        out.push({ id: `notice:${date}:start5:${b.id}:${span.start}`, title: `${p ? name(p) : b.categoryId} o ${clock}`, body: b.waits ? 'Za 5 min – „Zacznij” czeka w pasku.' : 'Za 5 min.', line: `wait:${b.id}`, day: date })
      }
    }
    // The hard end (D228, D230): the notification comes while it is current as the bar's line is (`hardEndCurrent`: a
    // project runs, or the time to explain after one waits for your answer), and for the message of the minute it passed
    // in when a project ended in it with no time to explain after (`hardEndMessage`) – the line does not last then. A
    // project running comes at any time; the rest within an hour of the pass – never hours late (the app started, the
    // notice turned on) – counted from the later of the pass and the end of the class mode that lasted in or after its
    // minute (D355: the mode holds it back; the end comes from the day's facts, so a restart or another leader tells the
    // same). Never when „mniej pytań” was on in the minute it passed in or is on now (D134: no notification, not a later one).
    const passed = current?.passed ?? hardEndMessage(state, t)
    const waiting = new Set<string>()
    if (on.hardEnd && passed != null && !modes.fewer && !fewerAt(m.ctx.events, state.grid, passed)) {
      const id = `notice:${date}:hardEnd:-:${passed}`
      const classEnd = modes.classMode ? null : classModeEnd(state, passed, prefs)
      const since = classEnd != null && Number.isFinite(classEnd) ? Math.max(passed, classEnd) : passed
      if (current?.projectRuns || atOf(state.grid, since) >= now - 60 * MIN) {
        out.push({ id, title: 'Twardy koniec projektów', body: 'Minimum regeneracji potrzebuje teraz czasu do pory snu.', line: null, day: date })
        // In the class mode it waits (D355), its retry too: it comes after the mode.
        if (modes.classMode) waiting.add(id)
      }
    }
    // In a session or a class the reserve shows only in the colour, with „mniej pytań” its message is a quiet line – no
    // notification in any quiet mode (spec „Model energii”, D326).
    if (on.reserve && m.energy.enabled && !view.quiet) {
      for (const d of m.energy.descents) {
        const line = reserveMessageId(date, d.pool, d.at)
        // Not once the pool is above the reserve again or its line was answered („Zacznij”, „nie dziś” – here or elsewhere).
        if (!d.message || atOf(state.grid, d.at) < now - 60 * MIN || !m.energy.atReserve[d.pool] || answered(m.ctx.events, line)) continue
        // Its click opens the panel on the reserve's line – the sighting that counts (D241, A4-04).
        out.push({ id: `notice:${date}:reserve:${d.pool}:${d.at}`, title: 'Energia na poziomie rezerwy', body: `${POOL_TEXT[d.pool]} – czas na regenerację.`, line, day: date })
      }
    }
    // The state of notifications – one read of the helper per refresh, only when a notification needs it. Windows takes
    // them when it „accepts”; an unread state (`unknown`) never holds a notification back.
    let reads: Promise<string> | null = null
    const notifState = () => (reads ??= this.d.notificationState?.() ?? Promise.resolve('accepts'))
    // Not taken by Windows (its state held them – a full screen, a presentation – or showing it failed): once more, with
    // the same id and time, when it takes them again and you are here, while the notification still holds and its line
    // was not seen meanwhile (A4-07).
    const seen = new Set(m.ctx.events.filter((e) => e.k === 'question.seen').map((e) => (e as unknown as { question: string }).question))
    // One waiting for the end of the class mode keeps its retry meanwhile (spec „Powiadomienia i dźwięki”: while current).
    const kept = out.filter((n) => this.notTaken.has(n.id) && !(n.line && seen.has(n.line)))
    const held = kept.filter((n) => !waiting.has(n.id))
    for (const id of [...this.notTaken]) if (!kept.some((n) => n.id === id)) this.notTaken.delete(id)
    for (const id of [...this.retried]) if (!out.some((n) => n.id === id)) this.retried.delete(id)
    if (held.length && (this.d.present?.() ?? true) && takesNotifications(await notifState())) {
      for (const n of held) {
        this.notTaken.delete(n.id)
        this.retried.add(n.id)
        // Its failure is said by id too: the log tells whether the retry came up (E8j.2).
        const ok = this.d.notify(n, () => this.d.log('info', `ponowione powiadomienie też nieprzyjęte: ${n.id}`))
        this.d.log('info', ok ? `powiadomienie ponowione: ${n.id}` : `ponowienie powiadomienia odrzucone: ${n.id}`)
      }
    }
    const fresh = out.filter((n) => !shown.has(n.id) && !waiting.has(n.id))
    if (!fresh.length) return
    const stateNow = await notifState()
    for (const n of fresh) {
      const ok = this.d.notify(n, () => this.holdBack(n, 'odrzucone przy pokazaniu'))
      // Refused at once (an error of Windows): written like one shown, so only the way above tries it again – once.
      if (!ok && !this.notTaken.has(n.id)) continue
      folder.markNotice(date, n.id, now)
      if (!takesNotifications(stateNow)) this.holdBack(n, `stan powiadomień ${stateNow}`)
    }
  }

  /** Notifications Windows did not take (by id): each comes once more (A4-07). */
  private readonly notTaken = new Set<string>()
  /** Notifications already shown once more (by id, while they hold): a late failure of the first showing does not bring a
   *  second retry (A4-07 – once). */
  private readonly retried = new Set<string>()

  /** Keeps a notification for its one retry; its line in the log comes once per notification, not per refresh (F2). */
  private holdBack(n: NotifyIn, reason: string): void {
    if (this.notTaken.has(n.id) || this.retried.has(n.id)) return
    this.notTaken.add(n.id)
    this.d.log('info', `powiadomienie nieprzyjęte przez Windows: ${n.id} (${reason}) – ponowię raz`)
  }

  /** The way of a break: from the screen after a project, else the lowest cost in the lowest pool (spec „Timer”). */
  /**
   * A line's regeneration started (the reserve's message, a break): the start first – the line is answered only once it
   * started, never hidden with nothing running. From the reserve's message the approved boundary moves by the length of
   * the regeneration while work is still ahead in the forecast, at most to the maximum – the rest never costs the
   * boundary's reward (spec „Model energii”).
   */
  private async startFromLine(line: string, day: string | undefined, click: TimerIn & { durationMin: number }, answer: string, moveBoundary: boolean): Promise<void> {
    const before = this.model
    const r = await this.d.timer({ ...click, day })
    if (!r.ok) {
      this.say(r.why ?? 'regeneracja nie zaczęła się')
      return this.refresh()
    }
    await this.d.timer({ a: 'mark', question: line, answer, day })
    const s = before?.state
    const folder = this.d.folder()
    if (moveBoundary && s && day && folder && s.boundary.approved != null && s.forecastWorkEnd != null && s.now < s.forecastWorkEnd) {
      const to = Math.min(s.boundary.max, s.boundary.approved + click.durationMin)
      if (to > s.boundary.approved)
        await folder.userEvents([{ k: 'boundary.approve', day, boundary: atOf(s.grid, to), auto: s.boundary.auto, plan: before!.ctx.plan.map((b) => b.id) }]).catch((e) => this.d.log('warn', 'przesunięcie granicy po regeneracji z komunikatu', e))
    }
    await this.refresh()
  }

  private breakWay(): string | null {
    const m = this.model
    if (!m) return null
    const t = timerNow(m.state)
    if (t.fg?.info.isProject) return 'przerwa-od-ekranu'
    const now = m.energy.known ? m.energy.now : null
    if (!now) return null
    const lowest = [...POOLS].sort((a: Pool, b: Pool) => now[a] - now[b])[0]!
    return suggestRegen(m.state.settings, lowest)
  }

  /** A click of the bar (`from`: which window). A refused or failed one says why in the bar for a few seconds. */
  async act(action: string, arg: string | undefined, from: ViewKind): Promise<void> {
    const key = `${action}|${arg ?? ''}`
    // Two clicks within 0.5 s are one – also the second click of a cost that comes too soon after its first. On the
    // monotonic clock: a wall clock set back or forward meanwhile (time sync) neither drops a click nor lets a double one through.
    const at = this.mono
    if ((this.lastClick.key === key && at - this.lastClick.at < DOUBLE_MS) || (action === 'confirm' && this.pending && at - (this.pending.until - CONFIRM_MS) < DOUBLE_MS)) return
    // A click of the bar itself (the desktop bar's background) is no action: it never parts the two clicks of one (A7-01).
    if (action !== 'barClick') this.lastClick = { key, at }
    try {
      await this.actNow(action, arg, from)
    } catch (e) {
      this.pending = null
      this.say(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`)
      this.d.log('warn', `pasek: ${action}`, e)
      await this.refresh()
    }
  }

  private say(text: string): void {
    this.note = { text, until: this.mono + NOTE_MS }
    setTimeout(() => void this.refresh(), NOTE_MS + 50).unref?.()
  }

  private async actNow(action: string, arg: string | undefined, from: ViewKind): Promise<void> {
    const v = this.current()
    // A step of „Przedłuż” before its second click: a new cost and new 10 s – no reaction and no click of the widget (T289).
    if (action === 'extendStep') return this.extendStep(arg === '-15' ? -15 : 15)
    if (from === 'bar') {
      // A click of the desktop bar counts as seeing what it shows (spec), and its next 10 s are the app's own.
      this.d.clickedApp()
      const ids = this.shownQuestions()
      if (ids.length) void this.d.seen(ids, 'bar')
    }
    // The quick capture (D385, D402): always – also without a day counted now, in the night, „Odcinam się”, a session, a class.
    if (action === 'quickAdd') return this.quickAdd(arg ?? '')
    if (action === 'quickOpen') {
      this.d.openQuick?.()
      return
    }
    if (v.day == null && action !== 'openMain') return
    const day = v.day ?? undefined
    let r: TimerResult | null = null
    let label = ''
    let click: TimerIn | null = null
    /** The button the cost stands in place of (none: the row under the buttons). */
    let button = action
    const num = (s: string | undefined) => (s != null && /^-?\d+$/.test(s) ? Number(s) : null)
    switch (action) {
      case 'next':
        click = { a: 'next' }
        break
      case 'pause':
        click = { a: 'pause' }
        break
      case 'extend':
        click = { a: 'extend', minutes: num(arg) ?? 15 }
        label = `Przedłuż +${num(arg) ?? 15}`
        break
      case 'endWork':
        click = { a: 'workEnd' }
        break
      case 'finished':
        click = { a: 'finish' }
        break
      case 'cutOff':
        click = { a: 'cutOff' }
        break
      case 'back':
        click = { a: 'back' }
        break
      case 'water':
        click = { a: 'drink' }
        break
      case 'fewer':
        click = { a: 'fewer' }
        break
      case 'better':
        click = { a: 'better' }
        break
      case 'start':
        if (this.nextBlock) click = { a: 'start', block: this.nextBlock }
        label = 'Start'
        break
      case 'bgEnd':
        if (arg) click = { a: 'finish', block: arg }
        break
      case 'bgExtend': {
        const [block, min] = (arg ?? '').split('|')
        if (block) click = { a: 'extend', block, minutes: num(min) ?? 15 }
        label = `Przedłuż +${num(min) ?? 15}`
        button = `bgExtend:${block}`
        break
      }
      case 'undo':
        if (arg) click = { a: 'undo', target: arg }
        break
      case 'signal':
      case 'relative': {
        const f = this.d.folder()
        if (!f || !arg) return
        const [a, b] = arg.split('|')
        await f.energySignal(action === 'signal' ? { signal: a as 'glasses' } : { pool: a as 'head', delta: (num(b) ?? 0) as -10 | 0 | 10 })
        return this.refresh()
      }
      case 'confirm': {
        const p = this.pending
        this.pending = null
        if (p && p.until > this.mono) r = await p.redo()
        if (r && !r.ok && r.why) this.say(r.why)
        return this.refresh()
      }
      case 'openMain':
        // „+ Prośba do kolejki” and another person outside the quiet modes (D311): the screen of requests; „Rytuał” (D318).
        this.d.showMain(arg === 'requests' || arg === 'ritual' ? arg : 'today')
        return
      case 'request': {
        // „Zrobione teraz” or „Pilne” for a person (D311): `<now|urgent>|<person, empty: „osoba: ?”>|<estimate, empty: default>`.
        const [mode, person, est] = (arg ?? '').split('|')
        if (mode !== 'now' && mode !== 'urgent') return
        click = { a: 'requestNow', request: newId(), person: person || null, urgent: mode === 'urgent', estimateMin: mode === 'urgent' ? num(est) : null }
        break
      }
      case 'requestEnd': {
        // „Koniec” of the request in the bar – to its own day (also one from before 04:00).
        const run = v.requests.running
        if (!run) return
        const res = await this.d.timer({ a: 'requestEnd', request: run.id, day: run.day })
        if (!res.ok && res.why) this.say(res.why)
        return this.refresh()
      }
      case 'routine': {
        // „✓ Zapisz zaznaczone” of the unfolded steps (D328): `<block>|<version>|<places of the steps in it, comma-separated>`
        // – the steps' ids from the view (40 ids would not fit an action's argument).
        const [block, version, places] = (arg ?? '').split('|')
        const r = v.routines.find((x) => x.block === block)
        if (!r || !(ROUTINE_VERSIONS as readonly string[]).includes(version ?? '')) return
        const steps = r[version as RoutineVersion]
        const ids = [...new Set((places ?? '').split(',').map(num))].flatMap((k) => (k != null && steps[k] ? [steps[k]!.id] : []))
        return this.routineDone(day, r, version as RoutineVersion, ids)
      }
      case 'step': {
        // The tick of the step line (D440): `<block>|<step>` – the bar's day; no sound, no window.
        const [block, step] = (arg ?? '').split('|')
        if (!block || !step) return
        return this.tickStep(day, block, step)
      }
      case 'variants': {
        const [what, which] = (arg ?? '').split('|')
        if (what === 'open') return this.openVariants()
        if (what === 'pick') return this.pickVariant(which)
        if (what === 'close') {
          this.panel = null
          return this.refresh()
        }
        return
      }
      case 'line': {
        const [line, act, value] = (arg ?? '').split('|')
        if (!line || !act) return
        const [kind, id] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]
        button = `line:${line}|${act}`
        if (kind === 'moved') return act === 'undo' ? this.undoMoved(id === 'push' ? 'push' : 'variant') : undefined
        // „Zadanie zrobione? · Tak · Wraca na listę” (D384): the answer is the task's record.
        if (kind === 'task') return act === 'done' || act === 'back' ? this.answerTask(line, act) : undefined
        if (kind === 'wait') click = act === 'start' ? { a: 'start', block: id } : { a: 'cancel', block: id }
        else if (kind === 'restart') click = { a: 'restart', block: id }
        // The day's moments (A1-12): an anchored block's „Zacznij · Zaparkuj · Koniec pracy”, a fixed block cancelled after
        // „Koniec pracy”, a fixed block extended after its plan ended it, „Pracowałem do teraz”.
        else if (kind === 'anchor') click = act === 'start' ? { a: 'start', block: id } : act === 'park' ? { a: 'park', block: id } : { a: 'workEnd' }
        else if (kind === 'fixedLeft') click = { a: 'cancel', block: id }
        else if (kind === 'notExtended') {
          click = { a: 'extend', block: id, minutes: num(value) ?? 15 }
          label = `Przedłuż +${click.minutes}`
        }
        else if (kind === 'workedUntil') click = { a: 'workedUntil', explain: id }
        // A routine (D328): „✓ Wszystkie” – every step of the usual version, „gorsze dni” – every step of that one.
        else if (kind === 'routine') {
          const r = v.routines.find((x) => x.line === line)
          if (!r || (act !== 'all' && act !== 'worse')) return
          const version = act === 'worse' && r.worse.length ? 'worse' : 'normal'
          return this.routineDone(day, r, version, r[version].map((s) => s.id))
        } else if (kind === 'routineSaved') return act === 'undo' ? this.undoRoutine() : undefined
        // „OK” of the line about saving the battery: the day's answer in the log – it never comes back that day.
        else if (kind === 'battery') await this.d.timer({ a: 'mark', question: line, answer: 'ok', day })
        // A gap (D368): „Przesuń resztę wcześniej” closes it, „Zostaw” – the answer in the log, never asked again for it.
        else if (kind === 'gap') {
          if (act === 'close') return this.closeGapNow(line, day)
          return act === 'leave' ? this.leaveGap(line, day) : undefined
        } else if (kind === 'paused') click = act === 'start' ? { a: 'start', block: id } : { a: 'park', block: id }
        else if (kind === 'fewerOffer') {
          await this.d.timer({ a: 'mark', question: line, answer: act, day })
          if (act === 'yes') click = { a: 'fewer' }
        } else if (kind === 'reserve') {
          // „Zacznij” – the regeneration by the way cheapest in the pool, from now, the boundary moved by it; „nie dziś” –
          // the line hides until the day ends.
          if (act !== 'start') await this.d.timer({ a: 'mark', question: line, answer: act, day })
          else return this.startFromLine(line, day, { a: 'startNew', block: line.replace(/[^a-z0-9]/gi, '').slice(0, 40), categoryId: REGEN_CATEGORY, variantId: this.model ? suggestRegen(this.model.state.settings, id.split(':')[1] as Pool) : null, durationMin: RESERVE_REGEN_MIN }, act, true)
        } else if (kind === 'break' || kind === 'solitude') {
          // A break pauses the running work (it waits as the next in the plan), never ends it.
          if (act === 'break' || act === 'solitude') return this.startFromLine(line, day, { a: 'startNew', block: line.replace(/[^a-z0-9]/gi, '').slice(0, 40), categoryId: 'regeneracja', variantId: act === 'solitude' ? 'cisza' : this.breakWay(), durationMin: 15 }, act, false)
          await this.d.timer({ a: 'mark', question: line, answer: act, day })
        } else if (act === 'extend') click = { a: 'extend', minutes: num(value) ?? 15 }
        else if (act === 'next') {
          click = { a: 'next' }
          action = 'next'
        } else if (act === 'workEnd') click = { a: 'workEnd' }
        else if (act === 'endedAt' && value == null) {
          this.d.showMain('today')
          return
        } else {
          r = await this.d.answer(line, act, num(value))
          if (r.confirm) {
            const c = r.confirm
            this.wait('start', act === 'working' ? 'Pracuję' : 'Start', c, () => this.d.answer(line, act, 1))
          } else if (!r.ok && r.why) this.say(r.why)
          return this.refresh()
        }
        label = act === 'start' ? 'Zacznij' : act === 'extend' && !label ? `Przedłuż +${num(value) ?? 15}` : label
        break
      }
      default:
        return
    }
    // An answer alone (a mark – „nie dziś”, „Kontynuuję”): the view without its line at once.
    if (!click) return this.refresh()
    const c = { ...click, day }
    r = await this.d.timer(c)
    if (r.confirm) {
      const cost = r.confirm
      // „Dalej”: its first click ended the running block; the cost belongs to starting the next one – shown at „Start”.
      if (action === 'next') this.wait('start', 'Start', cost, () => this.d.timer({ a: 'start', block: cost.block, day, confirm: true }))
      // „Przedłuż” – of the block in front, in the background or from a line – keeps its length's steps (T289).
      else this.wait(button, label || 'Start', cost, () => this.d.timer({ ...c, confirm: true }), c.a === 'extend' ? c.minutes : undefined, c.a === 'extend' ? c.block : undefined)
    } else {
      this.pending = null
      if (!r.ok && r.why) this.say(r.why)
    }
    await this.refresh()
  }

  /** A title from the bar's field into „Skrzynka” (D385): refused – the bar says why. */
  private async quickAdd(title: string): Promise<void> {
    const r = this.d.quickAdd ? await this.d.quickAdd(title) : { ok: false, error: 'Szybki zapis nie działa teraz.' }
    if (!r.ok && r.error) this.say(r.error)
    return this.refresh()
  }

  /**
   * The answer to „Zadanie zrobione?” (D384, T754): the task the line asks about – planned in its block, not done – as the
   * folder has it now: „Tak” – Zrobione, „Wraca na listę” – no longer planned. One edit of the record: every computer's
   * line goes with it (answered elsewhere meanwhile – nothing written, the bar says so).
   */
  private async answerTask(line: string, answer: 'done' | 'back'): Promise<void> {
    const folder = this.d.folder()
    const [, day, block] = line.split(':')
    if (!folder || !day || !block) return
    const asked = (r: RequestRecord | null): r is RequestRecord => !!r && r.kind === 'task' && !isDone(r) && r.block === block
    // The list may be a minute old (`LIST_TRUST_MS`): the record itself is read again – answered on another computer
    // meanwhile, nothing is written over its answer.
    const task = casesFrom(await folder.collection('request')).find(asked)
    const rel = task ? paths.record('request', task.id) : null
    const before = rel ? (((await folder.recordView(rel)) as RawRecord | undefined) ?? null) : null
    if (!rel || !before || !asked(requestFrom(before))) {
      this.say('To pytanie ma już odpowiedź.')
      return this.refresh()
    }
    const entry = recordEdit(rel, before, taskAnswerRaw(before, answer, this.now))
    const res = entry ? await this.d.edit([entry]) : []
    if (res.some((o) => o.status !== 'applied' && o.status !== 'waiting')) this.say('Odpowiedź spotkała się ze zmianą z innego komputera – odpowiedz na pytanie w oknie głównym.')
    return this.refresh()
  }

  /**
   * A step ticked off on the bar (D440, T793): the block in the day's plan as the day's file holds it now (with the queue)
   * over the snapshot the bar counted (the model of its last count, of that day; another day or none: counted now) – a
   * block gone already is said at once; its list as the file holds it (`tickEdits`); its tick in the day's file and – a
   * block of a task planned in it – in the task's record, one edit of the queue whose every entry carries the guard of the
   * block (`EditGuard` `dayBlock`): the queue checks it on the day's file in its own turn of the write – a block taken out,
   * cancelled or moved away meanwhile (another computer) gets no tick, nor its task – „Tego bloku już nie ma w planie.”.
   * Ticked on another computer meanwhile – nothing to write. No sound (D440).
   */
  private async tickStep(day: string | undefined, blockId: string, stepId: string): Promise<void> {
    const folder = this.d.folder()
    if (!folder || !day) return
    const m = this.model?.state.grid.date === day ? this.model : await folder.widgetModel(this.now)
    const rel = paths.day(day)
    const before = ((await folder.recordView(rel)) as RawRecord | undefined) ?? null
    const file = before ? dayFileFrom(before, day) : null
    const block = m.state.grid.date === day ? dayPlan(m.ctx.snapshot, file).find((b) => b.id === blockId) : undefined
    if (!block) {
      this.say(BLOCK_GONE)
      return this.refresh()
    }
    const taskRel = block.task ? paths.record('request', block.task) : null
    const taskBefore = taskRel ? (((await folder.recordView(taskRel)) as RawRecord | undefined) ?? null) : null
    const out = tickEdits({ date: day, day: before, block, stepId, done: true, task: taskBefore })
    if ('error' in out) {
      this.say(out.error)
      return this.refresh()
    }
    const guards: EditGuard[] = [{ kind: 'dayBlock', rel, block: block.id, inFile: !!file?.blocks.some((b) => b.id === block.id), why: BLOCK_GONE }]
    const entries = [recordEdit(rel, before, out.day), taskRel && out.task ? recordEdit(taskRel, taskBefore, out.task) : null].filter((e): e is EditEntry => e != null).map((e) => ({ ...e, guards }))
    const res = entries.length ? await this.d.edit(entries) : []
    const refused = res.find((o) => o.status === 'refused')
    if (refused) this.say(refused.why ?? BLOCK_GONE)
    else if (res.some((o) => o.status !== 'applied' && o.status !== 'waiting')) this.say('Odhaczenie spotkało się ze zmianą z innego komputera – odpowiedz na pytanie w oknie głównym.')
    return this.refresh()
  }

  /**
   * A routine's steps saved (D328) – the same click as the card in „Dziś”, so the first save closes both (its line goes);
   * „Zapisano: … · Cofnij” stays in its place for a while (one click of the bar is easily the wrong one).
   */
  private async routineDone(day: string | undefined, routine: BarRoutine, version: RoutineVersion, steps: string[]): Promise<void> {
    const r = await this.d.timer({ a: 'routineDone', block: routine.block, version, steps, day })
    if (!r.ok) this.say(r.why ?? 'rutyna nie zapisała się')
    else if (day) this.routineSaved = { block: routine.block, day, text: `Zapisano: ${routine.name} (${ROUTINE_VERSION_NAMES[version]}) – ${steps.length} z ${routine[version].length}`, until: this.mono + ROUTINE_UNDO_MS }
    return this.refresh()
  }

  /** „Cofnij” of a routine saved from the bar: it waits to be ticked off again (its line and card come back). */
  private async undoRoutine(): Promise<void> {
    const saved = this.routineSaved
    this.routineSaved = null
    if (saved) {
      const r = await this.d.timer({ a: 'routineUndo', block: saved.block, day: saved.day })
      if (!r.ok && r.why) this.say(r.why)
    }
    return this.refresh()
  }

  /** A cost waits for its second click within 10 s, in place of its button. */
  private wait(button: string, label: string, cost: NonNullable<TimerResult['confirm']>, redo: () => Promise<TimerResult>, minutes?: number, block?: string): void {
    this.pending = { button, text: costText(label, cost), until: this.mono + CONFIRM_MS, redo, ...(minutes != null ? { minutes } : {}), ...(block ? { block } : {}) }
    setTimeout(() => void this.refresh(), CONFIRM_MS + 50).unref?.()
  }

  /**
   * „Przedłuż” waiting for its second click, 15 min longer or shorter (at least 15, at most `EXTEND_MAX_MIN`): its new cost
   * with new 10 s – only judged, never written; a length that costs nothing still waits for „Potwierdź” (a step is never
   * the extension itself).
   */
  private async extendStep(delta: number): Promise<void> {
    const p = this.pending
    if (!p || p.minutes == null || p.until <= this.mono) return
    const minutes = Math.min(EXTEND_MAX_MIN, Math.max(15, p.minutes + delta))
    if (minutes === p.minutes) return
    const day = this.current().day ?? undefined
    const c: TimerIn = { a: 'extend', minutes, day, ...(p.block ? { block: p.block } : {}) }
    const r = await this.d.timer({ ...c, probe: true })
    if (r.confirm) this.wait(p.button, `Przedłuż +${minutes}`, r.confirm, () => this.d.timer({ ...c, confirm: true }), minutes, p.block)
    else if (r.ok) {
      this.pending = { button: p.button, text: `Przedłuż +${minutes}: bez kosztu`, until: this.mono + CONFIRM_MS, redo: () => this.d.timer(c), minutes, ...(p.block ? { block: p.block } : {}) }
      setTimeout(() => void this.refresh(), CONFIRM_MS + 50).unref?.()
    } else {
      this.pending = null
      if (r.why) this.say(r.why)
    }
    await this.refresh()
  }

  /**
   * A notification's line clicked (its panel opened on it): a sighting only of a question or the reserve's message the
   * bar shows now – a line held back (a session, a class) or not there, or any other text of an address, writes nothing
   * (the address only opens a view).
   */
  notificationSighting(line: string): string[] {
    const v = this.current()
    if (v.day == null || !SEEN_LINE.test(line)) return []
    return v.question?.id === line || v.lines.some((l) => l.id === line) ? [line] : []
  }

  /** The questions a window that sees them shows (D231): „Dalej?” and the lines the bar shows, not those folded in „⋯”. */
  shownQuestions(): string[] {
    const v = this.current()
    if (v.day == null) return []
    return [v.question?.id, ...v.lines.slice(0, shownLineCount(v)).map((l) => l.id)].filter((x): x is string => !!x && QUESTION_ID.test(x))
  }
}
