/**
 * Steps on the bar (SNT5, D440): a block with steps running – the desktop bar and the window's own bar show „☐ <krok> ·
 * krok 1/2”; the tick (a click, the desktop bar takes no keys – D229) ticks it off in the day's file and shows the next
 * one in every bar, after the last „Wszystkie kroki ✓” without a tick. Runs at any hour: the block starts from its panel.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, viewPage, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('kroki (D440): ptaszek na pasku pulpitu i w pasku okna odhacza krok i pokazuje następny, po ostatnim „Wszystkie kroki ✓”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-steps-'))
  const steps = [
    { id: 's1', title: 'Napisać testy', order: 0 },
    { id: 's2', title: 'Zrobić commit', order: 1 }
  ]
  const { dayFile } = seedAwake(dataDir, [{ id: 'late', categoryId: 'inne', startMin: 27 * 60, durationMin: 30, fixed: false, origin: 'user', steps }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('block-late')).toBeVisible({ timeout: 30_000 })
      // No step line before the block runs.
      await expect(page.getByTestId('bar-step')).toHaveCount(0)
      await page.getByTestId('block-late').click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('bar-step-text')).toHaveText('Napisać testy · krok 1/2', { timeout: 15_000 })
      const bar = await viewPage(app, 'bar')
      await expect(bar.getByTestId('bar-step-text')).toHaveText('Napisać testy · krok 1/2', { timeout: 15_000 })
      await bar.getByTestId('bar-step-tick').click()
      await expect(bar.getByTestId('bar-step-text')).toHaveText('Zrobić commit · krok 2/2')
      await expect(page.getByTestId('bar-step-text')).toHaveText('Zrobić commit · krok 2/2')
      await page.getByTestId('bar-step-tick').click()
      await expect(bar.getByTestId('bar-step-text')).toHaveText('Wszystkie kroki ✓')
      await expect(bar.getByTestId('bar-step-tick')).toHaveCount(0)
      // The ticks are the day's (T786): the block's list stays as it was.
      const file = JSON.parse(readFileSync(dayFile, 'utf8')) as { stepsDone?: unknown; blocks: Array<{ id: string; steps?: unknown }> }
      expect(file.stepsDone).toEqual({ late: { s1: true, s2: true } })
      expect(file.blocks.find((b) => b.id === 'late')!.steps).toEqual(steps)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
