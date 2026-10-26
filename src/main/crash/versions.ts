/**
 * The 10 last versions that ran on this computer, with their first and last start and their crashes (spec „Pliki na
 * OneDrive”, .presence: E1 copies this into the computer's presence; the rules of leading, freezing and installing at
 * night read it from there). Kept locally in versions.json of the app data.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface VersionRun {
  version: string
  firstRun: number
  lastRun: number
  crashes: number
}

export const KEPT_VERSIONS = 10

export function withRun(list: VersionRun[], version: string, crashedVersion: string | null, now: number): VersionRun[] {
  const out = list.map((v) => ({ ...v }))
  if (crashedVersion) {
    const c = out.find((v) => v.version === crashedVersion)
    if (c) c.crashes++
    else out.push({ version: crashedVersion, firstRun: now, lastRun: now, crashes: 1 })
  }
  const cur = out.find((v) => v.version === version)
  if (cur) cur.lastRun = now
  else out.push({ version, firstRun: now, lastRun: now, crashes: 0 })
  return out.sort((a, b) => b.lastRun - a.lastRun).slice(0, KEPT_VERSIONS)
}

export function recordRun(userData: string, version: string, crashedVersion: string | null, log: (level: 'info' | 'warn', msg: string) => void, now = Date.now()): void {
  const file = join(userData, 'versions.json')
  let list: VersionRun[] = []
  try {
    const o = JSON.parse(readFileSync(file, 'utf8')) as { versions?: VersionRun[] }
    if (Array.isArray(o.versions)) list = o.versions.filter((v) => typeof v?.version === 'string')
  } catch {
    list = []
  }
  try {
    writeFileSync(file, `${JSON.stringify({ format: 1, versions: withRun(list, version, crashedVersion, now) }, null, 2)}\n`)
    if (crashedVersion) log('warn', `awaria wersji ${crashedVersion} zapisana`)
  } catch (e) {
    log('warn', `versions.json: ${e instanceof Error ? e.message : String(e)}`)
  }
}
