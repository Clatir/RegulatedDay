/**
 * „Wczytaj PDF zjazdów” (D357, 1.1.0) in the calendar: a PDF (the test identity takes it from RD_E2E_PDF instead of the
 * dialog of Windows) read into a preview, corrected, one day left out, „Zapisz” – the days are zjazdy in the calendar and
 * their classes blocks „<przedmiot> · <forma>” in the day's plan; no question about the weekly analysis (D467). A second
 * test: „Cofnij” of the toast takes the days back, Friday untouched. Independent of the day it runs at (T528): the dates of
 * the schedule are made from the logical today. A third test reads the made-up PDF of the fixtures (every row with its own warnings) and cancels – nothing
 * is written; a fourth: a file that is no PDF gives the message and no preview.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { addDays, weekday } from '../../src/shared/time/zone'
import { date as dateCells, header, pdfOf, row, type Cell } from '../fixtures/zjazdy-pdf'
import { launch, logicalToday, withMainLog } from './app'

const shots = process.env.RD_E2E_SHOTS
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

const NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']
const plDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`

/** The folder set up like the wizard's. */
function seed(dir: string): void {
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
}

/** The schedule of three days to come: a Saturday (a room in the building), the Sunday (TEAMS only) and the Saturday after. */
function schedule(s1: string): Uint8Array {
  const s2 = addDays(s1, 1)
  const s3 = addDays(s1, 7)
  const day = (d: string, y: number, rows: Cell[][]): Cell[] => [...dateCells(y, `${plDate(d)} (${NAMES[weekday(d) - 1]})`), ...header(y - 16), ...rows.flat()]
  const page: Cell[] = [
    ...day(s1, 520, [row(488, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia', 'dr Jan Testowy'), row(472, '9:45-11:15', '19H', 'ćwiczenia', 'Statystyka', 'dr Jan Testowy')]),
    ...day(s2, 440, [row(408, '8:00-9:30', 'TEAMS', 'wykład', 'Prawo gospodarcze', 'dr Piotr Fikcyjny')]),
    ...day(s3, 376, [row(344, '13:15-14:45', '12B', 'ćwiczenia', 'Zarządzanie', 'dr Jan Testowy')])
  ]
  return pdfOf([page])
}

/** The month with `date` in its grid (the grid shows the days around the month, too). */
async function showMonthOf(page: Page, date: string): Promise<void> {
  const cell = page.getByTestId(`day-${date}`)
  for (let i = 0; i < 3 && (await cell.count()) === 0; i++) await page.getByTestId('month-next').click()
  for (let i = 0; i < 6 && (await cell.count()) === 0; i++) await page.getByTestId('month-prev').click()
  await expect(cell).toBeVisible()
}

const dayFile = (dir: string, d: string) => join(dir, 'days', d.slice(0, 4), `${d}.json`)
const readBlocks = (dir: string, d: string): Array<{ name?: string; startMin: number; durationMin: number; origin?: string; fixed?: boolean }> => {
  try {
    return (JSON.parse(readFileSync(dayFile(dir, d), 'utf8')) as { blocks?: Array<{ name?: string; startMin: number; durationMin: number; origin?: string; fixed?: boolean }> }).blocks ?? []
  } catch {
    return []
  }
}
const zjazdBlocks = (dir: string, d: string) => readBlocks(dir, d).filter((b) => b.origin === 'zjazd')

test('zjazdy z PDF: podgląd z poprawkami, zapis wybranych dni, pytanie o analizę, blok „przedmiot · forma”', async () => {
  const today = logicalToday()
  let s1 = addDays(today, 2)
  while (weekday(s1) !== 6) s1 = addDays(s1, 1)
  const s2 = addDays(s1, 1)
  const s3 = addDays(s1, 7)
  const work = mkdtempSync(join(tmpdir(), 'rd-e2e-zjazdy-'))
  const pdf = join(work, 'zjazdy-e2e.pdf')
  writeFileSync(pdf, schedule(s1))
  const dataDir = join(work, 'data')
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir, RD_E2E_PDF: pdf } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await page.getByTestId('calendar-zjazdy').click()

      // The preview: the file, the three days, nothing saved yet.
      await expect(page.getByTestId('zjazdy-preview')).toBeVisible()
      await expect(page.getByTestId('zjazdy-file')).toHaveText('zjazdy-e2e.pdf')
      for (const d of [s1, s2, s3]) await expect(page.getByTestId(`zjazdy-day-${d}`)).toContainText(`${plDate(d)} · ${NAMES[weekday(d) - 1]}`)
      await expect(page.getByTestId(`zjazdy-row-${s1}`)).toHaveCount(2)
      await expect(page.getByTestId('zjazdy-save')).toHaveText('Zapisz (3 dni)')
      // The kind from the rooms: a room in the building – stationary; TEAMS only – remote.
      await expect(page.getByTestId(`zjazdy-kind-${s1}`).getByRole('radio', { name: 'stacjonarny' })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByTestId(`zjazdy-kind-${s2}`).getByRole('radio', { name: 'zdalny' })).toHaveAttribute('aria-checked', 'true')
      expect(zjazdBlocks(dataDir, s1)).toHaveLength(0)
      await shot(page, 'zjazdy-01-podglad')

      // Corrections: the first class ends 5 min later, the second one's subject changed, the last day left out.
      await expect(page.getByTestId(`zjazdy-hours-${s1}-0`)).toHaveText('08:00–09:30')
      await page.getByTestId(`zjazdy-end-plus-${s1}-0`).click()
      await expect(page.getByTestId(`zjazdy-hours-${s1}-0`)).toHaveText('08:00–09:35')
      const subject = page.getByTestId(`zjazdy-subject-${s1}-1`)
      await expect(subject).toHaveValue('Statystyka')
      await subject.fill('Statystyka B')
      await subject.press('Enter')
      await expect(subject).toHaveValue('Statystyka B')
      await page.getByTestId(`zjazdy-load-${s3}`).click()
      await expect(page.getByTestId('zjazdy-save')).toHaveText('Zapisz (2 dni)')
      await shot(page, 'zjazdy-02-poprawione')

      // The preview survives a visit to another screen (a form not saved is kept).
      await page.getByTestId('nav-requests').click()
      await page.getByTestId('nav-calendar').click()
      await expect(page.getByTestId('zjazdy-preview')).toBeVisible()
      await expect(page.getByTestId('zjazdy-save')).toHaveText('Zapisz (2 dni)')

      await page.getByTestId('zjazdy-save').click()
      await expect(page.getByTestId('zjazdy-preview')).toHaveCount(0)

      // A Saturday of the import asks nothing (D467: no weekly analysis to move): the toast with „Cofnij” comes at once.
      await expect(page.getByText('Zapisano 2 dni zjazdów')).toBeVisible()
      await expect(page.getByTestId('ask-analysis')).toHaveCount(0)

      // The calendar: the days of the import are zjazdy of their kind; the day left out is not.
      await showMonthOf(page, s1)
      await expect(page.getByTestId(`day-${s1}`)).toContainText('zjazd stacjonarny')
      await expect(page.getByTestId(`day-${s2}`)).toContainText('zjazd zdalny')
      await expect(page.getByTestId(`day-${s3}`)).not.toContainText('zjazd')
      await shot(page, 'zjazdy-03-kalendarz')
      await expect
        .poll(() => zjazdBlocks(dataDir, s1).map((b) => [b.name, b.startMin, b.durationMin, b.fixed]))
        .toEqual([
          ['Ekonomia · wykład', 480, 95, true],
          ['Statystyka B · ćwiczenia', 585, 90, true]
        ])
      expect(zjazdBlocks(dataDir, s3)).toHaveLength(0)

      // The day's plan has the classes as blocks „przedmiot · forma”.
      await page.getByTestId(`day-${s1}`).click()
      await expect(page.locator('[data-block-title="Ekonomia · wykład"]')).toBeVisible()
      await expect(page.locator('[data-block-title="Statystyka B · ćwiczenia"]')).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('zjazdy z PDF: „Cofnij” cofa dni importu; piątek zostaje bez zmian (bez analizy tygodniowej, D467)', async () => {
  const today = logicalToday()
  let s1 = addDays(today, 2)
  while (weekday(s1) !== 6) s1 = addDays(s1, 1)
  const s2 = addDays(s1, 1)
  const s3 = addDays(s1, 7)
  const friday = addDays(s1, -1)
  const work = mkdtempSync(join(tmpdir(), 'rd-e2e-zjazdy-'))
  const pdf = join(work, 'zjazdy-e2e.pdf')
  writeFileSync(pdf, schedule(s1))
  const dataDir = join(work, 'data')
  seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir, RD_E2E_PDF: pdf } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await page.getByTestId('calendar-zjazdy').click()
      await expect(page.getByTestId('zjazdy-preview')).toBeVisible()
      await page.getByTestId(`zjazdy-load-${s3}`).click()
      await page.getByTestId('zjazdy-save').click()
      await expect(page.getByText('Zapisano 2 dni zjazdów')).toBeVisible()
      await expect(page.getByTestId('ask-analysis')).toHaveCount(0)
      await expect.poll(() => zjazdBlocks(dataDir, s1).length).toBe(2)
      // „Cofnij” at once (the toast stays 10 s): the import goes back.
      await page.getByTestId('toast-action').click()
      await expect(page.getByText('Cofnięto import zjazdów: 2 dni')).toBeVisible()
      await expect.poll(() => zjazdBlocks(dataDir, s1).length).toBe(0)
      await expect.poll(() => zjazdBlocks(dataDir, s2).length).toBe(0)
      await expect.poll(() => readBlocks(dataDir, friday).length).toBe(0)
      await showMonthOf(page, s1)
      await expect(page.getByTestId(`day-${s1}`)).not.toContainText('zjazd')
      await expect(page.getByTestId(`day-${s2}`)).not.toContainText('zjazd')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('zjazdy z PDF: ostrzeżenia parsera w podglądzie, „Anuluj” nic nie zapisuje', async () => {
  const work = mkdtempSync(join(tmpdir(), 'rd-e2e-zjazdy-'))
  const dataDir = join(work, 'data')
  seed(dataDir)
  // The made-up schedule of the fixtures (October 2030): its days are all to come until then.
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir, RD_E2E_PDF: resolve('tests/fixtures/zjazdy.pdf') } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await page.getByTestId('calendar-zjazdy').click()
      await expect(page.getByTestId('zjazdy-preview')).toBeVisible()
      await expect(page.getByTestId('zjazdy-file')).toHaveText('zjazdy.pdf')
      await expect(page.getByTestId('zjazdy-warnings')).toContainText('ok. 12:00')
      await shot(page, 'zjazdy-04-ostrzezenia')
      await expect(page.getByTestId('zjazdy-day-2030-10-12')).toContainText('12.10.2030 · sobota')
      await expect(page.getByTestId('zjazdy-day-2030-10-26')).toContainText('26.10.2030 · sobota')
      // A row left out: the day with no row left cannot be loaded.
      await page.getByTestId('zjazdy-remove-2030-10-12-0').click()
      await expect(page.getByTestId('zjazdy-blocked-2030-10-12')).toHaveText('wszystkie wiersze usunięte')
      await page.getByTestId('zjazdy-cancel').click()
      await expect(page.getByTestId('zjazdy-preview')).toHaveCount(0)
      await expect(page.getByTestId('month-grid')).toBeVisible()
    })
    expect(errors).toEqual([])
    expect(zjazdBlocks(dataDir, '2030-10-12')).toHaveLength(0)
    expect(readBlocks(dataDir, '2030-10-13')).toHaveLength(0)
  } finally {
    await app.close()
  }
})

test('zjazdy z PDF: plik, który nie jest PDF-em, daje komunikat i żadnego podglądu', async () => {
  const work = mkdtempSync(join(tmpdir(), 'rd-e2e-zjazdy-'))
  const notPdf = join(work, 'nie-pdf.pdf')
  writeFileSync(notPdf, 'to nie jest plik PDF')
  const { app, page, userData, errors } = await launch({ data: true, env: { RD_E2E_PDF: notPdf } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await page.getByTestId('calendar-zjazdy').click()
      await expect(page.getByRole('status').filter({ hasText: 'Błąd' })).toBeVisible()
      await expect(page.getByTestId('zjazdy-preview')).toHaveCount(0)
      await expect(page.getByTestId('month-grid')).toBeVisible()
    })
    // The toast of the error is no error of the page.
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
