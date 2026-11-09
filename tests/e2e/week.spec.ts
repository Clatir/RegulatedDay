/**
 * „Tydzień” i cele miesięczne (E10, D356, D360): the page opens from the menu with seven columns, the arrows move the week,
 * a goal set at the top is saved and its progress „x z y” shows at once, a value out of its range is refused under the
 * field, a click on a day opens its plan; the step „Cele na <miesiąc>” of the morning plan takes over the month before's
 * numbers („Zapisz”) or hides itself („Pomiń”). Independent of the day of the week it runs on (T528): nothing assumes a
 * type of day, and Monday's „Strona B” is closed when it comes first.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { previousMonth } from '../../src/shared/model/goals'
import { launch, logicalToday, withMainLog } from './app'

const shots = process.env.RD_E2E_SHOTS
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

type GoalsFile = Record<string, { study?: number | null; regen?: number | null; trading?: number | null; skipped?: boolean }>

/** A folder like the wizard's, today with a block of its own at 10:00, optionally with the month before's goals in rd.json. */
function seed(dir: string, o: { previousGoals?: GoalsFile[string] } = {}): void {
  const today = logicalToday()
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    const value = r.rel === 'rd.json' && o.previousGoals ? { ...(r.value as object), goals: { [previousMonth(today.slice(0, 7))]: o.previousGoals } } : r.value
    writeFileSync(join(dir, r.rel), JSON.stringify(value, null, 2))
  }
  mkdirSync(join(dir, 'days', today.slice(0, 4)), { recursive: true })
  writeFileSync(join(dir, 'days', today.slice(0, 4), `${today}.json`), JSON.stringify({ schema: 1, date: today, blocks: [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false }] }))
}

const goalsOf = (dir: string): GoalsFile => (JSON.parse(readFileSync(join(dir, 'rd.json'), 'utf8')) as { goals?: GoalsFile }).goals ?? {}

/** Monday's „Strona B” comes first in the morning plan: closed, so the step after it shows. */
async function pastSideB(page: Page, today: string): Promise<void> {
  await expect(page.getByTestId('morning-plan')).toBeVisible({ timeout: 30_000 })
  if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) await page.getByTestId('side-b-done').click()
}

