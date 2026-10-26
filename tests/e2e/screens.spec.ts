/**
 * The screens of E3 on a folder set up like the wizard's: the morning plan and the approval of the boundary, a block
 * added after it with the exchange („Dodaj bez wymiany”, the second click for an overrun), the calendar (a „zjazd”
 * marked on several dates), requests, routines, templates, the history with a restore, the settings (a value out of
 * its range refused with its message). Independent of the hour it runs at: today's work block is at 03:00 of the
 * night after (the end of the logical day), so the plan always has a boundary to approve.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { launch, withMainLog } from './app'

const shots = process.env.RD_E2E_SHOTS
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

/** The logical day now (04:00–04:00 Polish time). */
function logicalToday(): string {
  const now = new Date(Date.now() - 4 * 3600_000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function seed(dir: string): void {
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
  const day = { schema: 1, date: today, dayType: 'zwykly', blocks: [{ id: 'late', categoryId: 'inne', startMin: 27 * 60, durationMin: 30, fixed: false }] }
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
      const day = JSON.parse(readFileSync(join(dataDir, 'days', logicalToday().slice(0, 4), `${logicalToday()}.json`), 'utf8')) as { blocks: unknown[] }
      expect(day.blocks).toHaveLength(2)
      // The day's wake outside 04:00–12:00: refused with its message (never saved to be dropped by the day's schema).
      const wake = page.getByTestId('day-wake')
      const wakeBefore = await wake.inputValue()
      await wake.fill('13:00')
      await wake.press('Enter')
      await expect(wake).toHaveAttribute('data-error', /Dozwolone/)
      await expect(wake).toHaveValue(wakeBefore)

      // Kalendarz: two dates marked as a remote „zjazd”.
      await page.getByTestId('nav-calendar').click()
      await expect(page.getByTestId('calendar')).toBeVisible()
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
      await shot(page, 'e3-09-settings')
      const rd = JSON.parse(readFileSync(join(dataDir, 'rd.json'), 'utf8')) as { settings: Array<{ patch: { dayTypes?: { zwykly?: { budgetMin?: number } } } }> }
      expect(rd.settings.at(-1)!.patch.dayTypes?.zwykly?.budgetMin).toBe(420)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
