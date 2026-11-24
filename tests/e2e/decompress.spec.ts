/**
 * N7 – „Bufory dekompresji” (D386, D403, D569): off by default – the plan as it is; switched on in „Plan dnia” (from tomorrow, the bar of the
 * settings), the day after a costly block of 90 min has a tile „Dekompresja” (the cup, the sea green) and the block after it pushed apart;
 * „Usuń” takes the buffer away for the day, „Cofnij” brings it back.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const write = (dir: string, rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2))
}
const fileOf = (dir: string, date: string) => JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')) as { cancelled?: Record<string, true> | string[]; blocks: Array<{ id: string; startMin: number }> }

test('bufory dekompresji: domyślnie wyłączone; włączone – „Dekompresja” po kosztownym bloku, kolejny przesunięty; „Usuń” i „Cofnij”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-decompress-'))
  const { today } = seedAwake(dataDir, [])
  // Tomorrow, a weekend day (no sessions): a meeting 19:00–20:30 at an emotions' cost 4, a block of work at 20:30.
  const tomorrow = addDays(today, 1)
  write(dataDir, paths.day(tomorrow), {
    schema: 1,
    date: tomorrow,
    dayType: 'weekend',
    wakeMin: 12 * 60,
    blocks: [
      { id: 'meet', categoryId: 'inne', startMin: 19 * 60, durationMin: 90, fixed: false, costs: { head: 0, emotions: 4, senses: 0, body: 0 }, name: 'Spotkanie' },
      { id: 'x', categoryId: 'inne', startMin: 20 * 60 + 30, durationMin: 30, fixed: false, name: 'Po spotkaniu' }
    ]
  })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      await expect(page.getByTestId('block-x')).toContainText('20:30', { timeout: 30_000 })
      // D569: off by default – no buffer.
      await expect(page.locator('[data-decompress="true"]')).toHaveCount(0)

      // Ustawienia → „Plan dnia” → „Bufory dekompresji” (from tomorrow).
      await page.getByTestId('nav-settings').click()
      await page.getByTestId('toc-settings-plan').click()
      const toggle = page.getByTestId('settings-plan').getByTestId('setting-decompress.on')
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await expect(page.getByTestId('settings-plan').getByTestId('field-decompress.minLengthMin')).toBeVisible()
      await expect(page.getByTestId('settings-plan').getByTestId('field-decompress.minCost')).toBeVisible()
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')

      // „Dziś” keeps the day it showed (tomorrow).
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('block-x')).toBeVisible({ timeout: 30_000 })
      const buffer = page.locator('[data-decompress="true"]')
      await expect(buffer).toHaveCount(1, { timeout: 30_000 })
      await expect(buffer).toContainText('Dekompresja')
      // A tile of 15 min is low: its start only.
      await expect(buffer).toContainText('20:30')
      await expect(buffer.getByTestId('decompress-icon')).toHaveCount(1)
      await expect(page.getByTestId('block-x')).toContainText('20:45')

      // „Usuń” – cancelled for the day (one entry of the day's file), the block after it where you put it; „Cofnij” – back.
      await buffer.click()
      await page.getByTestId('block-remove').click()
      await expect(page.locator('[data-decompress="true"]')).toHaveCount(0, { timeout: 15_000 })
      await expect(page.getByTestId('block-x')).toContainText('20:30')
      await expect.poll(() => Object.keys(fileOf(dataDir, tomorrow).cancelled ?? {}).length, { timeout: 15_000 }).toBe(1)
      await page.getByRole('status').getByTestId('toast-action').first().click()
      await expect(page.locator('[data-decompress="true"]')).toHaveCount(1, { timeout: 15_000 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
