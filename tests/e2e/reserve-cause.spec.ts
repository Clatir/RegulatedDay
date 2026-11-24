/**
 * The cause of a pool going below the reserve (N20, T2560–T2565): on the axis of „Dziś” the tile of the block at whose time the head
 * first goes below the reserve has a ring in the head's colour and the hint „Tu głowa schodzi poniżej rezerwy (28 → 19)”; the other tile
 * has none. Tomorrow (the wake at 12:00 in `seedAwake`, the energy counted from the assumed check-in – everything at 100): two blocks
 * after the wake, the first one heavy on the head – the time of the test run decides nothing.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('obwódka przy przyczynie (N20): blok, w którym głowa schodzi poniżej rezerwy, ma obwódkę i podpowiedź; inny blok – żadnej', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-reserve-cause-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const heavy = { head: 60, emotions: 0, senses: 0, body: 0 }
  const blocks = [
    { id: 'heavy', categoryId: 'inne', startMin: 13 * 60, durationMin: 90, fixed: false, name: 'Ciężki', costs: heavy },
    { id: 'light', categoryId: 'inne', startMin: 16 * 60, durationMin: 60, fixed: false, name: 'Lekki' }
  ]
  writeFileSync(join(dataDir, paths.day(tomorrow)), JSON.stringify({ schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks }))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      await expect(page.getByTestId('day-title')).not.toContainText('Dziś')
      const heavyTile = page.getByTestId('block-heavy')
      await expect(heavyTile).toBeVisible({ timeout: 30_000 })
      await expect(heavyTile).toHaveAttribute('data-reserve-cause', 'head')
      await expect(page.getByTestId('block-light')).not.toHaveAttribute('data-reserve-cause', /.+/)
      await heavyTile.hover()
      await expect(page.getByTestId('reserve-cause-heavy').getByTestId('reserve-cause-text')).toHaveText(/^Tu głowa schodzi poniżej rezerwy \(\d+ → \d+\)$/)
      await page.getByTestId('block-light').hover()
      await expect(page.getByTestId('reserve-cause-heavy')).toHaveCount(0)
    })
  } finally {
    await app.close()
  }
  expect(errors).toEqual([])
})
