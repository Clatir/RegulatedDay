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
type PlanFileBlock = { id: string; categoryId: string; startMin: number; durationMin: number; name?: string | null }
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
async function freeHour(page: Page, dates: string | string[], minutes: number, near?: number, ppm = 0.8): Promise<number> {
  // 0.8 px a minute: the axis of „Tydzień” (WEEK_PPM); „3 dni” – 1.2. `near`: the free hour closest to it (else the first).
  const list = Array.isArray(dates) ? dates : [dates]
  const found = await page.evaluate(
    ([ds, px, around]) => {
      let best: number | null = null
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
        if (blocks.some(([a, b]) => a! < y + (px as number) + 8 && b! > y - 8)) continue
        if (around == null) return hour
        if (best == null || Math.abs(hour - (around as number)) < Math.abs(best - (around as number))) best = hour
      }
      return best
    },
    [list, minutes * ppm, near ?? null] as const
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

test('Tydzień (D366, D431): „Więcej” otwiera pełną edycję dnia z blokiem jeszcze niezapisanym (z nazwą z okienka), „Dodaj” w niej go zapisuje', async () => {
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
      // D431: the cursor in „Nazwa” at once; the name goes to the day's panel with the block.
      await expect(page.getByTestId('week-new-name')).toBeFocused()
      await page.keyboard.type('Analiza rynku')
      await page.getByTestId('week-new-duration').fill('45')
      await page.getByTestId('week-new-duration').press('Enter')
      await page.getByTestId('week-new-more').click()
      // The day's own panel with the block as it stands (nothing saved yet).
      await expect(page.getByTestId('day-today')).toBeVisible()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-start')).toHaveValue(clockOf(h))
      await expect(page.getByTestId('block-duration')).toHaveValue('45 min')
      await expect(page.getByTestId('block-name')).toHaveValue('Analiza rynku')
      await expect(page.getByTestId('block-name')).toBeFocused()
      expect(planOf(dataDir, thu)).toEqual([])
      await page.getByTestId('block-add').click()
      await expect.poll(() => planOf(dataDir, thu).map((b) => [b.startMin, b.durationMin, b.name]), { timeout: 15_000 }).toEqual([[h, 45, 'Analiza rynku']])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D431): okienko „Nowy blok” – kursor w polu „Nazwa”, Enter zapisuje blok z nazwą, kafelek z kategorią przy godzinach', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-name-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const { tue } = await nextWeek(page)
      const h = await freeHour(page, tue, 120)
      await page.mouse.click(await centreOf(page, tue), await hourY(page, h))
      const small = page.getByTestId('week-new')
      await expect(small).toBeVisible()
      await expect(page.getByTestId('week-new-name')).toBeFocused()
      await page.keyboard.type('Analiza rynku')
      await page.keyboard.press('Enter')
      await expect(small).toBeHidden()
      await expect.poll(() => planOf(dataDir, tue).map((b) => [b.categoryId, b.name, b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([['inne', 'Analiza rynku', h, 60]])
      const tile = page.getByTestId(`week-block-${tue}-${planOf(dataDir, tue)[0]!.id}`)
      await expect(tile).toContainText('Analiza rynku')
      await expect(tile).toContainText(`${clockOf(h)}–${clockOf(h + 60)} · Inne obowiązki`)
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

test('Tydzień (D371, przegląd): przeciągnięcie tylko w poziomie to godzina w kilku dniach; puszczenie przed przechwyceniem nie zostawia ducha; przewinięcie nie przesuwa zakresu; po bloku klik nic nie tworzy; zmiana tygodnia zamyka okienko', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-review-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const { tue, wed, thu } = await nextWeek(page)
      const small = page.getByTestId('week-new')
      const bands = page.getByTestId('week-range')
      const h = await freeHour(page, [tue, wed, thu], 15)

      // Only sideways: the days are the pointer's, the hours an hour from where it went down, as a click gives them.
      const y = await hourY(page, h)
      const x0 = await centreOf(page, tue)
      await page.mouse.move(x0, y)
      await page.mouse.down()
      await page.mouse.move(await centreOf(page, thu), y, { steps: 6 })
      await expect(bands).toHaveCount(3)
      for (const band of await bands.all()) await expect(band).toContainText(`${clockOf(h)}–${clockOf(h + 60)}`)
      await page.mouse.up()
      await expect(small).toHaveAttribute('data-dates', `${tue},${wed},${thu}`)
      await expect(page.getByTestId('week-new-duration')).toHaveValue('1 h')
      await page.keyboard.press('Escape')
      await expect(small).toBeHidden()

      // Let go before the column held the pointer (a move under 4 px, out into the gap): no drag is left behind, and the
      // pointer coming back with no button held draws nothing.
      const col = (await page.getByTestId(`week-col-${tue}`).boundingBox())!
      await page.mouse.move(col.x + col.width - 1, y)
      await page.mouse.down()
      await page.mouse.move(col.x + col.width + 2, y)
      await page.mouse.up()
      await page.mouse.move(col.x + col.width / 2, y + 30, { steps: 3 })
      await page.mouse.move(col.x + col.width / 2, y + 90, { steps: 3 })
      await expect(bands).toHaveCount(0)
      await expect(small).toHaveCount(0)

      // The page scrolling under a drag: the start stays where it went down, the end is where the pointer is now.
      const before = await hourY(page, h)
      await page.mouse.move(x0, before)
      await page.mouse.down()
      await page.mouse.move(x0, before + 10, { steps: 2 })
      await page.mouse.wheel(0, 40)
      // The scrolling is not done at once: its end is when the label of the hour stands still, moved up.
      const label = page.getByTestId(`week-hour-${h}`)
      const labelY = async () => {
        const box = (await label.boundingBox())!
        return box.y + box.height / 2
      }
      let last = Number.NaN
      await expect
        .poll(async () => {
          const now = await labelY()
          const still = now === last
          last = now
          return still && now < before - 1
        })
        .toBe(true)
      const scrolled = before - last
      await page.mouse.move(x0, before + 72, { steps: 4 })
      const endMin = Math.round((h + (72 + scrolled) / 0.8) / 5) * 5
      await expect(bands.first()).toHaveAttribute('data-start', String(h))
      await expect(bands.first()).toHaveAttribute('data-end', String(endMin))
      await page.mouse.up()
      await expect(small).toHaveAttribute('data-start', String(h))
      await page.keyboard.press('Escape')
      await expect(small).toBeHidden()

      // A press on a block that ends on an empty place is no click on the grid (nothing is created).
      const blockBox = (await page.locator(`[data-testid^="week-block-${tue}-"]`).first().boundingBox())!
      const free = await hourY(page, h)
      await page.mouse.move(blockBox.x + blockBox.width / 2, blockBox.y + blockBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(blockBox.x + blockBox.width / 2, free, { steps: 6 })
      await page.mouse.up()
      await expect(small).toHaveCount(0)
      await expect(page.getByTestId('week')).toBeVisible()

      // Another week is another grid: the window of the one left does not stay over it (the arrow with the keyboard).
      await page.mouse.click(await centreOf(page, wed), await hourY(page, h))
      await expect(small).toBeVisible()
      await page.getByTestId('week-prev').focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('week-today')).toBeDisabled()
      await expect(small).toHaveCount(0)
      expect(planOf(dataDir, wed)).toEqual([])
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
      /**
       * Drags upward 99 px (90 min at 1.1 px a minute) on an empty place of the axis. The place is looked for, not taken from
       * the bottom: late in the day „Dziś” puts the blocks not started yet after now, at the axis's end (the test runs at any
       * hour). The lowest run of 110 px free of blocks (anything `data-no-grid`) in view, with the axis scrolled to its end,
       * its start or its centre.
       */
      const dragUp = async () => {
        const axis = page.getByTestId('timeline-axis')
        let spot: { x: number; y: number } | null = null
        for (const block of ['end', 'start', 'center'] as const) {
          spot = await axis.evaluate((el, b) => {
            el.scrollIntoView({ block: b })
            const r = el.getBoundingClientRect()
            const x = r.left + 120
            const top = Math.max(r.top, 0) + 2
            let run = 0
            for (let y = Math.min(r.bottom, window.innerHeight) - 2; y >= top; y -= 2) {
              const at = document.elementFromPoint(x, y)
              run = at != null && el.contains(at) && at.closest('[data-no-grid]') == null ? run + 2 : 0
              if (run >= 110) return { x, y: y + run - 6 }
            }
            return null
          }, block)
          if (spot) break
        }
        expect(spot, 'an empty place 110 px high on the axis').not.toBeNull()
        const { x, y } = spot!
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
      // After midnight the start of the logical day carries „+1”.
      expect(await page.getByTestId('block-start').inputValue()).toMatch(/^\d\d:\d[05]( \+1)?$/)
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

test('Tydzień (D400): „Dodaj” na zajęte miejsce w trzech przyszłych dniach przesuwa kolejny blok w każdym, jedna linia „Przesunięto N bloków w 3 dniach · Cofnij” cofa wszystkie', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-push-'))
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // The days of the next week (none gone, none today: the same at every hour of the day).
      const { tue, wed, thu } = await nextWeek(page)
      const days = [tue, wed, thu]
      const h = await freeHour(page, days, 120)
      const small = page.getByTestId('week-new')
      const line = page.getByTestId('week-pushed')
      // A block of an hour in the second hour of the free place, in each of the days: free place, nothing is pushed, no line.
      await dragDays(page, tue, thu, h + 60, 60)
      await page.mouse.up()
      await expect(small).toBeVisible()
      await page.getByTestId('week-new-add').click()
      await expect(small).toBeHidden()
      for (const d of days) await expect.poll(() => planOf(dataDir, d).map((b) => [b.startMin, b.durationMin]), { timeout: 15_000 }).toEqual([[h + 60, 60]])
      await expect(line).toHaveCount(0)
      const first = Object.fromEntries(days.map((d) => [d, planOf(dataDir, d)]))
      const pIds = Object.fromEntries(days.map((d) => [d, first[d]![0]!.id]))

      // Another one over the first half of it (90 min from the line of the hour): the first block goes on, in each day.
      await dragDays(page, tue, thu, h, 90)
      await page.mouse.up()
      await expect(small).toBeVisible()
      await expect(page.getByTestId('week-new-duration')).toHaveValue('1 h 30 min')
      await page.getByTestId('week-new-add').click()
      await expect(small).toBeHidden()
      for (const d of days) {
        await expect.poll(() => planOf(dataDir, d).find((b) => b.id === pIds[d])?.startMin, { timeout: 15_000 }).toBeGreaterThanOrEqual(h + 90)
        const added = planOf(dataDir, d).filter((b) => !first[d]!.some((f) => f.id === b.id) && b.startMin === h)
        expect(added.map((b) => b.durationMin)).toEqual([90])
      }
      // One line for all three days (more blocks may follow where a template's flexible block stood after them).
      await expect(line).toBeVisible()
      await expect(line).toContainText(/Przesunięto \d+ \S+ w 3 dniach/)
      await shot(page, 'j3b-01-week-push')
      // The line is the window's, not the page's: it is there again after another page (D400, 15 min from the save).
      await page.getByTestId('nav-stats').click()
      await expect(page.getByTestId('week')).toHaveCount(0)
      await page.getByTestId('nav-week').click()
      await expect(line).toBeVisible()

      // „Cofnij”: all three days are as they were – the new block gone, the first one back at its place.
      await page.getByTestId('week-pushed-undo').click()
      await expect(line).toHaveCount(0)
      for (const d of days) {
        await expect
          .poll(() => planOf(dataDir, d).map((b) => [b.id, b.startMin, b.durationMin]).sort(), { timeout: 15_000 })
          .toEqual(first[d]!.map((b) => [b.id, b.startMin, b.durationMin]).sort())
      }
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** A day's file with the blocks given (the rest of the day comes from its template, as for every day to come). */
function seedDay(dir: string, date: string, blocks: Array<{ id: string; startMin: number; durationMin: number; fixed?: boolean; categoryId?: string }>): void {
  mkdirSync(dirname(dayFileOf(dir, date)), { recursive: true })
  writeFileSync(dayFileOf(dir, date), JSON.stringify({ schema: 1, date, blocks: blocks.map((b) => ({ categoryId: 'inne', fixed: false, ...b })) }))
}

/** The Monday on or before `date`. */
const mondayOf = (date: string): string => plusDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))
/** A column's first line as the page words it: „śr 25.11” (`dayHeading`). */
const headingOf = (date: string): string => `${['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'][(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]} ${Number(date.slice(8, 10))}.${date.slice(5, 7)}`

test('Widoki (SNT1, D417, D418, T936): przełącznik zapamiętany, „3 dni” z krzywą „przyjęte” jutro, „Agenda” z blokiem jutra otwierającym dzień', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-views-'))
  seed(dataDir)
  const today = logicalToday()
  const yesterday = plusDays(today, -1)
  const tomorrow = plusDays(today, 1)
  seedDay(dataDir, tomorrow, [{ id: 'ag1', startMin: 11 * 60, durationMin: 60 }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      // „Tydzień” first: seven columns; the switch names the three views.
      await expect(page.getByTestId('week-mode-week')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('[data-testid^="week-col-"]')).toHaveCount(7, { timeout: 30_000 })
      await expect(page.getByTestId('week-modes')).toContainText('Tydzień')
      await expect(page.getByTestId('week-modes')).toContainText('3 dni')
      await expect(page.getByTestId('week-modes')).toContainText('Agenda')

      // „3 dni”: yesterday, today, tomorrow – the arrows move by a day, „Dziś” goes back.
      await page.getByTestId('week-mode-3days').click()
      await expect(page.locator('[data-testid^="week-col-"]')).toHaveCount(3)
      for (const d of [yesterday, today, tomorrow]) await expect(page.getByTestId(`week-col-${d}`)).toBeVisible()
      await expect(page.getByTestId('three-title')).toHaveAttribute('data-middle', today)
      await expect(page.getByTestId('three-today')).toBeDisabled()
      await expect(page.getByTestId('week-grid')).toHaveAttribute('data-mode', '3days')
      // The energy's curve behind tomorrow's blocks, counted from the assumed check-in (D422); none for the day gone by.
      await expect(page.getByTestId(`week-energy-${tomorrow}`)).toHaveAttribute('data-assumed', 'true', { timeout: 30_000 })
      await expect(page.getByTestId(`week-energy-assumed-${tomorrow}`)).toHaveText('przyjęte')
      await expect(page.getByTestId(`week-energy-${yesterday}`)).toHaveCount(0)
      await shot(page, 'snt1-01-three-days')
      await page.getByTestId('three-next').click()
      await expect(page.getByTestId('three-title')).toHaveAttribute('data-middle', tomorrow)
      await expect(page.getByTestId(`week-col-${plusDays(today, 2)}`)).toBeVisible()
      await expect(page.getByTestId('three-today')).toBeEnabled()
      await page.getByTestId('three-today').click()
      await expect(page.getByTestId('three-title')).toHaveAttribute('data-middle', today)

      // The view is remembered: another page and back, „3 dni” is still there.
      await page.getByTestId('nav-stats').click()
      await expect(page.getByTestId('week')).toHaveCount(0)
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId('week')).toHaveAttribute('data-mode', '3days')

      // „Agenda”: seven days from today, a day after a day; tomorrow's block has its hour, name, length – a click opens its day.
      await page.getByTestId('week-mode-agenda').click()
      await expect(page.locator('[data-testid^="agenda-day-"]')).toHaveCount(7, { timeout: 30_000 })
      await expect(page.getByTestId(`agenda-day-${today}`)).toBeVisible()
      await expect(page.getByTestId(`agenda-day-${plusDays(today, 6)}`)).toBeVisible()
      await expect(page.getByTestId(`agenda-heading-${today}`)).toContainText('Dziś')
      await expect(page.getByTestId(`agenda-heading-${tomorrow}`)).toContainText('Jutro')
      const row = page.getByTestId(`agenda-block-${tomorrow}-ag1`)
      await expect(row).toContainText('11:00')
      await expect(row).toContainText('Inne obowiązki')
      await expect(row).toContainText('1 h')
      await shot(page, 'snt1-02-agenda')
      await row.click()
      await expect(page.getByTestId('day-today')).toBeVisible()
      await expect(page.getByTestId('day-title')).toContainText(`${tomorrow.slice(8)}.${tomorrow.slice(5, 7)}.`)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Przeciąganie bloku (SNT1, D417, D422): wtorek → środa z podglądem miejsca i linią „Przeniesiono … · Cofnij” przywracającą oba dni; w „3 dniach” zmiana godziny jutra', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-drag-'))
  seed(dataDir)
  const today = logicalToday()
  const tomorrow = plusDays(today, 1)
  // The days of the next week: none gone, none today – the same at every hour of the day.
  const tue = plusDays(mondayOf(today), 8)
  const wed = plusDays(tue, 1)
  seedDay(dataDir, tue, [{ id: 'mv1', startMin: 12 * 60, durationMin: 60 }])
  seedDay(dataDir, tomorrow, [{ id: 'mv2', startMin: 14 * 60, durationMin: 60 }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await nextWeek(page)
      const src = page.getByTestId(`week-block-${tue}-mv1`)
      await expect(src).toBeVisible({ timeout: 30_000 })
      await expect(src).toHaveAttribute('data-movable', 'true')
      await src.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const h = await freeHour(page, wed, 90, 12 * 60)
      const targetY = await hourY(page, h)
      const box = (await src.boundingBox())!
      const sx = box.x + box.width / 2
      const sy = box.y + 10
      // Held 10 px under the block's top, taken to the free hour of Wednesday: its place is shown while the button is held.
      await page.mouse.move(sx, sy)
      await page.mouse.down()
      await page.mouse.move(sx + 30, sy + 10, { steps: 4 })
      await page.mouse.move(await centreOf(page, wed), targetY + 10, { steps: 8 })
      const band = page.getByTestId('week-drop')
      await expect(band).toHaveAttribute('data-start', String(h))
      await expect(band).toContainText(`${clockOf(h)}–${clockOf(h + 60)}`)
      await expect(page.getByTestId('week-grid')).toHaveAttribute('data-dragging', 'true')
      await page.mouse.up()
      // Written: the block is Wednesday's at that hour (the same id), Tuesday's file lets it go.
      await expect.poll(() => planOf(dataDir, wed).find((b) => b.id === 'mv1')?.startMin, { timeout: 15_000 }).toBe(h)
      await expect.poll(() => planOf(dataDir, tue).some((b) => b.id === 'mv1'), { timeout: 15_000 }).toBe(false)
      await expect(page.getByTestId(`week-block-${wed}-mv1`)).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId(`week-block-${tue}-mv1`)).toHaveCount(0)
      const line = page.getByTestId('week-pushed')
      await expect(line).toContainText(`Przeniesiono: Inne obowiązki na ${headingOf(wed)}`)
      await shot(page, 'snt1-03-moved')
      // „Cofnij”: both days as they were.
      await page.getByTestId('week-pushed-undo').click()
      await expect(line).toHaveCount(0)
      await expect.poll(() => planOf(dataDir, tue).find((b) => b.id === 'mv1')?.startMin, { timeout: 15_000 }).toBe(12 * 60)
      await expect.poll(() => planOf(dataDir, wed).some((b) => b.id === 'mv1'), { timeout: 15_000 }).toBe(false)
      await expect(page.getByTestId(`week-block-${tue}-mv1`)).toBeVisible({ timeout: 15_000 })

      // A click on the block with no movement opens its day, as before.
      await page.getByTestId(`week-block-${tue}-mv1`).click()
      await expect(page.getByTestId('day-today')).toBeVisible()
      await expect(page.getByTestId('day-title')).toContainText(`${tue.slice(8)}.${tue.slice(5, 7)}.`)

      // „3 dni”: tomorrow's block dragged within its column takes the hour as on the axis of „Dziś” (5 min, no line when nothing is pushed).
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-3days').click()
      const mine = page.getByTestId(`week-block-${tomorrow}-mv2`)
      await expect(mine).toBeVisible({ timeout: 30_000 })
      await mine.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const h2 = await freeHour(page, tomorrow, 90, 14 * 60, 1.2)
      const y2 = await hourY(page, h2)
      const box2 = (await mine.boundingBox())!
      const x2 = box2.x + box2.width / 2
      await page.mouse.move(x2, box2.y + 10)
      await page.mouse.down()
      await page.mouse.move(x2, box2.y + 30, { steps: 3 })
      await page.mouse.move(x2, y2 + 10, { steps: 6 })
      await expect(page.getByTestId('week-drop')).toHaveAttribute('data-start', String(h2))
      await page.mouse.up()
      await expect.poll(() => planOf(dataDir, tomorrow).find((b) => b.id === 'mv2')?.startMin, { timeout: 15_000 }).toBe(h2)
      await expect(page.getByTestId('week-pushed')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Miesiąc (D429): po bloku stałym paski mają nazwy bloków elastycznych po godzinie, z godzinami w podpowiedzi', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-month-flex-'))
  seed(dataDir)
  const today = logicalToday()
  // The 15th of the next month: a day to come at any time. One fixed block (06:30) and two flexible ones before every block
  // of the template (04:05, 04:50) – the fixed bar first, then the flexible ones by the hour.
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 15)).toISOString().slice(0, 10)
  seedDay(dataDir, next, [
    { id: 'f1', startMin: 6 * 60 + 30, durationMin: 60, fixed: true },
    { id: 'x2', startMin: 4 * 60 + 50, durationMin: 30 },
    { id: 'x1', startMin: 4 * 60 + 5, durationMin: 30 }
  ])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await expect(page.getByTestId('calendar')).toBeVisible()
      await page.getByTestId('month-next').click()
      await expect(page.getByTestId('calendar')).toHaveAttribute('data-counted', 'true', { timeout: 30_000 })
      const bars = page.getByTestId(`month-bar-${next}`)
      await expect(bars).toHaveCount(3, { timeout: 30_000 })
      await expect(bars.nth(0)).toHaveAttribute('title', /06:30–07:30/)
      await expect(bars.nth(1)).toHaveAttribute('title', /04:05–04:35/)
      await expect(bars.nth(1)).toHaveText('Inne obowiązki')
      await expect(bars.nth(2)).toHaveAttribute('title', /04:50–05:20/)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Miesiąc (SNT1, D418, D422): w komórce dnia do trzech pasków stałych bloków, „+N” za resztę i kropka obciążenia ze zdaniem', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-month-'))
  seed(dataDir)
  const today = logicalToday()
  // The 15th of the next month: a day to come at any time, with three fixed blocks (06:30, 07:30, 08:30) and two flexible ones.
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 15)).toISOString().slice(0, 10)
  seedDay(dataDir, next, [
    { id: 'f1', startMin: 6 * 60 + 30, durationMin: 60, fixed: true },
    { id: 'f2', startMin: 7 * 60 + 30, durationMin: 60, fixed: true },
    { id: 'f3', startMin: 8 * 60 + 30, durationMin: 60, fixed: true },
    { id: 'x1', startMin: 13 * 60, durationMin: 30 },
    { id: 'x2', startMin: 15 * 60, durationMin: 30 }
  ])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await expect(page.getByTestId('calendar')).toBeVisible()
      await page.getByTestId('month-next').click()
      await expect(page.getByTestId('calendar')).toHaveAttribute('data-counted', 'true', { timeout: 30_000 })
      const bars = page.getByTestId(`month-bar-${next}`)
      await expect(bars).toHaveCount(3, { timeout: 30_000 })
      await expect(bars.nth(0)).toHaveAttribute('title', /06:30–07:30/)
      await expect(bars.nth(2)).toHaveAttribute('title', /08:30–09:30/)
      // Everything else the day holds – the two flexible blocks and whatever its template brings – is „+N”.
      await expect(page.getByTestId(`month-more-${next}`)).toHaveText(/^\+([2-9]|\d{2,})$/)
      // The dot of the load: a level and the sentence about the work and the budget.
      const dot = page.getByTestId(`month-load-${next}`)
      await expect(dot).toHaveAttribute('data-level', /^(low|mid|high)$/)
      await expect(dot).toHaveAttribute('title', /^Praca .+ z .+$/)
      await shot(page, 'snt1-04-month')
      // The colour of the day and the selection stay: a click with Ctrl selects the day.
      await page.getByTestId(`day-${next}`).click({ modifiers: ['Control'] })
      await expect(page.getByTestId(`day-${next}`)).toHaveAttribute('aria-pressed', 'true')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
