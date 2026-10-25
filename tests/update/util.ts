// adapted from FI tests/update/util.ts @ de81f2b
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, promises as fs, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

/** Output of a Windows PowerShell command (the tests may read the text of tools – the app never does). */
export function powershell(script: string): string {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })
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

/** Uninstalls the production app silently (the uninstall entry's quiet command). */
export function uninstall(): void {
  const out = powershell(`(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}' -ErrorAction SilentlyContinue).QuietUninstallString`)
  if (!out) return
  spawnSync('cmd.exe', ['/C', out], { stdio: 'ignore', timeout: 300_000 })
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
