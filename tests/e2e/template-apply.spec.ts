/**
 * „Zastosuj do…” i „Odwołaj w…” szablonu (D540–D545): jutro z własnym blokiem na miejscu pierwszego bloku szablonu – pytanie, „Uzupełnij luki”
 * dodaje tylko drugi; kolejne „Zastosuj” na jutro nie pyta (dzień ma już bloki szablonu); „Wybierz dni…” z datą wpisaną ośmioma cyframi
 * (pole pokazuje DD-MM-RRRR) i zakresem dwóch dni → „Nadpisz plan” odwołuje własny blok, oba dni mają cały szablon; „Cofnij” w linii przywraca;
 * „Odwołaj w…” → „Jutro” zdejmuje bloki szablonu. Wieczór po 22:30 – po każdej sesji, nic nie zależy od godziny testu.
 * „Dziś” (D546–D548): okno godzin i minionych z domyślnymi wyborami, „Anuluj”; wg planu – bloki minione jako zrealizowane (start „według
 * planu” i koniec zrobiony w logu dnia), „Cofnij” cofa fakty i bloki; od teraz – pierwszy blok zaczyna się teraz (poza początkiem i końcem
 * doby logicznej, gdzie test się pomija).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { templateBlockId } from '../../src/shared/engine/createDay'
import { templateJson } from '../../src/shared/model/defaults'
import { dayFileFrom, planBlock, templateFrom, type Template } from '../../src/shared/model/plan'
import { logicalMinuteOf } from '../../src/shared/time/day'
import { addDays } from '../../src/shared/time/zone'
import { launch, logicalToday, withMainLog } from './app'
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
  // The blocks of the file still in the plan („Nadpisz” and „Odwołaj” cancel – the block stays in the file, T1907).
  const ids = (date: string) => {
    const f = fileOf(dataDir, date)
    return f.blocks.map((b) => b.id).filter((x) => !f.cancelled.includes(x))
  }

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

/** The events of a day's logs (every computer's file), as written. */
const logOf = (dir: string, date: string): Json[] => {
  const d = join(dir, 'log', date.slice(0, 4), date)
  let names: string[] = []
  try {
    names = readdirSync(d).filter((n) => n.endsWith('.jsonl'))
  } catch {
    return []
  }
  return names.flatMap((n) =>
    readFileSync(join(d, n), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as Json]
        } catch {
          return []
        }
      })
  )
}

