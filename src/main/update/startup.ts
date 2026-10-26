/**
 * The start of the production app while an installation may be under way (spec „Instalacja, aktualizacje i log”). The
 * app never waits in the installation folder: before the lock of one copy and without the helper it reads only the task
 * file in update\<X> (in the state „FI” it also opens the installer's file, read and write, without truncating). No
 * task, an unreadable one (logged), an unknown format, „postponed” or „failed”: a normal start without delay.
 *
 * - „FI” with a live installer: an older version, and X started without „--updated”, end within 1 s. Otherwise, after
 *   the lock: a newer version „done” without the manifest of X; X „done” when its files' sizes agree with the manifest,
 *   else „failed” with the quiet banner „nie dokończyła się”; an older „failed” with the banner „nie udała się”.
 * - Otherwise: a version newer than X ends the task and removes the guard's entry; X does so only at „done” (or when
 *   it is the start the owner made, with „--updated”: it confirms „uruchomiono wersję X”). In the other cases the app
 *   reads guard.lock: alive (its counter changed between two reads 6 s apart) – the app hands its start over
 *   (handover.jsonl) and ends within 1 s; held but standing still 30 s (reads every 10 s) – hung: its process is closed
 *   and a new guard started; free – a guard is started with the handover, and the app waits at most 60 s for any owner
 *   to take the lock with a changing counter (the end of the guard it started ends the wait only when the lock is free
 *   at two tries 1 s apart). No owner in time: „failed”, the guard's entry removed, the sizes compared, a normal start
 *   with the banner „nie dokończyła się” – the app never closes without a trace.
 */
import { compareVersions } from '@shared/update'
import { handoverLine, readGuardLock, readTask, writeTask, type Task } from '@shared/task'

export const FI_ALIVE_MAX_MS = 10 * 60_000
export const FI_FRESH_MS = 60_000
export const LOCK_SECOND_READ_MS = 6000
export const LOCK_HUNG_MS = 30_000
export const LOCK_HUNG_READ_MS = 10_000
export const OWNER_WAIT_MS = 60_000

export interface StartupDeps {
  updateDir: string
  version: string
  argv: readonly string[]
  /** The scheme of the app's address (production: regulatedday). */
  protocol: string
  now(): number
  sleep(ms: number): Promise<void>
  /** A file's text; null = none. A busy file is read again 3 times within 1 s; then it throws. */
  readText(path: string): string | null
  writeText(path: string, text: string): void
  appendText(path: string, text: string): void
  listDirs(dir: string): string[] | null
  /** Held open by another process so that it cannot be opened for writing (read and write, never truncating). */
  heldOpen(path: string): boolean
  processAlive(pid: number): boolean
  /** The first file of the manifest missing or of another size (only the files of the manifest); null = all agree. */
  filesMismatch(taskDir: string, task: Task): string | null
  /** Starts the guard (detached, outside the app's job) for the task in `taskDir`; answers its process. */
  startGuard(taskDir: string): { pid: number; exited: () => boolean } | null
  /** Closes a hung owner after checking its program's name and start time. */
  killOwner(pid: number, startMs: number): boolean
  removeGuardEntry(): void
  log(level: 'info' | 'warn' | 'error', msg: string): void
}

export type Banner = { kind: 'failed' | 'unfinished'; version: string }

export type StartupResult =
  | { kind: 'normal'; banner: Banner | null; afterLock: (() => Banner | null) | null; confirmed: Task | null }
  | { kind: 'exit'; reason: string }

const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, '')}\\${b}`

/** The task of the update folder that matters: one not finished, the newest version first. */
export function findTask(d: Pick<StartupDeps, 'updateDir' | 'listDirs' | 'readText' | 'log'>): { dir: string; task: Task; raw: Record<string, unknown> } | null {
  const found: Array<{ dir: string; task: Task; raw: Record<string, unknown> }> = []
  for (const name of d.listDirs(d.updateDir) ?? []) {
    const dir = join(d.updateDir, name)
    let text: string | null
    try {
      text = d.readText(join(dir, 'task.json'))
    } catch (e) {
      d.log('warn', `plik zadania ${name} nieczytelny: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const r = readTask(text)
    if (r.kind === 'unreadable') d.log('warn', `plik zadania ${name} nieczytelny: ${r.error}`)
    if (r.kind === 'unknownFormat') d.log('warn', `plik zadania ${name}: nieznany format ${String(r.format)}`)
    if (r.kind === 'task') found.push({ dir, task: r.task, raw: r.raw })
  }
  const open = found.filter((f) => f.task.state !== 'done' && f.task.state !== 'postponed' && f.task.state !== 'failed')
  const pool = open.length ? open : found
  pool.sort((a, b) => compareVersions(b.task.version, a.task.version))
  return pool[0] ?? null
}

/** The handover line of this start: --hidden, the address, or nothing. */
function myHandover(d: StartupDeps): string {
  const url = d.argv.find((a) => a.startsWith(`${d.protocol}:`)) ?? null
  return handoverLine({ at: d.now(), hidden: d.argv.includes('--hidden'), url })
}

function update(d: StartupDeps, dir: string, task: Task, raw: Record<string, unknown>, patch: Partial<Task>): Task {
  const next = { ...task, ...patch, updatedAt: d.now() }
  d.writeText(join(dir, 'task.json'), writeTask(next, raw))
  return next
}

function lockCounter(d: StartupDeps, dir: string): { held: boolean; counter: number | null; pid: number; startMs: number } {
  const path = join(dir, 'guard.lock')
  const held = d.heldOpen(path)
  let lock = null
  try {
    lock = readGuardLock(d.readText(path))
  } catch {
    lock = null
  }
  return { held, counter: lock?.counter ?? null, pid: lock?.pid ?? 0, startMs: lock?.startMs ?? 0 }
}

