/**
 * Input and use of this computer (spec „Użycie komputera”, „Obecność przy komputerze”): every 5 s the system's idle
 * time is sampled; a sample with less than 5 s of idle time is input (what Windows counts as activity: mouse, keyboard,
 * touch, pen, also a program moving the mouse; a game pad not). Samples with breaks up to 15 s join into one streak, and
 * a streak of at least 30 s outside the app is use – the time the main window or the icon's panel has the focus, and
 * 10 s after a click of the desktop bar or the icon, is the app's own handling, never use.
 *
 * The day's log gets the gaps in input and in use from 2 min: a gap is written when it reaches 2 min (with the last input
 * outside the app before it) and closed at the next input or use; a gap through 04:00 is split between both days. Any
 * input is presence (who leads, the day without presence). The source is the system's last input
 * (powerMonitor.getSystemIdleTime – GetLastInputInfo, the same the helper would read; T464).
 */
import { dayStart, logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'

export const SAMPLE_MS = 5_000
/** A sample with less idle time than this is input. */
export const INPUT_IDLE_MS = 5_000
/** Samples with breaks up to this join into one streak. */
export const JOIN_MS = 15_000
/** A streak of at least this outside the app is use. */
export const USE_MS = 30_000
/** Gaps from this long are written to the day's log. */
export const GAP_MS = 2 * 60_000
/** Around a click of the desktop bar or the icon the input is the app's own. */
export const APP_CLICK_MS = 10_000
/** The presence's state turns „idle” only after this long without input (reading is no flapping of the file). */
export const PRESENCE_IDLE_MS = 15_000

export interface InputDeps {
  now: () => number
  /** Seconds since the last input on this computer. */
  idleSeconds: () => number
  /** The main window or the icon's panel has the focus. */
  appFocused: () => boolean
  /** An event of this computer for a day's log (meta). */
  write: (draft: { day: string; dom: 'meta'; k: string } & Record<string, unknown>) => void
  /** Input at `at` (presence; outside the app also use of the computer). */
  presence: (at: number, outsideApp: boolean) => void
  /** No input in this sample. */
  idle: () => void
  computer: string
}

interface OpenGap {
  id: string
  kind: 'input' | 'use'
  from: number
  day: string
}

export class InputTracker {
  private lastInput: number | null = null
  private lastOutside: number | null = null
  private streak: { from: number; last: number } | null = null
  private lastUse: number | null = null
  private lastClick = Number.NEGATIVE_INFINITY
  private gaps: { input: OpenGap | null; use: OpenGap | null } = { input: null, use: null }
  private readonly started: number

  constructor(private readonly d: InputDeps) {
    this.started = d.now()
  }

  /** A click of the desktop bar or the icon: the next 10 s are the app's own handling. */
  clickedApp(at = this.d.now()): void {
    this.lastClick = at
  }

  /** The last input outside the app (for the presence and the session's end at the last input). */
  get lastOutsideInput(): number | null {
    return this.lastOutside
  }

  /** One sample (every 5 s). */
  sample(): void {
    const now = this.d.now()
    const idleMs = Math.max(0, this.d.idleSeconds() * 1000)
    const inputAt = now - idleMs
    // The system's last input, also one between two samples (never before the start: it was not observed).
    if (inputAt >= this.started && (this.lastInput == null || inputAt > this.lastInput)) this.lastInput = inputAt
    if (idleMs < INPUT_IDLE_MS) {
      const inApp = this.d.appFocused() || now - this.lastClick <= APP_CLICK_MS
      this.d.presence(inputAt, !inApp)
      this.close('input', inputAt)
      if (!inApp) {
        this.lastOutside = inputAt
        this.streak = this.streak && inputAt - this.streak.last <= JOIN_MS ? { from: this.streak.from, last: inputAt } : { from: inputAt, last: inputAt }
        if (this.streak.last - this.streak.from >= USE_MS) {
          this.lastUse = this.streak.last
          this.close('use', this.streak.from)
        }
      }
    } else if (idleMs >= PRESENCE_IDLE_MS) this.d.idle()
    this.splitAtDay(now)
    // Gaps reaching 2 min are written (input: from the last input; use: from the last use, or the start of observation).
    const lastInput = this.lastInput ?? this.started
    if (!this.gaps.input && now - lastInput >= GAP_MS) this.open('input', lastInput)
    const lastUse = this.lastUse ?? this.started
    if (!this.gaps.use && now - lastUse >= GAP_MS) this.open('use', lastUse)
  }

  private open(kind: 'input' | 'use', from: number): void {
    const day = logicalDayOf(from)
    const g: OpenGap = { id: `${this.d.computer}-${kind}-${from.toString(36)}`, kind, from, day }
    this.gaps[kind] = g
    this.d.write({ day, dom: 'meta', k: 'gap.open', gap: g.id, kind, from, lastOutside: kind === 'input' ? this.lastOutside : null })
  }

  private close(kind: 'input' | 'use', to: number): void {
    const g = this.gaps[kind]
    if (!g) return
    this.gaps[kind] = null
    this.d.write({ day: g.day, dom: 'meta', k: 'gap.close', gap: g.id, to: Math.max(g.from, to) })
  }

  /** A gap open through 04:00 is closed at the day's start and opened again in the new day. */
  private splitAtDay(now: number): void {
    for (const kind of ['input', 'use'] as const) {
      const g = this.gaps[kind]
      if (!g) continue
      const today = logicalDayOf(now)
      if (g.day === today) continue
      const boundary = dayStart(addDays(g.day, 1))
      this.gaps[kind] = null
      this.d.write({ day: g.day, dom: 'meta', k: 'gap.close', gap: g.id, to: boundary })
      const day = logicalDayOf(boundary)
      const next: OpenGap = { id: `${this.d.computer}-${kind}-${boundary.toString(36)}`, kind, from: boundary, day }
      this.gaps[kind] = next
      this.d.write({ day, dom: 'meta', k: 'gap.open', gap: next.id, kind, from: boundary, lastOutside: kind === 'input' ? this.lastOutside : null })
    }
  }
}
