// adapted from FI src/main/datastore/backup.ts @ 39d14e8 (restore: FI src/main/datastore/restore.ts @ 1a88646)
/**
 * Kopie zapasowe (spec „Kopie zapasowe”, „Pliki na OneDrive”; T81): one ZIP of the data folder per logical day in
 * `backups/daily/RRRR-MM-DD.zip`, the last 14 kept, and the newest of each past ISO week copied to
 * `backups/weekly/RRRR-Www.zip`, the last 8 kept. Who makes it and when (the leader, after 12:00) is the caller's.
 *
 * Changed against FI:
 * - the ZIP is made from the disk (FI: from the store's records in memory, W7): the logs are append-only files written
 *   meanwhile, so a log goes in up to its last whole line;
 * - the data are the .json and .jsonl files outside backups/, hidden folders and temp files (FI: its collections by
 *   name): an older version that leads still backs up a folder of records a newer version added;
 * - the backup is named by the logical date the caller gives (FI: the computer's date), its week by pure date arithmetic
 *   (FI: luxon in the computer's zone);
 * - the weekly copy is the newest daily of each past week (FI: the first daily of the current week; FI's first weekly
 *   copies, made from the dailies there, were already the newest of each week): 14 days and 8 weeks before them;
 * - a second backup of the same day replaces the first (FI kept the first – made at the start, while here the later one
 *   is that day's newer data); the rename keeps exactly one file;
 * - `createDailyBackup` reports a failure in its result and never throws; a listing that cannot be read is an error,
 *   never an empty folder (spec „Dane i ustawienia”), so the rotation then removes nothing;
 * - temp files of a backup a crash cut short (hidden, this app's names only) are removed after an hour – on OneDrive they
 *   would go to every computer;
 * - new: the additional place outside OneDrive (`copyLatestTo`); the restore into a new folder and the reading of one
 *   record come from FI restore.ts, with the reader of zip.ts in place of yauzl.
 */
import { promises as fs } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { isIgnoredPath, sanitizeRelPath } from '@shared/data/paths'
import { addDays, daysBetween, isIsoDate, weekday } from '@shared/time/zone'
import { pathExists, removeFile, tempPathFor, withRetry } from '../datastore/atomic'
import { diskSource, withZip, zipFolder, type ZipEntry, type ZipSource } from './zip'

/** Daily backups kept, and one a week for 8 weeks before them (spec „Kopie zapasowe”, FI D84 C4). */
export const DAILY_KEEP = 14
export const WEEKLY_KEEP = 8
/** A temp file untouched this long is left from a backup a crash cut short (a running one keeps writing it). */
const STALE_TEMP_MS = 60 * 60 * 1000

/** The kinds of backups; each lives in its subfolder of the same name (FI's layout). */
export type BackupKind = 'daily' | 'weekly'

export type BackupResult =
  | {
      ok: true
      file: string
      bytes: number
      /** Files in the ZIP. */
      files: number
      /** Files removed while the backup was made: left out, named. */
      skipped: string[]
      /** The backup is made, but keeping 14 + 8 failed (removed or copied next time). */
      rotateError?: string
    }
  | { ok: false; error: string }

export interface BackupInfo {
  kind: BackupKind
  name: string
  path: string
  bytes: number
  mtimeMs: number
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const errCode = (e: unknown) => (e as NodeJS.ErrnoException | null)?.code

/**
 * The names of this app's backups, by kind (FI B121): a backups folder shared with another program never has its other
 * files listed, taken back or removed by the rotation.
 */
const BACKUP_NAMES: Record<BackupKind, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}\.zip$/,
  weekly: /^\d{4}-W\d{2}\.zip$/
}
/** A temp file of one of those (`tempPathFor`: hidden, „.tmp-” and 8 hex digits). */
const BACKUP_TEMP = /^\.\d{4}-(?:\d{2}-\d{2}|W\d{2})\.zip\.tmp-[0-9a-f]{8}$/

