// adapted from FI src/main/log.ts @ de81f2b
/**
 * The log of errors and crashes (spec „Instalacja, aktualizacje i log”): an append-only file in the app data
 * (logs/main.log), rotated at 1 MB also while the app runs (weeks in the tray), and a repeated line is limited – the same
 * message more than REPEAT_LIMIT times a minute is counted, not written, and the count follows once the minute is over.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type LogLevel = 'info' | 'warn' | 'error'

let file: string | null = null
/** Lines written since the size was checked last. */
let sinceCheck = 0
const MAX_BYTES = 1024 * 1024
const CHECK_EVERY = 200
export const REPEAT_LIMIT = 5
const REPEAT_WINDOW_MS = 60_000

/** Each message's lines in the current minute: how many were written and how many held back. */
const repeats = new Map<string, { since: number; written: number; held: number }>()

/** The clock of the log (tests set it). */
let now = () => Date.now()
export function setLogClock(clock: () => number): void {
  now = clock
}

function rotateIfBig(): void {
  if (!file) return
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, join(dirname(file), 'main.old.log'))
  } catch {
    /* no log yet */
  }
}

export function initLog(userDataDir: string): string {
  const dir = join(userDataDir, 'logs')
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'main.log')
  rotateIfBig()
  return dir
}

function describe(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? detail.message
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

function write(line: string): void {
  if (!file) return
  if (++sinceCheck >= CHECK_EVERY) {
    sinceCheck = 0
    rotateIfBig()
  }
  try {
    appendFileSync(file, line)
  } catch {
    /* logging must never break the app */
  }
}

/** The held-back counts of the minutes that are over, as lines. */
function flushRepeats(at: number, all = false): void {
  for (const [key, r] of repeats) {
    if (!all && at - r.since < REPEAT_WINDOW_MS) continue
    repeats.delete(key)
    if (r.held) write(`${new Date(at).toISOString()} INFO (powtórzone jeszcze ${r.held} razy w ciągu minuty) ${key}\n`)
  }
}

export function log(level: LogLevel, message: string, detail?: unknown): void {
  const at = now()
  flushRepeats(at)
  const key = `${level.toUpperCase()} ${message}`
  const r = repeats.get(key) ?? { since: at, written: 0, held: 0 }
  repeats.set(key, r)
  if (r.written >= REPEAT_LIMIT) {
    r.held++
    return
  }
  r.written++
  const line = `${new Date(at).toISOString()} ${key}${detail !== undefined ? ` ${describe(detail)}` : ''}\n`
  if (level !== 'info') process.stderr.write(line)
  write(line)
}

/** The line of the log at a clean exit: the counts still held back first. */
export function flushLog(): void {
  flushRepeats(now(), true)
}
