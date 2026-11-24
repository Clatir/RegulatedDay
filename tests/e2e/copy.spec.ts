/**
 * Kopia Ctrl + przeciągnięciem (D513): z Ctrl wciśniętym w chwili puszczenia oryginał zostaje, a kopia staje w miejscu upuszczenia –
 * na osi dnia (kafelek kopii z „+” w trakcie, kursor z „+”), w „Tygodniu” na inny dzień, z panelu „Sprawy” na oś (nowa sprawa, oryginał
 * zostaje na liście) i w pasie wydarzeń całodniowych; jedno „Cofnij” w dymku zdejmuje kopię. Bez Ctrl – przeciągnięcie jak dotąd.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { newTask } from '../../src/shared/model/requests'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

type Json = Record<string, unknown>
const readJson = (file: string): Json | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Json
  } catch {
    return null
  }
}
const write = (dir: string, rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2))
}
const blocksOf = (dir: string, date: string) => dayFileFrom(readJson(join(dir, paths.day(date))) ?? {}, date).blocks
const recordsIn = (dir: string, folder: string): Json[] =>
  existsSync(join(dir, folder))
    ? readdirSync(join(dir, folder))
        .filter((n) => n.endsWith('.json'))
        .map((n) => readJson(join(dir, folder, n)))
        .filter((r): r is Json => r != null)
    : []
const mondayOf = (date: string): string => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))
const headingOf = (date: string): string => `${['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'][(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]} ${date.slice(8, 10)}.${date.slice(5, 7)}` // as `dayHeading` (`plDayMonth`, zero-padded)
const centreOf = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test('oś dnia (D513): przeciągnięcie z Ctrl – oryginał zostaje, kopia (kafelek z „+” w trakcie) staje o godzinie upuszczenia; „Cofnij” ją zdejmuje; bez Ctrl – przeniesienie', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-copy-day-'))
  const { today } = seedAwake(dataDir, [])
  // Tomorrow's evening (after any session of its template): a block of an hour at 19:00.
  const tomorrow = addDays(today, 1)
  write(dataDir, paths.day(tomorrow), { schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks: [{ id: 'c1', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false, note: 'notatka' }] })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const tile = page.getByTestId('block-c1')
      await expect(tile).toBeVisible({ timeout: 30_000 })
      await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const box = (await tile.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + 10
      // Two hours down (1.1 px a minute), Ctrl pressed while it is held.
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y + 30, { steps: 3 })
      await page.keyboard.down('Control')
      await page.mouse.move(x, y + 132, { steps: 6 })
      const ghost = page.getByTestId('copy-ghost')
      await expect(ghost).toHaveAttribute('data-start', String(21 * 60))
      await expect(page.getByTestId('timeline')).toHaveAttribute('data-copying', 'true')
      // The block itself stays where it is while the copy is held.
      await expect(tile).toContainText('19:00')
      await page.mouse.up()
      await page.keyboard.up('Control')
      await expect.poll(() => blocksOf(dataDir, tomorrow).length, { timeout: 15_000 }).toBe(2)
      const copy = blocksOf(dataDir, tomorrow).find((b) => b.id !== 'c1')!
      expect([copy.startMin, copy.durationMin, copy.note, copy.origin]).toEqual([21 * 60, 60, 'notatka', 'user'])
      expect(blocksOf(dataDir, tomorrow).find((b) => b.id === 'c1')!.startMin).toBe(19 * 60)
      await expect(page.getByTestId(`block-${copy.id}`)).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('copy-ghost')).toHaveCount(0)
      // One „Cofnij”: the copy gone, the original as it was.
      await expect(page.getByText('Skopiowano: Inne obowiązki')).toBeVisible()
      await page.getByTestId('toast-action').click()
      await expect.poll(() => blocksOf(dataDir, tomorrow).map((b) => [b.id, b.startMin]), { timeout: 15_000 }).toEqual([['c1', 19 * 60]])

      // Without Ctrl: the block itself moves (as ever).
      await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const b2 = (await tile.boundingBox())!
      await page.mouse.move(b2.x + b2.width / 2, b2.y + 10)
      await page.mouse.down()
      await page.mouse.move(b2.x + b2.width / 2, b2.y + 40, { steps: 3 })
      await page.mouse.move(b2.x + b2.width / 2, b2.y + 76, { steps: 4 })
      await expect(page.getByTestId('copy-ghost')).toHaveCount(0)
      await page.mouse.up()
      await expect.poll(() => blocksOf(dataDir, tomorrow).map((b) => [b.id, b.startMin]), { timeout: 15_000 }).toEqual([['c1', 20 * 60]])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D513): blok przeciągnięty z Ctrl na inny dzień – kopia tam, oryginał zostaje; „Cofnij” zdejmuje kopię', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-copy-week-'))
  const { today } = seedAwake(dataDir, [])
  // The next week: none of its days gone, none today.
  const tue = addDays(mondayOf(today), 8)
  const wed = addDays(tue, 1)
  write(dataDir, paths.day(tue), { schema: 1, date: tue, blocks: [{ id: 'mv1', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false }] })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      const src = page.getByTestId(`week-block-${tue}-mv1`)
      await expect(src).toBeVisible({ timeout: 30_000 })
      await src.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const box = (await src.boundingBox())!
      const sx = box.x + box.width / 2
      const sy = box.y + 8
      const wedX = (await centreOf(page, `week-col-${wed}`)).x
      await page.mouse.move(sx, sy)
      await page.mouse.down()
      await page.mouse.move(sx + 30, sy + 4, { steps: 4 })
      await page.mouse.move(wedX, sy, { steps: 8 })
      // Ctrl pressed while it is held, without a move: the grid says the drop is a copy.
      await page.keyboard.down('Control')
      await expect(page.getByTestId('week-grid')).toHaveAttribute('data-copying', 'true')
      await expect(page.getByTestId('week-drop')).toHaveAttribute('data-start', String(19 * 60))
      await page.mouse.up()
      await page.keyboard.up('Control')
      await expect.poll(() => blocksOf(dataDir, wed).length, { timeout: 15_000 }).toBe(1)
      const copy = blocksOf(dataDir, wed)[0]!
      expect(copy.id).not.toBe('mv1')
      expect([copy.startMin, copy.durationMin, copy.moves, copy.movedFrom]).toEqual([19 * 60, 60, 0, null])
      // The original stays on Tuesday – no move noted.
      expect(blocksOf(dataDir, tue).map((b) => [b.id, b.startMin])).toEqual([['mv1', 19 * 60]])
      expect(dayFileFrom(readJson(join(dataDir, paths.day(tue))) ?? {}, tue).movedTo).toEqual({})
      await expect(page.getByTestId(`week-block-${wed}-${copy.id}`)).toBeVisible({ timeout: 15_000 })
      await expect(src).toBeVisible()
      await expect(page.getByText(`Skopiowano: Inne obowiązki na ${headingOf(wed)}`)).toBeVisible()
      await page.getByTestId('toast-action').click()
      await expect.poll(() => blocksOf(dataDir, wed).length, { timeout: 15_000 }).toBe(0)
      expect(blocksOf(dataDir, tue).map((b) => b.id)).toEqual(['mv1'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Sprawy (D513): sprawa przeciągnięta z panelu na oś z Ctrl – nowa sprawa w bloku, oryginał zostaje na liście niezaplanowany', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-copy-cases-'))
  const { today } = seedAwake(dataDir, [])
  write(dataDir, paths.record('request', 't1'), newTask('t1', Date.now(), today, { title: 'Napisać raport', list: 'today', note: 'szczegóły' }))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('cases-panel-today')).toContainText('Napisać raport', { timeout: 30_000 })
      await page.getByTestId('timeline-axis').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      const axis = (await page.getByTestId('timeline-axis').boundingBox())!
      const lo = Number(await page.getByTestId('timeline-axis').getAttribute('data-lo'))
      const ppm = Number(await page.getByTestId('timeline-axis').getAttribute('data-ppm'))
      const chip = await centreOf(page, 'case-chip')
      await page.mouse.move(chip.x, chip.y)
      await page.mouse.down()
      await page.mouse.move(chip.x - 12, chip.y + 4, { steps: 3 })
      await page.keyboard.down('Control')
      await page.mouse.move(axis.x + axis.width / 3, axis.y + (10 * 60 - lo) * ppm + 1, { steps: 8 })
      // Held with Ctrl: „+” before the title.
      await expect(page.getByTestId('case-drag')).toHaveAttribute('data-copy', 'true')
      await expect(page.getByTestId('case-drag')).toContainText('+ Napisać raport')
      await page.mouse.up()
      await page.keyboard.up('Control')
      await expect.poll(() => recordsIn(dataDir, 'requests').length, { timeout: 15_000 }).toBe(2)
      const copy = recordsIn(dataDir, 'requests').find((r) => r.id !== 't1')!
      const original = recordsIn(dataDir, 'requests').find((r) => r.id === 't1')!
      expect([copy.title, copy.note, copy.day]).toEqual(['Napisać raport', 'szczegóły', today])
      expect(original.block ?? null).toBeNull()
      const [block] = blocksOf(dataDir, today)
      expect([block!.task, block!.startMin]).toEqual([copy.id, 600])
      await expect(page.getByText('Skopiowano: Napisać raport')).toBeVisible()
      // Both on „Dziś”: the copy „zaplanowane”, the original not.
      await expect(page.getByTestId('cases-panel-today').getByTestId('case-chip')).toHaveCount(2)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('wydarzenia całodniowe (D513): belka przeciągnięta z Ctrl o dwa dni – kopia tyle samo dni długa, oryginał zostaje; „Cofnij” ją usuwa', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-copy-allday-'))
  const { today } = seedAwake(dataDir, [])
  const tue = addDays(mondayOf(today), 8)
  const wed = addDays(tue, 1)
  const thu = addDays(tue, 2)
  const fri = addDays(tue, 3)
  write(dataDir, paths.record('allDay', 'e1'), { schema: 1, id: 'e1', title: 'Wyjazd', startDate: tue, endDate: wed, calendarId: null, color: 'teal', note: '', free: false })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      const bar = page.getByTestId('allday-bar-e1')
      await expect(bar).toBeVisible({ timeout: 30_000 })
      const from = await centreOf(page, `allday-cell-${tue}`)
      const to = await centreOf(page, `allday-cell-${thu}`)
      const b = (await bar.boundingBox())!
      await page.mouse.move(from.x, b.y + b.height / 2)
      await page.mouse.down()
      await page.keyboard.down('Control')
      await page.mouse.move(from.x + 20, b.y + b.height / 2, { steps: 3 })
      await page.mouse.move(to.x, b.y + b.height / 2, { steps: 6 })
      const band = page.getByTestId('allday-copy')
      await expect(band).toHaveAttribute('data-from', thu)
      await expect(band).toHaveAttribute('data-to', fri)
      await page.mouse.up()
      await page.keyboard.up('Control')
      await expect.poll(() => recordsIn(dataDir, 'allday').length, { timeout: 15_000 }).toBe(2)
      const copy = recordsIn(dataDir, 'allday').find((r) => r.id !== 'e1')!
      expect([copy.title, copy.startDate, copy.endDate, copy.color]).toEqual(['Wyjazd', thu, fri, 'teal'])
      expect(recordsIn(dataDir, 'allday').find((r) => r.id === 'e1')).toMatchObject({ startDate: tue, endDate: wed })
      // No card opened by the release.
      await expect(page.getByTestId('allday-card')).toHaveCount(0)
      await expect(page.getByText('Skopiowano: Wyjazd')).toBeVisible()
      await page.getByTestId('toast-action').click()
      await expect.poll(() => recordsIn(dataDir, 'allday').map((r) => r.id), { timeout: 15_000 }).toEqual(['e1'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