test('szablon: Zastosuj do dziś – okno godzin i minionych (domyślnie wg planu i jako zrealizowane), Cofnij, potem od teraz', async () => {
  const nowMin = () => Math.floor(logicalMinuteOf(logicalToday(), Date.now()))
  // Both blocks gone by at the template's hours, both within the day once moved to now (and the day not changing under the test).
  test.skip(nowMin() < 4 * 60 + 40 || nowMin() > 27 * 60 + 20, 'początek albo koniec doby logicznej')
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-template-today-'))
  const { today } = seedAwake(dataDir, [])
  const morning: Template = {
    id: 'poranek',
    name: 'Poranek',
    // Another type than today's (an ordinary day): never the day's own template.
    dayType: 'weekend',
    weekdays: [6],
    archived: false,
    versions: [
      {
        from: '2026-01-01',
        budgetMin: null,
        maxMin: null,
        blocks: [
          planBlock({ id: 'r1', categoryId: 'inne', startMin: 4 * 60, durationMin: 10, name: 'Rano', origin: 'template' }),
          planBlock({ id: 'r2', categoryId: 'inne', startMin: 4 * 60 + 15, durationMin: 10, name: 'Potem', origin: 'template' })
        ]
      }
    ]
  }
  write(dataDir, paths.record('template', morning.id), templateJson(morning))
  const id = (b: string) => templateBlockId(today, 'poranek', b)
  const starts = () => {
    const f = fileOf(dataDir, today)
    return Object.fromEntries(f.blocks.filter((b) => !f.cancelled.includes(b.id)).map((b) => [b.id, b.startMin]))
  }
  const facts = () => logOf(dataDir, today).filter((e) => (e.k === 'block.start' || e.k === 'block.end') && [id('r1'), id('r2')].includes(String(e.block)))
  const undone = () => new Set(logOf(dataDir, today).filter((e) => e.k === 'undo').map((e) => String(e.target)))

  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').filter({ hasText: 'Poranek' }).click()
      await expect(page.getByTestId('template-name')).toHaveValue('Poranek')

      // „Dziś” – okno z domyślnymi wyborami; „Anuluj” niczego nie zmienia.
      await page.getByTestId('template-apply').click()
      await page.getByTestId('template-apply-today').click()
      const confirm = page.getByTestId('template-apply-confirm')
      await expect(confirm).toContainText('Zastosuj „Poranek” do dziś')
      await expect(confirm.getByTestId('template-apply-confirm-hours-plan')).toBeChecked()
      await expect(confirm.getByTestId('template-apply-confirm-hours-now')).not.toBeChecked()
      await expect(confirm.getByTestId('template-apply-confirm-past-done')).toBeChecked()
      await expect(confirm.getByTestId('template-apply-confirm-past-skip')).not.toBeChecked()
      await confirm.getByRole('button', { name: 'Anuluj' }).click()
      await expect(confirm).toBeHidden()
      expect(starts()[id('r1')]).toBeUndefined()

      // „Zastosuj” wg planu: oba bloki w godzinach szablonu, zrealizowane – start „według planu” i koniec zrobiony w logu dnia.
      await page.getByTestId('template-apply').click()
      await page.getByTestId('template-apply-today').click()
      await page.getByTestId('template-apply-confirm-ok').click()
      await expect(page.getByTestId('group-line-template')).toContainText('dodano 2 bloki (w tym 2 zrealizowane)')
      await expect.poll(() => starts()).toMatchObject({ [id('r1')]: 4 * 60, [id('r2')]: 4 * 60 + 15 })
      await expect.poll(() => facts().map((e) => [e.k, e.block, e.how ?? e.done])).toEqual([
        ['block.start', id('r1'), 'plan'],
        ['block.end', id('r1'), true],
        ['block.start', id('r2'), 'plan'],
        ['block.end', id('r2'), true]
      ])

      // „Cofnij”: fakty cofnięte, bloki poza planem.
      await page.getByTestId('group-line-template-undo').click()
      await expect.poll(() => facts().every((e) => undone().has(String(e.id)))).toBe(true)
      await expect.poll(() => starts()[id('r1')]).toBeUndefined()

      // Od teraz: pierwszy blok zaczyna się teraz, drugi 15 min po nim; nic minionego, nic nowego w logu.
      await page.getByTestId('template-apply').click()
      await page.getByTestId('template-apply-today').click()
      await page.getByTestId('template-apply-confirm-hours-now').check()
      const before = nowMin()
      await page.getByTestId('template-apply-confirm-ok').click()
      await expect(page.getByTestId('group-line-template')).toContainText('dodano 2 bloki')
      await expect(page.getByTestId('group-line-template')).not.toContainText('zrealizowan')
      const after = nowMin()
      await expect.poll(() => starts()[id('r1')]).toBeDefined()
      const r1 = starts()[id('r1')]!
      expect(r1).toBeGreaterThanOrEqual(before)
      expect(r1).toBeLessThanOrEqual(after)
      expect(starts()[id('r2')]).toBe(r1 + 15)
      expect(facts()).toHaveLength(4)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('szablon: klik w pustą oś zapisuje blok od razu i mówi „Dodano blok · Cofnij” (D563 P2) – „Cofnij” zdejmuje blok', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-template-axis-undo-'))
  seedAwake(dataDir, [])
  const empty: Template = { id: 'pusty', name: 'Pusty', dayType: 'zwykly', weekdays: [7], archived: false, versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [] }] }
  write(dataDir, paths.record('template', empty.id), templateJson(empty))
  const blocksOf = () => {
    const t = templateFrom(readJson(join(dataDir, paths.record('template', empty.id))))
    return t ? t.versions.flatMap((v) => v.blocks).length : -1
  }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').filter({ hasText: 'Pusty' }).click()
      const hours = page.getByTestId('template-timeline').getByTestId('timeline-hours')
      await hours.scrollIntoViewIfNeeded()
      const box = (await hours.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 15_000 })
      const toast = page.getByRole('status').filter({ hasText: 'Dodano blok' })
      await expect(toast).toBeVisible()
      await expect.poll(blocksOf).toBe(1)
      await toast.getByTestId('toast-action').click()
      await expect.poll(blocksOf).toBe(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('szablon: „Cofnij” dodanego bloku po wpisaniu nazwy usuwa blok i nie pyta o konflikt z własną zmianą (D563 P2)', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-template-axis-undo2-'))
  seedAwake(dataDir, [])
  const empty: Template = { id: 'pusty', name: 'Pusty', dayType: 'zwykly', weekdays: [7], archived: false, versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [] }] }
  write(dataDir, paths.record('template', empty.id), templateJson(empty))
  const blocks = () => {
    const t = templateFrom(readJson(join(dataDir, paths.record('template', empty.id))))
    return t ? t.versions.flatMap((v) => v.blocks) : []
  }
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-templates').click()
      await page.getByTestId('template-item').filter({ hasText: 'Pusty' }).click()
      const hours = page.getByTestId('template-timeline').getByTestId('timeline-hours')
      await hours.scrollIntoViewIfNeeded()
      const box = (await hours.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 15_000 })
      const toast = page.getByRole('status').filter({ hasText: 'Dodano blok' })
      await expect(toast).toBeVisible()
      // The name typed before „Cofnij” is a change of the template after the add – „Cofnij” takes the block out all the same.
      await page.keyboard.type('Plan tygodnia')
      await page.keyboard.press('Enter')
      await expect.poll(() => blocks().map((b) => b.name)).toEqual(['Plan tygodnia'])
      await toast.getByTestId('toast-action').click()
      await expect.poll(() => blocks().length).toBe(0)
      await expect(page.getByTestId('template-timeline').locator('[data-block-title="Plan tygodnia"]')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
