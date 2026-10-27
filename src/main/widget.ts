/**
 * The widget in the main process (spec „Widget”, „Akcje widgetu wykonuje proces główny”): the view of the engine for the
 * bar at the top of the main window, the icon's panel and the desktop bar, and the icon; every click of the bar as an
 * action of the timer (a first click with a cost waits 10 s for the second, shown in place of its button; two clicks
 * within 0.5 s are one); the Windows notifications on by default (D230) – shown only by the leader, each once by its
 * stable id in the day's log.
 *
 * Until a data folder is open, and for 10 min after a change of the trial (E0, D298), the widget shows the trial.
 */
import type { TimerIn, TimerResult, ViewKind } from '@shared/api'
import { blockName } from '@shared/blockName'
import { engineView } from '@shared/engineView'
import { plannedSpan } from '@shared/engine/blocks'
import { atOf } from '@shared/engine/grid'
import type { ModePrefs } from '@shared/engine/modes'
import { suggestRegen } from '@shared/engine/reserve'
import { timerNow } from '@shared/engine/timer'
import type { NoticeKind } from '@shared/machine'
import { POOLS, type Pool } from '@shared/model/categories'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import { ALL_BUTTONS, type BarPending, type WidgetView } from '@shared/widget'
import type { DataFolder } from './data/folder'

const CONFIRM_MS = 10_000
/** Two clicks within this count as one (spec „Potwierdzenie przedłużenia”). */
export const DOUBLE_MS = 500
const REFRESH_MS = 15_000
/** A refused or failed click says why in the bar this long. */
const NOTE_MS = 6_000
/** A change of the trial shows it instead of the engine for this long (the trial's checks, D298). */
export const TRIAL_HOLD_MS = 10 * 60_000
const MIN = 60_000
/** The questions of the engine (their ids: rule:day:block:threshold) – only they are marked seen. */
const QUESTION_ID = /^(next|next2|workEnd|return|absence|shutdown):\d{4}-\d{2}-\d{2}:/
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
  timer: (click: TimerIn) => Promise<TimerResult>
  answer: (id: string, answer: string, value: number | null) => Promise<TimerResult>
  seen: (ids: string[], how: 'panel' | 'main' | 'notification' | 'bar') => Promise<unknown>
  clickedApp: () => void
  modePrefs: () => ModePrefs
  notices: () => Record<NoticeKind, boolean>
  trial: () => { view: WidgetView; changedAt: number }
  notify: (n: NotifyIn) => boolean
  showMain: (page?: string) => void
  emit: (view: WidgetView) => void
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  now?: () => number
}

interface Pending extends BarPending {
  redo: () => Promise<TimerResult>
}

const costText = (label: string, c: NonNullable<TimerResult['confirm']>) => `${label}: ${c.overrun ? 'przekroczenie' : 'przedłużenie'} · ${c.bedtime ? `pora snu +${c.minutes} min` : `−${c.minutes} min puli`}`

/**
 * The tone of a warning (spec: quiet at 5 and 0 min): only when the step of the same block (and plan) changes to 5 or 0
 * – never at the start of the app, nor when the view comes back from the trial with a block already over its end.
 */
export function toneOnChange(prev: { block: string; warn: string } | null, view: WidgetView): { next: { block: string; warn: string } | null; play: 'five' | 'zero' | null } {
  const next = view.day ? { block: `${view.day}|${view.block?.name ?? ''}|${view.block?.endsAt ?? ''}`, warn: view.warn } : null
  const changed = !!next && !!prev && prev.block === next.block && prev.warn !== next.warn
  return { next, play: changed && view.soundOk && (view.warn === 'five' || view.warn === 'zero') ? view.warn : null }
}

/** The bar while the day cannot be counted (a file not readable now): no actions, one line why. */
function unknownView(trial: WidgetView): WidgetView {
  return {
    ...trial,
    hidden: false,
    quiet: false,
    tone: 'brak',
    warn: 'none',
    dot: false,
    drop: false,
    block: null,
    question: null,
    lines: [{ id: 'unknown', text: 'Dnia nie da się teraz policzyć (plik jeszcze nieczytelny) – pasek wróci sam.', actions: [], dot: false }],
    session: false,
    stateLine: null,
    tooltip: 'Dzień nieznany – czekam na pliki',
    buttons: { ...ALL_BUTTONS, next: false, pause: false, extend: false, workEnd: false, cutOff: false },
    background: [],
    autos: { groups: [], items: [] },
    pending: null,
    day: null,
    note: null
  }
}

