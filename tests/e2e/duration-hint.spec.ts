/**
 * „Długość z historii” (N6, D569, D625): with five blocks of „Inne” finished on days gone by, each of 45 min (their logs seeded – T528: the
 * clock is the real one), the panel of a new block of „Inne” (an hour) on tomorrow says „zwykle trwa 45 min · Przyjmij”; „Przyjmij” saves the
 * block with 45 min as the field would (the first committed field of a draft, D461). Switched off in „Ustawienia → Plan dnia” – no hint.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { placeLogical } from '../../src/shared/time/day'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const blocksOn = (dir: string, date: string) => {
  try {
    return dayFileFrom(JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')), date).blocks
  } catch {
    return []
  }
}

/** A block of „Inne” from 09:00 for `minutes`, started by a click and ended by „Skończyłem”, on each of the days. */
function seedHistory(dir: string, days: string[], minutes: number): void {
  for (const day of days) {
    const lines: string[] = []
    let n = 0
    const ev = (k: string, at: number, extra: Record<string, unknown>) => lines.push(JSON.stringify({ id: `seed-${day}-${n}`, c: 'seed', n: n++, t: at, l: at, v: 1, day, dom: 'timer', k, at, ...extra }))
    const from = placeLogical(day, 9 * 60)
    ev('block.start', from, { block: `h-${day}`, bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: 60, fixed: false }, confirmUntil: null, how: 'click' })
    ev('block.end', from + minutes * 60_000, { block: `h-${day}`, done: true, rule: null, fin: true })
    mkdirSync(join(dir, paths.logDir(day)), { recursive: true })
    writeFileSync(join(dir, paths.log(day, 'seed')), lines.join('\n') + '\n')
  }
}

test('podpowiedź długości (N6): 5 bloków „Inne” po 45 min – „zwykle trwa 45 min · Przyjmij” przy nowym bloku, „Przyjmij” zapisuje 45; wyłączona w Ustawieniach – brak', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-duration-hint-'))
  const { today } = seedAwake(dataDir, [])
  seedHistory(dataDir, [1, 2, 3, 5, 8].map((b) => addDays(today, -b)), 45)
  const tomorrow = addDays(today, 1)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      await expect(page.getByTestId('day-title')).not.toContainText('Dziś')
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-duration')).toHaveValue('1 h')
      const hint = page.getByTestId('duration-hint')
      await expect(hint).toHaveText('zwykle trwa 45 min · Przyjmij', { timeout: 15_000 })
      await expect(hint).toHaveAttribute('title', 'mediana z 5 bloków w 90 dniach')
      await page.getByTestId('duration-hint-accept').click()
      await expect.poll(() => blocksOn(dataDir, tomorrow).map((b) => [b.categoryId, b.durationMin]), { timeout: 15_000 }).toEqual([['inne', 45]])
      await expect(page.getByTestId('block-duration')).toHaveValue('45 min')
      await expect(hint).toHaveCount(0)
      await page.getByTestId('block-editor-close').click()

      // Switched off in „Ustawienia → Plan dnia”: a new block of an hour has no hint.
      await page.getByTestId('nav-settings').click()
      const toggle = page.getByTestId('setting-durationHints')
      await toggle.scrollIntoViewIfNeeded()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await page.getByTestId('nav-today').click()
      await page.getByTestId('day-next').click()
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-duration')).toHaveValue('1 h')
      await expect(page.getByTestId('duration-hint')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
