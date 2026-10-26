/**
 * Windows CI: the installer updates itself from Releases (plan E0 „gotowe, gdy”): version N → N+1 from a local stand-in
 * for GitHub Releases, data untouched, four paths – with a window („Zainstaluj teraz”), hidden (the night), at the start
 * of Windows and interrupted (the last two simulated: CI cannot log in to Windows) – each confirmed by the file
 * „uruchomiono wersję X”; and the FI path without the helper. Each step has its deadline; a failure prints the logs.
 */
import { createReadStream, existsSync, mkdirSync, copyFileSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { click, foreground, taskbarButton, topWindows, windowsAt, type TopWindow } from '../e2e/win32'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { mainPage } from '../e2e/app'
import { APP_EXE, MANIFEST, SETUP, appProcesses, appRunning, dump, installed, manifestDiff, powershell, processEnd, productionData, readJson, readText, runEntry, sha256, sleep, stopAll, uninstall } from './util'

const FROM = resolve(process.env.RD_UPDATE_FROM ?? 'release')
const TO = resolve(process.env.RD_UPDATE_TO ?? 'release-next')
const NEXT = process.env.RD_UPDATE_TO_VERSION ?? ''
const CURRENT = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

test.skip(process.platform !== 'win32' || !NEXT, 'Windows CI only: needs the next version built into release-next (ci.yml)')
// Each test starts from a fresh installation: one failure does not skip the rest (one worker, in order).
test.describe.configure({ mode: 'default' })

let server: Server
let base = ''
const hits: string[] = []

test.beforeAll(async () => {
  const files = [SETUP, MANIFEST]
  const sums = (await Promise.all(files.map(async (f) => `${await sha256(join(TO, f))}  ${f}\n`))).join('')
  server = createServer((req, res) => {
    const url = decodeURIComponent(req.url ?? '/')
    hits.push(url)
    if (url.startsWith('/repos/Clatir/RegulatedDay/releases')) {
      const release = {
        tag_name: `v${NEXT}`,
        prerelease: false,
        draft: false,
        name: `Regulated Day ${NEXT}`,
        body: `## Test aktualizacji\n- wersja ${NEXT} zbudowana w CI`,
        published_at: new Date().toISOString(),
        html_url: `https://github.com/Clatir/RegulatedDay/releases/tag/v${NEXT}`,
        assets: [...files.map((f) => ({ name: f, size: statSync(join(TO, f)).size, browser_download_url: `${base}/download/${f}` })), { name: 'SHA256SUMS.txt', size: Buffer.byteLength(sums), browser_download_url: `${base}/download/SHA256SUMS.txt` }]
      }
      res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"rd-ci"' }).end(JSON.stringify([release]))
      return
    }
    const name = url.replace(/^\/download\//, '')
    if (name === 'SHA256SUMS.txt') return void res.end(sums)
    if (!files.includes(name)) return void res.writeHead(404).end()
    res.writeHead(200, { 'Content-Length': String(statSync(join(TO, name)).size), 'Content-Type': 'application/octet-stream' })
    createReadStream(join(TO, name)).pipe(res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  server?.closeAllConnections()
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
  await stopAll()
})

const env = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(process.env as Record<string, string>),
  RD_UPDATE_URL: base,
  RD_UPDATE_CHECK_DELAY_MS: '1000',
  ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  ...extra
})

/** A fresh installation of N with the production data folder cleaned (a user's data folder is never touched otherwise). */
async function freshN(): Promise<string> {
  await stopAll()
  expect(await uninstall()).toBe(true)
  // Every test reads only its own logs (the serial group repeats from the start after a failure).
  for (const p of ['update', 'logs', 'launched.json']) rmSync(join(productionData(), p), { recursive: true, force: true, maxRetries: 10 })
  const r = spawnSync(join(FROM, SETUP), ['/S'], { stdio: 'ignore', timeout: 600_000 })
  expect(r.status).toBe(0)
  await expect.poll(() => installed()?.version, { timeout: 120_000 }).toBe(CURRENT)
  // „Uruchamiaj z Windows” on (as set in the app): the guard of the start of Windows starts the app after installing.
  mkdirSync(productionData(), { recursive: true })
  writeFileSync(join(productionData(), 'config.json'), `${JSON.stringify({ format: 1, autostart: { enabled: true } }, null, 2)}\n`)
  return installed()!.dir
}

const installerRuns = () => powershell(`(Get-Process -Name '${SETUP.replace(/\.exe$/, '')}' -ErrorAction SilentlyContinue | Measure-Object).Count`) !== '0'

/** The download of N+1 as the updater leaves it (update\<X>\download with ready.json) – the paths that start from it. */
function stageDownload(): void {
  const dir = join(productionData(), 'update', NEXT, 'download')
  mkdirSync(dir, { recursive: true })
  for (const f of [SETUP, MANIFEST]) copyFileSync(join(TO, f), join(dir, f))
  writeFileSync(join(dir, 'ready.json'), `${JSON.stringify({ version: NEXT, notes: 'CI', at: Date.now() })}\n`)
}

/** N+1 installed, started and confirmed by „uruchomiono wersję N+1”; the task finished and the guard's entry gone. */
async function expectUpdated(installDir: string, step: { name: string }): Promise<void> {
  step.name = `instalacja ${NEXT}`
  await expect.poll(() => installed()?.version, { timeout: 600_000, intervals: [2000] }).toBe(NEXT)
  step.name = `potwierdzenie startu ${NEXT}`
  await expect.poll(() => readJson<{ version: string }>(join(productionData(), 'launched.json'))?.version, { timeout: 300_000, intervals: [1000] }).toBe(NEXT)
  await expect.poll(() => appProcesses().some((p) => p.path.toLowerCase() === join(installDir, APP_EXE).toLowerCase()), { timeout: 60_000 }).toBe(true)
  step.name = 'koniec zadania'
  await expect.poll(() => existsSync(join(productionData(), 'update', NEXT, 'task.json')), { timeout: 120_000, intervals: [1000] }).toBe(false)
  expect(runEntry('Regulated Day Guard')).toBeNull()
}

test('z oknem: „Zainstaluj teraz” – pobranie w tle, okno postępu bez fokusu z przyciskiem na pasku zadań, start nowej wersji', async () => {
  test.setTimeout(20 * 60_000)
  const step = { name: 'instalacja N' }
  let probe: ChildProcess | null = null
  try {
    const dir = await freshN()
    step.name = 'pobranie w tle'
    // The installer slowed down: the progress window stays long enough to be checked.
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: env({ RD_TEST_INSTALLER_SLEEP_MS: '30000' }) })
    const page = await mainPage(app)
    await expect.poll(() => page.evaluate(() => window.rd.update().then((u) => u.phase)), { timeout: 180_000, intervals: [1000] }).toBe('ready')
    step.name = 'okno próbne na pierwszym planie (kliknięcie prawdziwym kursorem)'
    probe = spawn('notepad.exe', [], { detached: true, stdio: 'ignore' })
    const probeWindow = async () => {
      for (let i = 0; i < 60; i++) {
        const w = topWindows().find((x) => x.pid === probe!.pid && x.visible && x.cls === 'Notepad')
        if (w) return w
        await sleep(500)
      }
      throw new Error('brak okna próbnego')
    }
    const pw = await probeWindow()
    // A point of the probe window that no other window covers (the progress window opens in the middle of the screen).
    const clickProbe = () => {
      const [l, t, r, b] = pw.rect
      const candidates: Array<[number, number]> = [[(l + r) / 2, t + 60], [l + 40, t + 60], [r - 40, t + 60], [l + 40, b - 40], [r - 40, b - 40], [(l + r) / 2, b - 40]]
      const i = windowsAt(candidates).indexOf(pw.hwnd)
      if (i < 0) throw new Error('okno próbne zasłonięte w każdym punkcie')
      click(...candidates[i]!)
    }
    clickProbe()
    await expect.poll(foreground, { timeout: 10_000 }).toBe(pw.hwnd)
    step.name = '„Zainstaluj teraz”'
    const ended = processEnd(app, 120_000)
    await page.evaluate(() => window.rd.updateAction('installNow')).catch(() => undefined)
    await ended
    step.name = 'okno postępu: na wierzchu, bez zabierania fokusu'
    let progress: TopWindow | undefined
    // What the install helper's process showed (its pid from install.log), printed if the window is not found.
    const seen = new Set<string>()
    try {
      await expect
        .poll(
          async () => {
            const all = topWindows()
            progress = all.find((w) => w.visible && w.title === 'Regulated Day – aktualizacja')
            const pid = Number(/start install \(pid (\d+)/.exec(await readText(join(productionData(), 'logs', 'install.log')))?.[1] ?? 0)
            for (const w of all.filter((x) => x.pid === pid)) seen.add(`${w.cls} „${w.title}” ${w.visible ? 'widoczne' : 'ukryte'}`)
            return !!progress
          },
          { timeout: 120_000, intervals: [500] }
        )
        .toBe(true)
    } catch (e) {
      console.log(`okna pomocnika instalacji: ${[...seen].join('; ') || 'żadnych'}`)
      throw e
    }
    expect(foreground()).toBe(pw.hwnd)
    const order = () => topWindows().map((w) => w.hwnd)
    expect(order().indexOf(progress!.hwnd)).toBeLessThan(order().indexOf(pw.hwnd))
    step.name = 'kliknięcie okna próbnego zasłania okno postępu'
    clickProbe()
    await expect.poll(() => order().indexOf(pw.hwnd) < order().indexOf(progress!.hwnd), { timeout: 10_000 }).toBe(true)
    step.name = 'przycisk okna postępu na pasku zadań (UI Automation)'
    const button = taskbarButton('aktualizacja')
    expect(button, 'brak przycisku okna postępu na pasku zadań').not.toBeNull()
    click(button!.x + button!.width / 2, button!.y + button!.height / 2)
    await expect.poll(() => order().indexOf(progress!.hwnd) < order().indexOf(pw.hwnd), { timeout: 10_000 }).toBe(true)
    await expectUpdated(dir, step)
    expect(await readText(join(productionData(), 'logs', 'install.log'))).toContain('nowa wersja potwierdziła start')
  } catch (e) {
    console.log(`Nieudany etap: ${step.name}; zapytania: ${hits.slice(-10).join(', ')}`)
    await dump(`z oknem: ${step.name}`)
    throw e
  } finally {
    probe?.kill()
    await stopAll()
  }
})

test('ukryta (noc): instalacja bez okna nad innymi, nowa wersja startuje w zasobniku', async () => {
  test.setTimeout(20 * 60_000)
  const step = { name: 'instalacja N' }
  try {
    const dir = await freshN()
    step.name = 'pobranie i noc'
    spawn(join(dir, APP_EXE), ['--hidden'], { env: env({ RD_TEST_NIGHT_INSTALL_MS: '2000' }), detached: true, stdio: 'ignore' }).unref()
    await expectUpdated(dir, step)
    expect(await readText(join(productionData(), 'logs', 'main.log'))).toContain('start w zasobniku')
  } catch (e) {
    console.log(`Nieudany etap: ${step.name}`)
    await dump(`ukryta: ${step.name}`)
    throw e
  } finally {
    await stopAll()
  }
})

test('przy starcie Windows (symulowane): aplikacja z autostartu przekazuje pobraną wersję strażnikowi', async () => {
  test.setTimeout(20 * 60_000)
  const step = { name: 'instalacja N' }
  try {
    const dir = await freshN()
    stageDownload()
    step.name = 'start z autostartu'
    spawn(join(dir, APP_EXE), ['--hidden'], { env: env({ RD_UPDATE_URL: 'http://127.0.0.1:9' }), detached: true, stdio: 'ignore' }).unref()
    await expectUpdated(dir, step)
    expect(await readText(join(productionData(), 'logs', 'guard.log'))).toContain('zainstalowano')
  } catch (e) {
    console.log(`Nieudany etap: ${step.name}`)
    await dump(`start Windows: ${step.name}`)
    throw e
  } finally {
    await stopAll()
  }
})

test('przerwana: pomocnik instalacji i instalator zabite w trakcie – strażnik z wpisu Run naprawia przy logowaniu', async () => {
  test.setTimeout(25 * 60_000)
  const step = { name: 'instalacja N' }
  try {
    const dir = await freshN()
    stageDownload()
    step.name = 'start instalacji'
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: env({ RD_UPDATE_URL: 'http://127.0.0.1:9' }) })
    const page = await mainPage(app)
    await expect.poll(() => page.evaluate(() => window.rd.update().then((u) => u.phase)), { timeout: 60_000 }).toBe('ready')
    const ended = processEnd(app, 120_000)
    await page.evaluate(() => window.rd.updateAction('installNow')).catch(() => undefined)
    await ended
    step.name = 'przerwanie w trakcie instalatora'
    await expect.poll(installerRuns, { timeout: 120_000, intervals: [200] }).toBe(true)
    await sleep(1500)
    spawnSync('taskkill', ['/F', '/IM', 'rd-install.exe'], { stdio: 'ignore' })
    spawnSync('taskkill', ['/F', '/T', '/IM', SETUP], { stdio: 'ignore' })
    await sleep(2000)
    step.name = 'logowanie: strażnik z wpisu Run'
    const entry = runEntry('Regulated Day Guard')
    expect(entry).not.toBeNull()
    // Verbatim: the entry's own quotes reach cmd as Windows reads the Run key (Node would escape them as \").
    spawn('cmd.exe', ['/C', `start "" ${entry}`], { detached: true, stdio: 'ignore', shell: false, windowsVerbatimArguments: true }).unref()
    await expectUpdated(dir, step)
    const guardLog = await readText(join(productionData(), 'logs', 'guard.log'))
    expect(guardLog).toMatch(/zainstalowano/)
  } catch (e) {
    console.log(`Nieudany etap: ${step.name}`)
    await dump(`przerwana: ${step.name}`)
    throw e
  } finally {
    await stopAll()
  }
})

