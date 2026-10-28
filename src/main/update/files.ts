/**
 * The small files of updates in the app data (spec „Instalacja, aktualizacje i log”): the confirmation „uruchomiono
 * wersję X” (outside the update folder, with the attempt's id – a file of an earlier attempt does not count), the local
 * plan of sessions and classes for the guard, the start sequence's file system, and the cleaning of old update folders.
 */
import { closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync, renameSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { compareVersions, parseManifest } from '@shared/update'
import { readTask, type Task } from '@shared/task'
import type { StartupDeps } from './startup'

/** Atomic and synchronous (the start sequence runs before the app is ready): a temporary file renamed over. */
export function writeSyncAtomic(path: string, text: string): void {
  const tmp = join(dirname(path), `.${randomBytes(4).toString('hex')}.tmp`)
  writeFileSync(tmp, text)
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, path)
      return
    } catch (e) {
      if (i >= 20) throw e
      const until = Date.now() + 100
      while (Date.now() < until) {
        /* a reader holds the file: a moment later */
      }
    }
  }
}

/** A file's text; null = none; a busy file read again 3 times within 1 s. */
export function readSharedSync(path: string): string | null {
  for (let attempt = 0; ; attempt++) {
    try {
      return readFileSync(path, 'utf8')
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return null
      if (attempt >= 3) throw e
      const until = Date.now() + 250
      while (Date.now() < until) {
        /* busy */
      }
    }
  }
}

export function heldOpen(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    closeSync(openSync(path, 'r+'))
    return false
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * The first of the manifest's files missing in the installation or of another size; null = all agree (only its files).
 * Electron's fs shows an asar archive as a folder of size 0: the check reads with the archives' support off.
 */
export function manifestMismatch(taskDir: string, task: Task): string | null {
  let m
  try {
    m = parseManifest(readFileSync(join(taskDir, task.manifest), 'utf8'))
  } catch (e) {
    return `manifest nieczytelny (${e instanceof Error ? e.message : String(e)})`
  }
  const proc = process as { noAsar?: boolean }
  const noAsar = proc.noAsar
  proc.noAsar = true
  try {
    for (const f of m.files) {
      let size: number
      try {
        size = statSync(join(task.installDir, ...f.path.split('/'))).size
      } catch {
        return `${f.path} – brak pliku`
      }
      if (size !== f.size) return `${f.path} – ${size} B zamiast ${f.size} B`
    }
    return null
  } finally {
    proc.noAsar = noAsar
  }
}

export function fsDeps(): Pick<StartupDeps, 'readText' | 'writeText' | 'appendText' | 'listDirs' | 'heldOpen' | 'processAlive' | 'filesMismatch'> {
  return {
    readText: readSharedSync,
    writeText: writeSyncAtomic,
    appendText: (p, t) => appendFileSync(p, t),
    listDirs: (dir) => {
      try {
        return readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch {
        return null
      }
    },
    heldOpen,
    processAlive,
    filesMismatch: manifestMismatch
  }
}

// ------------------------------------------------------------------ „uruchomiono wersję X”

export function writeLaunched(userData: string, version: string, attemptId: string): void {
  writeSyncAtomic(join(userData, 'launched.json'), `${JSON.stringify({ version, attemptId, at: Date.now() })}\n`)
}

// ------------------------------------------------------------------ the plan for the guard

export interface PlanBlock {
  start: number
  end: number
  kind: 'session' | 'class'
}

export const PLAN_DAYS = 7

/** The local plan of sessions and classes for the next 7 logical days, with absolute times (E1/E4a fill the blocks). */
export function writePlan(userData: string, blocks: PlanBlock[], now = Date.now()): void {
  writeSyncAtomic(join(userData, 'plan-blocks.json'), `${JSON.stringify({ format: 1, from: now, to: now + PLAN_DAYS * 24 * 60 * 60_000, blocks }, null, 2)}\n`)
}

/** A session or a class runs now or starts within 30 min by the plan file (as the guard judges the logon, A5-03). */
export function planBlocking(userData: string, now = Date.now()): boolean {
  try {
    const p = JSON.parse(readFileSync(join(userData, 'plan-blocks.json'), 'utf8')) as { blocks?: Array<Partial<PlanBlock>> }
    return (p.blocks ?? []).some((b) => typeof b.start === 'number' && typeof b.end === 'number' && now >= b.start - 30 * 60_000 && now < b.end)
  } catch {
    return false
  }
}

// ------------------------------------------------------------------ cleaning

/**
 * After the lock of one copy: the folders update\<v> of versions not newer than the running one go, unless they hold a
 * task in another state than „done” or a held guard.lock; locked files are skipped (tried again at the next start). A
 * downloaded release not installed yet (a newer version) waits in update\<X>\download and stays.
 */
export function cleanUpdateFolders(updateDir: string, current: string, log: (msg: string) => void): void {
  for (const name of existsSync(updateDir) ? readdirSync(updateDir) : []) {
    const dir = join(updateDir, name)
    try {
      if (!statSync(dir).isDirectory()) continue
      if (!/^\d+\.\d+\.\d+/.test(name) || compareVersions(name, current) > 0) continue
      const t = readTask(readSharedSync(join(dir, 'task.json')))
      // An older version „nieudane” or „odłożono” will never install now – a newer one runs (A5-10); the running one's
      // failure stays for its banner (D316).
      const over = compareVersions(name, current) < 0 && t.kind === 'task' && (t.task.state === 'failed' || t.task.state === 'postponed')
      if (t.kind === 'task' && t.task.state !== 'done' && !over) continue
      if (heldOpen(join(dir, 'guard.lock'))) continue
      rmSync(dir, { recursive: true, force: true, maxRetries: 2 })
      log(`usunięty folder aktualizacji ${name}`)
    } catch (e) {
      log(`folder aktualizacji ${name}: ${e instanceof Error ? e.message : String(e)} – przy następnym starcie`)
    }
  }
}

/** The manifest of the running version (copied with its installer): its version and Electron's. */
export function manifestOf(updateDir: string, version: string): { version: string; electron: string } | null {
  try {
    const m = parseManifest(readFileSync(join(updateDir, version, 'Regulated-Day-manifest.json'), 'utf8'))
    return { version: m.version, electron: m.electron }
  } catch {
    return null
  }
}
