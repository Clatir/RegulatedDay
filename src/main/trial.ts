/**
 * The trial of the icon, the panel and the desktop bar (D286, E0): its switches drive the widget's view in place of the
 * engine, and its log keeps what the helper saw (the order of windows, the foreground, notifications, fullscreen) so the
 * trial can be checked and copied. Usable from the „Próba” screen and from „Próba ▸” in the tray's menu.
 */
import { EventEmitter } from 'node:events'
import { DEFAULT_TRIAL, trialView, type TrialState, type WidgetView } from '@shared/widget'
import { TONE_SETS, type Tone, type WarnStep } from '@shared/theme'

const TONES: Tone[] = ['praca', 'zycie', 'wolne', 'rezerwa', 'brak']
const WARNS: WarnStep[] = ['none', 'warm', 'five', 'zero']
const LOG_LINES = 500

export function trialFrom(raw: unknown, base: TrialState): TrialState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TrialState>
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    tone: TONES.includes(r.tone as Tone) ? (r.tone as Tone) : base.tone,
    warn: WARNS.includes(r.warn as WarnStep) ? (r.warn as WarnStep) : base.warn,
    dot: flag(r.dot, base.dot),
    drop: flag(r.drop, base.drop),
    hidden: flag(r.hidden, base.hidden),
    quiet: flag(r.quiet, base.quiet),
    long: flag(r.long, base.long),
    session: flag(r.session, base.session),
    question: flag(r.question, base.question),
    minutesLeft: typeof r.minutesLeft === 'number' && Number.isInteger(r.minutesLeft) && r.minutesLeft >= 0 && r.minutesLeft <= 600 ? r.minutesLeft : base.minutesLeft,
    toneSet: typeof r.toneSet === 'string' && r.toneSet in TONE_SETS ? r.toneSet : base.toneSet
  }
}

export class Trial extends EventEmitter {
  private s: TrialState = { ...DEFAULT_TRIAL }
  private lines: string[] = []
  /** The block's end moves on only when the trial changes – its countdown runs meanwhile. */
  private viewAt = Date.now()
  /** When the trial was last changed (0: never – the engine drives the widget, E4b). */
  changedAt = 0

  get state(): TrialState {
    return this.s
  }

  view(): WidgetView {
    return trialView(this.s, this.viewAt)
  }

  set(patch: unknown): TrialState {
    this.s = trialFrom({ ...this.s, ...(patch as object) }, this.s)
    this.viewAt = Date.now()
    this.changedAt = this.viewAt
    this.emit('change', this.view())
    return this.s
  }

  log(line: string): void {
    const text = `${new Date().toLocaleTimeString('pl-PL', { hour12: false })} ${line}`
    this.lines.push(text)
    if (this.lines.length > LOG_LINES) this.lines.splice(0, this.lines.length - LOG_LINES)
    this.emit('log', text)
  }

  history(): string[] {
    return [...this.lines]
  }

  clear(): void {
    this.lines = []
  }
}
