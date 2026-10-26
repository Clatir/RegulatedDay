/**
 * The widget in the main process (spec „Widget”, „Akcje widgetu wykonuje proces główny”): the view of the engine for the
 * bar at the top of the main window, the icon's panel and the desktop bar, and the icon; every click of the bar as an
 * action of the timer (a first click with a cost waits 10 s for the second, shown in place of its button); the Windows
 * notifications on by default (D230) – shown only by the leader, each once by its stable id in the day's log.
 *
 * Until a data folder is open, and for 10 min after a change of the trial (E0, D298), the widget shows the trial.
 */
import type { TimerIn, TimerResult, ViewKind } from '@shared/api'
import { engineView } from '@shared/engineView'
import { questionsOf } from '@shared/engine/auto'
import { plannedSpan } from '@shared/engine/blocks'
import { atOf } from '@shared/engine/grid'
import type { ModePrefs } from '@shared/engine/modes'
import { timerNow } from '@shared/engine/timer'
import type { NoticeKind } from '@shared/machine'
import { categoryName } from '@shared/model/rd'
import type { BarPending, WidgetView } from '@shared/widget'
import type { DataFolder } from './data/folder'

const CONFIRM_MS = 10_000
const REFRESH_MS = 15_000
/** A change of the trial shows it instead of the engine for this long (the trial's checks, D298). */
export const TRIAL_HOLD_MS = 10 * 60_000
const MIN = 60_000

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

