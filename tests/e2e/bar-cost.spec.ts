/**
 * „Koszt ▸” of the bar's „⋯” (D585, N12) in the app: a block begun from its panel (it works at any hour – the block at 02:00 of the night
 * after, the day without the night's quiet), its cost changed from the main window's bar (a step, a typed number) and from the desktop bar
 * (a step with Shift – ±10; the desktop bar has no field) – each a `block.cost` of the main process in the day's log, the block's tile in
 * „Dziś” saying the new cost from now on; „Jak podkategoria (…)” gives the own cost up (`costs: null`).
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { logicalMinuteOf } from '../../src/shared/time/day'
import { launch, logicalToday, viewPage, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('koszt trwającego bloku z paska (D585): krok w pasku okna, Shift+[+] na pasku pulpitu, wpisana liczba, „Jak podkategoria” – kafelek „Dziś” i log', async () => {
  // The cost of a block of a day gone by is never changed (T2509): not in the last 20 min of the logical day (its end at 04:00).
  test.skip(logicalMinuteOf(logicalToday(), Date.now()) > 28 * 60 - 20, 'doba logiczna kończy się o 04:00 – blok byłby z dnia minionego')
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-bar-cost-'))
  const { today } = seedAwake(dataDir, [{ id: 'k', categoryId: 'inne', startMin: 26 * 60, durationMin: 60, fixed: false, origin: 'user' }])
  /** The changes of the block's cost in today's logs (every computer's file), in the order written. */
  const logged = () => {
    const dir = join(dataDir, 'log', today.slice(0, 4), today)
    let names: string[] = []
    try {
      names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'))
    } catch {
      return []
    }
    return names.flatMap((n) =>
      readFileSync(join(dir, n), 'utf8')
        .split('\n')
        .filter((l) => l.includes('"block.cost"'))
        .map((l) => (JSON.parse(l) as { costs: unknown }).costs)
    )
  }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      const tile = page.getByTestId('block-k-cost')
      await expect(tile).toHaveText('1 · 1 · 1 · 1', { timeout: 30_000 })
      const main = page.getByTestId('bar-main')
      // Nothing begun: no „Koszt ▸” in „⋯”.
      await main.getByTestId('bar-group-more').click()
      await expect(main.getByTestId('bar-more-actions')).toBeVisible()
      await expect(main.getByTestId('bar-group-cost')).toHaveCount(0)
      await main.getByTestId('bar-group-more').click()
      await page.getByTestId('block-k').click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('block-timer-start')).toHaveCount(0, { timeout: 15_000 })

      // The main window's bar: „⋯” → „Koszt ▸” → [+] of the head.
      await main.getByTestId('bar-group-more').click()
      await main.getByTestId('bar-group-cost').click()
      await expect(main.getByTestId('bar-cost-title')).toHaveText('Koszt od teraz: Inne obowiązki')
      await expect(main.getByTestId('bar-cost-reset')).toHaveText('Jak podkategoria (1·1·1·1)')
      await main.getByTestId('bar-cost-head-plus').click()
      await expect(tile).toHaveText('2 · 1 · 1 · 1', { timeout: 15_000 })
      await expect(main.getByTestId('bar-cost-head-value')).toHaveValue('2')

      // The desktop bar: no field; [+] with Shift – 10 at once.
      const bar = await viewPage(app, 'bar')
      await bar.getByTestId('bar-group-more').click()
      await bar.getByTestId('bar-group-cost').click()
      await expect(bar.getByTestId('bar-cost-head-value')).toHaveText('2')
      await expect(bar.getByTestId('bar-cost').locator('input')).toHaveCount(0)
      await bar.getByTestId('bar-cost-senses-plus').click({ modifiers: ['Shift'] })
      await expect(tile).toHaveText('2 · 1 · 11 · 1', { timeout: 15_000 })
      await expect(bar.getByTestId('bar-cost-senses-value')).toHaveText('11')

      // A number typed in the main window's bar; then „Jak podkategoria” – the category's cost again.
      await main.getByTestId('bar-cost-body-value').fill('5')
      await main.getByTestId('bar-cost-body-value').press('Enter')
      await expect(tile).toHaveText('2 · 1 · 11 · 5', { timeout: 15_000 })
      await main.getByTestId('bar-cost-reset').click()
      await expect(tile).toHaveText('1 · 1 · 1 · 1', { timeout: 15_000 })
      await expect(bar.getByTestId('bar-cost-head-value')).toHaveText('1')
      await bar.getByTestId('bar-cost-done').click()
      await expect(bar.getByTestId('bar-cost')).toHaveCount(0)
      await expect
        .poll(logged, { timeout: 40_000 })
        .toEqual([
          { head: 2, emotions: 1, senses: 1, body: 1 },
          { head: 2, emotions: 1, senses: 11, body: 1 },
          { head: 2, emotions: 1, senses: 11, body: 5 },
          null
        ])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
