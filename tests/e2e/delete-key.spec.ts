/**
 * Del i „+ Nowa…” (D462, D463). Del usuwa zaznaczony element po pytaniu „Usunąć „…”?” (Enter – Usuń, Esc – Anuluj) i z „Cofnij”:
 * blok w „Dziś” (klik w kafelek), blok otwarty z „Tygodnia” (klik w niego zaznacza go w „Dziś”), wiersz w „Sprawach”; w polu
 * tekstowym Del kasuje tekst i nic więcej; przycisk „Usuń” działa jak dotąd (od razu). „+ Nowa…” na liście „Rutyna” w panelu
 * bloku otwiera okno na środku z nazwą i krokami z czasem; „Zapisz” tworzy rutynę, blok ją dostaje razem z krokami i długością.
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const blocksOn = (dir: string, date: string) => {
  try {
    return dayFileFrom(JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')), date).blocks
  } catch {
    return []
  }
}
const ids = (dir: string, date: string) => blocksOn(dir, date).map((b) => b.id)

const BLOCKS = [
  { id: 'k1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false },
  { id: 'k2', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, fixed: false, name: 'Drugi' }
]

test('Dziś (D462): Del na zaznaczonym bloku pyta, Esc zostawia, Enter usuwa z „Cofnij”; w polu tekstu Del kasuje tekst; przycisk „Usuń” działa od razu', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-del-today-'))
  const { today } = seedAwake(dataDir, BLOCKS)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('block-k2')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('block-k2').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toContainText('Usunąć „Drugi”?')
      // Esc leaves everything.
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('delete-ask')).toHaveCount(0)
      expect(ids(dataDir, today)).toEqual(['k1', 'k2'])
      // Del once more, then the default button (Enter).
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask-yes')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => ids(dataDir, today), { timeout: 15_000 }).toEqual(['k1'])
      await expect(page.getByTestId('block-k2')).toHaveCount(0)
      // „Cofnij” brings it back.
      await page.getByTestId('toast-action').click()
      await expect.poll(() => ids(dataDir, today), { timeout: 15_000 }).toEqual(['k1', 'k2'])

      // In a field Del only erases text: the panel's name field.
      await page.getByTestId('block-k2').click()
      const name = page.getByTestId('block-name')
      await name.click()
      await page.keyboard.press('End')
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toHaveCount(0)

      // „Usuń” works as before – at once, no question.
      await page.getByTestId('block-k1').click()
      await page.getByTestId('block-remove').click()
      await expect(page.getByTestId('delete-ask')).toHaveCount(0)
      await expect.poll(() => ids(dataDir, today), { timeout: 15_000 }).toEqual(['k2'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień (D462): klik w blok otwiera jego dzień z blokiem zaznaczonym – Del pyta i usuwa', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-del-week-'))
  const { today } = seedAwake(dataDir, BLOCKS)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('block-k1')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId(`week-block-${today}-k1`).click()
      await expect(page.getByTestId('today')).toBeVisible()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-k1')).toHaveAttribute('data-selected', 'true')
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toContainText('Usunąć „Inne obowiązki”?')
      await page.getByTestId('delete-ask-yes').click()
      await expect.poll(() => ids(dataDir, today), { timeout: 15_000 }).toEqual(['k2'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Sprawy (D462): klik w wiersz zaznacza go, Del pyta i usuwa z „Cofnij”; Del w polu notatki kasuje tekst', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-requests').click()
      for (let i = 0; i < 2; i++) await page.getByTestId('request-new').click()
      await expect(page.getByTestId('case-row')).toHaveCount(2)
      const note = page.getByTestId('request-note').first()
      await note.fill('spacer')
      await note.press('Enter')
      await note.press('Delete')
      await expect(page.getByTestId('delete-ask')).toHaveCount(0)
      // A click on the row (its edge, beside the fields) selects it.
      await page.getByTestId('case-row').first().click({ position: { x: 4, y: 4 } })
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toContainText('Usunąć „')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('case-row')).toHaveCount(1)
      await page.getByTestId('toast-action').click()
      await expect(page.getByTestId('case-row')).toHaveCount(2)
      await expect(page.getByTestId('request-note').first()).toHaveValue('spacer')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('„+ Nowa…” (D463): lista „Rutyna” w panelu bloku otwiera okno na środku; „Zapisz” tworzy rutynę z krokami, blok ją dostaje z krokami i długością; Esc nic nie zmienia', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-new-routine-'))
  const { today } = seedAwake(dataDir, [{ id: 'r1', categoryId: 'rutyny', startMin: 8 * 60, durationMin: 20, fixed: false }])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('block-r1')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('block-r1').click()
      const routine = page.getByTestId('block-routine')
      await routine.selectOption({ label: '+ Nowa…' })
      const dialog = page.getByTestId('new-routine')
      await expect(dialog).toBeVisible()
      // In the middle of the screen (the window is 1280 × 900).
      const box = (await dialog.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(60)
      expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(120)
      // Esc: nothing changed, nothing saved.
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      expect(blocksOn(dataDir, today)[0]!.routine ?? null).toBeNull()
      await expect(routine).toHaveValue('-')

      await routine.selectOption({ label: '+ Nowa…' })
      await page.getByTestId('new-routine-name').fill('Wieczór')
      await page.getByTestId('new-routine-name').press('Tab')
      await dialog.getByLabel('Krok 1').fill('Woda')
      await dialog.getByLabel('Czas kroku 1').fill('10')
      await dialog.getByLabel('Czas kroku 1').press('Tab')
      await page.getByTestId('new-thing-save').click()
      await expect(dialog).toHaveCount(0)
      await expect.poll(() => blocksOn(dataDir, today)[0]!.routine ?? null, { timeout: 15_000 }).not.toBeNull()
      const files = readdirSync(join(dataDir, 'routines')).filter((n) => n.endsWith('.json'))
      expect(files).toHaveLength(1)
      const saved = JSON.parse(readFileSync(join(dataDir, 'routines', files[0]!), 'utf8')) as { id: string; name: string; normal: Array<{ name: string; min: number }> }
      expect(saved.name).toBe('Wieczór')
      expect(saved.normal.map((s) => [s.name, s.min])).toEqual([['Woda', 10]])
      const block = blocksOn(dataDir, today)[0]!
      expect(block.routine).toBe(saved.id)
      expect(block.durationMin).toBe(10)
      expect(block.steps.map((s) => [s.title, s.min])).toEqual([['Woda', 10]])
      await expect(routine).toHaveValue(saved.id)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Rutyny (D462): klik w rutynę na liście zaznacza ją, Del pyta i usuwa z „Cofnij”; Del w polu nazwy kasuje tekst', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-routines').click()
      await page.getByTestId('routine-new').click()
      await expect(page.getByTestId('routine-item')).toHaveCount(1)
      const name = page.getByTestId('routine-name')
      await name.click()
      await page.keyboard.press('End')
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toHaveCount(0)
      await page.getByTestId('routine-item').click()
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toContainText('Usunąć „Nowa rutyna”?')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('routine-item')).toHaveCount(0)
      await page.getByTestId('toast-action').click()
      await expect(page.getByTestId('routine-item')).toHaveCount(1)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
