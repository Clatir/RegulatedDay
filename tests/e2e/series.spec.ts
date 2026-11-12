/**
 * Serie powtarzalne (OPS1, D381, D382, D401): the field „Powtarzaj” of a block's panel makes a series (every week, on the
 * weekday of the block) – the block is its first occurrence, with ↻ by its name on the axis of „Dziś” and in „Tydzień”, a week
 * on; a change of one occurrence in its panel asks „Tylko to · To i następne · Cała seria” and „Tylko to” changes that day
 * only; the removal asks too; the list in „Szablony” says the rule in words and ends the series. Independent of the day of
 * the week and of the hour it runs at (T528): the series' special days are set to „odbywa się”, the dates are counted from the
 * logical day now, a day a week on is reached from the week view.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { newSeries } from '../../src/shared/engine/series'
import { seriesJson } from '../../src/shared/model/series'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { addDays } from '../../src/shared/time/zone'
import { launch, logicalToday, withMainLog } from './app'

/** A folder like the wizard's, today with a block of its own at 10:00 (an hour); `series` – a daily series that starts today and asks on special days (D382), today a day of regeneration. */
function seed(dir: string, o: { series?: boolean } = {}): void {
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
  writeFileSync(join(dir, 'days', today.slice(0, 4), `${today}.json`), JSON.stringify({ schema: 1, date: today, ...(o.series ? { dayType: 'regeneracyjny' } : {}), blocks: [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false }] }))
  if (o.series) {
    const block = { categoryId: 'nauka', variantId: null, startMin: 15 * 60, durationMin: 30, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null }
    mkdirSync(join(dir, 'series'), { recursive: true })
    writeFileSync(join(dir, 'series', 'sr1.json'), JSON.stringify(seriesJson(newSeries('sr1', block as never, today, { kind: 'daily' }, 'ask', { until: null, count: null }))))
  }
}

