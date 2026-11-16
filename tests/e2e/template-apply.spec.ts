/**
 * „Zastosuj do…” i „Odwołaj w…” szablonu (D540–D545): jutro z własnym blokiem na miejscu pierwszego bloku szablonu – pytanie, „Uzupełnij luki”
 * dodaje tylko drugi; kolejne „Zastosuj” na jutro nie pyta (dzień ma już bloki szablonu); „Wybierz dni…” z datą wpisaną ośmioma cyframi
 * (pole pokazuje DD-MM-RRRR) i zakresem dwóch dni → „Nadpisz plan” odwołuje własny blok, oba dni mają cały szablon; „Cofnij” w linii przywraca;
 * „Odwołaj w…” → „Jutro” zdejmuje bloki szablonu. Wieczór po 22:30 – po każdej sesji, nic nie zależy od godziny testu.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { templateBlockId } from '../../src/shared/engine/createDay'
import { templateJson } from '../../src/shared/model/defaults'
import { dayFileFrom, planBlock, type Template } from '../../src/shared/model/plan'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

type Json = Record<string, unknown>
const readJson = (file: string): Json | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Json
  } catch {
    return null
  }
}
const write = (dir: string, rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2))
}
const fileOf = (dir: string, date: string) => dayFileFrom(readJson(join(dir, paths.day(date))) ?? {}, date)
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`
const dashed = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

const training: Template = {
  id: 'trening',
  name: 'Trening',
  dayType: 'zwykly',
  // Sunday of an ordinary type – never the template of the days of the test.
  weekdays: [7],
  archived: false,
  versions: [
    {
      from: '2026-01-01',
      budgetMin: null,
      maxMin: null,
      blocks: [
        planBlock({ id: 'x1', categoryId: 'inne', startMin: 22 * 60 + 30, durationMin: 60, name: 'Pierwszy', origin: 'template' }),
        planBlock({ id: 'x2', categoryId: 'inne', startMin: 24 * 60, durationMin: 30, name: 'Drugi', origin: 'template' })
      ]
    }
  ]
}

test('szablon: Zastosuj do jutra (pytanie, luki), bez pytania drugi raz, zakres z ośmiu cyfr – Nadpisz, Cofnij, Odwołaj', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-template-apply-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const after = addDays(today, 2)
  write(dataDir, paths.record('template', training.id), templateJson(training))
  const mine = { id: 'moj', categoryId: 'inne', startMin: 22 * 60 + 45, durationMin: 30, fixed: false, name: 'Mój' }
  write(dataDir, paths.day(tomorrow), { schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks: [mine] })
  write(dataDir, paths.day(after), { schema: 1, date: after, blocks: [{ ...mine }] })
  const id = (date: string, b: string) => templateBlockId(date, 'trening', b)
  const ids = (date: string) => fileOf(dataDir, date).blocks.map((b) => b.id)

  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').filter({ hasText: 'Trening' }).click()
      await expect(page.getByTestId('template-name')).toHaveValue('Trening')

      // Jutro: „Pierwszy” nachodzi na „Mój” – pytanie; „Uzupełnij luki” dodaje tylko „Drugi”.
      await page.getByTestId('template-apply').click()
      await page.getByTestId('template-apply-tomorrow').click()
      await expect(page.getByTestId('template-apply-mode')).toBeVisible()
      await page.getByTestId('template-apply-fill').click()
      await expect(page.getByTestId('template-apply-mode')).toBeHidden()
      await expect(page.getByTestId('group-line-template')).toContainText('dodano 1 blok')
      await expect.poll(() => ids(tomorrow)).toEqual(expect.arrayContaining(['moj', id(tomorrow, 'x2')]))
      expect(ids(tomorrow)).not.toContain(id(tomorrow, 'x1'))

      // Drugi raz: dzień ma już blok szablonu – bez pytania, nic nowego (luka zajęta).
      await page.getByTestId('template-apply').click()
      await page.getByTestId('template-apply-tomorrow').click()
      await expect(page.getByText('Nic nie dodano')).toBeVisible()
      await expect(page.getByTestId('template-apply-mode')).toHaveCount(0)

      // Wybierz dni: osiem cyfr → DD-MM-RRRR, zakres jutro–pojutrze; jutro ma już szablon (luki), pojutrze pyta → „Nadpisz plan”.
      await page.getByTestId('template-apply').click()
      await page.getByTestId('template-apply-pick').click()
      const dialog = page.getByTestId('template-apply-days')
      await dialog.getByTestId('template-apply-days-from').fill(ddmmyyyy(tomorrow))
      await expect(dialog.getByTestId('template-apply-days-from')).toHaveValue(dashed(tomorrow))
      await dialog.getByTestId('template-apply-days-to').fill(ddmmyyyy(after))
      await expect(dialog.getByTestId('template-apply-days-count')).toContainText('Wybrane: 2 dni')
      await expect(dialog.getByTestId(`day-${tomorrow}`)).toHaveAttribute('aria-pressed', 'true')
      await dialog.getByTestId('template-apply-days-ok').click()
      await expect(page.getByTestId('template-apply-mode')).toContainText(`${after.slice(8, 10)}.${after.slice(5, 7)}.${after.slice(0, 4)}`)
      await expect(page.getByTestId('template-apply-mode')).toContainText('(1)')
      await page.getByTestId('template-apply-overwrite').click()
      await expect.poll(() => ids(after)).toEqual(expect.arrayContaining([id(after, 'x1'), id(after, 'x2')]))
      expect(ids(after)).not.toContain('moj')
      // Jutro bez pytania: „Mój” zostaje.
      expect(ids(tomorrow)).toContain('moj')

      // „Cofnij” w linii: pojutrze wraca jak przed zmianą.
      await page.getByTestId('group-line-template-undo').click()
      await expect.poll(() => ids(after)).toEqual(['moj'])

      // „Odwołaj w…” → „Jutro”: blok szablonu wychodzi z planu, własny zostaje.
      await page.getByTestId('template-revoke').click()
      await page.getByTestId('template-revoke-tomorrow').click()
      await expect(page.getByTestId('group-line-template')).toContainText('odwołany')
      await expect.poll(() => ids(tomorrow)).toEqual(['moj'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
