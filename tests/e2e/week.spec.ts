/**
 * „Tydzień” i cele miesięczne (E10, D356, D360): the page opens from the menu with seven columns, the arrows move the week,
 * a goal set at the top is saved and its progress „x z y” shows at once, a value out of its range is refused under the
 * field, a click on a day opens its plan; the step „Cele na <miesiąc>” of the morning plan takes over the month before's
 * numbers („Zapisz”) or hides itself („Pomiń”). Independent of the day of the week it runs on (T528): nothing assumes a
 * type of day, and Monday's „Strona B” is closed when it comes first. A new block from the grid (D366): a click on an empty
 * place of a day of the next week (never a day gone by) opens its small window, „Dodaj” saves the block there at that
 * hour, a drag gives its length; the heading of a day and a block open the day; the axes of „Dziś” and „Szablony” take a drag.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const dayFileOf = (dir: string, date: string): string => join(dir, 'days', date.slice(0, 4), `${date}.json`)
type PlanFileBlock = { id: string; categoryId: string; startMin: number; durationMin: number }
const planOf = (dir: string, date: string): PlanFileBlock[] => (existsSync(dayFileOf(dir, date)) ? (JSON.parse(readFileSync(dayFileOf(dir, date), 'utf8')) as { blocks: PlanFileBlock[] }).blocks : [])
const plusDays = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** „Tydzień” one week on (every day of it ahead – none gone by); the dates of its Tuesday, Wednesday and Thursday. */
async function nextWeek(page: Page): Promise<{ tue: string; wed: string; thu: string }> {
  await page.getByTestId('nav-week').click()
  await page.getByTestId('week-next').click()
  const monday = (await page.getByTestId('week-title').getAttribute('data-week'))!
  await expect(page.getByTestId(`week-col-${plusDays(monday, 1)}`)).toBeVisible({ timeout: 30_000 })
  return { tue: plusDays(monday, 1), wed: plusDays(monday, 2), thu: plusDays(monday, 3) }
}

/**
 * The first full hour from 6:00 on of a day's column (of each of the days) that has room for `minutes` with no block in it –
 * the days of the next week come with the blocks of their templates, so a place to click is looked for, not assumed.
 */
async function freeHour(page: Page, dates: string | string[], minutes: number): Promise<number> {
  // 0.8 px a minute: the axis of „Tydzień” (WEEK_PPM).
  const list = Array.isArray(dates) ? dates : [dates]
  const found = await page.evaluate(
    ([ds, px]) => {
      const col = document.querySelector(`[data-testid="week-col-${ds[0]}"]`)!.getBoundingClientRect()
      const blocks = ds.flatMap((d) =>
        [...document.querySelectorAll(`[data-testid^="week-block-${d}-"]`)].map((e) => {
          const r = e.getBoundingClientRect()
          return [r.top - col.top, r.bottom - col.top]
        })
      )
      for (const label of document.querySelectorAll('[data-testid^="week-hour-"]')) {
        const hour = Number(label.getAttribute('data-testid')!.slice('week-hour-'.length))
        const r = label.getBoundingClientRect()
        const y = r.top + r.height / 2 - col.top
        if (hour < 360 || y + (px as number) + 8 > col.height) continue
        if (!blocks.some(([a, b]) => a! < y + (px as number) + 8 && b! > y - 8)) return hour
      }
      return null
    },
    [list, minutes * 0.8] as const
  )
  expect(found, `a free ${minutes} min on ${list.join(', ')}`).not.toBeNull()
  return found!
}

const clockOf = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** The viewport's y of the hour's line on the axis of „Tydzień” (its label stands centred on it), the hour brought into view. */
async function hourY(page: Page, hourMin: number): Promise<number> {
  const label = page.getByTestId(`week-hour-${hourMin}`)
  await label.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = (await label.boundingBox())!
  return box.y + box.height / 2
}

const centreOf = async (page: Page, date: string): Promise<number> => {
  const box = (await page.getByTestId(`week-col-${date}`).boundingBox())!
  return box.x + box.width / 2
}

