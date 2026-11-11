/**
 * Wyszukiwarka Ctrl K (SNT6, D387): the palette opens over any screen, two words from a note of a day gone by find that
 * block, Enter opens „Dziś” on that day with the block's panel and its note; Esc closes; a phrase with nothing explains
 * itself; the command „Jutro” only moves to tomorrow's plan. Independent of the day of the week it runs on (T528).
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { plDate } from '../../src/shared/format'
import { addDays } from '../../src/shared/time/zone'
import { launch, logicalToday, withMainLog } from './app'

/** A folder like the wizard's, with a block of its own and a note on a day a month back (a day with no log). */
function seed(dir: string, past: string): void {
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
  mkdirSync(join(dir, 'days', past.slice(0, 4)), { recursive: true })
  writeFileSync(
    join(dir, 'days', past.slice(0, 4), `${past}.json`),
    JSON.stringify({ schema: 1, date: past, blocks: [{ id: 'n1', categoryId: 'analiza', startMin: 10 * 60, durationMin: 60, fixed: false, note: 'Rozmowa z Żółwiem: numer telefonu Kowalski 600 100 200' }] })
  )
}

test('Ctrl K: dwa słowa z notatki minionego dnia, Enter otwiera ten dzień z panelem bloku; Esc zamyka; pusty wynik tłumaczy; „Jutro” tylko nawigacja', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-search-'))
  const today = logicalToday()
  const past = addDays(today, -30)
  seed(dataDir, past)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // Over another screen: the shortcut works anywhere in the window.
      await page.getByTestId('nav-calendar').click()
      await page.keyboard.press('Control+k')
      await expect(page.getByTestId('search')).toBeVisible()
      await expect(page.getByTestId('search-input')).toBeFocused()
      // Nothing typed: the commands.
      await expect(page.getByTestId('search-hit').first()).toContainText('Nowy blok')
      // Esc closes it, the screen stays.
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('search')).toHaveCount(0)
      await expect(page.getByTestId('page-calendar')).toBeVisible()

      // Two words of a note, without diacritics and in another order than in the note.
      await page.keyboard.press('Control+k')
      await page.getByTestId('search-input').fill('kowalski zolw')
      const hit = page.locator('[data-testid="search-hit"][data-kind="block"]')
      await expect(hit).toHaveCount(1, { timeout: 30_000 })
      await expect(hit).toContainText(plDate(past))
      await expect(hit.locator('mark').first()).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('search')).toHaveCount(0)
      await expect(page.getByTestId('page-today')).toBeVisible()
      await expect(page.getByTestId('day-title')).toContainText(plDate(past))
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-note')).toHaveValue(/Kowalski 600 100 200/)

      // A phrase nobody has: the empty state says how the search looks.
      await page.keyboard.press('Control+k')
      await page.getByTestId('search-input').fill('kowlaski')
      await expect(page.getByTestId('search-empty')).toContainText('bez literówek')
      await page.keyboard.press('Escape')

      // The command „Jutro” goes to tomorrow's plan, nothing else.
      await page.keyboard.press('Control+k')
      await page.getByTestId('search-input').fill('jutro')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('day-title')).toContainText(plDate(addDays(today, 1)))
      await expect(page.getByTestId('day-title')).not.toContainText('Dziś')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
