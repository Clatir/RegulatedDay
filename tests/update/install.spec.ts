/**
 * Windows CI: identities and the installation (spec „Powiadomienia i dźwięki”, „Instalacja, aktualizacje i log”, T384).
 * The development and test identities leave nothing in the system; the installed exe is the production identity with
 * one Start menu shortcut, the address registered and files agreeing with the manifest; the uninstaller removes the
 * guard, the update folder and the toast activator's keys pointing at the installation, and keeps Windows' settings of
 * notifications (your choices).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { APP_EXE, GUID, MANIFEST, PRODUCT, SETUP, appDataDir, dump, installed, powershell, productionData, runEntry, sha256, sleep, stopAll, uninstall } from './util'

const FROM = resolve(process.env.RD_UPDATE_FROM ?? 'release')
const UNPACKED = join(FROM, 'win-unpacked', APP_EXE)
const CURRENT = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

test.skip(process.platform !== 'win32' || !existsSync(join(FROM, SETUP)), 'Windows CI: needs release/ with the installer')
test.describe.configure({ mode: 'serial' })

/** What an identity could leave in the system (spec: CI compares it before and after the development runs). */
function systemState(): string {
  return powershell(`
    $data = Join-Path ([Environment]::GetFolderPath('ApplicationData')) '${PRODUCT}'
    $programs = [Environment]::GetFolderPath('Programs')
    $out = @()
    $out += 'data=' + (Test-Path $data)
    $out += 'shortcuts=' + ((Get-ChildItem $programs -Filter '*Regulated*' -ErrorAction SilentlyContinue | ForEach-Object Name) -join ',')
    $out += 'run=' + (((Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -like '*Regulated*' } | ForEach-Object Name) -join ',')
    $out += 'protocol=' + (Test-Path 'HKCU:\\Software\\Classes\\regulatedday')
    $out += 'clsid=' + ((Get-ChildItem 'HKCU:\\Software\\Classes\\CLSID' -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty (Join-Path $_.PSPath 'LocalServer32') -ErrorAction SilentlyContinue).'(default)' -like '*Regulated Day*' } | ForEach-Object PSChildName) -join ',')
    $out -join ';'
  `)
}

async function waitForFile(file: string, ms: number): Promise<boolean> {
  for (let t = 0; t < ms; t += 500) {
    if (existsSync(file)) return true
    await sleep(500)
  }
  return false
}

test('tożsamości: win-unpacked deweloperska, z RD_USER_DATA testowa; npm start i npm run dev nie zostawiają śladów', async () => {
  test.setTimeout(10 * 60_000)
  const before = systemState()
  // win-unpacked: the development identity.
  const dev = await electron.launch({ executablePath: UNPACKED, env: { ...(process.env as Record<string, string>), RD_UPDATE_URL: 'http://127.0.0.1:9' } })
  const devInfo = await dev.evaluate(({ app }) => ({ name: app.getName(), userData: app.getPath('userData') }))
  await dev.close()
  expect(devInfo.name).toBe('Regulated Day Dev')
  expect(devInfo.userData.endsWith('Regulated Day Dev')).toBe(true)
  // win-unpacked with RD_USER_DATA: the test identity.
  const test1 = await electron.launch({ executablePath: UNPACKED, env: { ...(process.env as Record<string, string>), RD_USER_DATA: join(appDataDir(), 'rd-ci-test') } })
  const testInfo = await test1.evaluate(({ app }) => ({ name: app.getName(), userData: app.getPath('userData') }))
  await test1.close()
  expect(testInfo.name).toBe('Regulated Day Test')
  // npm start and npm run dev: the development identity, its data under „Regulated Day Dev”.
  for (const script of ['start', 'dev']) {
    const devLog = join(appDataDir(), 'Regulated Day Dev', 'logs', 'main.log')
    const child = spawn('npm', ['run', script], { shell: true, stdio: 'ignore', env: { ...process.env, RD_UPDATE_URL: 'http://127.0.0.1:9' } })
    const started = await waitForFile(devLog, 120_000)
    await sleep(5000)
    spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' })
    await stopAll()
    expect(started, `npm run ${script}`).toBe(true)
  }
  expect(systemState()).toBe(before)
})

