/**
 * The screens of E3 on a folder set up like the wizard's: the morning plan and the approval of the boundary, a block
 * added after it with the exchange („Dodaj bez wymiany”, the second click for an overrun), a block dragged an hour up
 * (D305), the bar's place picked on the monitors' mock-up (D304), the calendar (a „zjazd”
 * marked on several dates), requests, routines, templates, the history with a restore, the settings (a value out of
 * its range refused with its message). Independent of the hour and the day it runs at (T528): today is an ordinary day
 * from its file (its template has no blocks since D467), so its work block at 03:00 of the night after (the end of the
 * logical day, always still to come) proposes the boundary; yesterday has a block of its own from `seed` (a Sunday has
 * none from a template).
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SESSIONS, DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords, SETUP_FROM, templateJson } from '../../src/shared/model/defaults'
import { planBlock } from '../../src/shared/model/plan'
import { paths } from '../../src/shared/data/paths'
import { createDailyBackup } from '../../src/main/data/backup'
import { logicalMinuteOf } from '../../src/shared/time/day'
import { addDays } from '../../src/shared/time/zone'
import { launch, logicalToday, viewPage, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const shots = process.env.RD_E2E_SHOTS
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

/**
 * `sessions: false` – today's sessions answered „Nie”: no fixed work still to come makes „Koniec pracy” a break.
 */
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
  // Yesterday: a block of its own – after a Sunday (a weekend without sessions or a template block) the day gone would
  // otherwise have none to check that it does not drag.
  const yesterday = addDays(today, -1)
  mkdirSync(join(dir, 'days', yesterday.slice(0, 4)), { recursive: true })
  writeFileSync(
    join(dir, 'days', yesterday.slice(0, 4), `${yesterday}.json`),
    JSON.stringify({ schema: 1, date: yesterday, blocks: [{ id: 'past', categoryId: 'inne', startMin: 10 * 60, durationMin: 30, fixed: false }] })
  )
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
      // „Cele na <miesiąc>” (D360) comes before the questions about symptoms until skipped.
      await page.getByTestId('goals-skip').click()
      await page.getByTestId('checkin-skip').click()
      await expect(page.getByTestId('queue-pick')).toContainText('Mama')
      await page.getByTestId('boundary-approve').click()
      await expect(page.getByTestId('boundary')).toContainText('Plan zatwierdzony')
      await shot(page, 'e3-02-approved')
      // „Cofnij zatwierdzenie” (A6-11): the card says „do zrobienia” again and offers the approval; approved once more.
      await page.getByTestId('boundary-undo').click()
      await expect(page.getByTestId('boundary-approve')).toBeVisible()
      await expect(page.getByTestId('morning-plan')).toContainText('do zrobienia')
      await page.getByTestId('boundary-approve').click()
      await expect(page.getByTestId('boundary')).toContainText('Plan zatwierdzony')
      await expect(page.getByTestId('morning-plan')).toContainText('zatwierdzony')
      // A work block added after the approval, beyond the boundary: the exchange, „Dodaj bez wymiany”.
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await page.getByTestId('block-start').fill('3:30')
      // D461: the start committed saves the new block – a work block after the approval asks for the exchange at once.
      await page.getByTestId('block-start').press('Enter')
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
      // The edges need the block ahead of now: at night (from 30 min before its new start) a not started block whose
      // start has passed stands at the current minute (the forecast), so the drags would start from there.
      if (logicalMinuteOf(logicalToday(), Date.now()) < before - 60 - 30) {
        // D365: the bottom edge moves the end, the top one the start with the same end – 5 min steps, the hours shown while dragging.
        // The block is short (its end is not written on it): its start as shown, its end that and its saved length.
        const saved = () => (JSON.parse(readFileSync(dayPath, 'utf8')) as { blocks: Array<{ id: string; startMin: number; durationMin: number }> }).blocks.find((b) => b.id === 'late')!
        const span = async () => {
          const m = /(\d\d):(\d\d)/.exec((await late.textContent()) ?? '')!
          const start = Number(m[1]) * 60 + Number(m[2]) + (Number(m[1]) < 4 ? 1440 : 0)
          return { start, end: start + saved().durationMin }
        }
        const clock = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}${min >= 1440 ? ' +1' : ''}`
        await expect(page.getByTestId('block-late-edge-end')).toBeVisible()
        await expect(page.getByTestId('block-late-edge-top')).toBeVisible()
        const s0 = await span()
        const grab = async (edge: 'top' | 'end') => {
          await late.scrollIntoViewIfNeeded()
          const r = (await late.boundingBox())!
          return { x: r.x + 40, y: edge === 'end' ? r.y + r.height - 3 : r.y + 3 }
        }
        const bottom = await grab('end')
        await page.mouse.move(bottom.x, bottom.y)
        await page.mouse.down()
        await page.mouse.move(bottom.x, bottom.y + 16, { steps: 3 })
        await page.mouse.move(bottom.x, bottom.y + 33, { steps: 3 })
        // The hours are shown while the edge is held (nothing saved yet).
        const end1 = Math.round((s0.end + 30) / 5) * 5
        await expect(page.getByTestId('edge-hint')).toContainText(`${clock(s0.start)}–${clock(end1)}`)
        // At an edge the cursor is the edge's alone (never „grabbing” of the whole block).
        await expect(late).toHaveClass(/cursor-ns-resize/)
        await expect(late).not.toHaveClass(/cursor-grabbing/)
        await page.mouse.up()
        await expect.poll(() => saved().durationMin).toBe(end1 - s0.start)
        const s1 = await span()
        const top = await grab('top')
        await page.mouse.move(top.x, top.y)
        await page.mouse.down()
        await page.mouse.move(top.x, top.y - 8, { steps: 3 })
        await page.mouse.move(top.x, top.y - 16.5, { steps: 3 })
        await page.mouse.up()
        const start2 = Math.round((s1.start - 15) / 5) * 5
        await expect.poll(() => saved().durationMin).toBe(s1.end - start2)
        expect(saved().startMin % 1440).toBe(start2 % 1440)
        await expect(late).toContainText(clock(start2))
        // Dragged to under 5 min: the block holds 5 min and no less.
        const squeeze = await grab('end')
        await page.mouse.move(squeeze.x, squeeze.y)
        await page.mouse.down()
        await page.mouse.move(squeeze.x, squeeze.y - 150, { steps: 6 })
        await page.mouse.up()
        await expect.poll(() => saved().durationMin).toBe(5)
      } else {
        test.info().annotations.push({ type: 'skip', description: 'D365: krawędzie pominięte w nocy (blok już za teraz)' })
      }
      // A dialog keeps the keyboard (A6-21): Tab never leaves it, Ctrl+N of the page waits, Esc gives the focus back.
      await page.getByTestId('block-move').click()
      const moveDialog = page.getByRole('dialog')
      await expect(moveDialog).toBeVisible()
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab')
        expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
      }
      await page.keyboard.press('Control+KeyN')
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(moveDialog).toBeHidden()
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('block-move')
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
      // E8k.3 (D347): the reason stays under the field while the value is refused – until the next edit.
      await expect(page.getByTestId('day-wake-error')).toContainText('Dozwolone')
      // The message floats under the narrow field and takes no clicks from what lies below it.
      const overMessage = await page.getByTestId('day-wake-error').evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return top === el || el.contains(top)
      })
      expect(overMessage).toBe(false)
      // Esc, wherever the focus is, takes the message and the frame away – and closes nothing else.
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('day-wake-error')).toHaveCount(0)
      await expect(wake).not.toHaveAttribute('aria-invalid', 'true')
      await expect(page.getByTestId('today')).toBeVisible()
      // The next edit takes it too.
      await wake.fill('13:00')
      await wake.press('Enter')
      await expect(page.getByTestId('day-wake-error')).toContainText('Dozwolone')
      await wake.fill('7:00')
      await expect(page.getByTestId('day-wake-error')).toHaveCount(0)
      await wake.press('Escape')

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
      // The days' files read first (today's own type „zwykły” is marked from its file) and the month counted (the bars, „+N” and
      // the dot of the load of D418 come with it) – then the text to keep.
      await expect(todayCell).toContainText('zwykły')
      await expect(page.getByTestId('calendar')).toHaveAttribute('data-counted', 'true', { timeout: 30_000 })
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
      await expect(page.getByTestId('case-row')).toHaveCount(2)
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
      // A field with a layout of its own keeps it (D347): the name and the buttons of the routine in one row, the step's name wide.
      const rowTop = async (id: string) => (await page.getByTestId(id).boundingBox())!.y
      expect(Math.abs((await rowTop('routine-name')) - (await rowTop('routine-remove')))).toBeLessThan(12)
      expect((await steps.getByLabel('Krok 1', { exact: true }).boundingBox())!.width).toBeGreaterThan(150)
      await shot(page, 'e3-06-routines')

      // Szablony: the ordinary day – no second shift and no mark of one (D467).
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').first().click()
      await expect(page.getByTestId('template-editor')).toBeVisible()
      await expect(page.getByTestId('template-timeline')).not.toContainText('druga zmiana')
      // D365: a block of the template with its own start (one added on a free place) – the bottom edge lengthens it by
      // the field's way (30 min, 33 px).
      const tAxis = page.getByTestId('template-timeline').getByTestId('timeline-axis')
      await tAxis.click({ position: { x: 120, y: (await tAxis.boundingBox())!.height - 40 } })
      await expect(page.getByTestId('block-editor')).toBeVisible()
      const own = page.getByTestId('template-timeline').locator('[data-movable="true"]').first()
      await expect(own).toBeVisible()
      await own.scrollIntoViewIfNeeded()
      const lengthField = page.getByTestId('block-duration')
      const length0 = await lengthField.inputValue()
      const ownBox = (await own.boundingBox())!
      await page.mouse.move(ownBox.x + 40, ownBox.y + ownBox.height - 3)
      await page.mouse.down()
      await page.mouse.move(ownBox.x + 40, ownBox.y + ownBox.height + 16, { steps: 3 })
      await page.mouse.move(ownBox.x + 40, ownBox.y + ownBox.height + 30, { steps: 3 })
      await page.mouse.up()
      await expect(lengthField).not.toHaveValue(length0)
      // The name's field is no wider than its `max-w` and the buttons stay in its row (not wrapped under it).
      const name = (await page.getByTestId('template-name').boundingBox())!
      expect(name.width).toBeLessThanOrEqual(262)
      expect(Math.abs(name.y - (await page.getByTestId('template-copy').boundingBox())!.y)).toBeLessThan(12)
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

test('trwający blok (D365): dolna krawędź na osi przedłuża i skraca przez timer, nie przez plan', async () => {
  // The engine approves the boundary itself at the first work block's start (end of work + 15 min – on a weekend or a
  // holiday that is 45 min from now): the day's own approval at the end of the logical day (04:00) puts it out of the way
  // at any hour and on any day of the week – the cost counts only minutes after the boundary. Not run only in the last
  // 75 min of the logical day, where the block (30 min) and its extension (30 min) would reach over the turn of the day.
  const nowMin = logicalMinuteOf(logicalToday(), Date.now())
  test.skip(nowMin > 28 * 60 - 75, 'blok i jego przedłużenie nie mieszczą się już w dobie logicznej (koniec o 04:00)')
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-resize-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      const late = page.getByTestId('block-late')
      await expect(late).toBeVisible({ timeout: 30_000 })
      await page.evaluate((a) => window.rd.logEvents([{ k: 'boundary.approve', day: a.day, boundary: a.boundary, auto: false }]), { day: logicalToday(), boundary: Math.round((Date.now() + (28 * 60 - nowMin - 1) * 60_000) / 60_000) * 60_000 })
      await late.click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('bar-block')).toContainText('Inne obowiązki')
      // A running block has the bottom edge only (its start is no longer its plan's to move).
      await expect(page.getByTestId('block-late-edge-end')).toBeVisible()
      await expect(page.getByTestId('block-late-edge-top')).toHaveCount(0)
      await expect(late).not.toHaveAttribute('data-movable', 'true')
      const dayFile = join(dataDir, 'days', logicalToday().slice(0, 4), `${logicalToday()}.json`)
      const planned = () => (JSON.parse(readFileSync(dayFile, 'utf8')) as { blocks: Array<{ id: string; durationMin: number; startMin: number }> }).blocks.find((b) => b.id === 'late')!
      const before = planned()
      const logFile = async () => join(dataDir, 'log', logicalToday().slice(0, 4), logicalToday(), `${(await page.evaluate(() => window.rd.dataView())).computer}.jsonl`)
      const events = async () =>
        readFileSync(await logFile(), 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l) as { k: string; minutes?: number })
          .filter((e) => e.k.startsWith('block.'))
      const drag = async (dy: number) => {
        await late.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const r = (await late.boundingBox())!
        const x = r.x + 40
        const y = r.y + r.height - 3
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x, y + dy / 2, { steps: 4 })
        await page.mouse.move(x, y + dy, { steps: 4 })
        // The hours and what the end brings are shown while the edge is held.
        await expect(page.getByTestId('edge-hint')).toBeVisible()
        await page.mouse.up()
      }
      // Down by 30 min (33 px): inside the approved boundary (the end of the day) – written at once as „Przedłuż”, the plan of the day untouched.
      await drag(33)
      await expect.poll(async () => (await events()).filter((e) => e.k === 'block.extend').length).toBe(1)
      const extended = (await events()).find((e) => e.k === 'block.extend')!.minutes!
      expect(extended).toBeGreaterThanOrEqual(25)
      expect(extended).toBeLessThanOrEqual(35)
      expect(planned()).toEqual(before)
      await expect(page.getByTestId('resize-confirm')).toHaveCount(0)
      // Up by far more than the block holds: the end stops at now (rounded up) – a shortening, never before now.
      await drag(-110)
      await expect.poll(async () => (await events()).filter((e) => e.k === 'block.shorten').length).toBe(1)
      const shortened = (await events()).find((e) => e.k === 'block.shorten')!.minutes!
      expect(shortened).toBeGreaterThan(0)
      expect(shortened).toBeLessThan(30 + extended)
      expect(planned()).toEqual(before)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('trwający blok (D365): za granicą koszt i „Potwierdź · Anuluj” – bez potwierdzenia nic się nie zmienia, z nim jedno „Przedłuż”', async () => {
  // The boundary is written 45 min from now and the block runs 30 min from now: an extension by 60 min crosses it, at any
  // hour (the cost counts the minutes after the boundary). Not run only in the last 100 min of the logical day (04:00),
  // where the extended block would reach over the turn of the day.
  const nowMin = logicalMinuteOf(logicalToday(), Date.now())
  test.skip(nowMin > 28 * 60 - 100, 'blok przedłużony za granicę nie mieści się już w dobie logicznej (koniec o 04:00)')
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-resize-cost-'))
  seed(dataDir, { sessions: false })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      const late = page.getByTestId('block-late')
      await expect(late).toBeVisible({ timeout: 30_000 })
      await page.evaluate((a) => window.rd.logEvents([{ k: 'boundary.approve', day: a.day, boundary: a.boundary, auto: false }]), { day: logicalToday(), boundary: Math.round((Date.now() + 45 * 60_000) / 60_000) * 60_000 })
      await late.click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('bar-block')).toContainText('Inne obowiązki')
      const logFile = async () => join(dataDir, 'log', logicalToday().slice(0, 4), logicalToday(), `${(await page.evaluate(() => window.rd.dataView())).computer}.jsonl`)
      const extends_ = async () =>
        readFileSync(await logFile(), 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l) as { k: string; minutes?: number })
          .filter((e) => e.k === 'block.extend')
      const drag = async (dy: number) => {
        await late.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const r = (await late.boundingBox())!
        const x = r.x + 40
        const y = r.y + r.height - 3
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x, y + dy / 2, { steps: 4 })
        await page.mouse.move(x, y + dy, { steps: 4 })
        // Past the boundary the hint carries the cost while the edge is held.
        await expect(page.getByTestId('edge-hint')).toContainText('Przedłuż +')
        await page.mouse.up()
      }
      const confirm = page.getByTestId('resize-confirm')
      // 60 min down: past the boundary – the cost waits, the block is drawn at the end it asks for, nothing is written.
      await drag(66)
      await expect(confirm).toBeVisible()
      await expect(page.getByTestId('resize-confirm-text')).toContainText('Przedłuż +')
      await expect(page.getByTestId('resize-confirm-text')).toContainText(/przedłużenie|przekroczenie/)
      await expect(late).toHaveAttribute('data-waiting', 'true')
      expect(await extends_()).toHaveLength(0)
      // Without „Potwierdź” it goes away by itself (10 s) and the block is at its end again – the log unchanged.
      await expect(confirm).toBeHidden({ timeout: 20_000 })
      await expect(late).not.toHaveAttribute('data-waiting', 'true')
      expect(await extends_()).toHaveLength(0)
      // „Anuluj”: the same.
      await drag(66)
      await expect(confirm).toBeVisible()
      await page.getByTestId('resize-confirm-no').click()
      await expect(confirm).toBeHidden()
      await expect(late).not.toHaveAttribute('data-waiting', 'true')
      expect(await extends_()).toHaveLength(0)
      // „Potwierdź”: one extension, the event of „Przedłuż” (a click of the bar writes the same).
      await drag(66)
      await expect(confirm).toBeVisible()
      await page.getByTestId('resize-confirm-yes').click()
      await expect.poll(async () => (await extends_()).length).toBe(1)
      await expect(confirm).toBeHidden()
      const minutes = (await extends_())[0]!.minutes!
      expect(minutes).toBeGreaterThanOrEqual(55)
      expect(minutes).toBeLessThanOrEqual(65)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('rozsuwanie (D367): blok przeciągnięty na zajęte miejsce przesuwa kolejne w pliku dnia, w trakcie widać ich nowe miejsca; „Cofnij” w pasku przywraca plik', async () => {
  // Tomorrow – a day to come at any hour of the run (no „now” on its axis): three blocks of yours an hour each and no
  // sessions, so nothing else stands between them.
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-push-'))
  seed(dataDir)
  const tomorrow = addDays(logicalToday(), 1)
  const own = (id: string, startMin: number) => ({ id, categoryId: 'inne', startMin, durationMin: 60, fixed: false, origin: 'user' })
  const dayFile = join(dataDir, 'days', tomorrow.slice(0, 4), `${tomorrow}.json`)
  mkdirSync(dirname(dayFile), { recursive: true })
  writeFileSync(
    dayFile,
    JSON.stringify({
      schema: 1,
      date: tomorrow,
      dayType: 'zwykly',
      sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])),
      blocks: [own('a', 13 * 60), own('b', 14 * 60), own('c', 15 * 60)]
    })
  )
  const starts = () => Object.fromEntries((JSON.parse(readFileSync(dayFile, 'utf8')) as { blocks: Array<{ id: string; startMin: number }> }).blocks.map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const a = page.getByTestId('block-a')
      const b = page.getByTestId('block-b')
      await expect(a).toHaveAttribute('data-movable', 'true')
      await a.scrollIntoViewIfNeeded()
      const box = (await a.boundingBox())!
      // An hour down (1.1 px a minute): „a” onto „b” – while it is held, „b” and „c” stand an hour later, dashed.
      await page.mouse.move(box.x + 40, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 40, box.y + 50, { steps: 4 })
      await page.mouse.move(box.x + 40, box.y + 86, { steps: 4 })
      await expect(b).toHaveAttribute('data-pushed', 'true')
      await expect(b).toContainText('15:00')
      await expect(page.getByTestId('block-c')).toHaveAttribute('data-pushed', 'true')
      expect(starts()).toEqual({ a: 780, b: 840, c: 900 })
      await page.mouse.up()
      // One edit of the day's file: the dragged block and both pushed ones.
      await expect.poll(starts).toEqual({ a: 840, b: 900, c: 960 })
      await expect(b).not.toHaveAttribute('data-pushed', 'true')
      await expect(b).toContainText('15:00')
      const line = page.getByTestId('bar-line-moved:push')
      // The change's line stands after every line of the day (T584): at some hours of the run two of them (a morning
      // question, water) fill the bar and it waits in „⋯” – unfold it then, the line works there the same.
      const more = page.getByTestId('bar-main').getByTestId('bar-group-more')
      await expect(async () => {
        if (!(await line.count()) && (await more.count()) && (await more.getAttribute('aria-pressed')) !== 'true') await more.click()
        await expect(line).toContainText('Przesunięto 2 bloki', { timeout: 1_000 })
      }).toPass({ timeout: 10_000 })
      await page.getByTestId('bar-act-moved-undo').click()
      await expect.poll(starts).toEqual({ a: 780, b: 840, c: 900 })
      await expect(line).toHaveCount(0)
      await expect(b).toContainText('14:00')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('bloki równoległe (D476, D492): blok upuszczony na prawą część innego staje obok niego – „Równolegle z …”, oba obok siebie na osi, za grupą przesunięty; „Cofnij” w pasku przywraca plik', async () => {
  // Tomorrow – a day to come at any hour of the run: „a” 13:00 (60 min), „c” 14:00, „b” 16:00 (90 min) of yours, no sessions.
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-parallel-'))
  seed(dataDir)
  const tomorrow = addDays(logicalToday(), 1)
  const own = (id: string, startMin: number, durationMin = 60) => ({ id, categoryId: 'inne', startMin, durationMin, fixed: false, origin: 'user' })
  const dayFile = join(dataDir, 'days', tomorrow.slice(0, 4), `${tomorrow}.json`)
  mkdirSync(dirname(dayFile), { recursive: true })
  writeFileSync(
    dayFile,
    JSON.stringify({
      schema: 1,
      date: tomorrow,
      dayType: 'zwykly',
      sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])),
      blocks: [own('a', 13 * 60), own('c', 14 * 60), own('b', 16 * 60, 90)]
    })
  )
  type Raw = { id: string; startMin: number; alongside?: string | null }
  const file = () => Object.fromEntries((JSON.parse(readFileSync(dayFile, 'utf8')) as { blocks: Raw[] }).blocks.map((b) => [b.id, [b.startMin, b.alongside ?? null]]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const a = page.getByTestId('block-a')
      const b = page.getByTestId('block-b')
      await expect(b).toHaveAttribute('data-movable', 'true')
      // „b” in the middle of the view, „a” 3 h above it.
      await b.scrollIntoViewIfNeeded()
      const boxA = (await a.boundingBox())!
      const boxB = (await b.boundingBox())!
      // „b” by its right part, up onto the right part of „a” (the left part of a tile is a move to that hour – D367).
      const x = boxB.x + boxB.width * 0.85
      await page.mouse.move(x, boxB.y + 20)
      await page.mouse.down()
      await page.mouse.move(x, boxB.y - 40, { steps: 4 })
      await page.mouse.move(x, boxA.y + 30, { steps: 6 })
      await expect(page.getByTestId('parallel-hint')).toHaveText('Równolegle z Inne obowiązki')
      // „c” waits for the end of the group (16:30 – „b” is 90 min long), dashed while „b” is held.
      await expect(page.getByTestId('block-c')).toHaveAttribute('data-pushed', 'true')
      await expect(page.getByTestId('block-c')).toContainText('14:30')
      await page.mouse.up()
      // One edit of the day's file: „b” beside „a” at its start, „c” after the group.
      await expect.poll(file).toEqual({ a: [780, null], c: [870, null], b: [780, 'a'] })
      // Side by side on the axis (D476): two lanes.
      await expect(a).toHaveAttribute('data-lane', '0/2')
      await expect(b).toHaveAttribute('data-lane', '1/2')
      await expect(page.getByTestId('block-c')).toContainText('14:30')
      const line = page.getByTestId('bar-line-moved:push')
      const more = page.getByTestId('bar-main').getByTestId('bar-group-more')
      await expect(async () => {
        if (!(await line.count()) && (await more.count()) && (await more.getAttribute('aria-pressed')) !== 'true') await more.click()
        await expect(line).toContainText('Przesunięto 1 blok', { timeout: 1_000 })
      }).toPass({ timeout: 10_000 })
      await page.getByTestId('bar-act-moved-undo').click()
      await expect.poll(file).toEqual({ a: [780, null], c: [840, null], b: [960, null] })
      await expect(a).not.toHaveAttribute('data-lane', '0/2')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('bloki równoległe (D492): bez przesunięcia – dymek „Równolegle z …” z „Cofnij”; odciągnięcie bloku z grupy stawia je znowu po kolei', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-parallel-undo-'))
  seed(dataDir)
  const tomorrow = addDays(logicalToday(), 1)
  const own = (id: string, startMin: number) => ({ id, categoryId: 'inne', startMin, durationMin: 60, fixed: false, origin: 'user' })
  const dayFile = join(dataDir, 'days', tomorrow.slice(0, 4), `${tomorrow}.json`)
  mkdirSync(dirname(dayFile), { recursive: true })
  writeFileSync(dayFile, JSON.stringify({ schema: 1, date: tomorrow, dayType: 'zwykly', sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])), blocks: [own('a', 13 * 60), own('b', 16 * 60)] }))
  type Raw = { id: string; startMin: number; alongside?: string | null }
  const file = () => Object.fromEntries((JSON.parse(readFileSync(dayFile, 'utf8')) as { blocks: Raw[] }).blocks.map((b) => [b.id, [b.startMin, b.alongside ?? null]]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const a = page.getByTestId('block-a')
      const b = page.getByTestId('block-b')
      await expect(b).toHaveAttribute('data-movable', 'true')
      await b.scrollIntoViewIfNeeded()
      const drop = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(from.x, from.y - 30, { steps: 4 })
        await page.mouse.move(to.x, to.y, { steps: 6 })
        await page.mouse.up()
      }
      const boxA = (await a.boundingBox())!
      const boxB = (await b.boundingBox())!
      await drop({ x: boxB.x + boxB.width * 0.85, y: boxB.y + 20 }, { x: boxB.x + boxB.width * 0.85, y: boxA.y + 30 })
      await expect.poll(file).toEqual({ a: [780, null], b: [780, 'a'] })
      const toast = page.getByRole('status').filter({ hasText: 'Równolegle z Inne obowiązki' })
      await expect(toast).toBeVisible()
      await toast.getByTestId('toast-action').click()
      await expect.poll(file).toEqual({ a: [780, null], b: [960, null] })
      // Again, then „b” dragged away by its name (the left part) to 18:00: it leaves the group – one after another again.
      await drop({ x: boxB.x + boxB.width * 0.85, y: boxB.y + 20 }, { x: boxB.x + boxB.width * 0.85, y: boxA.y + 30 })
      await expect.poll(file).toEqual({ a: [780, null], b: [780, 'a'] })
      await expect(b).toHaveAttribute('data-lane', '1/2')
      const now = (await b.boundingBox())!
      await drop({ x: now.x + 10, y: now.y + 20 }, { x: now.x + 10, y: now.y + 20 + 5 * 60 * 1.1 })
      await expect.poll(file).toEqual({ a: [780, null], b: [1080, null] })
      await expect(b).not.toHaveAttribute('data-lane', '1/2')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('rozsuwanie w „Szablonach” (D367, D372): blok przeciągnięty na zajęty przesuwa kolejne w nowej wersji szablonu; „Cofnij” na stronie przywraca szablon', async () => {
  // The ordinary day's template with three blocks of its own in the evening (after any session):
  // the day it makes (from tomorrow) has nothing else between them, on any day of the week.
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-push-template-'))
  seed(dataDir)
  const tomorrow = addDays(logicalToday(), 1)
  const own = (id: string, startMin: number) => planBlock({ id, categoryId: 'inne', startMin, durationMin: 60, origin: 'template' })
  const ordinary = defaultTemplates().find((t) => t.id === 'zwykly')!
  const file = join(dataDir, paths.record('template', 'zwykly'))
  writeFileSync(file, JSON.stringify(templateJson({ ...ordinary, versions: [{ from: SETUP_FROM, blocks: [own('a', 18 * 60), own('b', 19 * 60), own('c', 20 * 60)], budgetMin: null, maxMin: null }] })))
  type Raw = { versions: Record<string, { blocks: Array<{ id: string; startMin: number }> }> }
  const versions = () => (JSON.parse(readFileSync(file, 'utf8')) as Raw).versions
  const startsFrom = (from: string) => Object.fromEntries((versions()[from]?.blocks ?? []).map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').first().click()
      const axis = page.getByTestId('template-timeline')
      const a = axis.getByTestId('block-a')
      const b = axis.getByTestId('block-b')
      await expect(a).toHaveAttribute('data-movable', 'true')
      await a.scrollIntoViewIfNeeded()
      const box = (await a.boundingBox())!
      // An hour down (1.1 px a minute): „a” onto „b” – while it is held, „b” and „c” stand an hour later, dashed.
      await page.mouse.move(box.x + 40, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 40, box.y + 50, { steps: 4 })
      await page.mouse.move(box.x + 40, box.y + 86, { steps: 4 })
      await expect(b).toHaveAttribute('data-pushed', 'true')
      await expect(b).toContainText('20:00')
      await expect(axis.getByTestId('block-c')).toHaveAttribute('data-pushed', 'true')
      await page.mouse.up()
      // One edit of the template: its new version from tomorrow with the dragged block and both pushed ones; the version
      // in force before stays as it was.
      await expect.poll(() => startsFrom(tomorrow)).toEqual({ a: 19 * 60, b: 20 * 60, c: 21 * 60 })
      expect(startsFrom(SETUP_FROM)).toEqual({ a: 18 * 60, b: 19 * 60, c: 20 * 60 })
      const line = page.getByTestId('template-pushed')
      await expect(line).toContainText('Przesunięto 2 bloki')
      await page.getByTestId('template-pushed-undo').click()
      // The template as before the push: no version from tomorrow.
      await expect.poll(() => Object.keys(versions())).toEqual([SETUP_FROM])
      await expect(line).toHaveCount(0)
      await expect(b).toContainText('19:00')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('domykanie luk (D368): usunięty blok zostawia lukę – w pasku okna „Luka 1 h · Przesuń resztę wcześniej · Zostaw”; „Przesuń” zapisuje nowe godziny, „Cofnij” je przywraca', async () => {
  // Today, three blocks of yours an hour each from an hour from now; a day without the night's quiet (`seedAwake`) – at any
  // hour but the last 4 h 20 min of the logical day (the blocks would reach past 04:00).
  const nowMin = logicalMinuteOf(logicalToday(), Date.now())
  test.skip(nowMin > 28 * 60 - 260, 'trzy bloki od godziny od teraz nie mieszczą się już w dobie logicznej (koniec o 04:00)')
  const base = Math.ceil((nowMin + 60) / 5) * 5
  const own = (id: string, startMin: number) => ({ id, categoryId: 'inne', startMin, durationMin: 60, fixed: false, origin: 'user' })
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-gap-'))
  const { dayFile } = seedAwake(dataDir, [own('a', base), own('b', base + 60), own('c', base + 120)])
  const starts = () => Object.fromEntries((JSON.parse(readFileSync(dayFile, 'utf8')) as { blocks: Array<{ id: string; startMin: number }> }).blocks.map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const b = page.getByTestId('block-b')
      await b.scrollIntoViewIfNeeded()
      await b.click()
      await page.getByTestId('block-remove').click()
      await expect.poll(starts).toEqual({ a: base, c: base + 120 })
      // The bar's lines as the view has them (also those in „⋯”): the day's own lines – the morning's questions, the
      // computers' quiet ones – may stand before the gap's; two fit in the bar, the rest wait in „⋯” (any hour of the day).
      const lines = () => page.evaluate(async () => (await window.rd.widget()).lines.map((l) => l.id))
      const bar = page.getByTestId('bar-main')
      const reveal = async (prefix: string) => {
        await expect.poll(async () => (await lines()).some((id) => id.startsWith(prefix)), { timeout: 30_000 }).toBe(true)
        const line = bar.locator(`[data-testid^="bar-line-${prefix}"]`)
        const more = bar.getByTestId('bar-group-more')
        if (!(await line.count()) && (await more.getAttribute('aria-pressed')) !== 'true') await more.click()
        await expect(line).toHaveCount(1)
        return line
      }
      // One quiet line: „a” ends where „b” stood – 1 h empty before „c”, 1 h freed.
      const line = await reveal('gap:')
      await expect(line).toContainText('Luka 1 h')
      await expect(line).toContainText('Zostaw')
      await line.getByTestId('bar-act-gap-close').click()
      await expect.poll(starts).toEqual({ a: base, c: base + 60 })
      await expect.poll(async () => (await lines()).filter((id) => id.startsWith('gap:'))).toEqual([])
      const moved = await reveal('moved:push')
      await expect(moved).toContainText('Przesunięto 1 blok')
      await moved.getByTestId('bar-act-moved-undo').click()
      await expect.poll(starts).toEqual({ a: base, c: base + 120 })
      await expect.poll(async () => (await lines()).filter((id) => id.startsWith('moved:'))).toEqual([])
      // The gap is back, its question is not (answered once).
      expect((await lines()).filter((id) => id.startsWith('gap:'))).toEqual([])
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
      await page.getByTestId('goals-skip').click()
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
      // The engine's view; „Prośba ▸” stands at any hour, also in the night's quiet (D346).
      await expect.poll(() => page.evaluate(async () => (await window.rd.widget()).day), { timeout: 30_000 }).not.toBeNull()
      await expect(page.getByTestId('bar-group-request')).toHaveCount(1)
      await page.getByTestId('bar-group-request').click()
      await expect(page.getByTestId('bar-request-group')).toContainText('Zrobione teraz:')
      await page.getByTestId('bar-request-now-mama').click()
      await expect(page.getByTestId('bar-request')).toContainText('Zrobione teraz · Mama · 0:0')
      await page.getByTestId('bar-request-end').click()
      await expect(page.getByTestId('bar-request')).toHaveCount(0)
      // A quiet mode (a session waits for „Zacznij” – the session mode): „Pilne” starts
      // with 15 min without asking (D311).
      const quiet = await page.evaluate(async () => (await window.rd.widget()).quiet)
      await page.getByTestId('bar-group-request').click()
      await page.getByTestId('bar-request-urgent-mama').click()
      if (!quiet) {
        await expect(page.getByTestId('bar-request-estimate-value')).toHaveText('15 min')
        await page.getByTestId('bar-request-estimate-30').click()
        await page.getByTestId('bar-request-start').click()
      }
      await expect(page.getByTestId('bar-request')).toContainText('Pilne · Mama · 0:0')
      await expect(page.getByTestId('bar-request')).toContainText(quiet ? 'z 15 min' : 'z 30 min')
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
      const { night, quiet } = await page.evaluate(async () => await window.rd.widget())
      if (night) await page.getByTestId('routine-card-all').click()
      else {
        // In a quiet mode (a session waits for „Zacznij”) the routine's line waits in „⋯”.
        if (quiet) await page.getByTestId('bar-main').getByTestId('bar-group-more').click()
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
