/**
 * D512 in the app: the own cost of a routine in „Rutyny” (the label and window of a tile's cost, D501) – saved in the routine's file and
 * counted for its block in „Dziś” (its tile says it, the order own → routine → variant → category); „Szablony” – the tiles carry the cost
 * and the same window, which writes the template block's own cost in the version from the date of the changes. Runs at any hour (the
 * block at 02:00 of the night after).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

test('koszt rutyny (D512): zmiana w „Rutynach” zapisuje plik rutyny, kafelek bloku z tą rutyną w „Dziś” mówi nowy koszt', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cost-routine-'))
  seedAwake(dataDir, [{ id: 'rut', categoryId: 'rutyny', startMin: 26 * 60, durationMin: 60, fixed: false, origin: 'user', routine: 'poranek' }])
  mkdirSync(join(dataDir, 'routines'), { recursive: true })
  const file = join(dataDir, 'routines', 'poranek.json')
  writeFileSync(file, JSON.stringify({ schema: 1, id: 'poranek', name: 'Poranek', archived: false, normal: [{ id: 'a', name: 'Prysznic', min: 10 }], worse: [], costs: { head: 4, emotions: 0, senses: 1 } }))
  const costs = () => (JSON.parse(readFileSync(file, 'utf8')) as { costs?: unknown }).costs
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      // The routine's cost before the category's (1 · 0 · 1).
      await expect(page.getByTestId('block-rut-cost')).toHaveText('4 · 0 · 1', { timeout: 30_000 })
      await page.getByTestId('nav-routines').click()
      await page.getByTestId('routine-item').click()
      await expect(page.getByTestId('routine-cost')).toHaveText('4 · 0 · 1')
      await expect(page.getByTestId('routine-cost-from')).toHaveText('własny koszt rutyny')
      await page.getByTestId('routine-cost').click()
      await page.getByTestId('cost-pop-head-plus').click()
      await expect.poll(costs).toEqual({ head: 5, emotions: 0, senses: 1 })
      await page.keyboard.press('Escape')
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('block-rut-cost')).toHaveText('5 · 0 · 1', { timeout: 15_000 })
      // „Jak podkategoria”: no cost of the routine – the block costs its category's again.
      await page.getByTestId('nav-routines').click()
      await page.getByTestId('routine-item').click()
      await page.getByTestId('routine-cost').click()
      await page.getByTestId('cost-pop-reset').click()
      await expect.poll(costs).toBeNull()
      await expect(page.getByTestId('routine-cost-from')).toHaveText('jak podkategoria')
      await page.keyboard.press('Escape')
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('block-rut-cost')).toHaveText('1 · 0 · 1', { timeout: 15_000 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('koszt rutyny z ✎ (D514, T1430): zaczęty blok tej rutyny liczy nowy koszt od tej chwili – kafelek go mówi, log ma routine.cost procesu głównego', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cost-routine-begun-'))
  const { today } = seedAwake(dataDir, [{ id: 'rut', categoryId: 'rutyny', startMin: 26 * 60, durationMin: 60, fixed: false, origin: 'user', routine: 'poranek' }])
  mkdirSync(join(dataDir, 'routines'), { recursive: true })
  const file = join(dataDir, 'routines', 'poranek.json')
  writeFileSync(file, JSON.stringify({ schema: 1, id: 'poranek', name: 'Poranek', archived: false, normal: [{ id: 'a', name: 'Prysznic', min: 10 }], worse: [], costs: { head: 4, emotions: 0, senses: 1 } }))
  const costs = () => (JSON.parse(readFileSync(file, 'utf8')) as { costs?: unknown }).costs
  /** The changes of the routine's cost in today's logs (every computer's file). */
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
        .filter((l) => l.includes('"routine.cost"'))
        .map((l) => {
          const e = JSON.parse(l) as { routine: string; costs: unknown; was: unknown }
          return { routine: e.routine, costs: e.costs, was: e.was }
        })
    )
  }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      const tile = page.getByTestId('block-rut-cost')
      await expect(tile).toHaveText('4 · 0 · 1', { timeout: 30_000 })
      await page.getByTestId('block-rut').click()
      await page.getByTestId('block-timer-start').click()
      await expect(page.getByTestId('block-timer-start')).toHaveCount(0, { timeout: 15_000 })
      // Begun: the routine's cost of its start.
      await expect(tile).toHaveText('4 · 0 · 1')
      await page.getByTestId('edit-routine').click()
      const dialog = page.getByTestId('edit-routine-window')
      await expect(dialog.getByTestId('routine-cost')).toHaveText('4 · 0 · 1')
      await dialog.getByTestId('routine-cost').click()
      await page.getByTestId('cost-pop-head-plus').click()
      await expect(dialog.getByTestId('routine-cost')).toHaveText('5 · 0 · 1')
      // Esc closes the cost's window only; nothing saved before „Zapisz”.
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('cost-pop')).toHaveCount(0)
      await expect(dialog).toBeVisible()
      expect(costs()).toEqual({ head: 4, emotions: 0, senses: 1 })
      await expect(page.getByTestId('edit-scope')).toHaveText('Zmieni 1 blok od dziś')
      await page.getByTestId('new-thing-save').click()
      await expect(dialog).toHaveCount(0)
      await expect.poll(costs).toEqual({ head: 5, emotions: 0, senses: 1 })
      // From now on: the begun block counts the new cost (its minutes gone by stay by the old one) – the main process wrote the record
      // and with it `routine.cost` (at once in its journal; the folder's log with the next check).
      await expect(tile).toHaveText('5 · 0 · 1', { timeout: 15_000 })
      await expect.poll(logged, { timeout: 40_000 }).toEqual([{ routine: 'poranek', costs: { head: 5, emotions: 0, senses: 1 }, was: { head: 4, emotions: 0, senses: 1 } }])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('koszt w „Szablonach” (D512): kafelek bloku szablonu ma koszt i okienko; zmiana to własny koszt bloku w wersji od daty zmian', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cost-template-'))
  seedAwake(dataDir, [])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').first().click()
      // A new block of the template („Inne obowiązki”, 1 · 1 · 1), saved at once.
      const timeline = page.getByTestId('template-timeline')
      const hours = timeline.getByTestId('timeline-hours')
      await hours.scrollIntoViewIfNeeded()
      const box = (await hours.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 15_000 })
      // The ordinary day's sessions are blocks of the template too (D511, T1461): their tiles have the window as well.
      await expect(timeline.locator('[data-cost-of="tile:ny"][data-editable="true"]')).toHaveCount(1)
      const label = timeline.locator('[data-cost-of^="tile:"][data-editable="true"]:not([data-cost-of="tile:ny"]):not([data-cost-of="tile:londyn"])')
      await expect(label).toHaveCount(1)
      await expect(label).toHaveText('1 · 1 · 1')
      await label.click()
      await page.getByTestId('cost-pop-head-plus').click()
      // No question of a series' scope: the template's block, in the version from the date of the changes (tomorrow).
      await expect(page.getByTestId('series-scope')).toHaveCount(0)
      const own = () => {
        const dir = join(dataDir, 'templates')
        for (const n of readdirSync(dir)) {
          const t = JSON.parse(readFileSync(join(dir, n), 'utf8')) as { versions: Record<string, { blocks: Array<{ costs?: unknown }> }> }
          for (const v of Object.values(t.versions)) for (const b of v.blocks) if (b.costs) return b.costs
        }
        return null
      }
      await expect.poll(own).toEqual({ head: 2, emotions: 1, senses: 1 })
      await expect(label).toHaveText('2 · 1 · 1')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
