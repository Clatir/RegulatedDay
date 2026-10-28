/**
 * The screens of E3 on a folder set up like the wizard's: the morning plan and the approval of the boundary, a block
 * added after it with the exchange („Dodaj bez wymiany”, the second click for an overrun), a block dragged an hour up
 * (D305), the bar's place picked on the monitors' mock-up (D304), the calendar (a „zjazd”
 * marked on several dates), requests, routines, templates, the history with a restore, the settings (a value out of
 * its range refused with its message). Independent of the hour it runs at: today's work block is at 03:00 of the
 * night after (the end of the logical day), so the plan always has a boundary to approve.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SESSIONS, DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { createDailyBackup } from '../../src/main/data/backup'
import { logicalMinuteOf } from '../../src/shared/time/day'
import { addDays } from '../../src/shared/time/zone'
import { launch, viewPage, withMainLog } from './app'

const shots = process.env.RD_E2E_SHOTS
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

/** The logical day now (04:00–04:00 Polish time). */
function logicalToday(): string {
  const now = new Date(Date.now() - 4 * 3600_000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** `sessions: false` – today's sessions answered „Nie”: no fixed work still to come makes „Koniec pracy” a break. */
function seed(dir: string, o: { sessions?: boolean } = {}): void {
  const today = logicalToday()
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [{ id: 'mama', name: 'Mama', archived: false }], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
  // Today: an ordinary day with a work block at 03:00 of the night after (always still to come).
  const day = {
    schema: 1,
    date: today,
    dayType: 'zwykly',
    ...(o.sessions === false ? { sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])) } : {}),
    blocks: [{ id: 'late', categoryId: 'inne', startMin: 27 * 60, durationMin: 30, fixed: false }]
  }
  mkdirSync(join(dir, 'days', today.slice(0, 4)), { recursive: true })
  writeFileSync(join(dir, 'days', today.slice(0, 4), `${today}.json`), JSON.stringify(day))
  mkdirSync(join(dir, 'requests'), { recursive: true })
  writeFileSync(join(dir, 'requests', 'r1.json'), JSON.stringify({ schema: 1, id: 'r1', person: 'mama', estimateMin: 20, note: 'zakupy', createdAt: Date.now(), state: 'queued', day: null, block: null }))
}

