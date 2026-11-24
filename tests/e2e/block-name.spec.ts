/**
 * The name of a block (D430): „+ Blok” opens the panel of a new block with the cursor in „Nazwa”, the block waiting on the axis
 * dashed (D466); the name typed and left (D461: no „Dodaj” – the first committed field saves the block) – the tile says the name in
 * the category's place and the category beside its hours („14:00–15:00 · Inne obowiązki”), the day's file has the name. Tomorrow
 * (the wake at 12:00 in `seedAwake`): a new block in the day's first free place after the wake – a whole hour at any hour the test
 * runs (no exchange, no forecast moving it). D431: Enter in „Nazwa” of a new block saves it.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('nazwa bloku (D430, D431, D461): „+ Blok”, kursor w polu „Nazwa”, opuszczenie pola zapisuje blok – kafelek z nazwą i kategorią przy godzinach; Enter w nazwie nowego bloku zapisuje go', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-block-name-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const tomorrowFile = join(dataDir, paths.day(tomorrow))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      await expect(page.getByTestId('day-title')).not.toContainText('Dziś')
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      const name = page.getByTestId('block-name')
      await expect(name).toBeFocused()
      // The placeholder: what the block is called without a name.
      await expect(name).toHaveAttribute('placeholder', 'Inne obowiązki')
      // D466: the draft waits on the axis, dashed, with its hours; nothing is saved yet.
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await expect(page.getByTestId('block-add')).toHaveCount(0)
      expect(dayFileFrom(JSON.parse(readFileSync(tomorrowFile, 'utf8')), tomorrow).blocks).toEqual([])
      await page.keyboard.type('Analiza rynku')
      // D461: leaving the field is its first committed change – the block is saved.
      await page.keyboard.press('Tab')
      const tile = page.locator('[data-block-title="Analiza rynku"]')
      await expect(tile).toBeVisible({ timeout: 15_000 })
      // Its hours (where the day's first free place is), then the category.
      await expect(tile).toContainText(/\d\d:\d\d–\d\d:\d\d · Inne obowiązki/)
      // The panel stays on the block added, with its name.
      await expect(name).toHaveValue('Analiza rynku')
      await expect
        .poll(() => dayFileFrom(JSON.parse(readFileSync(tomorrowFile, 'utf8')), tomorrow).blocks.map((b) => [b.categoryId, b.name, b.durationMin]))
        .toEqual([['inne', 'Analiza rynku', 60]])
      // D431: the next new block – Enter in its name adds it, no „Dodaj” clicked.
      await page.getByTestId('day-add').click()
      await expect(name).toBeFocused()
      await expect(name).toHaveValue('')
      await page.keyboard.type('Przegląd tygodnia')
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-block-title="Przegląd tygodnia"]')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      await expect
        .poll(() => dayFileFrom(JSON.parse(readFileSync(tomorrowFile, 'utf8')), tomorrow).blocks.map((b) => b.name))
        .toEqual(['Analiza rynku', 'Przegląd tygodnia'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('nazwa bloku (D431): nowy blok na osi „Szablonów” – zapisany od razu, panel z kursorem w polu „Nazwa”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-block-name-tpl-'))
  seedAwake(dataDir, [])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').first().click()
      const hours = page.getByTestId('template-timeline').getByTestId('timeline-hours')
      await hours.scrollIntoViewIfNeeded()
      const box = (await hours.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 15_000 })
      const name = page.getByTestId('block-name')
      await expect(name).toBeFocused()
      await page.keyboard.type('Plan tygodnia')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('template-timeline').locator('[data-block-title="Plan tygodnia"]')).toBeVisible({ timeout: 15_000 })
      // Enter only commits the name of a block already saved: the panel stays.
      await expect(page.getByTestId('block-editor')).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** The own name of block `id` as the day's file holds it (null – none). */
const nameInFile = (file: string, date: string, id: string): string | null => dayFileFrom(JSON.parse(readFileSync(file, 'utf8')), date).blocks.find((b) => b.id === id)?.name ?? null