test('Tydzień (D366): klik w pusty wtorek – okienko, „Dodaj” zapisuje blok o tej godzinie; przeciągnięcie – blok 90 min; Esc nic nie zapisuje; nagłówek i blok otwierają dzień', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-new-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const { tue, wed, thu } = await nextWeek(page)
      // A click on an empty place opens the small window there – the day stays out of view (the column no longer opens it).
      const h1 = await freeHour(page, tue, 120)
      await page.mouse.click(await centreOf(page, tue), await hourY(page, h1))
      const small = page.getByTestId('week-new')
      await expect(small).toBeVisible()
      await expect(small).toHaveAttribute('data-date', tue)
      await expect(small).toHaveAttribute('data-start', String(h1))
      await expect(small).toContainText(clockOf(h1))
      await expect(page.getByTestId('week')).toBeVisible()
      // The block waiting is drawn in its column; nothing is saved yet.
      await expect(page.getByTestId('week-range-waiting')).toContainText(`${clockOf(h1)}–${clockOf(h1 + 60)}`)
      expect(planOf(dataDir, tue)).toEqual([])
      await page.getByTestId('week-new-add').click()
      await expect(small).toBeHidden()
      await expect.poll(() => planOf(dataDir, tue).map((b) => [b.categoryId, b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([['inne', h1, 60]])
      await expect(page.locator(`[data-testid="week-block-${tue}-${planOf(dataDir, tue)[0]!.id}"]`)).toBeVisible({ timeout: 15_000 })

      // A drag over an empty place of another day: the range is shown while it is held, then the block is as long as it.
      const h2 = await freeHour(page, wed, 120)
      const y2 = await hourY(page, h2)
      const x = await centreOf(page, wed)
      await page.mouse.move(x, y2)
      await page.mouse.down()
      await page.mouse.move(x, y2 + 36, { steps: 4 })
      await page.mouse.move(x, y2 + 72, { steps: 4 })
      await expect(page.getByTestId('week-range')).toContainText(`${clockOf(h2)}–${clockOf(h2 + 90)}`)
      await page.mouse.up()
      await expect(small).toBeVisible()
      await expect(small).toHaveAttribute('data-date', wed)
      await expect(page.getByTestId('week-new-duration')).toHaveValue('1 h 30 min')
      await page.getByTestId('week-new-add').click()
      await expect.poll(() => planOf(dataDir, wed).map((b) => [b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([[h2, 90]])

      // A move under 4 px is a click; Esc closes the window and writes nothing.
      const h3 = await freeHour(page, thu, 120)
      const y3 = await hourY(page, h3)
      const xThu = await centreOf(page, thu)
      await page.mouse.move(xThu, y3)
      await page.mouse.down()
      await page.mouse.move(xThu, y3 + 2)
      await page.mouse.up()
      await expect(small).toBeVisible()
      await expect(small).toHaveAttribute('data-date', thu)
      await expect(small).toHaveAttribute('data-start', String(h3))
      await page.keyboard.press('Escape')
      await expect(small).toBeHidden()
      expect(planOf(dataDir, thu)).toEqual([])
      // A click outside it closes it too.
      await page.mouse.click(xThu, y3)
      await expect(small).toBeVisible()
      await page.getByTestId('week-title').click()
      await expect(small).toBeHidden()
      expect(planOf(dataDir, thu)).toEqual([])

      // The heading of a day opens its plan; so does a block of it.
      await page.getByTestId(`week-day-${tue}`).click()
      await expect(page.getByTestId('day-today')).toBeVisible()
      await expect(page.getByTestId('day-title')).toContainText(`${tue.slice(8)}.${tue.slice(5, 7)}.`)
      await nextWeek(page)
      await page.locator(`[data-testid^="week-block-${wed}-"]`).first().click()
      await expect(page.getByTestId('day-today')).toBeVisible()
      await expect(page.getByTestId('day-title')).toContainText(`${wed.slice(8)}.${wed.slice(5, 7)}.`)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D366): „Więcej” otwiera pełną edycję dnia z blokiem jeszcze niezapisanym, „Dodaj” w niej go zapisuje', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-more-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const { thu } = await nextWeek(page)
      const h = await freeHour(page, thu, 120)
      await page.mouse.click(await centreOf(page, thu), await hourY(page, h))
      await expect(page.getByTestId('week-new')).toBeVisible()
      await page.getByTestId('week-new-duration').fill('45')
      await page.getByTestId('week-new-duration').press('Enter')
      await page.getByTestId('week-new-more').click()
      // The day's own panel with the block as it stands (nothing saved yet).
      await expect(page.getByTestId('day-today')).toBeVisible()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-start')).toHaveValue(clockOf(h))
      await expect(page.getByTestId('block-duration')).toHaveValue('45 min')
      expect(planOf(dataDir, thu)).toEqual([])
      await page.getByTestId('block-add').click()
      await expect.poll(() => planOf(dataDir, thu).map((b) => [b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([[h, 45]])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** A drag from the column of `from` to the column of `to` between the lines of the hours `h` and `h` + `minutes`; the button still held. */
async function dragDays(page: Page, from: string, to: string, h: number, minutes: number): Promise<void> {
  const y = await hourY(page, h)
  const x0 = await centreOf(page, from)
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await page.mouse.move(x0, y + 20, { steps: 3 })
  await page.mouse.move(await centreOf(page, to), y + minutes * 0.8, { steps: 6 })
}

test('Tydzień (D371): przeciągnięcie przez trzy dni – pasmo w każdym, „Anuluj” nic nie zapisuje, „Dodaj” zapisuje blok w każdym dniu; kategoria z ostatniego bloku', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-days-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const { tue, wed, thu } = await nextWeek(page)
      const fri = plusDays(tue, 3)
      const h = await freeHour(page, [tue, wed, thu, fri], 120)
      const small = page.getByTestId('week-new')
      const category = page.getByTestId('week-new-category')

      // While it is held: the band of the hours in each of the three columns.
      await dragDays(page, tue, thu, h, 90)
      await expect(page.getByTestId('week-range')).toHaveCount(3)
      for (const band of await page.getByTestId('week-range').all()) await expect(band).toContainText(`${clockOf(h)}–${clockOf(h + 90)}`)
      await page.mouse.up()
      await expect(small).toBeVisible()
      await expect(small).toHaveAttribute('data-dates', `${tue},${wed},${thu}`)
      await expect(page.getByTestId('week-new-hours')).toHaveText(`${clockOf(h)}–${clockOf(h + 90)}`)
      await expect(small).toContainText('wt–cz')
      await expect(page.getByTestId('week-new-duration')).toHaveValue('1 h 30 min')
      // The first time: „Inne”. One day only has „Więcej” – here it is not offered; no day gone by, no warning.
      await expect(category).toHaveValue('inne')
      await expect(page.getByTestId('week-new-more')).toHaveCount(0)
      await expect(page.getByTestId('week-new-past')).toHaveCount(0)
      // „Anuluj” closes it and writes nothing.
      await page.getByTestId('week-new-cancel').click()
      await expect(small).toBeHidden()
      for (const d of [tue, wed, thu]) expect(planOf(dataDir, d)).toEqual([])

      // Again, another category: a block in each of the days, at those hours.
      await dragDays(page, tue, thu, h, 90)
      await page.mouse.up()
      await expect(small).toBeVisible()
      const values = await category.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
      const chosen = values.find((v) => v !== 'inne')!
      await category.selectOption(chosen)
      await page.getByTestId('week-new-add').click()
      await expect(small).toBeHidden()
      for (const d of [tue, wed, thu]) await expect.poll(() => planOf(dataDir, d).map((b) => [b.categoryId, b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([[chosen, h, 90]])
      expect(planOf(dataDir, fri)).toEqual([])
      // Each is its own block.
      expect(new Set([tue, wed, thu].map((d) => planOf(dataDir, d)[0]!.id)).size).toBe(3)

      // The next window starts with the category of the block added last.
      await page.mouse.click(await centreOf(page, fri), await hourY(page, h))
      await expect(small).toBeVisible()
      await expect(category).toHaveValue(chosen)
      await page.keyboard.press('Escape')
      await expect(small).toBeHidden()

      // A drag from the right to the left takes the same days (from a place the blocks just added do not take).
      for (const d of [tue, wed, thu]) await expect(page.getByTestId(`week-block-${d}-${planOf(dataDir, d)[0]!.id}`)).toBeVisible({ timeout: 15_000 })
      const h2 = await freeHour(page, [tue, wed, thu], 60)
      await dragDays(page, thu, tue, h2, 60)
      await expect(page.getByTestId('week-range')).toHaveCount(3)
      await page.mouse.up()
      await expect(small).toHaveAttribute('data-dates', `${tue},${wed},${thu}`)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D371): dzień minął – okienko ma ostrzeżenie (z nazwami dni w zakresie), a „Dodaj” dalej zapisuje', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-past-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // The week before: every day of it has gone by (also on a Monday, when none of this week's has).
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-prev').click()
      const monday = (await page.getByTestId('week-title').getAttribute('data-week'))!
      const [mon, tue, wed] = [monday, plusDays(monday, 1), plusDays(monday, 2)]
      await expect(page.getByTestId(`week-col-${wed}`)).toBeVisible({ timeout: 30_000 })
      // Only where the pointer goes down must be free: the days gone by are full of what was planned.
      const h = await freeHour(page, mon, 15)
      const small = page.getByTestId('week-new')
      // Several days: the days by name; „Anuluj” writes nothing.
      await dragDays(page, mon, wed, h, 90)
      await page.mouse.up()
      await expect(small).toBeVisible()
      await expect(page.getByTestId('week-new-past')).toHaveText('Poniedziałek, wtorek i środa już minęły.')
      await page.getByTestId('week-new-cancel').click()
      await expect(small).toBeHidden()
      expect(planOf(dataDir, tue)).toEqual([])
      // One day: the warning of one; only a warning – „Dodaj” saves (D72).
      await page.mouse.click(await centreOf(page, mon), await hourY(page, h))
      await expect(small).toBeVisible()
      await expect(page.getByTestId('week-new-past')).toHaveText('Ten dzień już minął.')
      await page.getByTestId('week-new-add').click()
      await expect(small).toBeHidden()
      await expect.poll(() => planOf(dataDir, mon).map((b) => [b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([[h, 60]])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('oś dnia (D366): przeciągnięcie po pustym miejscu ustawia start i długość nowego bloku w „Dziś” i w „Szablonach”, kolumna godzin działa jak oś', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-axis-new-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      /** Drags upward 99 px (90 min at 1.1 px a minute) from near the bottom of the axis, the pointer going down on an empty place. */
      const dragUp = async () => {
        const axis = page.getByTestId('timeline-axis')
        await axis.evaluate((el) => el.scrollIntoView({ block: 'end' }))
        const box = (await axis.boundingBox())!
        const x = box.x + 120
        const y = box.y + box.height - 40
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x, y - 40, { steps: 4 })
        await page.mouse.move(x, y - 99, { steps: 4 })
        await expect(page.getByTestId('create-range')).toContainText('1 h 30 min')
        await page.mouse.up()
      }
      // „Dziś”: the panel of a new block with the start and the length of the range (as a click on the axis opens it).
      await dragUp()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-duration')).toHaveValue('1 h 30 min')
      expect(await page.getByTestId('block-start').inputValue()).toMatch(/^\d\d:\d[05]$/)
      await expect(page.getByTestId('block-add')).toBeVisible()
      await expect(page.getByTestId('create-range')).toHaveCount(0)

      // „Szablony”: a block of the template 90 min long; a click in the column of hours makes one on the quarter, an hour long.
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').first().click()
      await expect(page.getByTestId('template-editor')).toBeVisible()
      const own = page.getByTestId('template-timeline').locator('[data-movable="true"]')
      const before = await own.count()
      await dragUp()
      await expect(own).toHaveCount(before + 1)
      await expect(page.getByTestId('block-duration')).toHaveValue('1 h 30 min')
      const hours = page.getByTestId('timeline-hours')
      await hours.click({ position: { x: 20, y: 300 } })
      await expect(own).toHaveCount(before + 2)
      await expect(page.getByTestId('block-duration')).toHaveValue('1 h')
      // A drag in the column of hours is a drag on the axis (66 px – an hour).
      await hours.evaluate((el) => el.scrollIntoView({ block: 'end' }))
      const hb = (await hours.boundingBox())!
      await page.mouse.move(hb.x + 20, hb.y + hb.height - 60)
      await page.mouse.down()
      await page.mouse.move(hb.x + 20, hb.y + hb.height - 100, { steps: 4 })
      await page.mouse.move(hb.x + 20, hb.y + hb.height - 126, { steps: 4 })
      await page.mouse.up()
      await expect(own).toHaveCount(before + 3)
      await expect(page.getByTestId('block-duration')).toHaveValue('1 h')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
