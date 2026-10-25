/**
 * The task file of an installation (update\<X>\task.json – spec „Instalacja, aktualizacje i log”), shared by the app,
 * the guard and the install helper. It has a format number; an unknown one, an unreadable file or none at all means the
 * app starts normally. Fields this version does not know are kept when it writes the file.
 */
export const TASK_FORMAT = 1

export type TaskState = 'scheduled' | 'installing' | 'postponed' | 'done' | 'failed' | 'fi'
export type TaskTrigger = 'exit' | 'now' | 'night' | 'logon'
export type TaskStart = 'visible' | 'hidden' | 'none'

export interface Task {
  format: number
  version: string
  attemptId: string
  state: TaskState
  trigger: TaskTrigger
  start: TaskStart
  url: string | null
  autostart: boolean
  guid: string
  uninstallKey: string
  installDir: string
  appExe: string
  installer: string
  manifest: string
  attempts: number
  starts: number
  cleanEnd: boolean
  installerStartedAt: number | null
  installerPid: number | null
  createdAt: number
  updatedAt: number
  message: string | null
}

const STATES: TaskState[] = ['scheduled', 'installing', 'postponed', 'done', 'failed', 'fi']
const TRIGGERS: TaskTrigger[] = ['exit', 'now', 'night', 'logon']
const STARTS: TaskStart[] = ['visible', 'hidden', 'none']

export type TaskRead = { kind: 'none' } | { kind: 'unreadable'; error: string } | { kind: 'unknownFormat'; format: unknown } | { kind: 'task'; task: Task; raw: Record<string, unknown> }

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const int = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d)
const nint = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)

/** The task from the file's text (null text = no file). */
export function readTask(text: string | null): TaskRead {
  if (text == null) return { kind: 'none' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { kind: 'unreadable', error: e instanceof Error ? e.message : String(e) }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'unreadable', error: 'nie obiekt' }
  const r = raw as Record<string, unknown>
  if (r.format !== TASK_FORMAT) return { kind: 'unknownFormat', format: r.format }
  const state = STATES.includes(r.state as TaskState) ? (r.state as TaskState) : null
  if (!state || typeof r.version !== 'string') return { kind: 'unreadable', error: 'brak stanu albo wersji' }
  return {
    kind: 'task',
    raw: r,
    task: {
      format: TASK_FORMAT,
      version: r.version,
      attemptId: str(r.attemptId),
      state,
      trigger: TRIGGERS.includes(r.trigger as TaskTrigger) ? (r.trigger as TaskTrigger) : 'exit',
      start: STARTS.includes(r.start as TaskStart) ? (r.start as TaskStart) : 'none',
      url: typeof r.url === 'string' ? r.url : null,
      autostart: r.autostart === true,
      guid: str(r.guid),
      uninstallKey: str(r.uninstallKey),
      installDir: str(r.installDir),
      appExe: str(r.appExe),
      installer: str(r.installer, 'Regulated-Day-Setup.exe'),
      manifest: str(r.manifest, 'Regulated-Day-manifest.json'),
      attempts: int(r.attempts),
      starts: int(r.starts),
      cleanEnd: r.cleanEnd === true,
      installerStartedAt: nint(r.installerStartedAt),
      installerPid: nint(r.installerPid),
      createdAt: int(r.createdAt),
      updatedAt: int(r.updatedAt),
      message: typeof r.message === 'string' ? r.message : null
    }
  }
}

/** The text of a task: its fields over what the file held (fields this version does not know stay). */
export function writeTask(task: Task, raw: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ ...raw, ...task }, null, 2)}\n`
}

/** The guard's lock file (update\<X>\guard.lock): the owner's role, process and signal of life. */
export interface GuardLock {
  role: 'guard' | 'install'
  pid: number
  startMs: number
  counter: number
}

export function readGuardLock(text: string | null): GuardLock | null {
  if (!text) return null
  try {
    const o = JSON.parse(text.trim().replace(/\0+$/, '')) as Partial<GuardLock>
    if ((o.role !== 'guard' && o.role !== 'install') || typeof o.pid !== 'number' || typeof o.counter !== 'number') return null
    return { role: o.role, pid: o.pid, startMs: typeof o.startMs === 'number' ? o.startMs : 0, counter: o.counter }
  } catch {
    return null
  }
}

/** One line of handover.jsonl: the arguments of an app's start the owner takes over (visible before hidden, the last address). */
export interface Handover {
  at: number
  hidden: boolean
  url: string | null
}

export function handoverLine(h: Handover): string {
  return `${JSON.stringify(h)}\n`
}

/** What the owner starts after the installation from the handed over starts. */
export function mergeHandovers(lines: string, base: { start: TaskStart; url: string | null }): { start: TaskStart; url: string | null } {
  let start = base.start
  let url = base.url
  for (const line of lines.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const h = JSON.parse(line) as Partial<Handover>
      if (h.hidden === false) start = 'visible'
      else if (start === 'none') start = 'hidden'
      if (typeof h.url === 'string') url = h.url
    } catch {
      /* a torn line: skipped */
    }
  }
  return { start, url }
}