test('nazwa w miejscu (N9): F2 na zaznaczonym bloku „Dziś” – wpis i Enter zmieniają nazwę w pliku dnia, Esc nic nie zmienia, puste pole zdejmuje nazwę; dwuklik w nazwę kafelka – to samo, zapis przy kliknięciu obok', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-block-rename-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const tomorrowFile = join(dataDir, paths.day(tomorrow))
  // Tomorrow (the wake at 12:00): a block of the day's own, named, at an hour after it – the time of the test run decides nothing.
  writeFileSync(tomorrowFile, JSON.stringify({ schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks: [{ id: 'r1', categoryId: 'inne', startMin: 13 * 60, durationMin: 60, fixed: false, name: 'Raport' }] }))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      await expect(page.getByTestId('day-title')).not.toContainText('Dziś')
      const tile = page.getByTestId('block-r1')
      await expect(tile).toHaveAttribute('data-block-title', 'Raport', { timeout: 15_000 })
      // A click selects the block (its panel opens); F2 puts the field over its name, with the name selected.
      await tile.click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await page.keyboard.press('F2')
      const field = page.getByTestId('tile-name')
      await expect(field).toBeFocused()
      await expect(field).toHaveValue('Raport')
      await page.keyboard.type('Raport kwartalny')
      await page.keyboard.press('Enter')
      await expect(field).toHaveCount(0)
      await expect.poll(() => nameInFile(tomorrowFile, tomorrow, 'r1')).toBe('Raport kwartalny')
      await expect(tile).toHaveAttribute('data-block-title', 'Raport kwartalny')
      // The panel shows the same name – one record.
      await expect(page.getByTestId('block-name')).toHaveValue('Raport kwartalny')
      // Esc: nothing changes, and only the field closes – the panel stays.
      await page.keyboard.press('F2')
      await expect(field).toBeFocused()
      await page.keyboard.type('Inna nazwa')
      await page.keyboard.press('Escape')
      await expect(field).toHaveCount(0)
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(tile).toHaveAttribute('data-block-title', 'Raport kwartalny')
      expect(nameInFile(tomorrowFile, tomorrow, 'r1')).toBe('Raport kwartalny')
      // An empty field takes the name away: the block is named as its category again.
      await page.keyboard.press('F2')
      await page.keyboard.press('Delete')
      await page.keyboard.press('Enter')
      await expect(field).toHaveCount(0)
      await expect.poll(() => nameInFile(tomorrowFile, tomorrow, 'r1')).toBeNull()
      await expect(tile).toHaveAttribute('data-block-title', 'Inne obowiązki')
      // A double click on the name: the field with the category's name as the placeholder; a click beside saves it.
      await tile.locator('[data-tile-name]').dblclick()
      await expect(field).toBeFocused()
      await expect(field).toHaveAttribute('placeholder', 'Inne obowiązki')
      await expect(field).toHaveValue('')
      await page.keyboard.type('Spotkanie')
      await page.getByTestId('day-title').click()
      await expect(field).toHaveCount(0)
      await expect.poll(() => nameInFile(tomorrowFile, tomorrow, 'r1')).toBe('Spotkanie')
      await expect(tile).toHaveAttribute('data-block-title', 'Spotkanie')
      // The keys of the field are its own: Delete in it deletes a letter, the block stays.
      await page.keyboard.press('F2')
      await page.keyboard.press('Delete')
      await page.keyboard.press('Escape')
      await expect(tile).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('nazwa w miejscu (N9): „Tydzień” – dwuklik w nazwę kafelka zmienia nazwę w pliku dnia i zostaje w „Tygodniu”; F2 na bloku zaznaczonym Ctrl+klikiem; Esc nic nie zmienia', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-block-rename-week-'))
  const { today, dayFile } = seedAwake(dataDir, [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, name: 'Raport' }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      const tile = page.getByTestId(`week-block-${today}-w1`)
      await expect(tile).toBeVisible({ timeout: 30_000 })
      await expect(tile).toContainText('Raport')
      const field = page.getByTestId('tile-name')
      await tile.locator('[data-tile-name]').dblclick()
      await expect(field).toBeFocused()
      await expect(field).toHaveValue('Raport')
      await page.keyboard.type('Raport tygodniowy')
      await page.keyboard.press('Enter')
      await expect(field).toHaveCount(0)
      await expect.poll(() => nameInFile(dayFile, today, 'w1')).toBe('Raport tygodniowy')
      await expect(tile).toContainText('Raport tygodniowy')
      // The double click did not take you to the day: the week stays. (That the click's wait for a second one is cancelled – never fired later – is the
      // jsdom tests' (`tile-rename.test.ts`, `data-open-wait`): a timer of 300 ms cannot be waited out here without a fixed delay.)
      await expect(page.getByTestId('week')).toBeVisible()
      await expect(page.getByTestId('today')).toHaveCount(0)
      // Ctrl+click selects the block without opening it; F2 names it, Esc throws the typing away.
      await tile.click({ modifiers: ['Control'] })
      await page.keyboard.press('F2')
      await expect(field).toBeFocused()
      await page.keyboard.type('Nic z tego')
      await page.keyboard.press('Escape')
      await expect(field).toHaveCount(0)
      await expect(tile).toContainText('Raport tygodniowy')
      expect(nameInFile(dayFile, today, 'w1')).toBe('Raport tygodniowy')
      await expect(page.getByTestId('week')).toBeVisible()
      // An empty field takes the name away.
      await page.keyboard.press('F2')
      await page.keyboard.press('Delete')
      await page.keyboard.press('Enter')
      await expect.poll(() => nameInFile(dayFile, today, 'w1')).toBeNull()
      await expect(tile).toContainText('Inne obowiązki')
      // A single click on the name still opens the day (after a moment – a second click could have come).
      await tile.locator('[data-tile-name]').click()
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
