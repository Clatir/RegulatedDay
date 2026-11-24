/**
 * The cause of a pool going below the reserve (N20, T2560–T2573): on the axis of „Dziś” the tile of the block at whose time the head
 * first goes below the reserve has a ring in the head's colour and the hint „Tu głowa schodzi poniżej rezerwy (28 → 19)”; the other tile
 * has none. Tomorrow (the wake at 12:00 in `seedAwake`, the energy counted from the assumed check-in – everything at 100): two blocks
 * after the wake, the first one heavy on the head – the time of the test run decides nothing. Both stand clear of the sessions the day's template may have (08:00–11:00, 14:00–17:00):
 * a day to come draws its tiles at their planned hours, but the forecast of the energy runs a block that overlaps a fixed session after it – the descent would fall in a gap.
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
    { id: 'heavy', categoryId: 'inne', startMin: 12 * 60 + 15, durationMin: 90, fixed: false, name: 'Ciężki', costs: heavy },
    { id: 'light', categoryId: 'inne', startMin: 17 * 60 + 30, durationMin: 60, fixed: false, name: 'Lekki' }
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

test('obwódka przy przyczynie (N20, T2571): blok pod stałym blokiem biegnie w prognozie po nim – obwódka stoi na jego kafelku (miejsce planu), podpowiedź mówi, gdzie biegnie', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-reserve-cause-fc-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  // The elastic block of 13:00–14:30 is heavy on the head; a fixed block of 14:00–17:00 (as a session of the template would be) takes the front first:
  // the forecast runs the heavy one after it, while its tile stands at its plan's hour (a day to come – the axis does not move it).
  const blocks = [
    { id: 'heavy', categoryId: 'inne', startMin: 13 * 60, durationMin: 90, fixed: false, name: 'Ciężki', costs: { head: 60, emotions: 0, senses: 0, body: 0 } },
    { id: 'stala', categoryId: 'inne', startMin: 14 * 60, durationMin: 180, fixed: true, name: 'Stała' }
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
      await expect(page.getByTestId('block-stala')).not.toHaveAttribute('data-reserve-cause', /.+/)
      await heavyTile.hover()
      await expect(page.getByTestId('reserve-cause-heavy').getByTestId('reserve-cause-text')).toHaveText(/^Tu głowa schodzi poniżej rezerwy \(\d+ → \d+\) · w prognozie \d\d:\d\d–\d\d:\d\d$/)
    })
  } finally {
    await app.close()
  }
  expect(errors).toEqual([])
})
