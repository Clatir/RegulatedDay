/**
 * Telling a crash from a plain end (spec „Terminy”, D181): a local life marker in the app data every 30 s; a crash is an
 * end without a valid record of closing in the same logon session, or a new dump of the main process (process_type
 * „browser”). The same logon session is told by the volatile key the helper sets at the start (it vanishes at logoff and
 * restart, also with fast startup); without the helper an end without a record of closing is no crash (then a close in
 * Task Manager is not recognised either). A record of closing is valid only with no life marker after it (a logoff
 * cancelled). Closing by the installer is no crash: its marker counts when its time falls in the last window of the life
 * marker. A crash after a valid record of closing (while closing) goes only to the local log.
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, readdirSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { minidumpProcessType } from './minidump'

export const LIFE_EVERY_MS = 30_000
/** The installer's marker counts within the last window of the life marker (30 s and a margin for a busy disk). */
export const INSTALLER_WINDOW_MS = LIFE_EVERY_MS + 15_000

export interface LifeMarker {
  format: 1
  runId: string
  version: string
  pid: number
  startedAt: number
  lastAt: number
}

export interface CloseRecord {
  runId: string
  at: number
  why: 'quit' | 'installer' | 'system' | 'update'
}

export interface Session {
  /** The volatile key was there: the previous run's id (same logon session), else null. */
  prevRunId: string | null
}

export type EndKind = 'first' | 'clean' | 'installer' | 'crash' | 'crashWhileClosing' | 'unknown'

export interface Verdict {
  kind: EndKind
  previous: LifeMarker | null
  why: string
}

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

/** Pure: the end of the previous run from what it left behind. */
export function judge(prev: LifeMarker | null, close: CloseRecord | null, session: Session | null, installerAt: number | null, mainDump: boolean): Verdict {
  if (!prev) return { kind: 'first', previous: null, why: 'brak znacznika życia' }
  const validClose = !!close && close.runId === prev.runId && close.at >= prev.lastAt
  if (mainDump) return validClose ? { kind: 'crashWhileClosing', previous: prev, why: 'zrzut procesu głównego po zapisie zamknięcia' } : { kind: 'crash', previous: prev, why: 'zrzut procesu głównego' }
  if (validClose) return { kind: 'clean', previous: prev, why: `zamknięcie (${close!.why})` }
  if (installerAt != null && installerAt >= prev.lastAt && installerAt <= prev.lastAt + INSTALLER_WINDOW_MS) return { kind: 'installer', previous: prev, why: 'zamknięte przez instalator' }
  if (!session) return { kind: 'unknown', previous: prev, why: 'bez pomocnika – koniec bez zapisu zamknięcia nie jest awarią' }
  if (session.prevRunId === prev.runId) return { kind: 'crash', previous: prev, why: 'koniec bez zapisu zamknięcia w tej samej sesji logowania' }
  return { kind: 'clean', previous: prev, why: 'inna sesja logowania (wylogowanie albo restart)' }
}

export class LifeKeeper {
  private marker: LifeMarker | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  /** Closing began: a start that comes later (a quit during the start of the app) writes no marker. */
  private closed = false

  constructor(private readonly dir: string) {}

  get lifeFile(): string {
    return join(this.dir, 'life.json')
  }
  get closeFile(): string {
    return join(this.dir, 'closing.json')
  }
  get installerFile(): string {
    return join(this.dir, 'closed-by-installer.json')
  }

  previous(): LifeMarker | null {
    return readJson<LifeMarker>(this.lifeFile)
  }

  closeRecord(): CloseRecord | null {
    return readJson<CloseRecord>(this.closeFile)
  }

  installerMarker(): number | null {
    const m = readJson<{ at?: unknown }>(this.installerFile)
    return typeof m?.at === 'number' ? m.at : null
  }

  /** A new dump of the main process since `since` (renderer and GPU dumps in the same folder do not count). */
  static mainDumpSince(dumpDir: string, since: number): { found: boolean; types: string[] } {
    const types: string[] = []
    let found = false
    const walk = (d: string) => {
      if (!existsSync(d)) return
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else if (n.endsWith('.dmp') && st.mtimeMs >= since) {
          let type: string | null = null
          try {
            type = minidumpProcessType(readFileSync(p))
          } catch {
            type = null
          }
          types.push(type ?? '?')
          if (type === 'browser') found = true
        }
      }
    }
    walk(dumpDir)
    return { found, types }
  }

  /** Synchronous write without waiting for the disk: the session's end may end the process right after. */
  private writeNow(file: string, text: string, sync: boolean): void {
    const fd = openSync(file, 'w')
    try {
      writeSync(fd, text)
      if (sync) fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }

  start(runId: string, version: string, now = Date.now()): void {
    if (this.closed) return
    this.marker = { format: 1, runId, version, pid: process.pid, startedAt: now, lastAt: now }
    this.beat(now)
    this.timer = setInterval(() => this.beat(), LIFE_EVERY_MS)
    this.timer.unref?.()
  }

  beat(now = Date.now()): void {
    if (!this.marker) return
    this.marker.lastAt = now
    try {
      this.writeNow(this.lifeFile, `${JSON.stringify(this.marker)}\n`, false)
    } catch {
      /* the next beat tries again */
    }
  }

  /** The record of closing; `system`: at the end of the Windows session – one synchronous write, no fsync. */
  close(why: CloseRecord['why'], now = Date.now()): void {
    this.closed = true
    if (!this.marker) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    try {
      this.writeNow(this.closeFile, `${JSON.stringify({ runId: this.marker.runId, at: now, why })}\n`, why !== 'system')
    } catch {
      try {
        appendFileSync(this.closeFile, '')
      } catch {
        /* nothing more to do */
      }
    }
  }

  /** A logoff was cancelled: the app lives on, the marker beats again (its record of closing is no longer valid). */
  resume(): void {
    if (!this.marker || this.timer) return
    this.closed = false
    this.beat()
    this.timer = setInterval(() => this.beat(), LIFE_EVERY_MS)
    this.timer.unref?.()
  }
}
