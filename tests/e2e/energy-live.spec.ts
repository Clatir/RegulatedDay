/**
 * Energia na żywo (N19, T2579–T2582): przeciągnięcie drogiego bloku w „Dziś” na miejsce tuż po innym drogim pokazuje przed puszczeniem podpis
 * „najniższa energia 52 → 44 (G) · przyjęte” (jutro – energia z przyjętego check-inu, D593); Esc przeciągnięcie odwołuje: podpis znika, plik dnia bez
 * zmian po puszczeniu. Jutro (pobudka o 12:00 w `seedAwake`), dwa drogie bloki po pobudce, oba poza sesjami szablonu (08:00–11:00, 14:00–17:00).
 * Czekanie na warunek (`expect` z auto-wait) – podpis przychodzi po policzeniu próbnym, nie po stałej zwłoce.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

/**
 * Two heavy blocks on the head and a rest between the first and the evening: while the rest comes after the first one, the head recovers before the second;
 * the second pulled to right after the first (the rest is pushed on) leaves no time to recover – the lowest of the day falls.
 */
const BLOCKS = [
  { id: 'first', categoryId: 'inne', startMin: 12 * 60 + 15, durationMin: 45, fixed: false, name: 'Pierwszy', costs: { head: 8, emotions: 0, senses: 0, body: 0 } },
  { id: 'rest', categoryId: 'regeneracja', startMin: 13 * 60, durationMin: 45, fixed: false, name: 'Odpoczynek' },
  { id: 'second', categoryId: 'inne', startMin: 17 * 60 + 30, durationMin: 45, fixed: false, name: 'Drugi', costs: { head: 8, emotions: 0, senses: 0, body: 0 } }
]

/** The block `id` held and pulled onto the hour `toMin` (the tile's top at it), by the way a hand goes: in steps, the button down. */
async function hold(page: Page, id: string, fromMin: number, toMin: number) {
  const tile = page.getByTestId(`block-${id}`)
  await tile.scrollIntoViewIfNeeded()
  const box = (await tile.boundingBox())!
  const x = box.x + 18
  const y = box.y + 14
  await page.mouse.move(x, y)
  await page.mouse.down()
  // 1.1 px a minute (`PPM` of the axis).
  const dy = (toMin - fromMin) * 1.1
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (dy * i) / 10)
}

test('energia na żywo (N19): drogi blok pociągnięty tuż po innym – podpis ze spadkiem przed puszczeniem; Esc – podpis znika, plik dnia bez zmian', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-energy-live-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const file = join(dataDir, paths.day(tomorrow))
  writeFileSync(file, JSON.stringify({ schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks: BLOCKS }))
  const before = readFileSync(file, 'utf8')
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      await expect(page.getByTestId('day-title')).not.toContainText('Dziś')
      await expect(page.getByTestId('block-second')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('energy-trial')).toHaveCount(0)
      // „Drugi” 17:30 pulled to 13:00 – right after „Pierwszy”: the head has no time to recover between them.
      await hold(page, 'second', 17 * 60 + 30, 13 * 60)
      const caption = page.getByTestId('energy-trial')
      await expect(caption).toHaveText(/^najniższa energia \d+ → \d+ \(G\) · przyjęte$/, { timeout: 10_000 })
      const from = Number(await caption.getAttribute('data-before'))
      const to = Number(await caption.getAttribute('data-after'))
      expect(to).toBeLessThan(from)
      // Nothing is written before the drop.
      expect(readFileSync(file, 'utf8')).toBe(before)
      await page.keyboard.press('Escape')
      await expect(caption).toHaveCount(0)
      await page.mouse.up()
      // Esc ended the drag: the day's file is as it was, the block at its hour.
      await expect(page.getByTestId('energy-trial')).toHaveCount(0)
      expect(readFileSync(file, 'utf8')).toBe(before)
      await expect(page.getByTestId('block-second')).toBeVisible()
    })
  } finally {
    await app.close()
  }
  expect(errors).toEqual([])
})
