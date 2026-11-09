/**
 * „Statystyki” (D358): the page opens from the menu (and by Ctrl+4); in a clean folder it says there is too little data;
 * the period switches (4 tygodnie, 3 miesiące, od początku); with three frozen days (their grades and logs seeded for
 * the days before today – T528: the clock is the real one) it draws its four sections with a chart and a table each, and
 * counts a frozen day whose log is missing as unreadable.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { placeLogical } from '../../src/shared/time/day'
import { addDays } from '../../src/shared/time/zone'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { launch, logicalToday, withMainLog } from './app'

/** A folder as the wizard sets it up (the person „Mama”), with frozen days: grades, and logs for all but `missing` of them. */
function seed(dir: string, days: string[], missing: string[] = []): void {
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [{ id: 'mama', name: 'Mama', archived: false }], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
  const grades: string[] = []
  for (const day of days) {
    const lines: string[] = []
    let n = 0
    const ev = (k: string, dom: string, at: number, extra: Record<string, unknown> = {}) => lines.push(JSON.stringify({ id: `seed-${day}-${n}`, c: 'seed', n: n++, t: at, l: at, v: 1, day, dom, k, at, ...extra }))
    ev('presence.first', 'meta', placeLogical(day, 7 * 60))
    ev('energy.checkin', 'energy', placeLogical(day, 8 * 60), { answers: { head: [1, 1], emotions: [1, 1], senses: [1, 1] } })
    ev('request.start', 'timer', placeLogical(day, 12 * 60), { request: `r-${day}`, mode: 'now', person: 'mama', estimateMin: null, hardEndAt: null })
    ev('request.end', 'timer', placeLogical(day, 12 * 60 + 20), { request: `r-${day}` })
    ev('cost.felt', 'energy', placeLogical(day, 21 * 60), { category: 'analiza', feel: 'heavier' })
    grades.push(JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v: 1, how: 'ready', know: { seed: n - 1 }, missing: [], grade: { boundary: 'kept', free: false, closed: 'ritual', dayType: 'zwykly' } }))
    if (missing.includes(day)) continue
    mkdirSync(join(dir, 'log', day.slice(0, 4), day), { recursive: true })
    writeFileSync(join(dir, 'log', day.slice(0, 4), day, 'seed.jsonl'), lines.join('\n') + '\n')
  }
  mkdirSync(join(dir, 'grades', days[0]!.slice(0, 4)), { recursive: true })
  writeFileSync(join(dir, 'grades', days[0]!.slice(0, 4), 'seed.jsonl'), grades.join('\n') + '\n')
}

test('Statystyki: strona z menu i Ctrl+4, w czystym folderze „za mało danych”, przełączanie okresu', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      // In the menu before the history (D306: the settings right under it); the digits follow the menu's order (D362).
      await expect(page.getByTestId('nav-stats')).toHaveText(/Statystyki/)
      await expect(page.getByTestId('nav-stats')).toHaveAttribute('title', 'Statystyki (Ctrl 4)')
      await expect(page.getByTestId('nav-history')).toHaveAttribute('title', 'Historia (Ctrl 9)')
      await page.getByTestId('nav-stats').click()
      await expect(page.getByTestId('page-stats')).toBeVisible()
      await expect(page.getByTestId('stats-too-little')).toContainText('Za mało danych')
      await expect(page.getByTestId('stats-days')).toContainText('dni zamrożone: 0')
      await expect(page.getByTestId('stats-energy')).toHaveCount(0)
      const period = page.getByTestId('stats-period')
      await expect(period.getByRole('radio', { name: '4 tygodnie' })).toHaveAttribute('aria-checked', 'true')
      for (const name of ['3 miesiące', 'Od początku', '4 tygodnie']) {
        await period.getByRole('radio', { name }).click()
        await expect(period.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true')
        await expect(page.getByTestId('stats-too-little')).toBeVisible()
      }
      await page.getByTestId('nav-history').click()
      await expect(page.getByTestId('page-history')).toBeVisible()
      await page.keyboard.press('Control+Digit4')
      await expect(page.getByTestId('page-stats')).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Statystyki: trzy dni zamrożone – cztery sekcje z wykresem i tabelą, dzień bez loga jako nieczytelny', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-stats-'))
  const today = logicalToday()
  const days = [addDays(today, -4), addDays(today, -3), addDays(today, -2), addDays(today, -1)]
  seed(dataDir, days, [days[3]!])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('nav-stats')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-stats').click()
      await expect(page.getByTestId('stats-days')).toContainText('dni zamrożone: 3', { timeout: 30_000 })
      await expect(page.getByTestId('stats-days')).toContainText('nieczytelne: 1')
      await expect(page.getByTestId('stats-too-little')).toHaveCount(0)
      // Energy: three check-ins at 08:00 (the answers „trochę” – 65) in one bucket; the felt cost „ciężej” of a category.
      await expect(page.getByTestId('stats-hour-chart')).toBeVisible()
      await expect(page.getByTestId('stats-hour-chart-bar')).toHaveCount(1)
      await expect(page.getByTestId('stats-hour-table')).toContainText('08–10')
      await expect(page.getByTestId('stats-hour-table')).toContainText('3 check-iny')
      await expect(page.getByTestId('stats-hour-table')).toContainText('65')
      await expect(page.getByTestId('stats-weekday-table').locator('tbody tr')).toHaveCount(7)
      await expect(page.getByTestId('stats-felt-table')).toContainText('100%')
      // Accuracy: no block judged in these days.
      await expect(page.getByTestId('stats-accuracy-empty')).toBeVisible()
      // Requests: 3 × 20 min of Mama.
      await expect(page.getByTestId('stats-requests-table')).toContainText('Mama')
      await expect(page.getByTestId('stats-requests-table')).toContainText('1 h')
      await expect(page.getByTestId('stats-requests-chart-bar')).toHaveCount(1)
      // Boundaries: three kept days, in one or two weeks.
      await expect(page.getByTestId('stats-boundaries-table').locator('tbody tr').last()).toContainText('Razem')
      await expect(page.getByTestId('stats-boundaries-chart-bar').first()).toBeVisible()
      // Nothing wider than the window.
      const over = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="main-window"], main')].some((el) => el.scrollWidth > el.clientWidth + 1))
      expect(over).toBe(false)
      // The period switched and back: the same numbers (counted again or from memory).
      await page.getByTestId('stats-period').getByRole('radio', { name: 'Od początku' }).click()
      await expect(page.getByTestId('stats-days')).toContainText('dni zamrożone: 3')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
