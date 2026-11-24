/**
 * „Ostatnio usunięte” (N24): a block removed in „Dziś” and a sprawa removed in „Sprawy” are in „Historia” → „Usunięte · 30 dni”
 * by their names; „Przywróć” puts the block back into its day's file at its hours and makes the sprawa's file again – and then
 * neither is on the list.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const blocksOn = (dir: string, date: string) => {
  try {
    return dayFileFrom(JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')), date).blocks
  } catch {
    return []
  }
}

const BLOCKS = [
  { id: 'k1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false },
  { id: 'k2', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, fixed: false, name: 'Drugi' }
]

test('Historia → „Usunięte · 30 dni” (N24): usunięty blok i sprawa wracają po „Przywróć” i znikają z listy', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-removed-'))
  const { today } = seedAwake(dataDir, BLOCKS)
  const task = paths.record('request', 't1')
  mkdirSync(dirname(join(dataDir, task)), { recursive: true })
  writeFileSync(join(dataDir, task), JSON.stringify({ schema: 1, id: 't1', kind: 'task', title: 'Raport kwartalny', estimateMin: 30, categoryId: 'inne', list: 'inbox', state: 'queued', createdAt: Date.now() }))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      // The block goes (its own „Usuń”).
      await expect(page.getByTestId('block-k2')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('block-k2').click()
      await page.getByTestId('block-remove').click()
      await expect.poll(() => blocksOn(dataDir, today).map((b) => b.id), { timeout: 15_000 }).toEqual(['k1'])
      // The sprawa goes (Del on its row).
      await page.getByTestId('nav-requests').click()
      await expect(page.getByTestId('case-row')).toHaveCount(1, { timeout: 15_000 })
      await page.getByTestId('case-row').first().click({ position: { x: 4, y: 4 } })
      await page.keyboard.press('Delete')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('case-row')).toHaveCount(0)
      await expect.poll(() => existsSync(join(dataDir, task)), { timeout: 15_000 }).toBe(false)

      await page.getByTestId('nav-history').click()
      await page.getByTestId('history-removed-toggle').click()
      const rows = page.getByTestId('removed-row')
      await expect(rows).toHaveCount(2, { timeout: 15_000 })
      const block = rows.filter({ hasText: 'Drugi' })
      await expect(block).toContainText('12:00–12:30')
      await block.getByTestId('removed-restore').click()
      await expect.poll(() => blocksOn(dataDir, today).find((b) => b.id === 'k2')?.startMin ?? null, { timeout: 15_000 }).toBe(12 * 60)
      await expect(rows.filter({ hasText: 'Drugi' })).toHaveCount(0, { timeout: 15_000 })
      await rows.filter({ hasText: 'Raport kwartalny' }).getByTestId('removed-restore').click()
      await expect.poll(() => existsSync(join(dataDir, task)), { timeout: 15_000 }).toBe(true)
      await expect(rows).toHaveCount(0, { timeout: 15_000 })
      await expect(page.getByTestId('removed-none')).toBeVisible()
      // Both are back where they were.
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('block-k2')).toBeVisible({ timeout: 15_000 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
