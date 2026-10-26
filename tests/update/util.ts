// adapted from FI tests/update/util.ts @ de81f2b
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, promises as fs, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { NSIS_GUID, SETUP_ASSET, MANIFEST_ASSET } from '../../src/shared/update'

export const PRODUCT = 'Regulated Day'
export const APP_EXE = `${PRODUCT}.exe`
export const SETUP = SETUP_ASSET
export const MANIFEST = MANIFEST_ASSET
export const GUID = NSIS_GUID
export const shots = (name: string) => join('test-results', 'screens', `${name}.png`)
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

export const readText = (file: string) => fs.readFile(file, 'utf8').catch(() => '')

/**
 * The end of the app's process – call it before what ends the app. Playwright's „close” comes only once every copy of
 * the app's pipes is closed, and an owner of the installation the app starts detached inherits them: „close” would come
 * after the whole installation, when its windows and its installer are gone.
 */
export function processEnd(app: ElectronApplication, ms: number): Promise<void> {
  const p = app.process()
  return new Promise((resolve, reject) => {
    if (p.exitCode != null || p.signalCode != null) return resolve()
    const t = setTimeout(() => reject(new Error(`aplikacja nie zakończyła się w ${ms / 1000} s`)), ms)
    p.once('exit', () => {
      clearTimeout(t)
      resolve()
    })
  })
}

/** The files of a manifest missing in an installation or of another size (for a failure's dump). */
export function manifestDiff(installDir: string, manifestFile: string): string[] {
  const m = JSON.parse(readFileSync(manifestFile, 'utf8')) as { files: Array<{ path: string; size: number }> }
  return m.files.flatMap((f) => {
    const p = join(installDir, ...f.path.split('/'))
    if (!existsSync(p)) return [`${f.path}: brak`]
    const size = statSync(p).size
    return size === f.size ? [] : [`${f.path}: ${size} B zamiast ${f.size} B`]
  })
}

/**
 * Output of a Windows PowerShell command (the tests may read the text of tools – the app never does). Its output is
 * UTF-8 without BOM: PowerShell 5.1 writes the OEM code page otherwise („–” in a title becomes „?”).
 */
export function powershell(script: string): string {
  const utf8 = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; '
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', utf8 + script], { encoding: 'utf8' })
  return (r.stdout ?? '').trim()
}

/** The folder of app data of the production identity: %APPDATA%\Regulated Day (Environment.GetFolderPath). */
export function appDataDir(): string {
  return powershell('[Environment]::GetFolderPath("ApplicationData")') || join(homedir(), 'AppData', 'Roaming')
}
export const productionData = () => join(appDataDir(), PRODUCT)

/** The user's installation from the uninstall entry of the fixed nsis.guid. */
export function installed(): { dir: string; version: string } | null {
  const out = powershell(
    `$k = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}' -ErrorAction SilentlyContinue; $l = Get-ItemProperty 'HKCU:\\Software\\${GUID}' -ErrorAction SilentlyContinue; if ($k) { $k.DisplayVersion + '|' + $l.InstallLocation }`
  )
  const [version, dir] = out.split('|')
  return version && dir ? { version: version.trim(), dir: dir.trim() } : null
}

export function appProcesses(): Array<{ id: number; path: string }> {
  const out = powershell(`Get-Process -Name '${PRODUCT}','rd-guard','rd-install' -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.Id + '|' + $_.Path + '|' + $_.ProcessName }`)
  return out
    ? out
        .split(/\r?\n/)
        .map((l) => l.split('|'))
        .map(([id, path, name]) => ({ id: Number(id), path: path ?? '', name: name ?? '' }))
    : []
}

export const appRunning = () => appProcesses().some((p) => p.path.toLowerCase().endsWith(APP_EXE.toLowerCase()))

/** Ends the app, the guard and the install helper (force), never throws. */
export async function stopAll(): Promise<void> {
  for (const name of [APP_EXE, 'rd-guard.exe', 'rd-install.exe', SETUP]) spawnSync('taskkill', ['/F', '/T', '/IM', name], { stdio: 'ignore' })
  for (let i = 0; i < 40 && appProcesses().length; i++) await sleep(250)
}

export function runEntry(name: string): string | null {
  const out = powershell(`(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue).'${name}'`)
  return out || null
}

/**
 * Uninstalls the production app silently (the uninstall entry's quiet command) and waits for its end: the NSIS
 * uninstaller copies itself to %TEMP% and goes on after its first process ended. Returns false if it did not finish.
 */
export async function uninstall(ms = 180_000): Promise<boolean> {
  const out = powershell(`(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}' -ErrorAction SilentlyContinue).QuietUninstallString`)
  if (!out) return true
  const dir = installed()?.dir
  // `"…\Uninstall Regulated Day.exe" /currentuser /S` started directly: through `cmd /C` Node's quoting (\") breaks it.
  const m = /^"([^"]+)"\s*(.*)$/.exec(out)
  const [exe, rest] = m ? [m[1]!, m[2]!] : [out, '']
  spawnSync(exe, rest.split(/\s+/).filter(Boolean), { stdio: 'ignore', timeout: 300_000 })
  for (let t = 0; t < ms; t += 500) {
    if (!installed() && !(dir && existsSync(join(dir, APP_EXE)))) return true
    await sleep(500)
  }
  return false
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

/** Everything that explains a failed update, printed into the CI log. */
export async function dump(title: string, dirs: string[] = []): Promise<void> {
  const data = productionData()
  const lines = [`===== ${title}`]
  for (const log of ['main.log', 'guard.log', 'install.log', 'helper.log', 'update.log']) {
    lines.push(`--- logs/${log}:`, (await readText(join(data, 'logs', log))).split('\n').slice(-60).join('\n'))
  }
  const upd = join(data, 'update')
  for (const name of existsSync(upd) ? await fs.readdir(upd) : []) {
    lines.push(`--- update/${name}/task.json:`, await readText(join(upd, name, 'task.json')))
    lines.push(`--- update/${name}/guard.lock:`, await readText(join(upd, name, 'guard.lock')))
  }
  for (const dir of dirs) {
    const names = await fs.readdir(dir).catch((e: Error) => [`(${e.message})`])
    lines.push(`--- ${dir}:`, names.join(', '))
  }
  lines.push('--- procesy:', JSON.stringify(appProcesses()), '--- wpis Run strażnika:', String(runEntry('Regulated Day Guard')), '--- instalacja:', JSON.stringify(installed()))
  console.log(lines.join('\n'))
}
