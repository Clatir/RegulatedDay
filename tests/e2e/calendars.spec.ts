/**
 * Kalendarze w widokach okna (SNT2, D419, D425): z jednym kalendarzem żetonów nie ma; po dodaniu kalendarza „Praca” w ustawieniach
 * i przypisaniu do niego kategorii (tu „Inne obowiązki”) nad „Dziś” i „Tygodniem” są żetony; odznaczony „Praca” chowa blok tej
 * kategorii z osi „Dziś” i z kolumny „Tygodnia”, w nagłówku jest „ukryte: 1”, a liczby dnia (podsumowanie) zostają; po
 * zamknięciu i ponownym otwarciu okna kalendarz nadal jest odznaczony (zapamiętane na komputerze); zaznaczony – blok wraca.
 * Niezależne od dnia tygodnia: blok jest własny (bez typu dnia), wszystko liczone na `logicalToday()`.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { launch, logicalToday, withMainLog } from './app'

/** A folder like the wizard's, today with a block of its own at 10:00 in the category „Inne obowiązki”. */
function seed(dir: string): void {
  const today = logicalToday()
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
  mkdirSync(join(dir, 'days', today.slice(0, 4)), { recursive: true })
  writeFileSync(join(dir, 'days', today.slice(0, 4), `${today}.json`), JSON.stringify({ schema: 1, date: today, blocks: [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, note: 'zebranie kwartalne alfa' }] }))
}

test('kalendarze: żetony nad „Dziś” i „Tygodniem”, odznaczony kalendarz chowa blok, po restarcie okna nadal ukryty, zaznaczony – wraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-calendars-'))
  seed(dataDir)
  const today = logicalToday()
  const first = await launch({ env: { RD_DATA_DIR: dataDir } })
  const userData = first.userData
  try {
    await withMainLog(userData, async () => {
      const { page } = first
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('block-w1')).toBeVisible({ timeout: 30_000 })
      // One calendar („Moje”): no chips.
      await expect(page.getByTestId('calendar-chips')).toHaveCount(0)
      // A calendar „Praca” in the settings and the category „Inne obowiązki” moved into it.
      await page.getByTestId('nav-settings').click()
      await page.getByTestId('calendar-new').fill('Praca')
      await page.getByTestId('calendar-add').click()
      await expect(page.getByTestId('calendar-row')).toHaveCount(2)
      const row = page.locator('[data-testid="category-row"][data-category="inne"]')
      await row.getByTestId('category-more').click()
      await row.getByTestId('category-calendar').selectOption({ label: 'Praca' })
      await expect(row.getByTestId('category-calendar').locator('option:checked')).toHaveText('Praca')
      // „Dziś”: the chips of both calendars, the block there, nothing hidden.
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('calendar-chip')).toHaveCount(2)
      await expect(page.getByTestId('block-w1')).toBeVisible()
      await expect(page.getByTestId('calendar-hidden-count')).toHaveCount(0)
      // Unchecked: the block leaves the axis, „ukryte: 1”, the day's numbers stay.
      await page.getByTestId('calendar-chip').filter({ hasText: 'Praca' }).click()
      await expect(page.getByTestId('block-w1')).toHaveCount(0)
      await expect(page.getByTestId('calendar-hidden-count')).toHaveText('ukryte: 1')
      await expect(page.getByTestId('day-summary')).toContainText('budżet pracy')
      // Ctrl K (D427): the result of a hidden calendar shows in spite of it – the panel, the tile on the axis with where it
      // comes from, not counted as hidden; with the panel closed it is hidden again.
      await page.keyboard.press('Control+k')
      await page.getByTestId('search-input').fill('kwartalne')
      const hit = page.locator('[data-testid="search-hit"][data-kind="block"]')
      await expect(hit).toHaveCount(1, { timeout: 30_000 })
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-w1')).toHaveAttribute('data-hidden-calendar', 'Praca')
      await expect(page.getByTestId('calendar-hidden-count')).toHaveCount(0)
      await page.getByTestId('block-editor-close').click()
      await expect(page.getByTestId('block-w1')).toHaveCount(0)
      await expect(page.getByTestId('calendar-hidden-count')).toHaveText('ukryte: 1')
      // „Tydzień”: the same chips (one choice for all the views of the window), the block gone from today's column.
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId(`week-col-${today}`)).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('calendar-chip').filter({ hasText: 'Praca' })).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByTestId(`week-block-${today}-w1`)).toHaveCount(0)
      await expect(page.getByTestId('calendar-hidden-count')).toHaveText('ukryte: 1')
    })
  } finally {
    await first.app.close()
  }
  // The window opened again: still unchecked – a habit of this computer.
  const second = await launch({ userData, env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      const { page } = second
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('calendar-chip').filter({ hasText: 'Praca' })).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 })
      await expect(page.getByTestId('block-w1')).toHaveCount(0)
      await expect(page.getByTestId('calendar-hidden-count')).toHaveText('ukryte: 1')
      // Checked again: the block is back in „Dziś” and in „Tydzień”.
      await page.getByTestId('calendar-chip').filter({ hasText: 'Praca' }).click()
      await expect(page.getByTestId('block-w1')).toBeVisible()
      await expect(page.getByTestId('calendar-hidden-count')).toHaveCount(0)
      await expect(page.getByTestId('day-summary')).toContainText('budżet pracy')
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId(`week-block-${today}-w1`)).toBeVisible({ timeout: 30_000 })
    })
  } finally {
    await second.app.close()
  }
})