test('Tydzień (D356): siedem kolumn, strzałki tygodni, cel miesięczny z postępem „x z y”, zakres pola, kliknięcie dnia otwiera plan', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-'))
  seed(dataDir)
  const today = logicalToday()
  const month = today.slice(0, 7)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // The menu: „Tydzień” with its shortcut (right after the calendar, D361).
      await expect(page.getByTestId('nav-week')).toHaveAttribute('title', 'Tydzień (Ctrl 3)')
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId('week')).toBeVisible()
      // Seven columns, today's among them marked; today's own block on the common axis.
      const days = page.locator('[data-testid^="week-day-"]')
      await expect(days).toHaveCount(7)
      await expect(page.locator('[data-testid^="week-day-"][data-when="today"]')).toHaveCount(1)
      await expect(page.getByTestId(`week-day-${today}`)).toHaveAttribute('aria-current', 'date')
      await expect(page.getByTestId(`week-block-${today}-w1`)).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId(`week-regen-${today}`)).toContainText('min')
      await shot(page, 'e10-01-week')
      // The arrows: a week on, the day-of-today gone from the columns, „Ten tydzień” back.
      const week = (await page.getByTestId('week-title').getAttribute('data-week'))!
      await page.getByTestId('week-next').click()
      await expect(page.getByTestId('week-title')).not.toHaveAttribute('data-week', week)
      await expect(page.locator('[data-testid^="week-day-"][data-when="today"]')).toHaveCount(0)
      await expect(days).toHaveCount(7)
      await expect(page.getByTestId('week-today')).toBeEnabled()
      await page.getByTestId('week-prev').click()
      await expect(page.getByTestId('week-title')).toHaveAttribute('data-week', week)
      await page.getByTestId('week-next').click()
      await page.getByTestId('week-today').click()
      await expect(page.getByTestId('week-title')).toHaveAttribute('data-week', week)
      // No goals yet: the field's range is refused under it; a number is saved and its progress shows.
      await expect(page.getByTestId('goals-none')).toBeVisible()
      await page.getByTestId('goals-edit').click()
      await page.getByTestId('goal-set-study').fill('999')
      await page.getByTestId('goal-set-study').press('Enter')
      await expect(page.getByTestId('goal-set-study-error')).toContainText('od 1 do 300')
      await page.getByTestId('goal-set-study').fill('40')
      await page.getByTestId('goal-set-study').press('Enter')
      await expect.poll(() => goalsOf(dataDir)[month]?.study, { timeout: 15_000 }).toBe(40)
      await page.getByTestId('goals-edit').click()
      await shot(page, 'e10-02-goals')
      await expect(page.getByTestId('goal-study-text')).toHaveText('0 z 40 h')
      await expect(page.getByTestId('goal-regen-text')).toHaveText('bez celu')
      // „Wyczyść” takes the goal away (no goal – never a zero).
      await page.getByTestId('goals-edit').click()
      await page.getByTestId('goal-set-study-clear').click()
      await expect.poll(() => goalsOf(dataDir)[month]?.study ?? null, { timeout: 15_000 }).toBeNull()
      await page.getByTestId('goals-edit').click()
      await expect(page.getByTestId('goals-none')).toBeVisible()
      // A click on a day opens its plan (as in the calendar, D295).
      const other = page.locator('[data-testid^="week-day-"]:not([data-when="today"])').first()
      await other.click()
      await expect(page.getByTestId('page-today')).toBeVisible()
      await expect(page.getByTestId('day-today')).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('krok „Cele na <miesiąc>” (D360): liczby z poprzedniego miesiąca, „Zapisz” je zachowuje; krok nie wraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-goals-save-'))
  seed(dataDir, { previousGoals: { study: 30, regen: 10, trading: 5 } })
  const today = logicalToday()
  const month = today.slice(0, 7)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await pastSideB(page, today)
      await expect(page.getByTestId('goals-step')).toBeVisible()
      await expect(page.getByTestId('goals-step-previous')).toBeVisible({ timeout: 15_000 })
      await shot(page, 'e10-03-step')
      await expect(page.getByTestId('goals-step-study')).toHaveValue('30')
      await expect(page.getByTestId('goals-step-regen')).toHaveValue('10')
      await page.getByTestId('goals-step-regen').fill('12')
      await page.getByTestId('goals-step-regen').press('Enter')
      await page.getByTestId('goals-step-save').click()
      await expect.poll(() => goalsOf(dataDir)[month], { timeout: 15_000 }).toMatchObject({ study: 30, regen: 12, trading: 5 })
      // Next the questions about symptoms; the step is gone.
      await expect(page.getByTestId('checkin-skip')).toBeVisible()
      await expect(page.getByTestId('goals-step')).toHaveCount(0)
      // The progress waits on „Tydzień”.
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId('goal-study-text')).toHaveText('0 z 30 h')
      await expect(page.getByTestId('goal-regen-text')).toHaveText(/ z 12 dni$/)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('krok „Cele na <miesiąc>” (D360): „Pomiń” chowa go na cały miesiąc, cele zostają do ustawienia w „Tydzień”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-goals-skip-'))
  seed(dataDir)
  const today = logicalToday()
  const month = today.slice(0, 7)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await pastSideB(page, today)
      await expect(page.getByTestId('goals-step')).toContainText('Cele na')
      await page.getByTestId('goals-skip').click()
      await expect(page.getByTestId('goals-step')).toHaveCount(0)
      await expect(page.getByTestId('checkin-skip')).toBeVisible()
      await expect.poll(() => goalsOf(dataDir)[month]?.skipped, { timeout: 15_000 }).toBe(true)
      // Skipped is no goal: „Tydzień” still offers them.
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId('goals-none')).toBeVisible()
      await expect(page.getByTestId('goals-edit')).toHaveText('Ustaw cele')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
