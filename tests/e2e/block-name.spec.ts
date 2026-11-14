/**
 * The name of a block (D430): „+ Blok” opens the panel of a new block with the cursor in „Nazwa”, the block waiting on the axis
 * dashed (D466); the name typed and left (D461: no „Dodaj” – the first committed field saves the block) – the tile says the name in
 * the category's place and the category beside its hours („14:00–15:00 · Inne obowiązki”), the day's file has the name. Tomorrow
 * (the wake at 12:00 in `seedAwake`): a new block in the day's first free place after the wake – a whole hour at any hour the test
 * runs (no exchange, no forecast moving it). D431: Enter in „Nazwa” of a new block saves it.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
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
