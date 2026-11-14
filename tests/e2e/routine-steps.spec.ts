/**
 * 1.22-A in the panel of „Dziś” (D473, D474, D477): a block of the routine „Poranek” without steps of its own shows the
 * routine's steps in „Kroki” and on its tile; „na gorsze dni” shows that version, „zwykła” the usual one again – picked in the
 * panel or on the routine's card, one version for the block (D479); a tick is the day's (the block is never written by it –
 * the day keeps the routine's list, T1100) and the card's box with it (T1108); the last step of the running block, ticked on
 * the card, saves the routine (the card closes) and ends the block: „Skończono: Poranek · Cofnij”, its tile dimmed with ✓;
 * „Cofnij” lets it run on. Runs at any hour (the block at 03:00 of
 * the night after, started from its panel).
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('kroki rutyny w bloku (D473): kroki rutyny bez kopiowania, wersja na gorsze dni, ostatni krok kończy blok (D474) z ✓ na osi (D477)', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-routine-steps-'))
  // A block of the routine as a template makes it: no steps of its own.
  const { dayFile } = seedAwake(dataDir, [{ id: 'rut', categoryId: 'rutyny', startMin: 27 * 60, durationMin: 30, fixed: false, origin: 'user', routine: 'poranek' }])
  mkdirSync(join(dataDir, 'routines'), { recursive: true })
  const routine = { schema: 1, id: 'poranek', name: 'Poranek', archived: false, worse: [{ id: 'w', name: 'Leki', min: 5 }], normal: [
    { id: 'a', name: 'Prysznic', min: 10 },
    { id: 'b', name: 'Śniadanie', min: 20 }
  ] }
  writeFileSync(join(dataDir, 'routines', 'poranek.json'), JSON.stringify(routine))
  const read = () =>
    JSON.parse(readFileSync(dayFile, 'utf8')) as {
      stepsDone?: Record<string, Record<string, boolean>>
      routineSteps?: Record<string, { routine: string; version: string; steps: Array<{ id: string; title: string }> }>
      blocks: Array<{ id: string; steps?: unknown }>
    }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      const tile = page.getByTestId('block-rut')
      await expect(tile).toBeVisible({ timeout: 30_000 })
      // The routine's steps counted on the tile before the panel opens.
      await expect(tile.getByTestId('steps-counter')).toHaveText('✓ 0/2')
      await tile.click()
      const panel = page.getByTestId('block-steps')
      const titles = () => panel.getByTestId('step-title').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
      await expect.poll(titles).toEqual(['Prysznic', 'Śniadanie'])
      await expect(panel.getByTestId('steps-counter')).toHaveText('✓ 0/2')
      // „Na gorsze dni” – one click: that version's list, kept by the day; „zwykła” – the usual one again.
      const version = panel.getByTestId('steps-routine-version')
      await version.getByRole('radio', { name: 'na gorsze dni' }).click()
      await expect.poll(titles).toEqual(['Leki'])
      await expect.poll(() => read().routineSteps?.rut?.version).toBe('worse')
      await version.getByRole('radio', { name: 'zwykła' }).click()
      await expect.poll(titles).toEqual(['Prysznic', 'Śniadanie'])
      await expect.poll(() => read().routineSteps?.rut?.version).toBe('normal')
      await page.getByTestId('block-timer-start').click()
      // The bar's step line has the routine's steps too (D473); the block begun – its routine's card (D328) with the same list.
      await expect(page.getByTestId('bar-step-text')).toHaveText('Prysznic · krok 1/2', { timeout: 15_000 })
      const card = page.getByTestId('routine-card')
      await expect(card).toHaveCount(1)
      // One version for the block (D479, T1108): picked on the card – the panel shows it too; back again.
      await card.getByTestId('routine-card-version').getByText('na gorsze dni').click()
      await expect.poll(titles).toEqual(['Leki'])
      await card.getByTestId('routine-card-version').getByText('zwykła').click()
      await expect.poll(titles).toEqual(['Prysznic', 'Śniadanie'])
      // A tick in the panel: the day's – the card's box too; the block in the file stays without steps of its own (T786, T1100).
      await panel.getByTestId('step-tick').first().click()
      await expect(panel.getByTestId('steps-counter')).toHaveText('✓ 1/2')
      await expect(tile.getByTestId('steps-counter')).toHaveText('✓ 1/2')
      await expect(card.getByTestId('routine-card-step-a')).toBeChecked()
      await expect.poll(() => read().stepsDone?.rut).toEqual({ a: true })
      expect(read().blocks.find((b) => b.id === 'rut')!.steps).toBeUndefined()
      // The last step ticked on the card (seen in the panel): the routine saved – the card closes – and the block ends now
      // (D474) – „Skończono: Poranek · Cofnij”; D477: its tile dimmed with ✓ before the name.
      await card.getByTestId('routine-card-step-b').click()
      const toast = page.getByRole('status').filter({ hasText: 'Skończono: Poranek' })
      await expect(toast).toBeVisible({ timeout: 15_000 })
      await expect(panel.getByTestId('steps-counter')).toHaveText('✓ 2/2')
      await expect(card).toHaveCount(0)
      await expect(tile.getByTestId('block-finished')).toBeVisible()
      await expect(tile).toHaveAttribute('data-dim', 'on')
      await expect(page.getByTestId('bar-step')).toHaveCount(0)
      // „Cofnij”: it runs on, the step stays ticked off.
      await toast.getByRole('button', { name: 'Cofnij' }).click()
      await expect(page.getByTestId('bar-step-text')).toHaveText('Wszystkie kroki ✓', { timeout: 15_000 })
      await expect(tile.getByTestId('block-finished')).toHaveCount(0)
      await expect(panel.getByTestId('steps-counter')).toHaveText('✓ 2/2')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
