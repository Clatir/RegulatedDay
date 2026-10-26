/**
 * The helper (spec „Widget” → Pomocnik): a small C# program shipped with the installer that does what Node without
 * native modules cannot – the order of windows for the desktop bar, the change of the foreground window, the state of
 * notifications, power requests, the logon session. It starts as a child process with its working folder in the app
 * data, gets its paths as JSON, talks in JSON lines (UTF-8) and says it is alive every 2 s. After a crash it starts again
 * after 5 s, then ever more rarely, up to 5 min; after 3 crashes in 10 min it is „niedostępny”. RD_HELPER_PATH (tests,
 * CI on Linux) puts another program in its place – a .js/.mjs file runs in Electron's Node.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import type { HelperStatus } from '@shared/api'

export const HELPER_ALIVE_MS = 2000
export const HELPER_SILENT_MS = 10_000
export const HELPER_RESTART_MIN_MS = 5000
export const HELPER_RESTART_MAX_MS = 5 * 60_000
export const HELPER_CRASH_WINDOW_MS = 10 * 60_000
export const HELPER_CRASH_LIMIT = 3

export interface HelperMessage {
  type?: string
  re?: number
  ok?: boolean
  error?: string
  [key: string]: unknown
}

export interface HelperDeps {
  /** The program; null = not there (the status says „missing”). */
  program: string | null
  cwd: string
  /** The first line the helper reads: its paths and identity as JSON. */
  init: Record<string, unknown>
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  now?: () => number
}

/** The delay before the next start after `crashes` crashes in a row: 5 s, 10 s, 20 s … at most 5 min. */
export const restartDelay = (crashes: number): number => Math.min(HELPER_RESTART_MAX_MS, HELPER_RESTART_MIN_MS * 2 ** Math.max(0, crashes - 1))

/** „Niedostępny”: 3 crashes within the last 10 min. */
export const helperUnavailable = (crashTimes: readonly number[], now: number): boolean => crashTimes.filter((t) => now - t < HELPER_CRASH_WINDOW_MS).length >= HELPER_CRASH_LIMIT

export class HelperClient extends EventEmitter {
  private child: ChildProcess | null = null
  private pending = new Map<number, { resolve: (m: HelperMessage) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  private nextId = 1
  private crashTimes: number[] = []
  private crashesInRow = 0
  private lastAlive = 0
  private watchdog: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private stopped = false
  private hello = false
  private state: HelperStatus = { state: 'off', note: null }

  constructor(private readonly d: HelperDeps) {
    super()
  }

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  get status(): HelperStatus {
    return this.state
  }

  /** Answering now (its hello came and it is alive). */
  get running(): boolean {
    return this.state.state === 'running'
  }

  private setStatus(next: HelperStatus): void {
    if (next.state === this.state.state && next.note === this.state.note) return
    this.state = next
    this.emit('status', next)
  }

  start(): void {
    this.stopped = false
    if (!this.d.program || !existsSync(this.d.program)) {
      this.setStatus({ state: 'missing', note: 'Brak programu pomocnika w instalacji.' })
      return
    }
    this.spawnChild()
  }

  private spawnChild(): void {
    const program = this.d.program!
    const script = /\.(m?js|cjs)$/i.test(program)
    const child = spawn(script ? process.execPath : program, script ? [program] : [], {
      cwd: this.d.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: script ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env
    })
    this.child = child
    this.hello = false
    this.lastAlive = this.now
    if (!helperUnavailable(this.crashTimes, this.now)) this.setStatus({ state: 'starting', note: null })
    child.stdin!.setDefaultEncoding('utf8')
    child.stdin!.on('error', () => undefined)
    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line))
    createInterface({ input: child.stderr! }).on('line', (line) => this.d.log('warn', `pomocnik: ${line.slice(0, 500)}`))
    child.on('error', (e) => this.d.log('warn', 'pomocnik nie wystartował', e))
    child.on('exit', (code, signal) => this.onExit(child, code, signal))
    this.write({ cmd: 'init', ...this.d.init })
    this.watchdog = setInterval(() => {
      if (this.child === child && this.now - this.lastAlive > HELPER_SILENT_MS) {
        this.d.log('warn', `pomocnik milczy od ${Math.round((this.now - this.lastAlive) / 1000)} s – zamykam go`)
        child.kill()
      }
    }, HELPER_ALIVE_MS)
    this.watchdog.unref?.()
  }

  private onLine(line: string): void {
    let m: HelperMessage
    try {
      m = JSON.parse(line) as HelperMessage
    } catch {
      this.d.log('warn', `pomocnik: nieczytelna linia ${line.slice(0, 200)}`)
      return
    }
    this.lastAlive = this.now
    if (m.type === 'hello') {
      this.hello = true
      this.crashesInRow = 0
      this.setStatus({ state: helperUnavailable(this.crashTimes, this.now) ? 'unavailable' : 'running', note: null })
      this.d.log('info', `pomocnik działa (wersja ${String(m.version ?? '?')}, pid ${String(m.pid ?? '?')})`)
    }
    if (m.type === 'alive') {
      if (this.hello && this.state.state === 'unavailable' && !helperUnavailable(this.crashTimes, this.now)) this.setStatus({ state: 'running', note: null })
      return
    }
    if (typeof m.re === 'number') {
      const p = this.pending.get(m.re)
      if (p) {
        this.pending.delete(m.re)
        clearTimeout(p.timer)
        p.resolve(m)
      }
      return
    }
    if (m.type === 'log') {
      this.d.log(m.level === 'error' ? 'error' : m.level === 'warn' ? 'warn' : 'info', `pomocnik: ${String(m.message ?? '')}`)
      return
    }
    if (m.type) this.emit('event', m)
  }

  private onExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    if (this.child !== child) return
    this.child = null
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = null
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('pomocnik zakończył się'))
    }
    this.pending.clear()
    if (this.stopped) {
      this.setStatus({ state: 'off', note: null })
      return
    }
    this.crashTimes = [...this.crashTimes.filter((t) => this.now - t < HELPER_CRASH_WINDOW_MS), this.now]
    this.crashesInRow++
    const delay = restartDelay(this.crashesInRow)
    const unavailable = helperUnavailable(this.crashTimes, this.now)
    this.d.log('warn', `pomocnik zakończył się (kod ${code ?? signal}) – ponowny start za ${Math.round(delay / 1000)} s${unavailable ? ', niedostępny (3 awarie w 10 min)' : ''}`)
    this.setStatus(unavailable ? { state: 'unavailable', note: 'Pomocnik kilka razy przestał działać – działam bez niego.' } : { state: 'starting', note: null })
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.stopped) this.spawnChild()
    }, delay)
    this.restartTimer.unref?.()
  }

  private write(obj: Record<string, unknown>): void {
    const stdin = this.child?.stdin
    if (!stdin || stdin.destroyed) return
    stdin.write(`${JSON.stringify(obj)}\n`)
  }

  /** A command without an answer (the helper's events follow). */
  send(cmd: string, args: Record<string, unknown> = {}): void {
    this.write({ cmd, ...args })
  }

  /** A command and its answer; rejects when the helper does not run or does not answer in time. */
  request(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 5000): Promise<HelperMessage> {
    if (!this.child) return Promise.reject(new Error('pomocnik nie działa'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`pomocnik nie odpowiedział na ${cmd} w ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ cmd, id, ...args })
    })
  }

  stop(): void {
    this.stopped = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    const child = this.child
    if (!child) return
    this.write({ cmd: 'quit' })
    setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) child.kill()
    }, 1500).unref?.()
  }
}
