/**
 * Wydarzenia całodniowe i wielodniowe, ekrany (D405, D406, HKU1 część B): pas nad osią „Dziś” – klik w puste miejsce otwiera kartę
 * (tytuł, daty, kolor, notatka Markdown), „Zapisz” zapisuje plik `allday/<id>.json`, budżet dnia się nie zmienia; w „Tygodniu”
 * przeciągnięcie przez trzy dni daje jedną belkę na trzy kolumny; „Usuń” bez pytania, linia „Usunięto … · Cofnij” w oknie;
 * „To wolne” pyta raz o typ „Wolne” i „Cofnij” przywraca dni.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

interface Stored {
  id: string
  title: string
  startDate: string
  endDate: string
  note?: string
  free?: boolean
}

/** The events in the folder, by title. */
function stored(dir: string): Stored[] {
  const folder = join(dir, 'allday')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(folder, f), 'utf8')) as Stored)
}

const dayType = (dir: string, date: string): string | null => {
  const path = join(dir, 'days', date.slice(0, 4), `${date}.json`)
  return existsSync(path) ? ((JSON.parse(readFileSync(path, 'utf8')) as { dayType?: string }).dayType ?? null) : null
}

const centre = async (page: Page, testId: string): Promise<{ x: number; y: number }> => {
  const b = (await page.getByTestId(testId).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** The days of the week shown (their dates, Monday first). */
const weekDates = async (page: Page): Promise<string[]> => {
  const ids = await page.locator('[data-testid^="week-day-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('week-day-'.length)))
  expect(ids).toHaveLength(7)
  return ids
}

test('Dziś (D405): pas nad osią – klik otwiera kartę, „Zapisz” zapisuje wydarzenie z notatką Markdown, budżet dnia bez zmian; „Usuń” bez pytania, linia „Cofnij” przywraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-allday-'))
  const { today } = seedAwake(dataDir, [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('block-w1')).toBeVisible({ timeout: 30_000 })
      const summary = await page.getByTestId('day-summary').innerText()
      // The strip: always there, one line high while empty, over the axis.
      const strip = page.getByTestId('allday-today')
      await expect(strip).toBeVisible()
      await expect(strip).toHaveAttribute('data-rows', '1')
      expect((await strip.boundingBox())!.height).toBeLessThan(30)

      // A click on the empty place: the card of a new event on this day (from = to).
      await page.getByTestId(`allday-cell-${today}`).click()
      const card = page.getByTestId('allday-card')
      await expect(card).toBeVisible()
      await expect(page.getByTestId('allday-start')).toHaveValue(/^\d\d\.\d\d\.\d{4}$/)
      expect(await page.getByTestId('allday-start').inputValue()).toBe(await page.getByTestId('allday-end').inputValue())
      await expect(page.getByTestId('allday-remove')).toHaveCount(0)
      // Without a title: refused under the field, nothing written.
      await page.getByTestId('allday-save').click()
      await expect(page.getByTestId('allday-title-problem')).toHaveText('Wpisz tytuł wydarzenia.')
      expect(stored(dataDir)).toEqual([])
      await page.getByTestId('allday-title').fill('Konferencja')
      await page.getByTestId('allday-color-teal').click()
      await expect(page.getByTestId('allday-color-teal')).toHaveAttribute('aria-pressed', 'true')
      // The note: the editor of the block's note (D388).
      await card.getByRole('textbox', { name: 'Notatka' }).click()
      await page.keyboard.type('Sala 4')
      await page.getByTestId('allday-save').click()
      await expect(card).toBeHidden()
      await expect.poll(() => stored(dataDir).map((e) => [e.title, e.startDate, e.endDate, e.note]), { timeout: 15_000 }).toEqual([['Konferencja', today, today, 'Sala 4']])
      const id = stored(dataDir)[0]!.id
      const bar = page.getByTestId(`allday-bar-${id}`)
      await expect(bar).toBeVisible()
      await expect(bar).toHaveAttribute('title', /^Konferencja · \d+\.\d\d$/)
      await expect(bar).toContainText('Konferencja')
      // The event never changes the day's budget.
      await expect(page.getByTestId('day-summary')).toHaveText(summary)

      // Esc and „Anuluj” close the card with nothing saved.
      await bar.click()
      await expect(card).toBeVisible()
      await page.getByTestId('allday-title').fill('Inaczej')
      await page.keyboard.press('Escape')
      await expect(card).toBeHidden()
      expect(stored(dataDir).map((e) => e.title)).toEqual(['Konferencja'])

      // „Usuń”: no question, the line on top of the page, the file gone; „Cofnij” brings the very record back.
      await bar.click()
      await page.getByTestId('allday-remove').click()
      await expect(card).toBeHidden()
      const line = page.getByTestId('allday-removed')
      await expect(line).toHaveText(/Usunięto „Konferencja”/)
      await expect(bar).toHaveCount(0)
      await expect.poll(() => stored(dataDir), { timeout: 15_000 }).toEqual([])
      await expect(page.getByTestId('day-summary')).toHaveText(summary)
      // The line is the window's: it stands after another page too, but not on the other one's top.
      await page.getByTestId('nav-week').click()
      await expect(page.getByTestId('week')).toBeVisible()
      await expect(page.getByTestId('allday-removed')).toHaveCount(0)
      await page.getByTestId('nav-today').click()
      await expect(line).toBeVisible()
      await page.getByTestId('allday-line-undo').click()
      await expect(line).toHaveCount(0)
      await expect(bar).toBeVisible()
      await expect.poll(() => stored(dataDir).map((e) => [e.id, e.title, e.note]), { timeout: 15_000 }).toEqual([[id, 'Konferencja', 'Sala 4']])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D405): przeciągnięcie przez trzy dni pasa daje kartę z zakresem i jedną belkę na trzy kolumny; kolor, tytuł obcięty z pełną podpowiedzią', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-allday-week-'))
  seedAwake(dataDir, [])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await expect(page.locator('[data-testid^="week-day-"]')).toHaveCount(7, { timeout: 30_000 })
      // The next week: none of its days is today or gone, at any hour.
      const week = await nextWeek(page)
      const [from, , to] = [week[1]!, week[2]!, week[3]!]
      // The strip is in the same columns as the headings.
      const head = (await page.getByTestId(`week-day-${from}`).boundingBox())!
      const cell = (await page.getByTestId(`allday-cell-${from}`).boundingBox())!
      expect(Math.abs(head.x - cell.x)).toBeLessThan(2)
      expect(Math.abs(head.width - cell.width)).toBeLessThan(2)

      // A drag from Tuesday to Thursday: the range of three days.
      const a = await centre(page, `allday-cell-${from}`)
      const c = await centre(page, `allday-cell-${to}`)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move((a.x + c.x) / 2, a.y, { steps: 4 })
      await page.mouse.move(c.x, c.y, { steps: 4 })
      await expect(page.getByTestId('allday-range')).toHaveAttribute('data-from', from)
      await expect(page.getByTestId('allday-range')).toHaveAttribute('data-to', to)
      await page.mouse.up()
      const card = page.getByTestId('allday-card')
      await expect(card).toBeVisible()
      const plDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`
      await expect(page.getByTestId('allday-start')).toHaveValue(plDate(from))
      await expect(page.getByTestId('allday-end')).toHaveValue(plDate(to))
      // „Do” before „od”: said under the fields.
      await page.getByTestId('allday-end').fill(plDate(week[0]!))
      await page.getByTestId('allday-end').press('Enter')
      await expect(page.getByTestId('allday-dates-problem')).toHaveText('Data „do” nie może być przed datą „od”.')
      await page.getByTestId('allday-end').fill(plDate(to))
      await page.getByTestId('allday-end').press('Enter')
      await expect(page.getByTestId('allday-dates-problem')).toHaveCount(0)
      const long = 'Bardzo długi tytuł wydarzenia, który nie zmieści się nawet w trzech kolumnach tygodnia, bo ma prawie sto dwadzieścia znaków, a belka jest tylko jedną linią'.slice(0, 118)
      await page.getByTestId('allday-title').fill(long)
      await page.getByTestId('allday-color-rose').click()
      await page.getByTestId('allday-save').click()
      await expect(card).toBeHidden()
      await expect.poll(() => stored(dataDir).map((e) => [e.title, e.startDate, e.endDate]), { timeout: 15_000 }).toEqual([[long, from, to]])
      const bar = page.getByTestId(`allday-bar-${stored(dataDir)[0]!.id}`)
      await expect(bar).toBeVisible()
      await expect(bar).toHaveAttribute('data-from', from)
      await expect(bar).toHaveAttribute('data-to', to)
      // One bar over three columns; the title cut, the whole of it and the dates in the title.
      const colWidth = (await page.getByTestId(`allday-cell-${from}`).boundingBox())!.width
      const box = (await bar.boundingBox())!
      expect(box.width).toBeGreaterThan(colWidth * 2.8)
      expect(box.width).toBeLessThan(colWidth * 3.4)
      await expect(bar).toHaveAttribute('title', new RegExp(`^${long.replace('.', '\\.')} · \\d+–\\d+\\.\\d\\d$`))
      expect(await bar.locator('span').last().evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)

      // Sticky with the headings: after the grid is scrolled the strip is still in view.
      await page.getByTestId('week-grid').evaluate((el) => el.scrollIntoView({ block: 'end' }))
      await page.mouse.wheel(0, 600)
      await expect(bar).toBeInViewport()
      // A click on the bar opens the card of the event, with its days and colour.
      await bar.click()
      await expect(page.getByTestId('allday-title')).toHaveValue(long)
      await expect(page.getByTestId('allday-color-rose')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('allday-remove')).toBeVisible()
      await page.getByTestId('allday-cancel').click()
      await expect(page.getByTestId('allday-card')).toBeHidden()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D405, D406): „To wolne” pyta raz o typ „Wolne” na dni od jutra, „Tak” ustawia je jedną linią z „Cofnij”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-allday-free-'))
  seedAwake(dataDir, [])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await expect(page.locator('[data-testid^="week-day-"]')).toHaveCount(7, { timeout: 30_000 })
      const week = await nextWeek(page)
      const days = [week[1]!, week[2]!, week[3]!]
      await page.getByTestId(`allday-cell-${days[0]}`).click()
      await page.getByTestId('allday-title').fill('Urlop')
      await page.getByTestId('allday-end').fill(`${days[2]!.slice(8, 10)}.${days[2]!.slice(5, 7)}.${days[2]!.slice(0, 4)}`)
      await page.getByTestId('allday-end').press('Enter')
      await page.getByTestId('allday-free').check()
      await page.getByTestId('allday-save').click()
      // The question stands in the card's place, once: the days named in Polish.
      const ask = page.getByTestId('allday-free-ask')
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await expect(ask).toHaveText(/^Ustawić typ dnia „Wolne” na \S+ \d+\.\d\d – \S+ \d+\.\d\d\?$/)
      await page.getByTestId('allday-free-no').click()
      await expect(page.getByTestId('allday-card')).toBeHidden()
      for (const d of days) expect(dayType(dataDir, d)).not.toBe('wolne')

      // Again, and „Tak”: the days are „Wolne”, one line with one „Cofnij”.
      await page.getByTestId(`allday-bar-${stored(dataDir)[0]!.id}`).click()
      await page.getByTestId('allday-save').click()
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('allday-free-yes').click()
      await expect(page.getByTestId('allday-card')).toBeHidden()
      const line = page.getByTestId('allday-free-set')
      await expect(line).toHaveText('Typ dnia „Wolne” na 3 dniach' + 'Cofnij')
      for (const d of days) await expect.poll(() => dayType(dataDir, d), { timeout: 15_000 }).toBe('wolne')
      await page.getByTestId('allday-line-undo').click()
      await expect(line).toHaveCount(0)
      for (const d of days) await expect.poll(() => dayType(dataDir, d), { timeout: 15_000 }).not.toBe('wolne')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** „Następny tydzień” and the dates of its seven days once its grid is on show (the old grid stays until the new one is counted). */
async function nextWeek(page: Page): Promise<string[]> {
  await page.getByTestId('week-next').click()
  const monday = (await page.getByTestId('week-title').getAttribute('data-week'))!
  await expect(page.getByTestId(`week-day-${monday}`)).toBeVisible({ timeout: 30_000 })
  return weekDates(page)
}
