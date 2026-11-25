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
      // By its name field: the text „Trading” is also an option of every open row's „Kategoria” (the row of „Analiza” in „Praca” before
      // the move is drawn).
      const trading = groups.filter({ has: page.locator('[data-testid="group-name"][value="Trading"]') })
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
      // D525, D520: the subcategory's row names the four pools before their fields.
      await expect(regen.locator('label').filter({ has: page.locator('input') })).toHaveText([/^głowa/, /^emocje/, /^bodźce/, /^ciało/])
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

test('zaznaczanie w „Kategoriach” (D608, D609): 6 podkategorii Ctrl+klik → „Zmień 6” → „Koszt…” → ciało 2 od jutra, dziś bez zmiany, „Cofnij” przywraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-tree-group-'))
  seed(dataDir)
  const { app, page, userData } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-settings').click()
      // Six subcategories with no body cost (D523): „Praca”, „Nauka”, „Wolne”.
      const six = [
        ['analiza', 'Analiza'],
        ['journaling', 'Journaling'],
        ['sesja', 'Sesja tradingowa'],
        ['nauka', 'Nauka (NotebookLM)'],
        ['ogladanie', 'Oglądanie wykładu'],
        ['projekty', 'Projekty']
      ] as const
      const row = (id: string) => page.locator(`[data-testid="category-row"][data-category="${id}"]`)
      const body = (id: string, name: string) => row(id).getByLabel(`${name}: ciało`, { exact: true })
      for (const [id, name] of six) await expect(body(id, name)).toHaveValue('0')
      // A click on the row's frame (beside its fields) selects it; Ctrl adds the next ones.
      await row(six[0][0]).click({ position: { x: 3, y: 3 } })
      for (const [id] of six.slice(1)) await row(id).click({ position: { x: 3, y: 3 }, modifiers: ['Control'] })
      await expect(page.locator('[data-tree-item][data-selected="true"]')).toHaveCount(6)
      await expect(page.getByTestId('tree-selection')).toContainText('Zaznaczone: 6')

      // The bar stands above the tree, scrolled away by the clicks on the rows: scroll to it first and let the scroll event come
      // (one frame later) before the click – a menu closes on any scroll, and Playwright scrolls and clicks in the same frame (T2940).
      await page.getByTestId('tree-selection-menu').scrollIntoViewIfNeeded()
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await page.getByTestId('tree-selection-menu').click()
      await expect(page.getByTestId('tree-menu')).toContainText('Zmień 6 podkategorii')
      await page.getByTestId('tree-menu-cost').click()
      const dialog = page.getByTestId('tree-cost')
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId('tree-cost-body-state')).toHaveText('✓')
      await expect(page.getByTestId('tree-cost-head-state')).toHaveText('—')
      await page.getByTestId('tree-cost-body-plus').click()
      await page.getByTestId('tree-cost-body-plus').click()
      await expect(page.getByTestId('tree-cost-body-value')).toHaveValue('2')
      await page.getByTestId('tree-cost-apply').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('group-line-settings')).toContainText('Zmieniono 6 podkategorii')

      // From tomorrow (the bar's default): 2; today („od dziś” shows the settings in force now) – still 0.
      for (const [id, name] of six) await expect(body(id, name)).toHaveValue('2')
      const from = page.getByTestId('settings-from')
      await from.getByRole('radio', { name: 'od dziś' }).click()
      for (const [id, name] of six) await expect(body(id, name)).toHaveValue('0')
      await from.getByRole('radio', { name: 'od jutra' }).click()
      await expect(body('analiza', 'Analiza')).toHaveValue('2')

      // „Cofnij” brings the six back.
      await page.getByTestId('group-line-settings-undo').click()
      for (const [id, name] of six) await expect(body(id, name)).toHaveValue('0')
      await expect(page.getByTestId('group-line-settings')).toHaveCount(0)

      // Esc clears the selection.
      await row('analiza').click({ position: { x: 3, y: 3 } })
      await row('sesja').click({ position: { x: 3, y: 3 }, modifiers: ['Control'] })
      await expect(page.locator('[data-tree-item][data-selected="true"]')).toHaveCount(2)
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-tree-item][data-selected="true"]')).toHaveCount(0)
    })
  } finally {
    await app.close()
  }
})

test('„Uzupełnij ciało” (D623): 3 własne podkategorie z ciałem 0 → linia z liczbą → „Uzupełnij” → 1, 2, 3 → „Zapisz” od jutra, linia znika; „Cofnij” przywraca; „×” chowa na zawsze', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-body-fill-'))
  seed(dataDir)
  const { app, page, userData } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-settings').click()
      // The starting subcategories have their body cost (D523) – no line at first.
      await expect(page.getByTestId('body-fill-line')).toHaveCount(0)
      // Three subcategories of yours (they start with the body 0 – D523), added from tomorrow, the bar's default.
      const praca = page.locator('[data-testid="group-row"][data-group="g-praca"]')
      const names = ['Alfa', 'Beta', 'Gamma']
      for (const [i, name] of names.entries()) {
        await praca.getByTestId('subcategory-new').fill(name)
        await praca.getByTestId('subcategory-add').click()
        await expect(page.getByTestId('body-fill-text')).toHaveText(i === 0 ? '1 podkategoria ma ciało 0' : `${i + 1} podkategorie mają ciało 0`)
      }
      await page.getByTestId('body-fill-open').click()
      const dialog = page.getByTestId('body-fill')
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId('body-fill-row')).toHaveCount(3)
      for (const [i, name] of names.entries()) {
        await expect(page.getByTestId('body-fill-row').nth(i)).toContainText(name)
        await page.getByTestId(`body-fill-value-${i}`).fill(String(i + 1))
      }
      await page.getByTestId('body-fill-apply').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('group-line-settings')).toContainText('Uzupełniono ciało: 3 podkategorie')
      await expect(page.getByTestId('body-fill-line')).toHaveCount(0)
      // From tomorrow (the bar's default) the values stand in the rows.
      const body = (name: string) => page.getByLabel(`${name}: ciało`, { exact: true })
      for (const [i, name] of names.entries()) await expect(body(name)).toHaveValue(String(i + 1))

      // „Cofnij” – the gaps are back, the line with them.
      await page.getByTestId('group-line-settings-undo').click()
      await expect(page.getByTestId('body-fill-text')).toHaveText('3 podkategorie mają ciało 0')
      for (const name of names) await expect(body(name)).toHaveValue('0')

      // „×” – for good: it stays hidden after a new gap too.
      await page.getByTestId('body-fill-hide').click()
      await expect(page.getByTestId('body-fill-line')).toHaveCount(0)
      await praca.getByTestId('subcategory-new').fill('Delta')
      await praca.getByTestId('subcategory-add').click()
      await expect(body('Delta')).toHaveValue('0')
      await expect(page.getByTestId('body-fill-line')).toHaveCount(0)
    })
  } finally {
    await app.close()
  }
})