export async function runStartup(d: StartupDeps): Promise<StartupResult> {
  const normal = (banner: Banner | null = null, afterLock: (() => Banner | null) | null = null, confirmed: Task | null = null): StartupResult => ({ kind: 'normal', banner, afterLock, confirmed })
  const found = findTask(d)
  if (!found) return normal()
  const { dir, raw } = found
  let task = found.task
  const X = task.version
  const cmp = compareVersions(d.version, X)
  const updated = d.argv.includes('--updated')

  if (task.state === 'postponed') return normal()
  // „nieudane” for a newer X: the banner „nie udała się · Spróbuj ponownie · Pobierz” until a retry or a newer release.
  if (task.state === 'failed') return normal(cmp < 0 ? { kind: task.message === 'strażnik nie wystartował' || task.message === 'pliki niezgodne z manifestem' ? 'unfinished' : 'failed', version: X } : null)

  if (task.state === 'fi') {
    const installer = join(dir, task.installer)
    const fresh = task.installerPid == null && d.now() - task.updatedAt < FI_FRESH_MS
    const live = d.now() - task.updatedAt < FI_ALIVE_MAX_MS && (fresh || (task.installerPid != null && d.processAlive(task.installerPid) && d.heldOpen(installer)))
    if (live && (cmp < 0 || (cmp === 0 && !updated))) return { kind: 'exit', reason: `trwa instalacja ${X} (ścieżka FI)` }
    // After the lock of one copy: the state of the task. X started with „--updated” confirms „uruchomiono wersję X”.
    const confirm = cmp === 0 && updated ? task : null
    return normal(
      null,
      () => {
      if (cmp > 0) {
        update(d, dir, task, raw, { state: 'done' })
        return null
      }
      if (cmp === 0) {
        const bad = d.filesMismatch(dir, task)
        if (bad == null) {
          update(d, dir, task, raw, { state: 'done' })
          return null
        }
        d.log('warn', `pliki niezgodne z manifestem ${X}: ${bad}`)
        update(d, dir, task, raw, { state: 'failed', message: 'pliki niezgodne z manifestem' })
        return { kind: 'unfinished', version: X }
      }
      update(d, dir, task, raw, { state: 'failed', message: 'starsza wersja po instalacji' })
      return { kind: 'failed', version: X }
      },
      confirm
    )
  }

  // scheduled / installing / done: an owner (the guard or the install helper) runs the installation.
  if (cmp > 0 || (cmp === 0 && task.state === 'done')) {
    return normal(null, () => {
      if (task.state !== 'done') update(d, dir, task, raw, { state: 'done' })
      d.removeGuardEntry()
      return null
    })
  }
  // X started by its owner after the installation: the confirmation „uruchomiono wersję X” (the owner finishes the task).
  if (cmp === 0 && updated) return normal(null, null, task)

  const handover = join(dir, 'handover.jsonl')
  const handOver = (why: string): StartupResult => {
    d.appendText(handover, myHandover(d))
    return { kind: 'exit', reason: why }
  }

  const first = lockCounter(d, dir)
  let needGuard = !first.held
  if (first.held) {
    await d.sleep(LOCK_SECOND_READ_MS)
    const second = lockCounter(d, dir)
    if (second.held && second.counter !== first.counter) return handOver(`strażnik ${X} żyje – start przekazany`)
    if (!second.held) needGuard = true
    else {
      // Held and standing still: read every 10 s until 30 s without a change.
      const since = d.now() - LOCK_SECOND_READ_MS
      let hung = false
      while (!hung) {
        await d.sleep(LOCK_HUNG_READ_MS)
        const c = lockCounter(d, dir)
        if (!c.held) {
          needGuard = true
          break
        }
        if (c.counter !== first.counter) return handOver(`strażnik ${X} ruszył – start przekazany`)
        if (d.now() - since >= LOCK_HUNG_MS) hung = true
      }
      if (hung) {
        d.log('warn', `strażnik ${X} zawieszony (sygnał stoi ${LOCK_HUNG_MS / 1000} s) – zamykam go`)
        d.killOwner(second.pid, second.startMs)
        needGuard = true
      }
    }
  }

  if (needGuard) {
    d.appendText(handover, myHandover(d))
    const started = d.startGuard(dir)
    d.log('info', `strażnik ${X} uruchomiony przez aplikację${started ? ` (pid ${started.pid})` : ' – nie wystartował'}`)
    const until = d.now() + OWNER_WAIT_MS
    let last = lockCounter(d, dir)
    while (d.now() < until) {
      await d.sleep(500)
      const c = lockCounter(d, dir)
      if (c.held && last.held && c.counter != null && c.counter !== last.counter) return { kind: 'exit', reason: `strażnik ${X} przejął start` }
      last = c
      if (started?.exited() && !c.held) {
        await d.sleep(1000)
        if (!lockCounter(d, dir).held) break
      }
    }
  }

  // No owner in time: never closing without a trace.
  d.log('warn', `strażnik ${X} nie przejął instalacji – zwykły start z banerem`)
  task = update(d, dir, task, raw, { state: 'failed', message: 'strażnik nie wystartował' })
  d.removeGuardEntry()
  const bad = d.filesMismatch(dir, task)
  d.log('info', bad == null ? `pliki zgodne z manifestem ${X}` : `pliki niezgodne z manifestem ${X}: ${bad}`)
  return normal({ kind: 'unfinished', version: X })
}