/**
 * Paths never in a backup: what the scanner ignores (backups/, temp files of atomic writes, hidden folders such as
 * .history/) and also .presence/, which the scanner reads (spec: „historii i obecności nie ma w kopiach”).
 */
export function isOutsideBackup(rel: string): boolean {
  return isIgnoredPath(rel) || rel.split('/').some((seg) => seg.startsWith('.'))
}

/**
 * The data (spec „Pliki na OneDrive”): rd.json, the records (.json) and the logs and grades (.jsonl), OneDrive's
 * conflict copies of them as they are – never other files that happen to be in the folder (exported ZIPs, desktop.ini).
 * By extension rather than by `classify`: a name the classifier does not know (an odd conflict copy, a folder of a newer
 * version) still goes into the backup.
 */
export function isDataFile(rel: string): boolean {
  return !isOutsideBackup(rel) && /\.jsonl?$/.test(rel)
}

/**
 * The ISO week of a date 'RRRR-MM-DD' as 'RRRR-Www' (the week's Thursday gives the year), null for no date: pure date
 * arithmetic, the same on every computer whatever its zone.
 */
export function isoWeekOf(date: string): string | null {
  if (!isIsoDate(date)) return null
  const thursday = addDays(date, 4 - weekday(date))
  const year = thursday.slice(0, 4)
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

const dailyFile = (backupsDir: string, date: string) => join(backupsDir, 'daily', `${date}.zip`)

/** This app's backups of one kind in `dir`, newest first; no folder = none, an unreadable one = an error. */
async function listNames(dir: string, kind: BackupKind): Promise<string[]> {
  let names: string[]
  try {
    names = await withRetry(() => fs.readdir(dir))
  } catch (e) {
    if (errCode(e) === 'ENOENT') return []
    throw e
  }
  return names.filter((n) => BACKUP_NAMES[kind].test(n)).sort().reverse()
}

/** A copy of a backup under another name, atomically. */
async function copyBackup(from: string, to: string): Promise<void> {
  await fs.mkdir(dirname(to), { recursive: true })
  const tmp = tempPathFor(to)
  try {
    await withRetry(() => fs.copyFile(from, tmp))
    await withRetry(() => fs.rename(tmp, to))
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

async function removeBeyond(dir: string, kind: BackupKind, keep: number): Promise<void> {
  for (const name of (await listNames(dir, kind)).slice(keep)) await removeFile(join(dir, name))
}

/** This app's temp files untouched for an hour; one held or gone meanwhile waits for the next time. */
async function removeStaleTemps(dir: string): Promise<void> {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  for (const name of names.filter((n) => BACKUP_TEMP.test(n))) {
    try {
      if (Date.now() - (await fs.stat(join(dir, name))).mtimeMs > STALE_TEMP_MS) await removeFile(join(dir, name))
    } catch {
      /* next time */
    }
  }
}

/**
 * Keep 14 daily and 8 weekly backups in a backups folder: first the newest daily of each past ISO week (before the week
 * of the newest daily) without a weekly copy is copied to weekly/ – unless it is older than the 8 weeks kept –, then the
 * oldest beyond the counts are removed. Only this app's names are touched (B121).
 */
async function rotate(dir: string): Promise<void> {
  const dailyDir = join(dir, 'daily')
  const weeklyDir = join(dir, 'weekly')
  const dailies = (await listNames(dailyDir, 'daily')).flatMap((name) => {
    const week = isoWeekOf(name.slice(0, 10))
    return week ? [{ name, week }] : []
  })
  const weeklies = new Set(await listNames(weeklyDir, 'weekly'))
  const current = dailies[0]?.week
  if (current) {
    // Newest first: the first daily seen of a week is its newest.
    const promote = new Map<string, string>()
    for (const { name, week } of dailies) {
      if (week < current && !weeklies.has(`${week}.zip`) && !promote.has(week)) promote.set(week, name)
    }
    const kept = new Set([...weeklies, ...[...promote.keys()].map((w) => `${w}.zip`)].sort().reverse().slice(0, WEEKLY_KEEP))
    for (const [week, name] of promote) {
      if (kept.has(`${week}.zip`)) await copyBackup(join(dailyDir, name), join(weeklyDir, `${week}.zip`))
    }
  }
  await removeBeyond(weeklyDir, 'weekly', WEEKLY_KEEP)
  await removeBeyond(dailyDir, 'daily', DAILY_KEEP)
  await removeStaleTemps(dailyDir)
  await removeStaleTemps(weeklyDir)
}

/** A log up to its last line end: a line still being appended (or torn by a crash) is no event – readers skip it too. */
function wholeLines(data: Buffer): Buffer {
  const end = data.lastIndexOf(0x0a)
  return end === data.length - 1 ? data : data.subarray(0, end + 1)
}

/** A file of the data as it goes into the backup: a log cut to its whole lines; a file not readable now named in the error. */
function backupSource(abs: string, rel: string): ZipSource {
  const disk = diskSource(abs, rel)
  return {
    name: rel,
    read: async () => {
      let content
      try {
        content = await disk.read()
      } catch (e) {
        throw new Error(`Nie można odczytać pliku ${rel}: ${message(e)}`)
      }
      return content && rel.endsWith('.jsonl') ? { ...content, data: wholeLines(content.data) } : content
    }
  }
}

/** True when the daily backup of the logical day `date` ('RRRR-MM-DD') is not there yet. */
export async function backupDue(backupsDir: string, date: string): Promise<boolean> {
  return !(await pathExists(dailyFile(backupsDir, date)))
}

/**
 * The daily backup of the logical day `date` ('RRRR-MM-DD'): a ZIP of the data files of `dataDir` in
 * `<backupsDir>/daily/<date>.zip`, then the rotation (14 daily, 8 weekly). Resilient to writes meanwhile: each file is
 * read whole once (a log appended to gives its whole lines up to then, a record rewritten atomically goes in old or new);
 * a file removed meanwhile is left out and named in `skipped`; a file held by OneDrive or an antivirus is read again,
 * and one still unreadable fails the backup – never a backup without it, which in two weeks would push out the full
 * ones. The ZIP is written under a temp name and renamed into place, so the final name never holds half a ZIP; a second
 * backup of the same day replaces the first. Never throws: a failure is `{ ok: false, error }` (the widget warns).
 */
export async function createDailyBackup(dataDir: string, backupsDir: string, date: string): Promise<BackupResult> {
  if (!isIsoDate(date)) return { ok: false, error: `Niepoprawna data dnia logicznego: ${date}` }
  const file = dailyFile(backupsDir, date)
  let made
  try {
    made = await zipFolder(dataDir, file, isDataFile, isOutsideBackup, backupSource)
  } catch (e) {
    return { ok: false, error: message(e) }
  }
  try {
    await rotate(backupsDir)
    return { ok: true, file, ...made }
  } catch (e) {
    return { ok: true, file, ...made, rotateError: message(e) }
  }
}

/**
 * The additional place of this computer, outside OneDrive (spec: „sam kopiuje tam najnowszą kopię, także gdy nie
 * prowadzi”): the newest daily backup copied to `<extraDir>/daily/` when it is not there (or there with another size –
 * that day's backup was made again), then the same rotation as in backups/ (14 daily, 8 weekly). Returns the name
 * copied, null when there was nothing to copy; an unreachable place rejects.
 */
export async function copyLatestTo(backupsDir: string, extraDir: string): Promise<string | null> {
  const newest = (await listNames(join(backupsDir, 'daily'), 'daily'))[0]
  if (!newest) return null
  const from = join(backupsDir, 'daily', newest)
  const to = join(extraDir, 'daily', newest)
  const there = await fs.stat(to).catch((e: unknown) => {
    if (errCode(e) === 'ENOENT') return null
    throw e
  })
  if (there && there.size === (await fs.stat(from)).size) return null
  await copyBackup(from, to)
  await rotate(extraDir)
  return newest
}

/** This app's backups in a backups folder (daily and weekly), newest first. */
export async function listBackups(backupsDir: string): Promise<BackupInfo[]> {
  const out: BackupInfo[] = []
  for (const kind of ['daily', 'weekly'] as const) {
    const dir = join(backupsDir, kind)
    for (const name of await listNames(dir, kind)) {
      try {
        const st = await fs.stat(join(dir, name))
        out.push({ kind, name, path: join(dir, name), bytes: st.size, mtimeMs: st.mtimeMs })
      } catch {
        /* removed meanwhile */
      }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * A safe relative path from a ZIP entry's name: `sanitizeRelPath` (not absolute, no drive, no "." or ".." or empty
 * segment) and none of the characters Windows refuses in a name (":" would write an alternate stream). null = unsafe.
 */
function safeRelPath(name: string): string | null {
  const rel = sanitizeRelPath(name)
  return rel && !/[<>:"|?*\u0000-\u001f]/.test(rel) ? rel : null
}

/** Empty or not there: a folder a backup may be restored into. */
async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await fs.readdir(dir)).length === 0
  } catch (e) {
    if (errCode(e) === 'ENOENT') return true
    if (errCode(e) === 'ENOTDIR') return false
    throw e
  }
}

/**
 * The whole backup restored into a new folder (spec „Przywracanie”: „cały folder do nowego folderu”): `targetDir` must
 * not exist or be empty – no folder is ever written over. A ZIP with an unsafe name (absolute, "..") is refused whole
 * before anything is written; only the data's files are taken. Unpacked under a temp name beside the target and renamed
 * into place, so no half folder ever shows. Returns the number of files.
 */
export async function restoreToFolder(zipFile: string, targetDir: string): Promise<number> {
  const target = resolve(targetDir)
  if (!(await isEmptyOrMissing(target))) throw new Error(`Folder ${target} istnieje i nie jest pusty – kopię przywraca się tylko do nowego folderu.`)
  return withZip(zipFile, async (zip) => {
    const files: Array<{ rel: string; entry: ZipEntry }> = []
    for (const entry of zip.entries) {
      const isDir = entry.name.endsWith('/')
      const rel = safeRelPath(isDir ? entry.name.slice(0, -1) : entry.name)
      if (!rel) throw new Error('ZIP zawiera niedozwolone ścieżki (np. ../) – odrzucony.')
      if (!isDir && isDataFile(rel)) files.push({ rel, entry })
    }
    const tmp = tempPathFor(target)
    try {
      await fs.mkdir(tmp, { recursive: true })
      for (const { rel, entry } of files) {
        const file = join(tmp, ...rel.split('/'))
        if (!file.startsWith(tmp + sep)) throw new Error('ZIP zawiera niedozwolone ścieżki (np. ../) – odrzucony.')
        await fs.mkdir(dirname(file), { recursive: true })
        try {
          await fs.writeFile(file, await zip.read(entry), { flag: 'wx' })
        } catch (e) {
          if (errCode(e) === 'EEXIST') throw new Error(`Uszkodzony plik ZIP: powtórzony wpis ${rel}`)
          throw e
        }
      }
      if (await pathExists(target)) await fs.rmdir(target)
      await withRetry(() => fs.rename(tmp, target))
      return files.length
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined)
      throw e
    }
  })
}

/**
 * One record of a backup, to take chosen records back: its bytes, null when the backup has no such file. `relPath` as
 * in the data folder (either slash). A damaged or unreadable ZIP rejects.
 */
export async function readBackupEntry(zipFile: string, relPath: string): Promise<Buffer | null> {
  const name = relPath.replace(/\\/g, '/')
  return withZip(zipFile, async (zip) => {
    const entry = zip.entries.find((e) => e.name === name)
    return entry ? zip.read(entry) : null
  })
}
