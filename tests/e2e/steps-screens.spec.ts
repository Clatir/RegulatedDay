/**
 * Steps in the panel of a block (SNT5, D440): three steps added with Enter (the field stays for the next one), a tick shows
 * „✓ 1/3” on the tile of the axis, the order changes by Alt+↓ and by dragging the handle, a removal says „Cofnij”; what is
 * written: the list in the block (no `done`), the tick in the day's `stepsDone` (T786).
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('kroki (D440): trzy kroki Enterem, ptaszek → „✓ 1/3” na kafelku, kolejność (Alt+↓ i przeciągnięcie), usunięcie z „Cofnij”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-steps-screens-'))
  const { dayFile } = seedAwake(dataDir, [{ id: 'late', categoryId: 'inne', startMin: 27 * 60, durationMin: 30, fixed: false, origin: 'user' }])
  const read = () => JSON.parse(readFileSync(dayFile, 'utf8')) as { stepsDone?: Record<string, Record<string, boolean>>; blocks: Array<{ id: string; steps?: Array<{ id: string; title: string; order: number; done?: boolean }> }> }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('block-late')).toBeVisible({ timeout: 30_000 })
      // No counter on a block without steps.
      await expect(page.getByTestId('block-late').getByTestId('steps-counter')).toHaveCount(0)
      await page.getByTestId('block-late').click()
      const panel = page.getByTestId('block-steps')
      await expect(panel).toBeVisible()
      // Enter adds and stays in the field: three steps without leaving it.
      const add = panel.getByTestId('step-add')
      await add.click()
      for (const [i, title] of ['Napisać testy', 'Przygotować logikę', 'Zrobić commit'].entries()) {
        await add.fill(title)
        await add.press('Enter')
        await expect(panel.getByTestId('step-title')).toHaveCount(i + 1)
        await expect(add).toHaveValue('')
        await expect(add).toBeFocused()
      }
      const titles = () => panel.getByTestId('step-title').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
      await expect.poll(titles).toEqual(['Napisać testy', 'Przygotować logikę', 'Zrobić commit'])
      await expect(panel.getByTestId('steps-counter')).toHaveText('✓ 0/3')
      // A tick: „✓ 1/3” by the heading and on the tile of the axis.
      await panel.getByTestId('step-tick').first().click()
      await expect(panel.getByTestId('steps-counter')).toHaveText('✓ 1/3')
      await expect(page.getByTestId('block-late').getByTestId('steps-counter')).toHaveText('✓ 1/3')
      // Alt+↓ moves the first one a place down (the keyboard's way); the tick goes with its step.
      await panel.getByTestId('step-title').first().press('Alt+ArrowDown')
      await expect.poll(titles).toEqual(['Przygotować logikę', 'Napisać testy', 'Zrobić commit'])
      await expect(panel.getByTestId('step-tick').nth(1)).toBeChecked()
      // The drag: the handle of the last step onto the first one.
      await panel.getByTestId('step-handle').nth(2).dragTo(panel.getByTestId('step').first(), { targetPosition: { x: 40, y: 2 } })
      await expect.poll(titles).toEqual(['Zrobić commit', 'Przygotować logikę', 'Napisać testy'])
      await expect(page.getByTestId('block-late').getByTestId('steps-counter')).toHaveText('✓ 1/3')
      await expect
        .poll(() => {
          const f = read()
          const b = f.blocks.find((x) => x.id === 'late')!
          return [[...b.steps!].sort((x, y) => x.order - y.order).map((s) => s.title), b.steps!.some((s) => 'done' in s), Object.keys(f.stepsDone?.late ?? {}).length]
        })
        .toEqual([['Zrobić commit', 'Przygotować logikę', 'Napisać testy'], false, 1])
      // A removal: „Cofnij” brings the step (and its tick) back.
      await panel.getByTestId('step-remove').nth(2).click()
      await expect.poll(titles).toEqual(['Zrobić commit', 'Przygotować logikę'])
      await expect(page.getByTestId('block-late').getByTestId('steps-counter')).toHaveText('✓ 0/2')
      await page.getByRole('button', { name: 'Cofnij' }).click()
      await expect.poll(titles).toEqual(['Zrobić commit', 'Przygotować logikę', 'Napisać testy'])
      await expect(page.getByTestId('block-late').getByTestId('steps-counter')).toHaveText('✓ 1/3')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