export class WidgetEngine {
  private view: WidgetView | null = null
  private pending: Pending | null = null
  private note: { text: string; until: number } | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<void> | null = null
  private again = false
  /** The block „Start: …” would start (from the last view). */
  private nextBlock: string | null = null
  private failing = false
  private lastClick = { key: '', at: Number.NEGATIVE_INFINITY }
  private model: Awaited<ReturnType<DataFolder['widgetModel']>> | null = null

  constructor(private readonly d: WidgetDeps) {}

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  /** The view now (the trial until the engine has one). */
  current(): WidgetView {
    const trial = this.d.trial()
    if (!this.view || this.now - trial.changedAt < TRIAL_HOLD_MS) return trial.view
    return this.view
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
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
      this.d.emit(this.current())
      return
    }
    const now = this.now
    try {
      const m = await folder.widgetModel(now)
      this.model = m
      const rd = m.rd
      const routines = (await folder.collection('routine').catch(() => [])).map(routineFrom).filter((x): x is Routine => !!x)
      const requests = (await folder.collection('request').catch(() => [])).map(requestFrom).filter((x): x is RequestRecord => !!x)
      const names = { rd, settings: m.state.settings, routines, requests }
      if (this.pending && this.pending.until <= now) this.pending = null
      if (this.note && this.note.until <= now) this.note = null
      this.nextBlock = timerNow(m.state).next?.id ?? null
      this.view = {
        ...engineView({
          ctx: m.ctx,
          state: m.state,
          energy: m.energy,
          activity: m.activity,
          now,
          name: (b) => blockName(b, names),
          care: { waterOn: rd.general.modules.water, waterEveryMin: rd.general.waterEveryMin, breakAfterMin: rd.general.breakAfterMin, solitudeAfterMin: rd.general.solitudeAfterMin },
          modePrefs: this.d.modePrefs(),
          // Only what the windows show (the view goes over IPC – no function in it).
          pending: this.pending ? { button: this.pending.button, text: this.pending.text, until: this.pending.until } : null,
          computer: folder.computers[0]?.id
        }),
        note: this.note
      }
      if (this.failing) this.d.log('info', 'widget: dzień znów policzony')
      this.failing = false
      if (folder.leader.iLead) await this.notices(folder, m, (b) => blockName(b, names), now)
    } catch (e) {
      // The day cannot be counted now: a bar without actions says so (never the last view with a stale countdown).
      if (!this.failing) this.d.log('warn', 'widok widgetu nie policzył się', e)
      this.failing = true
      this.model = null
      this.view = unknownView(this.d.trial().view)
    }
    this.d.emit(this.current())
  }

  /**
   * The notifications on by default (D230): 5 min before a block waiting for „Zacznij” and before classes and the commute
   * (not before an online lecture, D237; none in the class mode, D236, nor during stationary classes and the commute),
   * the hard end of projects while a project runs, a pool at the reserve (the message of its first descent of the day).
   * Each once: its id goes to the day's log.
   */
  private async notices(folder: DataFolder, m: Awaited<ReturnType<DataFolder['widgetModel']>>, name: (b: Parameters<typeof blockName>[0]) => string, now: number): Promise<void> {
    const on = this.d.notices()
    const view = this.view
    if (!view || view.hidden || view.night || view.recording) return
    const { state } = m
    const date = state.grid.date
    const shown = new Set(m.ctx.events.filter((e) => e.k === 'notice.shown').map((e) => (e as unknown as { notice: string }).notice))
    const t = timerNow(state)
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
    // A project runs (or ran in the minute of the hard end), or it passed in time to explain after a project (D250).
    if (on.hardEnd && state.hardEnd.passed != null && (state.hardEnd.message || t.fg?.info.isProject)) out.push({ id: `notice:${date}:hardEnd:-:${state.hardEnd.passed}`, title: 'Twardy koniec projektów', body: 'Minimum regeneracji potrzebuje teraz czasu do pory snu.', line: null, day: date })
    if (on.reserve && m.energy.enabled) {
      for (const d of m.energy.descents) {
        if (!d.message || atOf(state.grid, d.at) < now - 60 * MIN) continue
        out.push({ id: `notice:${date}:reserve:${d.pool}:${d.at}`, title: 'Energia na poziomie rezerwy', body: { head: 'Głowa', emotions: 'Emocje', senses: 'Bodźce' }[d.pool] + ' – czas na regenerację.', line: null, day: date })
      }
    }
    for (const n of out) {
      if (shown.has(n.id)) continue
      if (this.d.notify(n)) folder.markNotice(date, n.id, now)
    }
  }

  /** The way of a break: from the screen after a project, else the lowest cost in the lowest pool (spec „Timer”). */
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
    const at = this.now
    // Two clicks within 0.5 s are one – also the second click of a cost that comes too soon after its first.
    if ((this.lastClick.key === key && at - this.lastClick.at < DOUBLE_MS) || (action === 'confirm' && this.pending && at - (this.pending.until - CONFIRM_MS) < DOUBLE_MS)) return
    this.lastClick = { key, at }
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
    this.note = { text, until: this.now + NOTE_MS }
    setTimeout(() => void this.refresh(), NOTE_MS + 50).unref?.()
  }

  private async actNow(action: string, arg: string | undefined, from: ViewKind): Promise<void> {
    const v = this.current()
    if (from === 'bar') {
      // A click of the desktop bar counts as seeing what it shows (spec), and its next 10 s are the app's own.
      this.d.clickedApp()
      const ids = this.shownQuestions()
      if (ids.length) void this.d.seen(ids, 'bar')
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
        if (p && p.until > this.now) r = await p.redo()
        if (r && !r.ok && r.why) this.say(r.why)
        return this.refresh()
      }
      case 'openMain':
        this.d.showMain('today')
        return
      case 'line': {
        const [line, act, value] = (arg ?? '').split('|')
        if (!line || !act) return
        const [kind, id] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]
        button = `line:${line}|${act}`
        if (kind === 'wait') click = act === 'start' ? { a: 'start', block: id } : { a: 'cancel', block: id }
        else if (kind === 'restart') click = { a: 'restart', block: id }
        else if (kind === 'paused') click = act === 'start' ? { a: 'start', block: id } : { a: 'park', block: id }
        else if (kind === 'fewerOffer') {
          await this.d.timer({ a: 'mark', question: line, answer: act, day })
          if (act === 'yes') click = { a: 'fewer' }
        } else if (kind === 'break' || kind === 'solitude') {
          await this.d.timer({ a: 'mark', question: line, answer: act, day })
          // A break pauses the running work (it waits as the next in the plan), never ends it.
          if (act === 'break' || act === 'solitude') click = { a: 'startNew', block: line.replace(/[^a-z0-9]/gi, '').slice(0, 40), categoryId: 'regeneracja', variantId: act === 'solitude' ? 'cisza' : this.breakWay(), durationMin: 15 }
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
        label = act === 'start' ? 'Zacznij' : label
        break
      }
      default:
        return
    }
    if (!click) return
    const c = { ...click, day }
    r = await this.d.timer(c)
    if (r.confirm) {
      const cost = r.confirm
      // „Dalej”: its first click ended the running block; the cost belongs to starting the next one – shown at „Start”.
      if (action === 'next') this.wait('start', 'Start', cost, () => this.d.timer({ a: 'start', block: cost.block, day, confirm: true }))
      else this.wait(button, label || 'Start', cost, () => this.d.timer({ ...c, confirm: true }))
    } else {
      this.pending = null
      if (!r.ok && r.why) this.say(r.why)
    }
    await this.refresh()
  }

  /** A cost waits for its second click within 10 s, in place of its button. */
  private wait(button: string, label: string, cost: NonNullable<TimerResult['confirm']>, redo: () => Promise<TimerResult>): void {
    this.pending = { button, text: costText(label, cost), until: this.now + CONFIRM_MS, redo }
    setTimeout(() => void this.refresh(), CONFIRM_MS + 50).unref?.()
  }

  /** The questions a window that sees them shows (D231): „Dalej?” and the lines the bar shows, not those folded in „⋯”. */
  shownQuestions(): string[] {
    const v = this.current()
    if (v.day == null) return []
    return [v.question?.id, ...v.lines.slice(0, shownLineCount(v)).map((l) => l.id)].filter((x): x is string => !!x && QUESTION_ID.test(x))
  }
}