test('ścieżka FI bez pomocnika: „Zainstaluj teraz” – instalator odłączony, X działa bez banera', async () => {
  test.setTimeout(20 * 60_000)
  const step = { name: 'instalacja N' }
  let dir = ''
  try {
    dir = await freshN()
    for (const f of ['rd-helper.exe', 'rd-guard.exe', 'rd-install.exe']) rmSync(join(dir, 'resources', 'helper', f), { force: true })
    stageDownload()
    step.name = 'start bez pomocnika'
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: env({ RD_UPDATE_URL: 'http://127.0.0.1:9' }) })
    const page = await mainPage(app)
    await expect.poll(() => page.evaluate(() => window.rd.update().then((u) => u.phase)), { timeout: 60_000 }).toBe('ready')
    expect(await page.evaluate(() => window.rd.update().then((u) => u.note ?? ''))).toContain('Pomocnik nie działa')
    const ended = processEnd(app, 120_000)
    await page.evaluate(() => window.rd.updateAction('installNow')).catch(() => undefined)
    await ended
    step.name = `instalacja ${NEXT} ścieżką FI`
    await expect.poll(() => installed()?.version, { timeout: 600_000, intervals: [2000] }).toBe(NEXT)
    await expect.poll(() => readJson<{ version: string }>(join(productionData(), 'launched.json'))?.version, { timeout: 300_000, intervals: [1000] }).toBe(NEXT)
    await expect.poll(() => appRunning(), { timeout: 60_000 }).toBe(true)
    expect(await readText(join(productionData(), 'logs', 'main.log'))).not.toMatch(new RegExp(`aktualizacja do ${NEXT.replace(/\./g, '\\.')}: nie`))
  } catch (e) {
    console.log(`Nieudany etap: ${step.name}`)
    if (dir) console.log(`różnice z manifestem ${NEXT}: ${manifestDiff(dir, join(TO, MANIFEST)).join('; ') || 'żadnych'}`)
    await dump(`FI: ${step.name}`)
    throw e
  } finally {
    await stopAll()
  }
})
