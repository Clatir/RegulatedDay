/**
 * Drzewo kategorii (D510, 1.25-A2): w „Kategoriach” w Ustawieniach – nowa kategoria „Trading”, podkategoria „Analiza” przeniesiona do niej,
 * usunięcie kategorii z podkategorią (okno „Przenieś do …” → „Inne”, potem „Cofnij”) i wariant „Regeneracji” (sposób regeneracji); w panelu
 * bloku jedna lista „Podkategoria” z nagłówkami kategorii. Niezależne od dnia tygodnia: blok własny, wszystko na `logicalToday()`.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { launch, logicalToday, withMainLog } from './app'

/** A folder like the wizard's, today with a block of its own at 10:00 in „Inne obowiązki”. */
function seed(dir: string): void {
  const today = logicalToday()
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
  mkdirSync(join(dir, 'days', today.slice(0, 4)), { recursive: true })
  writeFileSync(join(dir, 'days', today.slice(0, 4), `${today}.json`), JSON.stringify({ schema: 1, date: today, blocks: [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, note: '' }] }))
}

test('drzewo kategorii: nowa kategoria, przeniesienie podkategorii, usunięcie z „Cofnij”, wariant i lista „Podkategoria” z nagłówkami', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-tree-'))
  seed(dataDir)
  const { app, page, userData } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-settings').click()
      const groups = page.getByTestId('group-row')
      await expect(groups).toHaveCount(5)
      // „Sposoby regeneracji” is no section any more.
      await expect(page.getByTestId('settings-regen-ways')).toHaveCount(0)

      // A new category, and „Analiza” moved into it.
      await page.getByTestId('group-new').fill('Trading')
      await page.getByTestId('group-add').click()
      await expect(groups).toHaveCount(6)
      const trading = groups.filter({ hasText: 'Trading' })
      const analiza = page.locator('[data-testid="category-row"][data-category="analiza"]')
      await analiza.getByTestId('category-more').click()
      await analiza.getByTestId('category-group').selectOption({ label: 'Trading' })
      await expect(trading.locator('[data-testid="category-row"][data-category="analiza"]')).toHaveCount(1)

      // Removing it asks (a subcategory is in it): move to „Inne”; then „Cofnij” brings it back.
      await trading.getByTestId('group-remove').click()
      await expect(page.getByTestId('group-remove-dialog')).toBeVisible()
      await expect(page.getByTestId('group-move-to')).toHaveValue('g-inne')
      await page.getByTestId('group-remove-confirm').click()
      await expect(page.getByTestId('group-remove-dialog')).toHaveCount(0)
      await expect(groups).toHaveCount(5)
      await expect(page.locator('[data-testid="group-row"][data-group="g-inne"] [data-category="analiza"]')).toHaveCount(1)
      await page.getByRole('button', { name: 'Cofnij' }).click()
      await expect(groups).toHaveCount(6)
      await expect(trading.locator('[data-testid="category-row"][data-category="analiza"]')).toHaveCount(1)

      // A variant of „Regeneracja” – a way of regeneration, „jak podkategoria”.
      const regen = page.locator('[data-testid="category-row"][data-category="regeneracja"]')
      await regen.getByTestId('category-more').click()
      await regen.getByTestId('variant-new').fill('Kąpiel')
      await regen.getByTestId('variant-add').click()
      const bath = regen.locator('[data-testid="variant-row"]').filter({ has: page.locator('input[value="Kąpiel"]') })
      await expect(bath).toHaveCount(1)
      await expect(bath.getByTestId('variant-costs-same')).toHaveAttribute('aria-checked', 'true')

      // The block's panel: one list „Podkategoria” with the categories as headers (the new one included).
      await page.getByTestId('nav-today').click()
      await page.getByTestId('block-w1').click()
      const list = page.getByTestId('block-category')
      await expect(list).toBeVisible()
      await expect(list.locator('optgroup')).toHaveCount(5)
      await expect(list.locator('optgroup').nth(0)).toHaveAttribute('label', 'Praca')
      await expect(list.locator('optgroup[label="Trading"] option')).toHaveText(['Analiza'])
      await expect(page.getByTestId('block-editor').getByText('Podkategoria', { exact: true })).toBeVisible()
    })
  } finally {
    await app.close()
  }
})
