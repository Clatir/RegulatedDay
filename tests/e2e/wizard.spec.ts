/**
 * The wizard (plan E3: „dzień planuje się od zera w kreatorze, drugi komputer dołącza bez zmian w danych”): the first
 * computer chooses an empty folder, goes through the steps with their defaults and „Zakończ” writes the shared data –
 * nothing before; the day plans itself from it. A second computer (another app data) joins the same folder: it writes
 * nothing shared – every file it did not write itself stays byte for byte.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launch, withMainLog } from './app'

const shots = process.env.RD_E2E_SHOTS
async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

/** Every file of the folder with its hash (the presence and the log of `own` aside: they are that computer's own). */
function snapshot(dir: string, own: string | null = null): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else {
        const rel = relative(dir, p).replace(/\\/g, '/')
        if (own && (rel === `.presence/${own}.json` || (rel.startsWith('log/') && rel.endsWith(`/${own}.jsonl`)))) continue
        out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex')
      }
    }
  }
  walk(dir)
  return out
}

test('kreator pierwszego komputera: pusty folder, kroki z wartościami domyślnymi, zapis dopiero przy „Zakończ”, dzień z planu', async () => {
  const oneDrive = mkdtempSync(join(tmpdir(), 'rd-e2e-onedrive-'))
  const folder = join(oneDrive, 'RegulatedDay')
  const { app, page, userData, errors } = await launch({ env: { OneDrive: oneDrive } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('wizard')).toBeVisible()
      await expect(page.getByTestId('wizard-folder')).toHaveText(folder)
      await expect(page.getByTestId('wizard-probe')).toContainText('jeszcze nie istnieje')
      await shot(page, '01-folder')
      // „Dalej” waits for „to pierwszy komputer”.
      await expect(page.getByTestId('wizard-next')).toBeDisabled()
      await page.getByTestId('wizard-first').click()
      await page.getByTestId('wizard-next').click()
      await expect(page.getByTestId('wizard-step')).toContainText('2 z 15')
      await expect(page.getByTestId('wizard-preview')).toBeVisible()
      await shot(page, '02-week')
      // The work: an ordinary day's budget changed – the preview counts it at once.
      await page.getByTestId('wizard-next').click()
      await page.getByTestId('wizard-next').click()
      await page.getByTestId('wizard-zwykly-budgetMin').fill('8h')
      await page.getByTestId('wizard-zwykly-budgetMin').press('Enter')
      await shot(page, '04-work')
      for (let i = 0; i < 6; i++) await page.getByTestId('wizard-next').click()
      // People.
      await expect(page.getByTestId('wizard-step')).toContainText('Osoby')
      await page.getByTestId('wizard-person').fill('Mama')
      await page.getByTestId('wizard-person-add').click()
      for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click()
      await expect(page.getByTestId('wizard-step')).toContainText('Ten komputer')
      await shot(page, '14-computer')
      await page.getByTestId('wizard-next').click()
      await expect(page.getByTestId('wizard-summary')).toContainText('budżet 8 h')
      // Nothing in the folder before „Zakończ”.
      expect(existsSync(folder)).toBe(false)
      await page.getByTestId('wizard-finish').click()
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await shot(page, '20-today')
      const rd = JSON.parse(readFileSync(join(folder, 'rd.json'), 'utf8')) as { settings: Array<{ patch: { dayTypes?: { zwykly?: { budgetMin?: number } } } }>; people: Array<{ name: string }> }
      expect(rd.settings[0]!.patch.dayTypes?.zwykly?.budgetMin).toBe(480)
      expect(rd.people.map((p) => p.name)).toEqual(['Mama'])
      expect(existsSync(join(folder, 'templates', 'zwykly.json'))).toBe(true)
      expect(existsSync(join(folder, 'templates', 'sobota.json'))).toBe(true)
      // The day counts from it: the morning plan proposes a boundary.
      await expect(page.getByTestId('morning-plan')).toBeVisible()
      await expect(page.getByTestId('day-summary')).toContainText('z 8 h')
      const config = JSON.parse(readFileSync(join(userData, 'config.json'), 'utf8')) as { dataFolder: string }
      expect(config.dataFolder).toBe(folder)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }

  // The next computer (its own app data) joins the folder: nothing shared changes.
  const before = snapshot(folder)
  const second = await launch({ env: { OneDrive: oneDrive } })
  try {
    await withMainLog(second.userData, async () => {
      await expect(second.page.getByTestId('wizard-join')).toBeVisible()
      await shot(second.page, '30-join')
      await second.page.getByTestId('wizard-next').click()
      await expect(second.page.getByTestId('wizard-step')).toContainText('Ten komputer')
      await second.page.getByTestId('wizard-next').click()
      await second.page.getByTestId('wizard-finish').click()
      await expect(second.page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      // The plan comes from the first computer's data.
      await expect(second.page.getByTestId('day-summary')).toContainText('z 8 h')
    })
  } finally {
    await second.app.close()
  }
  const id = (JSON.parse(readFileSync(join(second.userData, 'computer-id'), 'utf8')) as { id: string }).id
  const after = snapshot(folder, id)
  for (const [rel, hash] of Object.entries(before)) {
    // The first computer's own presence and logs are the first computer's – unchanged by the second.
    expect(after[rel], rel).toBe(hash)
  }
  expect(Object.keys(after).filter((rel) => !(rel in before))).toEqual([])
})