test('ekrany E3: plan poranny, wymiana, kalendarz, prośby, rutyny, szablony, historia, ustawienia', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-screens-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      // Dziś: the morning plan – the check-in skipped, the boundary approved.
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('morning-plan')).toBeVisible()
      await shot(page, 'e3-01-today')
      // On Monday „Strona B tygodnia” comes first (spec „Plan poranny”): its table, then „Dalej”.
      if (new Date(`${logicalToday()}T12:00:00Z`).getUTCDay() === 1) {
        await expect(page.getByTestId('side-b')).toContainText('Dotrzymane granice')
        await shot(page, 'e7-03-side-b')
        await page.getByTestId('side-b-done').click()
      }
      await page.getByTestId('checkin-skip').click()
      await expect(page.getByTestId('queue-pick')).toContainText('Mama')
      await page.getByTestId('boundary-approve').click()
      await expect(page.getByTestId('boundary')).toContainText('Plan zatwierdzony')
      await shot(page, 'e3-02-approved')
      // A work block added after the approval, beyond the boundary: the exchange, „Dodaj bez wymiany”.
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await page.getByTestId('block-start').fill('3:30')
      await page.getByTestId('block-start').press('Enter')
      await page.getByTestId('block-add').click()
      await expect(page.getByTestId('exchange')).toBeVisible()
      await shot(page, 'e3-03-exchange')
      await page.getByTestId('exchange-add').click()
      // Beyond the maximum: the second click confirms the overrun.
      if (await page.getByTestId('exchange').isVisible()) await page.getByTestId('exchange-add').click()
      await expect(page.getByTestId('exchange')).toBeHidden()
      const dayPath = join(dataDir, 'days', logicalToday().slice(0, 4), `${logicalToday()}.json`)
      const day = JSON.parse(readFileSync(dayPath, 'utf8')) as { blocks: unknown[] }
      expect(day.blocks).toHaveLength(2)
      // D305: the block dragged with the left button an hour up (1.1 px a minute) – its start moves by 60 min.
      const late = page.getByTestId('block-late')
      await expect(late).toHaveAttribute('data-movable', 'true')
      const shown = /(\d\d):(\d\d)/.exec((await late.textContent()) ?? '')!
      const before = Number(shown[1]) * 60 + Number(shown[2]) + (Number(shown[1]) < 4 ? 1440 : 0)
      await late.scrollIntoViewIfNeeded()
      const box = (await late.boundingBox())!
      await page.mouse.move(box.x + 40, box.y + 8)
      await page.mouse.down()
      await page.mouse.move(box.x + 40, box.y - 30, { steps: 4 })
      await page.mouse.move(box.x + 40, box.y - 58, { steps: 4 })
      await page.mouse.up()
      // On the 5-min grid (the forecast may show it off the grid in the night).
      await expect.poll(() => (JSON.parse(readFileSync(dayPath, 'utf8')) as { blocks: Array<{ id: string; startMin: number }> }).blocks.find((b) => b.id === 'late')?.startMin).toBe(Math.round((before - 60) / 5) * 5)
      // The drop selected nothing; a click right after it still does.
      await expect(late).not.toHaveAttribute('data-selected', 'true')
      await late.click()
      await expect(late).toHaveAttribute('data-selected', 'true')
      // A day gone is history: none of its blocks drags.
      await page.getByTestId('day-prev').click()
      await expect(page.locator('[data-block-title]').first()).toBeVisible()
      await expect(page.locator('[data-movable="true"]')).toHaveCount(0)
      await page.getByTestId('day-today').click()
      await expect(page.getByTestId('block-late')).toBeVisible()
      // The day's wake outside 04:00–12:00: refused with its message (never saved to be dropped by the day's schema).
      const wake = page.getByTestId('day-wake')
      const wakeBefore = await wake.inputValue()
      await wake.fill('13:00')
      await wake.press('Enter')
      await expect(wake).toHaveAttribute('data-error', /Dozwolone/)
      await expect(wake).toHaveValue(wakeBefore)

      // A day gone: its type is its plan's – the dialog says so, nothing to save (A6-12).
      await page.getByTestId('nav-today').click()
      await page.getByTestId('day-prev').click()
      await page.getByTestId('day-type').click()
      await expect(page.getByTestId('type-past')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.getByTestId('day-today').click()

      // Kalendarz: today keeps its type here – it changes in „Dziś” (A7-03).
      await page.getByTestId('nav-calendar').click()
      await expect(page.getByTestId('calendar')).toBeVisible()
      const todayCell = page.getByTestId(`day-${logicalToday()}`)
      // The days' files read first (today's own type „zwykły” is marked from its file) – then the text to keep.
      await expect(todayCell).toContainText('zwykły')
      const todayText = (await todayCell.textContent()) ?? ''
      await todayCell.click({ modifiers: ['Control'] })
      await page.getByTestId('calendar-type-zjazd-zdalny').click()
      await expect(page.getByText('Typ dzisiejszego dnia zmienisz w „Dziś”', { exact: false })).toBeVisible()
      await expect(todayCell).toHaveText(todayText)
      // Two dates of the next month (days to come) marked as a remote „zjazd”.
      await page.getByTestId('month-next').click()
      const cells = page.locator('[data-testid^="day-"]')
      await cells.nth(10).click({ modifiers: ['Control'] })
      await cells.nth(11).click({ modifiers: ['Control'] })
      await page.getByTestId('calendar-type-zjazd-zdalny').click()
      await expect(cells.nth(10)).toContainText('zjazd zdalny')
      await expect(cells.nth(11)).toContainText('zjazd zdalny')
      await shot(page, 'e3-04-calendar')

      // Prośby: a new one, its note.
      await page.getByTestId('nav-requests').click()
      await expect(page.getByTestId('request-note').first()).toHaveValue('zakupy')
      await page.getByTestId('request-new').click()
      await expect(page.getByTestId('request-row')).toHaveCount(2)
      // The new one (no note yet) comes first: its note.
      const note = page.getByTestId('request-note').first()
      await expect(note).toHaveValue('')
      await note.fill('odebrać paczkę')
      await note.press('Enter')
      await expect(page.getByTestId('request-note').first()).toHaveValue('odebrać paczkę')
      await expect(page.getByTestId('request-note').nth(1)).toHaveValue('zakupy')
      await shot(page, 'e3-05-requests')

      // Rutyny: a routine with two steps.
      await page.getByTestId('nav-routines').click()
      await page.getByTestId('routine-new').click()
      await expect(page.getByTestId('routine-editor')).toBeVisible()
      await page.getByTestId('step-add-normal').click()
      await expect(page.getByTestId('steps-normal')).toContainText('10 min')
      // The order is yours: ↑ moves the second step first – saved (A6-02).
      const steps = page.getByTestId('steps-normal')
      for (const [i, name] of [[1, 'woda'], [2, 'kot']] as const) {
        const f = steps.getByLabel(`Krok ${i}`, { exact: true })
        await f.fill(name)
        await f.press('Enter')
        await expect(f).toHaveValue(name)
      }
      await page.getByTestId('step-up-normal-1').click()
      await expect(steps.getByLabel('Krok 1', { exact: true })).toHaveValue('kot')
      await expect(steps.getByLabel('Krok 2', { exact: true })).toHaveValue('woda')
      await shot(page, 'e3-06-routines')

      // Szablony: the ordinary day with its second shift.
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').first().click()
      await expect(page.getByTestId('template-editor')).toBeVisible()
      await expect(page.getByTestId('template-timeline')).toContainText('druga zmiana')
      await shot(page, 'e3-07-templates')

      // Historia: the request edited – its earlier version, restored.
      await page.getByTestId('nav-history').click()
      await expect(page.getByTestId('history-record').first()).toBeVisible({ timeout: 15_000 })
      await shot(page, 'e3-08-history')

      // Ustawienia: a budget out of its range refused with its message; one in it saved from tomorrow.
      await page.getByTestId('nav-settings').click()
      const budget = page.getByTestId('setting-zwykly-budgetMin')
      await budget.fill('17h')
      await budget.press('Enter')
      await expect(page.getByRole('status').filter({ hasText: 'Najdłużej 16 h' })).toBeVisible()
      await budget.fill('7h')
      await budget.press('Enter')
      await expect(budget).toHaveValue('7 h')
      // „Komputery” (A3-13): this computer first, without „Zapomnij”.
      await expect(page.getByTestId('settings-computers')).toContainText('ten komputer')
      await expect(page.getByTestId('settings-computers').getByRole('button', { name: 'Zapomnij' })).toHaveCount(0)
      await shot(page, 'e3-09-settings')
      const rd = JSON.parse(readFileSync(join(dataDir, 'rd.json'), 'utf8')) as { settings: Array<{ patch: { dayTypes?: { zwykly?: { budgetMin?: number } } } }> }
      expect(rd.settings.at(-1)!.patch.dayTypes?.zwykly?.budgetMin).toBe(420)
      // A session removed and given back by „Cofnij” – with its id (A7-07).
      const sessions = page.getByTestId('settings-sessions')
      const firstName = await sessions.getByLabel('Nazwa sesji').first().inputValue()
      await page.getByTestId('session-remove-0').click()
      await expect(sessions.getByLabel('Nazwa sesji').first()).not.toHaveValue(firstName)
      await page.getByRole('button', { name: 'Cofnij' }).last().click()
      await expect(sessions.getByLabel('Nazwa sesji').first()).toHaveValue(firstName)
      // D304: the bar's place on the monitors' mock-up – by default the left bottom corner of the primary one.
      await expect(page.getByTestId('bar-place-map')).toBeVisible()
      await expect(page.getByTestId('bar-place-1-bottom-left')).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId('bar-place-1-top-center').click()
      await expect(page.getByTestId('bar-place-1-top-center')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('bar-place-1-bottom-left')).toHaveAttribute('aria-pressed', 'false')
      const prefs = await page.evaluate(() => window.rd.prefs())
      expect(prefs.barPlacement?.offset.y).toBe(8)
      await shot(page, 'e3-10-bar-place')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('timer E4a/E4b: Start, Pauza, Wznów i Dalej w pasku u góry okna, blok na osi tam, gdzie biegł; ten sam pasek w panelu ikony', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-timer-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      // „Start” from the block's panel (it works at any hour – at night the bar shows only the running block).
      await expect(page.getByTestId('block-late')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('block-late').click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('bar-block')).toContainText('Inne obowiązki')
      await expect(page.getByTestId('bar-main')).toHaveAttribute('data-tone', 'praca')
      await shot(page, 'e4a-01-running')
      // The icon's panel shows the same bar (the engine's view in every window).
      await page.evaluate(() => window.rd.barAction('openPanel'))
      const panel = await viewPage(app, 'panel')
      await expect(panel.getByTestId('bar-block')).toContainText('Inne obowiązki')
      // Pauza through the main process (the bar hides it at night), „Wznów” from the block's panel.
      await page.evaluate(() => window.rd.widgetAction('pause'))
      await expect(page.getByTestId('block-timer-start')).toHaveText('Wznów')
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('bar-block')).toContainText('Inne obowiązki')
      // The block stands on the axis where it runs (from now, not at 03:00 of its plan).
      await expect(page.getByTestId('block-late')).not.toContainText('03:00')
      await page.getByTestId('bar-next').click()
      await expect(page.getByTestId('bar-block')).not.toContainText('Inne obowiązki')
      // „Odcinam się”: the panel shows its line with „Wracam”, which ends it.
      await page.evaluate(() => window.rd.barAction('openPanel'))
      await page.evaluate(() => window.rd.widgetAction('cutOff'))
      await expect(panel.getByTestId('bar-state')).toContainText('Odcinam się od')
      await panel.getByTestId('bar-back').click()
      await expect(panel.getByTestId('bar-block')).toBeVisible()
      const log = readFileSync(join(dataDir, 'log', logicalToday().slice(0, 4), logicalToday(), `${(await page.evaluate(() => window.rd.dataView())).computer}.jsonl`), 'utf8')
      const kinds = log
        .trim()
        .split('\n')
        .map((l) => (JSON.parse(l) as { k: string }).k)
        .filter((k) => k.startsWith('block.'))
      expect(kinds).toEqual(['block.start', 'block.pause', 'block.resume', 'block.end'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('rytuał zamknięcia (D318): po „Koniec pracy” karta w „Dziś” i „Rytuał” w pasku; „Zamknij dzień” mówi o wierszach bez wyboru', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-ritual-'))
  // Without today's sessions: on a weekday before the last one ends „Koniec pracy” is only a break (a fixed work block
  // still to come) – no ritual yet, whatever hour the test runs at.
  seed(dataDir, { sessions: false })
  // The ritual's first day already written by a leader (D320): today.
  const rdFile = join(dataDir, 'rd.json')
  writeFileSync(rdFile, JSON.stringify({ ...JSON.parse(readFileSync(rdFile, 'utf8')), ritualFrom: logicalToday() }, null, 2))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('block-late')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('ritual')).toHaveCount(0)
      await page.getByTestId('block-late').click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('bar-block')).toContainText('Inne obowiązki')
      await page.evaluate(() => window.rd.widgetAction('endWork'))
      // The card after the end of work, its rows by the time of day; the bar's quiet „Rytuał” (not in the night).
      await expect(page.getByTestId('ritual')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('ritual-row-workEnd')).toContainText('Koniec pracy o')
      const night = await page.evaluate(async () => (await window.rd.widget()).night)
      await expect(page.getByTestId('bar-ritual')).toHaveCount(night ? 0 : 1)
      await shot(page, 'e6-01-ritual')
      await page.getByTestId('ritual-close').click()
      const left = await page.getByTestId('ritual-close-left').count()
      if (left) await page.getByTestId('ritual-close-confirm').click()
      await expect(page.getByTestId('ritual-left')).toContainText('dzień zamknięty o')
      await expect(page.getByTestId('bar-ritual')).toHaveCount(0)
      const log = readFileSync(join(dataDir, 'log', logicalToday().slice(0, 4), logicalToday(), `${(await page.evaluate(() => window.rd.dataView())).computer}.jsonl`), 'utf8')
      expect(log).toContain('"k":"ritual.close"')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('„Dane” w Ustawieniach (D321): eksport CSV do wybranego folderu, kopia z „Wybranymi rekordami” przywraca prośbę', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-data-'))
  seed(dataDir)
  const backup = await createDailyBackup(dataDir, join(dataDir, 'backups'), logicalToday())
  expect(backup.ok).toBe(true)
  // The request changed after the backup: the backup holds „zakupy”.
  const reqFile = join(dataDir, 'requests', 'r1.json')
  writeFileSync(reqFile, JSON.stringify({ ...JSON.parse(readFileSync(reqFile, 'utf8')), note: 'apteka' }))
  const csvDir = mkdtempSync(join(tmpdir(), 'rd-e2e-csv-'))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      // The window of Windows that picks a folder: here the test's folder.
      await app.evaluate(({ dialog }, dir) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as unknown as typeof dialog.showOpenDialog
      }, csvDir)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-settings').click()
      await expect(page.getByTestId('settings-data')).toBeVisible()
      await page.getByTestId('csv-export').click()
      await expect.poll(() => readdirSync(csvDir).filter((f) => f.endsWith('.csv')).length, { timeout: 15_000 }).toBe(3)
      // Again into the same folder (D323): asked first – „Anuluj” keeps the files, „Zastąp” writes them anew.
      const blocks = join(csvDir, 'bloki.csv')
      writeFileSync(blocks, 'stare')
      const answer = (response: number) =>
        app.evaluate(({ dialog }, r) => {
          const w = globalThis as unknown as { asked: number }
          w.asked = 0
          dialog.showMessageBox = (async () => (w.asked++, { response: r, checkboxChecked: false })) as unknown as typeof dialog.showMessageBox
        }, response)
      const asked = () => app.evaluate(() => (globalThis as unknown as { asked: number }).asked)
      await answer(1)
      await page.getByTestId('csv-export').click()
      await expect.poll(asked, { timeout: 15_000 }).toBe(1)
      expect(readFileSync(blocks, 'utf8')).toBe('stare')
      await answer(0)
      await page.getByTestId('csv-export').click()
      await expect.poll(() => readFileSync(blocks, 'utf8'), { timeout: 15_000 }).not.toBe('stare')
      // The backup: its records named as in the interface; the request taken back.
      await page.getByTestId(`backup-records-${logicalToday()}.zip`).click()
      await expect(page.getByTestId('backup-contents')).toContainText('Prośba: zakupy')
      await page.getByTestId('backup-contents').getByText('Prośba: zakupy').click()
      await page.getByTestId('backup-restore-chosen').click()
      await expect.poll(() => (JSON.parse(readFileSync(reqFile, 'utf8')) as { note: string }).note, { timeout: 15_000 }).toBe('zakupy')
      await shot(page, 'e6-02-data')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('gra (D322): „Passa · nuty” w nagłówku „Dziś”, świętowanie passy 7 dni znika po klawiszu, pokój z płytą i statusami dni', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-game-'))
  seed(dataDir, { sessions: false })
  const today = logicalToday()
  const day = (d: number) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + d)).toISOString().slice(0, 10)
  // The ritual and the game from three weeks back (D320, T509), seven kept days frozen up to yesterday – 8 notes each.
  const rdFile = join(dataDir, 'rd.json')
  writeFileSync(rdFile, JSON.stringify({ ...JSON.parse(readFileSync(rdFile, 'utf8')), ritualFrom: day(-20), gameFrom: day(-20) }, null, 2))
  const lines = [-7, -6, -5, -4, -3, -2, -1].map((d) => JSON.stringify({ day: day(d), at: Date.now(), v: 2, how: 'ready', know: { seed: 10 }, missing: [], grade: { boundary: 'kept', game: { v: 1, status: 'kept', out: null, notes: { boundary: 3, regen: 3, reserve: 2 } } } }))
  for (const y of new Set(lines.map((l) => (JSON.parse(l) as { day: string }).day.slice(0, 4)))) {
    mkdirSync(join(dataDir, 'grades', y), { recursive: true })
    writeFileSync(join(dataDir, 'grades', y, 'seed.jsonl'), `${lines.filter((l) => l.includes(`"day":"${y}`)).join('\n')}\n`)
  }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('game-line')).toContainText('Passa 7 · 56 nut', { timeout: 30_000 })
      // The streak of 7 reached yesterday: celebrated full-screen – not in a quiet mode, the night or „Odcinam się”, and
      // only with the main window in front (a runner may leave a new window without the focus).
      await page.bringToFront()
      const calm = await page.evaluate(async () => {
        const v = await window.rd.widget()
        return !v.quiet && !v.hidden && !v.night && document.hasFocus()
      })
      if (calm) {
        await expect(page.getByTestId('celebration')).toContainText('Passa 7 dni')
        await shot(page, 'e7-02-celebration')
        await page.keyboard.press('Space')
        await expect(page.getByTestId('celebration')).toHaveCount(0)
      } else await expect(page.getByTestId('celebration')).toHaveCount(0)
      // Once on this computer: not again.
      await page.getByTestId('nav-room').click()
      await expect(page.getByTestId('room-art')).toBeVisible()
      await expect(page.getByTestId('room-plyta-1')).toHaveCount(1)
      await expect(page.getByTestId('room-roslina-1')).toHaveCount(1)
      await expect(page.getByTestId(`room-day-${day(-1)}`)).toContainText('dotrzymany')
      await expect(page.getByTestId('room-next')).toContainText('Następny: Roślina – pierwsze liście – jeszcze 19 nut')
      await expect(page.getByTestId('celebration')).toHaveCount(0)
      await shot(page, 'e7-01-room')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('kalibracja (D119): po okresie karta w planie porannym – „Nie teraz” liczy odroczenie; przegląd z Ustawień – „Zakończ przegląd”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-calibration-'))
  seed(dataDir, { sessions: false })
  const today = logicalToday()
  const day = (d: number) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + d)).toISOString().slice(0, 10)
  const rdFile = join(dataDir, 'rd.json')
  writeFileSync(rdFile, JSON.stringify({ ...JSON.parse(readFileSync(rdFile, 'utf8')), ritualFrom: day(-30), gameFrom: day(-30) }, null, 2))
  // 14 ordinary days closed by the ritual, ended a week ago: the period is over, the review waits in the morning.
  const lines = Array.from({ length: 14 }, (_, i) => JSON.stringify({ day: day(-20 + i), at: Date.now(), v: 2, how: 'ready', know: { seed: 10 }, missing: [], grade: { boundary: 'kept', closed: 'ritual', dayType: 'zwykly' } }))
  for (const y of new Set(lines.map((l) => (JSON.parse(l) as { day: string }).day.slice(0, 4)))) {
    mkdirSync(join(dataDir, 'grades', y), { recursive: true })
    writeFileSync(join(dataDir, 'grades', y, 'seed.jsonl'), `${lines.filter((l) => l.includes(`"day":"${y}`)).join('\n')}\n`)
  }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  const review = () => (JSON.parse(readFileSync(rdFile, 'utf8')) as { calibrationReview?: { deferrals: number; reviewed: string | null } }).calibrationReview
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('morning-plan')).toBeVisible({ timeout: 30_000 })
      if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) await page.getByTestId('side-b-done').click()
      await page.getByTestId('checkin-skip').click()
      await expect(page.getByTestId('calibration-card')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('calibration-later').click()
      await expect(page.getByTestId('calibration-card')).toHaveCount(0)
      await expect.poll(() => review()?.deferrals, { timeout: 15_000 }).toBe(1)
      // The settings say where it is and open it.
      await page.getByTestId('nav-settings').click()
      await page.getByTestId('settings-calibration-open').click()
      await expect(page.getByTestId('calibration-review')).toContainText('Za mało danych na propozycje')
      await shot(page, 'e7-04-calibration')
      await page.getByTestId('calibration-finish').click()
      await expect.poll(() => review()?.reviewed, { timeout: 15_000 }).toBe(today)
      await expect(page.getByTestId('calibration-state')).toContainText('Przegląd zrobiony')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('prośby w pasku (D311, D312): „Prośba ▸” – „Zrobione teraz” z osobą i „Koniec”; „Pilne” z szacunkiem', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-requests-'))
  // Without today's sessions: in a session (a quiet mode) „Pilne” starts with 15 min without asking (D311).
  seed(dataDir, { sessions: false })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      // The engine's view (the night's quiet has no „Prośba ▸”).
      await expect.poll(() => page.evaluate(async () => (await window.rd.widget()).day), { timeout: 30_000 }).not.toBeNull()
      // At night the bar shows only the time and what runs: no „Prośba ▸” then – the request through the main process.
      const night = await page.evaluate(async () => (await window.rd.widget()).night)
      await expect(page.getByTestId('bar-group-request')).toHaveCount(night ? 0 : 1)
      if (night) await page.evaluate(() => window.rd.widgetAction('request', 'now|mama|'))
      else {
        await page.getByTestId('bar-group-request').click()
        await expect(page.getByTestId('bar-request-group')).toContainText('Zrobione teraz:')
        await page.getByTestId('bar-request-now-mama').click()
      }
      await expect(page.getByTestId('bar-request')).toContainText('Zrobione teraz · Mama · 0:0')
      await page.getByTestId('bar-request-end').click()
      await expect(page.getByTestId('bar-request')).toHaveCount(0)
      if (night) await page.evaluate(() => window.rd.widgetAction('request', 'urgent|mama|30'))
      else {
        await page.getByTestId('bar-group-request').click()
        await page.getByTestId('bar-request-urgent-mama').click()
        await expect(page.getByTestId('bar-request-estimate-value')).toHaveText('15 min')
        await page.getByTestId('bar-request-estimate-30').click()
        await page.getByTestId('bar-request-start').click()
      }
      await expect(page.getByTestId('bar-request')).toContainText('Pilne · Mama · 0:0')
      await expect(page.getByTestId('bar-request')).toContainText('z 30 min')
      await shot(page, 'e5-01-request')
      await page.getByTestId('bar-request-end').click()
      await expect(page.getByTestId('bar-request')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** The logical minute now (04:00 = 240, after midnight + 1440). */
const logicalMinuteNow = (): number => Math.floor(logicalMinuteOf(logicalToday(), Date.now()))

test('rutyny (D328): karta w „Dziś” z wersją i krokami; „Kroki ▸” w pasku – zapis w jednym miejscu zamyka oba', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-routines-'))
  seed(dataDir, { sessions: false })
  const today = logicalToday()
  const start = Math.max(240, logicalMinuteNow() - 20)
  mkdirSync(join(dataDir, 'routines'), { recursive: true })
  writeFileSync(join(dataDir, 'routines', 'r.json'), JSON.stringify({ schema: 1, id: 'r', name: 'Poranna', normal: [{ id: 'woda', name: 'woda', min: 2 }, { id: 'kot', name: 'kot', min: 8 }], worse: [{ id: 'woda', name: 'woda', min: 2 }], archived: false }))
  const dayFile = join(dataDir, 'days', today.slice(0, 4), `${today}.json`)
  const day = JSON.parse(readFileSync(dayFile, 'utf8'))
  day.blocks.push({ id: 'rut', categoryId: 'rutyny', startMin: start, durationMin: 10, fixed: false, routine: 'r' }, { id: 'rut2', categoryId: 'rutyny', startMin: start, durationMin: 10, fixed: false, routine: 'r' })
  writeFileSync(dayFile, JSON.stringify(day))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('routine-card')).toHaveCount(2, { timeout: 30_000 })
      // The card: the version „na gorsze dni”, one step ticked, „Zapisz zaznaczone”.
      const card = page.getByTestId('routine-card').first()
      await card.getByTestId('routine-card-version').getByText('na gorsze dni').click()
      await card.getByTestId('routine-card-step-woda').check()
      await card.getByTestId('routine-card-save').click()
      await expect(page.getByTestId('routine-card')).toHaveCount(1)
      await shot(page, 'e8-routine-card')
      // The bar (not in the night's quiet): „Kroki ▸” unfolds the steps of the other routine; its save closes the card.
      await expect.poll(() => page.evaluate(async () => (await window.rd.widget()).day), { timeout: 30_000 }).not.toBeNull()
      const night = await page.evaluate(async () => (await window.rd.widget()).night)
      if (night) await page.getByTestId('routine-card-all').click()
      else {
        const line = page.getByTestId('bar-main').getByTestId(`bar-line-routine:${today}:rut2`)
        await expect(line).toBeVisible()
        await line.getByTestId('bar-act-routine-steps').click()
        await page.getByTestId('bar-routine-step-kot').click()
        await page.getByTestId('bar-routine-save').click()
        await expect(line).toHaveCount(0)
      }
      await expect(page.getByTestId('routine-card')).toHaveCount(0)
      const logDir = join(dataDir, 'log', today.slice(0, 4), today)
      await expect.poll(() => readdirSync(logDir).map((f) => readFileSync(join(logDir, f), 'utf8')).join('').split('"k":"routine.done"').length - 1, { timeout: 15_000 }).toBe(2)

      // „Skopiuj ten dzień do…” onto yesterday (D330, a day that already ran): the warning first, „Anuluj” goes back
      // without copying.
      const yesterday = addDays(today, -1)
      await page.getByTestId('day-menu').click()
      await page.getByTestId('day-copy').click()
      const grid = page.getByTestId('copy-dialog')
      if (!(await grid.getByTestId(`day-${yesterday}`).isVisible())) await grid.getByLabel('Poprzedni miesiąc').click()
      await grid.getByTestId(`day-${yesterday}`).click()
      await grid.getByTestId('copy-apply').click()
      await expect(grid.getByTestId('copy-warning')).toContainText('Kopia zastąpi plan dnia, który już trwał')
      await expect(grid.getByTestId('copy-ahead')).toBeDisabled()
      await grid.getByTestId('copy-back').click()
      await expect(grid.getByTestId('copy-warning')).toHaveCount(0)
      await expect(grid.getByTestId('copy-apply')).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
