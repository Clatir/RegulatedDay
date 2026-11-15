/**
 * ✎ w panelu bloku (D514): obok listy „Podkategoria” otwiera okno „Podkategoria <nazwa>” z polami wybranej podkategorii; „Zapisz” zmienia
 * koszt od dziś – mimo „od jutra” w Ustawieniach – więc kafelek bloku od razu pokazuje nowy koszt; okno mówi, ile bloków zmieni;
 * Esc i „Anuluj” nie zmieniają nic.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const settingsOf = (dir: string): Array<{ from: string; at: number | null; patch: { categories?: Record<string, { costs?: Record<string, number> }> } }> => {
  try {
    return (JSON.parse(readFileSync(join(dir, paths.settings), 'utf8')) as { settings?: never[] }).settings ?? []
  } catch {
    return []
  }
}

test('✎ przy podkategorii (D514): okno wypełnione, Esc nic nie zmienia, „Zapisz” zmienia koszt od dziś i kafelek go pokazuje', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-edit-thing-'))
  const { today } = seedAwake(dataDir, [{ id: 'k1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('block-k1')).toBeVisible({ timeout: 30_000 })
      const cost = page.getByTestId('block-k1-cost')
      await expect(cost).toHaveText(/^1\D+1\D+1\D+1$/)
      await page.getByTestId('block-k1').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      // Esc: nothing changed, nothing saved.
      await page.getByTestId('edit-category').click()
      const dialog = page.getByTestId('edit-category-window')
      await expect(dialog).toContainText('Podkategoria Inne obowiązki')
      await expect(page.getByTestId('new-category-name')).toHaveValue('Inne obowiązki')
      await expect(page.getByTestId('new-cost-head')).toHaveValue('1')
      // D520, D523: the body is the fourth field – 1 for „Inne obowiązki”.
      await expect(page.getByTestId('new-cost-body')).toHaveValue('1')
      await expect(page.getByTestId('edit-scope')).toHaveText('Nic nie zmieniono.')
      const box = (await dialog.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(80)
      await page.getByTestId('new-cost-head').fill('4')
      await page.getByTestId('new-cost-head').press('Tab')
      await expect(page.getByTestId('edit-scope')).toContainText('Zmieni ')
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      expect(settingsOf(dataDir).filter((c) => c.patch.categories?.inne?.costs)).toEqual([])
      await expect(cost).toHaveText(/^1\D+1\D+1\D+1$/)

      // „Zapisz”: from today on, whatever „Od kiedy” says (the default is tomorrow).
      await page.getByTestId('edit-category').click()
      await page.getByTestId('new-cost-head').fill('4')
      await page.getByTestId('new-cost-head').press('Tab')
      await page.getByTestId('new-thing-save').click()
      await expect(dialog).toHaveCount(0)
      await expect(cost).toHaveText(/^4\D+1\D+1\D+1$/, { timeout: 15_000 })
      const change = settingsOf(dataDir).find((c) => c.patch.categories?.inne?.costs)!
      expect(change.from).toBe(today)
      expect(change.at).not.toBeNull()
      expect(change.patch.categories!.inne!.costs).toEqual({ head: 4 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