test('Powtarzaj (D381): co tydzień z bloku dnia – wystąpienie z ↻ w „Tygodniu” za 7 dni; „Tylko to” zmienia jedno; lista w „Szablonach” mówi regułę słowami', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-series-'))
  seed(dataDir)
  const today = logicalToday()
  const inWeek = addDays(today, 7)
  const inTwoWeeks = addDays(today, 14)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  /** The week of today (the page may still show another one). */
  const thisWeek = async () => {
    if (await page.getByTestId('week-today').isEnabled()) await page.getByTestId('week-today').click()
  }
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // The block of today has the field; it is not a series yet.
      await page.getByTestId('block-w1').click()
      await expect(page.getByTestId('block-series')).toBeVisible()
      await expect(page.getByTestId('series-mark')).toHaveCount(0)
      await page.getByTestId('series-rule').selectOption('weekly')
      // „Co ile tygodni” 1 and the weekday of the block are the start; „odbywa się” makes the run independent of the day's type.
      await expect(page.getByTestId('series-every')).toHaveValue('1')
      await page.getByTestId('series-special').getByRole('radio', { name: 'odbywa się' }).click()
      await page.getByTestId('series-create').click()
      // The block is the first occurrence: the panel follows it, says the rule in words, the axis marks it.
      await expect(page.getByTestId('series-text')).toContainText('co tydzień w', { timeout: 30_000 })
      await expect(page.locator('button[data-testid^="block-"]').filter({ has: page.getByTestId('series-mark') })).toHaveCount(1)
      // A week on: the occurrence in „Tydzień” with ↻.
      await page.getByTestId('nav-week').click()
      await thisWeek()
      await page.getByTestId('week-next').click()
      const inWeekBlock = page.locator(`[data-testid^="week-block-${inWeek}-"]`).filter({ has: page.getByTestId('series-mark') })
      await expect(inWeekBlock).toHaveCount(1, { timeout: 30_000 })
      await expect(inWeekBlock).toHaveAttribute('title', /10:00–11:00/)
      // Its day: the occurrence's panel; a change asks the scope, „Tylko to” changes this day only.
      await inWeekBlock.click()
      await expect(page.getByTestId('day-title')).toBeVisible()
      await page.locator('button[data-testid^="block-"]').filter({ has: page.getByTestId('series-mark') }).click()
      await expect(page.getByTestId('series-text')).toContainText('co tydzień w')
      await page.getByTestId('block-duration').fill('30')
      await page.getByTestId('block-duration').press('Enter')
      await expect(page.getByTestId('series-scope')).toBeVisible()
      await page.getByTestId('series-scope-only').click()
      await expect(page.getByTestId('series-scope')).toHaveCount(0)
      // The removal asks as well; closing it changes nothing.
      await page.getByTestId('block-remove').click()
      await expect(page.getByTestId('series-scope')).toBeVisible()
      await page.getByTestId('series-scope-cancel').click()
      await expect(page.getByTestId('series-scope')).toHaveCount(0)
      // In „Tydzień”: this day is half an hour, the day a week later (the rest of the series) still an hour.
      await page.getByTestId('nav-week').click()
      await thisWeek()
      await page.getByTestId('week-next').click()
      await expect(page.locator(`[data-testid^="week-block-${inWeek}-"]`).filter({ has: page.getByTestId('series-mark') })).toHaveAttribute('title', /10:00–10:30/, { timeout: 30_000 })
      await page.getByTestId('week-next').click()
      await expect(page.locator(`[data-testid^="week-block-${inTwoWeeks}-"]`).filter({ has: page.getByTestId('series-mark') })).toHaveAttribute('title', /10:00–11:00/, { timeout: 30_000 })
      // The list in „Szablony”: the series with its rule in words.
      await page.getByTestId('nav-templates').click()
      await expect(page.getByTestId('series-list')).toBeVisible()
      await expect(page.getByTestId('series-item')).toHaveCount(1)
      await expect(page.getByTestId('series-item')).toContainText('co tydzień w')
      await page.getByTestId('series-item').click()
      await expect(page.getByTestId('series-rule-text')).toContainText('co tydzień w')
      // „Zakończ serię”: it stays in the list, marked as ended.
      await page.getByTestId('series-end-now').click()
      await expect(page.getByTestId('series-item')).toContainText('zakończona', { timeout: 30_000 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('seria w dniu regeneracyjnym (D382): plan poranny pyta „z serii – zostaw · odwołaj”; Ctrl K znajduje serię i otwiera ją na liście', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-series-ask-'))
  seed(dataDir, { series: true })
  const today = logicalToday()
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // Monday's „Strona B” and the month's goals come first in the morning plan: closed, the plan's cards show.
      if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) await page.getByTestId('side-b-done').click()
      await page.getByTestId('goals-skip').click()
      await page.getByTestId('checkin-skip').click()
      // The occurrence stands on today's axis with ↻ and the morning plan asks about it.
      await expect(page.locator('button[data-testid^="block-"]').filter({ has: page.getByTestId('series-mark') })).toHaveCount(1, { timeout: 30_000 })
      await expect(page.getByTestId('ask-series')).toContainText('z serii', { timeout: 30_000 })
      // „Odwołaj”: the occurrence leaves today's plan (the series stays).
      await page.getByTestId('ask-series-cancel').click()
      await expect(page.getByTestId('ask-series')).toHaveCount(0, { timeout: 30_000 })
      await expect(page.locator('button[data-testid^="block-"]').filter({ has: page.getByTestId('series-mark') })).toHaveCount(0)
      // Ctrl K: the series as one record; Enter opens it on the list in „Szablony”, with its rule in words.
      await page.keyboard.press('Control+k')
      await page.getByTestId('search-input').fill('nauka')
      await expect(page.locator('[data-testid="search-hit"][data-kind="series"]')).toHaveCount(1)
      await page.locator('[data-testid="search-hit"][data-kind="series"]').click()
      await expect(page.getByTestId('series-rule-text')).toContainText('codziennie')
      await expect(page.getByTestId('series-item')).toHaveCount(1)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