export class WidgetEngine {
  private view: WidgetView | null = null
  private pending: Pending | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<void> | null = null
  private again = false
  /** The block „Start: …” would start (from the last view). */
  private nextBlock: string | null = null
  private logged = false

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
    try {
      const now = this.now
      const m = await folder.widgetModel(now)
      const rd = m.rd
      const name = (categoryId: string, variantId: string | null) => {
        const variant = variantId ? m.state.settings.categories[categoryId]?.variants.find((v) => v.id === variantId) : undefined
        return variant?.name ?? categoryName(rd, categoryId)
      }
      if (this.pending && this.pending.until <= now) this.pending = null
      this.nextBlock = timerNow(m.state).next?.id ?? null
      this.view = engineView({
        ctx: m.ctx,
        state: m.state,
        energy: m.energy,
        activity: m.activity,
        now,
        name,
        care: { waterOn: rd.general.modules.water, waterEveryMin: rd.general.waterEveryMin, breakAfterMin: rd.general.breakAfterMin, solitudeAfterMin: rd.general.solitudeAfterMin },
        modePrefs: this.d.modePrefs(),
        // Only what the windows show (the view goes over IPC – no function in it).
        pending: this.pending ? { button: this.pending.button, text: this.pending.text, until: this.pending.until } : null,
        computer: folder.computers[0]?.id
      })
      if (!this.logged) {
        this.logged = true
        this.d.log('info', `widget: widok silnika (dzień ${m.state.grid.date})`)
      }
      if (folder.leader.iLead) await this.notices(folder, m, name, now)
    } catch (e) {
      this.d.log('warn', 'widok widgetu nie policzył się', e)
    }
    this.d.emit(this.current())
  }

  /**
   * The notifications on by default (D230): 5 min before a block waiting for „Zacznij” and before classes and the commute
   * (not before an online lecture, D237; none in the class mode, D236, nor during stationary classes and the commute),
   * the hard end of projects while a project runs, a pool at the reserve. Each once: its id goes to the day's log.
   */
  private async notices(folder: DataFolder, m: Awaited<ReturnType<DataFolder['widgetModel']>>, name: (c: string, v: string | null) => string, now: number): Promise<void> {
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
        out.push({ id: `notice:${date}:start5:${b.id}:${span.start}`, title: `${name(b.categoryId, b.variantId)} o ${clock}`, body: b.waits ? 'Za 5 min – „Zacznij” czeka w pasku.' : 'Za 5 min.', line: `wait:${b.id}`, day: date })
      }
    }
    if (on.hardEnd && state.hardEnd.passed != null && t.fg?.info.isProject) out.push({ id: `notice:${date}:hardEnd:-:${state.hardEnd.passed}`, title: 'Twardy koniec projektów', body: 'Minimum regeneracji potrzebuje teraz czasu do pory snu.', line: null, day: date })
    if (on.reserve && m.energy.enabled) {
      for (const d of m.energy.descents) {
        if (d.silent || atOf(state.grid, d.at) < now - 60 * MIN) continue
        out.push({ id: `notice:${date}:reserve:${d.pool}:${d.at}`, title: 'Energia na poziomie rezerwy', body: { head: 'Głowa', emotions: 'Emocje', senses: 'Bodźce' }[d.pool] + ' – czas na regenerację.', line: null, day: date })
      }
    }
    for (const n of out) {
      if (shown.has(n.id)) continue
      if (this.d.notify(n)) folder.markNotice(date, n.id, now)
    }
  }

  /** A click of the bar (`from`: which window). */
  async act(action: string, arg: string | undefined, from: ViewKind): Promise<void> {
    const v = this.current()
    if (from === 'bar') {
      // A click of the desktop bar counts as seeing everything it shows (spec), and its next 10 s are the app's own.
      this.d.clickedApp()
      const ids = [v.question?.id, ...v.lines.map((l) => l.id)].filter((x): x is string => !!x && /^[a-zA-Z0-9]+:\d{4}-/.test(x))
      if (ids.length) void this.d.seen(ids, 'bar')
    }
    if (v.day == null && action !== 'openMain') return
    const day = v.day ?? undefined
    let r: TimerResult | null = null
    let label = ''
    let click: TimerIn | null = null
    const num = (s: string | undefined) => (s != null && /^-?\d+$/.test(s) ? Number(s) : null)
    switch (action) {
      case 'next':
        click = { a: 'next' }
        label = 'Dalej'
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
        await f.energySignal(action === 'signal' ? { signal: a as 'glasses' } : { pool: a as 'head', delta: (num(b) ?? 0) as -10 | 0 | 10 }).catch((e) => this.d.log('warn', 'sygnał nie zapisany', e))
        return this.refresh()
      }
      case 'confirm': {
        const p = this.pending
        this.pending = null
        if (p && p.until > this.now) r = await p.redo()
        if (r && !r.ok && r.why) this.d.log('info', `pasek: ${r.why}`)
        return this.refresh()
      }
      case 'openMain':
        this.d.showMain('today')
        return
      case 'line': {
        const [line, act, value] = (arg ?? '').split('|')
        if (!line || !act) return
        const [kind, id] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]
        if (kind === 'wait') click = act === 'start' ? { a: 'start', block: id } : { a: 'cancel', block: id }
        else if (kind === 'restart') click = { a: 'restart', block: id }
        else if (kind === 'paused') click = act === 'start' ? { a: 'start', block: id } : { a: 'park', block: id }
        else if (kind === 'fewerOffer') {
          await this.d.timer({ a: 'mark', question: line, answer: act } as TimerIn)
          if (act === 'yes') click = { a: 'fewer' }
        } else if (kind === 'break' || kind === 'solitude') {
          await this.d.timer({ a: 'mark', question: line, answer: act } as TimerIn)
          if (act === 'break' || act === 'solitude') click = { a: 'startNew', block: `${line.replace(/[^a-z0-9]/gi, '')}`.slice(0, 40), categoryId: 'regeneracja', durationMin: 15 }
        } else if (act === 'extend') click = { a: 'extend', minutes: num(value) ?? 15 }
        else if (act === 'next') click = { a: 'next' }
        else if (act === 'workEnd') click = { a: 'workEnd' }
        else if (act === 'endedAt' && value == null) {
          this.d.showMain('today')
          return
        } else {
          r = await this.d.answer(line, act, num(value))
          if (r.confirm) this.wait(`${line}|${act}`, act === 'working' ? 'Pracuję' : 'Start', r.confirm, () => this.d.answer(line, act, 1))
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
    if (r.confirm) this.wait(action === 'line' ? `line:${arg}` : action, label || 'Start', r.confirm, () => this.d.timer({ ...c, ...(action === 'next' ? { a: 'start', block: r!.confirm!.block } : {}), confirm: true }))
    else this.pending = null
    if (!r.ok && r.why && !r.confirm) this.d.log('info', `pasek: ${r.why}`)
    await this.refresh()
  }

  /** A cost waits for its second click within 10 s, in place of its button. */
  private wait(button: string, label: string, cost: NonNullable<TimerResult['confirm']>, redo: () => Promise<TimerResult>): void {
    this.pending = { button, text: costText(label, cost), until: this.now + CONFIRM_MS, redo }
    setTimeout(() => void this.refresh(), CONFIRM_MS + 50).unref?.()
  }

  /** The questions shown in a window that sees them (the main window in the foreground, the open panel). */
  shownQuestions(): string[] {
    const v = this.current()
    return [v.question?.id, ...v.lines.map((l) => l.id)].filter((x): x is string => !!x && /^[a-zA-Z0-9]+:\d{4}-/.test(x))
  }

  /** For the tests: the questions as the engine has them now. */
  static questionIds(m: Awaited<ReturnType<DataFolder['widgetModel']>>, now: number): string[] {
    return questionsOf({ ctx: m.ctx, state: m.state, activity: m.activity, now }).map((q) => q.id)
  }
}