test('instalacja: tożsamość produkcyjna, jeden skrót, adres regulatedday://, pliki zgodne z manifestem', async () => {
  test.setTimeout(10 * 60_000)
  try {
    const r = spawnSync(join(FROM, SETUP), ['/S'], { stdio: 'ignore', timeout: 600_000 })
    expect(r.status).toBe(0)
    await expect.poll(() => installed()?.version, { timeout: 120_000 }).toBe(CURRENT)
    const dir = installed()!.dir
    expect(existsSync(join(dir, 'resources', 'rd-installed'))).toBe(true)
    // Every file of the manifest, by size and SHA-256 (CI checks that a fresh installation agrees with it).
    const manifest = JSON.parse(readFileSync(join(FROM, MANIFEST), 'utf8')) as { files: Array<{ path: string; size: number; sha256: string }> }
    for (const f of manifest.files) expect(await sha256(join(dir, ...f.path.split('/'))), f.path).toBe(f.sha256)
    // One shortcut, directly in Programs (no subfolder – a second entry in Start).
    const programs = powershell("[Environment]::GetFolderPath('Programs')")
    expect(readdirSync(programs).filter((n) => /Regulated/i.test(n))).toEqual([`${PRODUCT}.lnk`])
    expect(powershell("(Get-ItemProperty 'HKCU:\\Software\\Classes\\regulatedday\\shell\\open\\command').'(default)'")).toContain(APP_EXE)
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: { ...(process.env as Record<string, string>), RD_UPDATE_URL: 'http://127.0.0.1:9' } })
    const info = await app.evaluate(({ app }) => ({ name: app.getName(), userData: app.getPath('userData') }))
    await app.close()
    expect(info.name).toBe(PRODUCT)
    expect(info.userData).toBe(productionData())
  } catch (e) {
    await dump('instalacja')
    throw e
  }
})

test('deinstalacja: strażnik, folder update i klucze aktywatora usunięte, ustawienia powiadomień zostają', async () => {
  test.setTimeout(10 * 60_000)
  const dir = installed()!.dir
  const exe = join(dir, APP_EXE)
  // What Electron writes at the first notification (unquoted path with a space) and what a task leaves.
  const clsid = '{0F6B2A2E-1111-4A4A-9C9C-1234567890AB}'
  powershell(`New-Item -Force 'HKCU:\\Software\\Classes\\CLSID\\${clsid}\\LocalServer32' | Out-Null; Set-ItemProperty 'HKCU:\\Software\\Classes\\CLSID\\${clsid}\\LocalServer32' -Name '(default)' -Value '${exe}'`)
  const other = '{0F6B2A2E-2222-4A4A-9C9C-1234567890AB}'
  powershell(`New-Item -Force 'HKCU:\\Software\\Classes\\CLSID\\${other}\\LocalServer32' | Out-Null; Set-ItemProperty 'HKCU:\\Software\\Classes\\CLSID\\${other}\\LocalServer32' -Name '(default)' -Value 'C:\\Inny\\Program.exe'`)
  powershell(`New-Item -Force 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\app.regulatedday.desktop' | Out-Null`)
  powershell(`Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'Regulated Day Guard' -Value '"C:\\x\\rd-guard.exe" --autostart'`)
  const upd = join(productionData(), 'update', '9.9.9')
  powershell(`New-Item -ItemType Directory -Force '${upd}' | Out-Null`)
  expect(await uninstall()).toBe(true)
  expect(installed()).toBeNull()
  expect(powershell(`Test-Path 'HKCU:\\Software\\Classes\\CLSID\\${clsid}'`)).toBe('False')
  expect(powershell(`Test-Path 'HKCU:\\Software\\Classes\\CLSID\\${other}'`)).toBe('True')
  expect(powershell("Test-Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\app.regulatedday.desktop'")).toBe('True')
  expect(runEntry('Regulated Day Guard')).toBeNull()
  expect(existsSync(upd)).toBe(false)
  expect(powershell("Test-Path 'HKCU:\\Software\\Classes\\regulatedday'")).toBe('False')
  powershell(`Remove-Item -Recurse -Force 'HKCU:\\Software\\Classes\\CLSID\\${other}' -ErrorAction SilentlyContinue`)
  void GUID
})
