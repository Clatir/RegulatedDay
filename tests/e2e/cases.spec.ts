/**
 * „Sprawy” (OPS2, L2: D383, D384, D402, D408): the page that replaced „Prośby” – a task from Ctrl+N, the lists and the move
 * to „Dziś”; the panel of „Dziś” beside the axis: a task dragged onto the axis at 10:00 is a block of 30 min „Inne” named by
 * it (the day's file and the record in one edit, „Cofnij” in the toast); „Powtarzaj” not offered on its block; the morning
 * plan's step of requests takes the tasks of „Dziś”; the shortcut of the quick capture in the settings (validated, switched
 * off). The pytanie „Zadanie zrobione?” of the bar and the ritual's lines are the unit and fs tests' (they need a block that
 * has run); the real Win+Alt+N – `quick-windows.spec.ts` (CI on Windows).
 * HKU2 (D409, D451): the due date set by a button of the row and its badge, the words „!jutro” of the new task (the line under the
 * field, saved without the word), the card „Terminy” of the morning plan with „Na Dziś” and „Pomiń”, the threshold in the settings.
 * HKU3 (D450): the priority chosen in the row (its stripe, the order), the switch „Listy · Macierz” remembered by the window, the drop
 * between the fields of the matrix, the stripe in the panel and on the tile of a block, the morning plan's line of the sprawy „Ważne i pilne”.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { plDate } from '../../src/shared/format'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { newRequest, newTask } from '../../src/shared/model/requests'
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

/** The records of requests/ (tasks and requests) in the folder now. */
const records = (dir: string): Json[] => {
  try {
    return readdirSync(join(dir, 'requests'))
      .filter((n) => n.endsWith('.json'))
      .map((n) => readJson(join(dir, 'requests', n)))
      .filter((r): r is Json => r != null)
  } catch {
    return []
  }
}

const putRecord = (dir: string, raw: Json): void => {
  mkdirSync(join(dir, 'requests'), { recursive: true })
  writeFileSync(join(dir, 'requests', `${raw.id as string}.json`), JSON.stringify(raw))
}

const blocksOf = (dir: string, today: string) => {
  const raw = readJson(join(dir, paths.day(today)))
  return raw ? dayFileFrom(raw, today).blocks : []
}

/** Press on the centre of `from`, move over `to` (the pointer of a drag, as the plan's other drags are made) – `hold` runs before the release. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold?: () => Promise<void>): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 12, from.y + 4, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await hold?.()
  await page.mouse.up()
}

const center = async (page: Page, testId: string, within?: Locator) => {
  const b = (await (within ?? page).getByTestId(testId).first().boundingBox())!
  return { x: b.x + Math.min(b.width / 2, 60), y: b.y + b.height / 2 }
}

test('Sprawy: Ctrl+N dodaje zadanie do Skrzynki, lista „Dziś” z sumą; przeciągnięcie z panelu na oś 10:00 daje blok 30 min „Inne” z tytułem zadania; „Cofnij”; „Powtarzaj” niedostępne', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-'))
  const { today } = seedAwake(dataDir, [])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })

      // The page: the same place in the menu and the same key as „Prośby”.
      await expect(page.getByTestId('nav-requests')).toContainText('Sprawy')
      await page.getByTestId('nav-requests').click()
      await expect(page.getByTestId('requests')).toBeVisible()
      await page.keyboard.press('Control+KeyN')
      await expect(page.getByTestId('case-add-title')).toBeFocused()
      await page.getByTestId('case-add-title').fill('Napisać raport')
      await page.getByTestId('case-add-title').press('Enter')
      const row = page.getByTestId('cases-inbox-list').getByTestId('case-row')
      await expect(row).toHaveCount(1)
      // A task: the title, 30 min, „Inne”, no note.
      await expect(row.getByTestId('case-title')).toHaveValue('Napisać raport')
      await expect(row.getByTestId('request-estimate')).toHaveValue('30 min')
      await expect(row.getByTestId('case-category')).toHaveValue('inne')
      await expect.poll(() => records(dataDir).map((r) => [r.kind, r.title, r.list, r.estimateMin, r.categoryId])).toEqual([['task', 'Napisać raport', 'inbox', 30, 'inne']])
      // A task needs its title: an empty one is refused, the saved one stays.
      await row.getByTestId('case-title').fill('')
      await row.getByTestId('case-title').press('Enter')
      await expect(row.getByTestId('case-title')).toHaveValue('Napisać raport')
      // To „Dziś”: the header says the sum of the estimates.
      await row.getByTestId('case-list').selectOption('today')
      await expect(page.getByTestId('cases-today-list').getByTestId('case-row')).toHaveCount(1)
      await expect(page.getByTestId('cases-today-title')).toHaveText('Dziś · 30 min')
      await expect(page.getByTestId('cases-inbox-list')).toHaveCount(0)
      await expect(page.getByTestId('cases-done')).toContainText('Pusto.')

      // The panel beside the axis of „Dziś”: the task, dragged onto the axis at 10:00.
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('cases-panel-today')).toContainText('Napisać raport')
      await page.getByTestId('timeline-axis').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      const axis = (await page.getByTestId('timeline-axis').boundingBox())!
      const lo = Number(await page.getByTestId('timeline-axis').getAttribute('data-lo'))
      const ppm = Number(await page.getByTestId('timeline-axis').getAttribute('data-ppm'))
      const at10 = { x: axis.x + axis.width / 3, y: axis.y + (10 * 60 - lo) * ppm + 1 }
      await drag(page, await center(page, 'case-chip'), at10, async () => {
        // Held over the axis: where the block would stand.
        await expect(page.getByTestId('case-ghost')).toContainText('10:00–10:30')
        await expect(page.getByTestId('case-drag')).toContainText('Napisać raport')
      })
      await expect.poll(() => blocksOf(dataDir, today).length, { timeout: 15_000 }).toBe(1)
      const block = blocksOf(dataDir, today)[0]!
      expect([block.categoryId, block.startMin, block.durationMin, block.task, block.origin]).toEqual(['inne', 600, 30, records(dataDir)[0]!.id, 'user'])
      // The record is „zaplanowane”: it stays on „Dziś” with the hour.
      await expect.poll(() => records(dataDir)[0]!.block).toBe(block.id)
      await expect(page.getByTestId('cases-panel-today')).toContainText('zaplanowane')
      await expect(page.getByTestId('cases-panel-today')).toContainText('10:00')
      // The block on the axis has the task's title.
      await expect(page.getByTestId(`block-${block.id}`)).toContainText('Napisać raport')

      // „Cofnij” of the toast: the block gone and the record without it – it is not „zaplanowane” any more.
      await page.getByTestId('toast-action').click()
      await expect.poll(() => blocksOf(dataDir, today).length, { timeout: 15_000 }).toBe(0)
      await expect.poll(() => records(dataDir)[0]!.block).toBeNull()
      await expect(page.getByTestId('cases-panel-today')).not.toContainText('zaplanowane')

      // „Zaplanuj” of the panel puts it in the nearest free place; „Powtarzaj” is not offered on its block, with the reason (D408).
      await page.getByTestId('case-plan').click()
      await expect.poll(() => blocksOf(dataDir, today).length, { timeout: 15_000 }).toBe(1)
      const again = blocksOf(dataDir, today)[0]!
      expect([again.categoryId, again.durationMin, again.task]).toEqual(['inne', 30, block.task])
      await page.getByTestId(`block-${again.id}`).click()
      await expect(page.getByTestId('series-unavailable')).toContainText('Blok zadania należy do jednego dnia')
      await expect(page.getByTestId('block-series')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('plan poranny: krok próśb obejmuje zadania z „Dziś” – wybrane zadanie to osobny blok, prośby jednym', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-morning-'))
  const { today } = seedAwake(dataDir, [])
  const t = newTask('t1', Date.now(), today, { title: 'Wymienić filtr', list: 'today', estimateMin: 45 })!
  putRecord(dataDir, t)
  putRecord(dataDir, newTask('t2', Date.now() - 1, today, { title: 'Ze Skrzynki' })!)
  putRecord(dataDir, newRequest('r1', Date.now() - 2, { person: null, estimateMin: 20, note: 'zakupy' }))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('morning-plan')).toBeVisible({ timeout: 30_000 })
      // On Monday „Strona B tygodnia” comes first, then „Cele na <miesiąc>” and the first check-in – each skipped.
      if (await page.getByTestId('side-b').isVisible()) await page.getByTestId('side-b-done').click()
      await page.getByTestId('goals-skip').click()
      await page.getByTestId('checkin-skip').click()
      const pick = page.getByTestId('queue-pick')
      await expect(pick).toBeVisible()
      // The task of „Dziś” and the request – not the task of „Skrzynka”.
      await expect(pick.getByTestId('queue-item')).toHaveCount(2)
      await expect(pick).toContainText('Wymienić filtr')
      await expect(pick).not.toContainText('Ze Skrzynki')
      // D408: the task of „Dziś” is chosen at once, the request is not.
      await expect(pick.getByTestId('queue-item').filter({ hasText: 'Wymienić filtr' }).getByRole('checkbox')).toBeChecked()
      await expect(pick.getByTestId('queue-item').filter({ hasText: 'zakupy' }).getByRole('checkbox')).not.toBeChecked()
      await pick.getByTestId('queue-add').click()
      await expect.poll(() => blocksOf(dataDir, today).map((b) => [b.task, b.durationMin, b.categoryId])).toEqual([['t1', 45, 'inne']])
      await expect.poll(() => records(dataDir).find((r) => r.id === 't1')!.block).toBe(blocksOf(dataDir, today)[0]!.id)
      // The request stays in the step; the task is planned and gone from it.
      await expect(pick.getByTestId('queue-item')).toHaveCount(1)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** This computer's prefs as the main process holds them. */
const prefs = (page: Page) => page.evaluate(() => window.rd.prefs())

test('Ustawienia: skrót szybkiego zapisu – nieprawidłowy odrzucony z powodem, prawidłowy zapisany, wyłączony; uwaga o skrócie', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-settings').click()
      const key = page.getByTestId('pref-quick-key')
      await expect(key).toHaveValue('Win+Alt+N')
      // A key without Ctrl or Alt is refused with its reason – nothing is sent (the default does not return in silence).
      await key.fill('N')
      await key.press('Enter')
      await expect(page.getByTestId('pref-quick-key-error')).toContainText('Ctrl lub Alt')
      expect((await prefs(page)).quickKey).toBe('Super+Alt+N')
      await key.fill('win+alt+f11')
      await key.press('Enter')
      await expect(key).toHaveValue('Win+Alt+F11')
      await expect.poll(async () => (await prefs(page)).quickKey).toBe('Super+Alt+F11')
      // Windows' answer is told under the field: it works, or another program holds it.
      await expect(page.getByTestId('pref-quick-note')).toContainText(/Otwiera małe okienko|Skrót zajęty przez inny program/)
      await page.getByTestId('pref-quick-on').click()
      await expect.poll(async () => (await prefs(page)).quickOn).toBe(false)
      await expect(page.getByTestId('pref-quick-note')).toContainText('Wyłączony')
      await expect(page.getByTestId('pref-quick-key')).toHaveCount(0)
      // On again: your own shortcut, not the default (T759).
      await page.getByTestId('pref-quick-on').click()
      await expect.poll(async () => prefs(page)).toMatchObject({ quickOn: true, quickKey: 'Super+Alt+F11' })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('rytuał wieczorny: niezrobione zadanie z „Dziś” wymienione („wrócą o 04:00”), „Zrobione” w rytuale przenosi je na listę Zrobione', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-ritual-'))
  // A day without work: the ritual is due at any hour (D318); its first day is today (D320).
  const { today } = seedAwake(dataDir, [])
  const rdFile = join(dataDir, 'rd.json')
  writeFileSync(rdFile, JSON.stringify({ ...JSON.parse(readFileSync(rdFile, 'utf8')), ritualFrom: today }, null, 2))
  putRecord(dataDir, newTask('t1', Date.now(), today, { title: 'Oddać książki', list: 'today' })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('ritual')).toBeVisible({ timeout: 30_000 })
      const part = page.getByTestId('ritual-cases')
      await expect(part.getByTestId('ritual-cases-back')).toContainText('Niezrobione z „Dziś” wrócą o 04:00 do „W tym tygodniu”')
      await expect(part.getByTestId('ritual-case-back')).toContainText('Oddać książki')
      // A weekday other than Sunday: no line of „Kiedyś / Może”.
      if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 0) await expect(page.getByTestId('ritual-someday')).toHaveCount(0)
      await part.getByTestId('ritual-case-done').click()
      await expect.poll(() => records(dataDir)[0]!.list).toBe('done')
      await expect(page.getByTestId('ritual-case-back')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Sprawy: termin ustawiony przyciskiem „Jutro” – znaczek „Termin jutro” na liście, „Wyczyść” go zdejmuje; „Po terminie” czerwony', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-due-'))
  const { today } = seedAwake(dataDir, [])
  putRecord(dataDir, newTask('t1', Date.now(), today, { title: 'Zapłacić podatek' })!)
  putRecord(dataDir, newTask('t2', Date.now() - 1, today, { title: 'Oddać formularz', dueDate: addDays(today, -2) })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-requests').click()
      const rows = page.getByTestId('cases-inbox-list').getByTestId('case-row')
      await expect(rows).toHaveCount(2)
      // The one past its date is first, with the red badge; the other has none yet.
      await expect(rows.first().getByTestId('case-title')).toHaveValue('Oddać formularz')
      await expect(rows.first().getByTestId('case-due')).toHaveText('Po terminie')
      await expect(rows.first().getByTestId('case-due')).toHaveAttribute('data-tone', 'over')
      const row = rows.nth(1)
      await expect(row.getByTestId('case-title')).toHaveValue('Zapłacić podatek')
      await expect(row.getByTestId('case-due')).toHaveCount(0)
      // „Terminy” of the row: „Jutro” sets the due date, the field shows it.
      await row.getByTestId('case-dates-open').click()
      await row.getByTestId('case-due-tomorrow').click()
      await expect(row.getByTestId('case-due')).toHaveText('Termin jutro')
      await expect(row.getByTestId('case-due')).toHaveAttribute('data-tone', 'soon')
      await expect.poll(() => records(dataDir).find((r) => r.id === 't1')!.dueDate).toBe(addDays(today, 1))
      await expect(row.getByTestId('case-due-date')).toHaveValue(/\d{2}\.\d{2}\.\d{4}/)
      // The date of doing: „Dziś” – the sprawa goes to „Dziś” (its date of doing is today); the due date stays.
      await row.getByTestId('case-do-today').click()
      await expect.poll(() => records(dataDir).find((r) => r.id === 't1')!.doDate).toBe(today)
      const moved = page.getByTestId('cases-today-list').getByTestId('case-row')
      await expect(moved).toHaveCount(1)
      await expect(moved.getByTestId('case-due')).toHaveText('Termin jutro')
      // A date of doing that has gone by (D454): the note under the field, the sprawa stays on „Dziś”, nothing refused.
      await moved.getByTestId('case-dates-open').click()
      await moved.getByTestId('case-do-date').fill(plDate(addDays(today, -3)))
      await moved.getByTestId('case-do-date').press('Enter')
      await expect(moved.getByTestId('case-do-note')).toHaveText('Ta data już minęła')
      await expect.poll(() => records(dataDir).find((r) => r.id === 't1')!.doDate).toBe(addDays(today, -3))
      await expect(page.getByTestId('cases-today-list').getByTestId('case-row')).toHaveCount(1)
      // „Wyczyść”: the badge goes (the row is a new one on the other list – its dates open again).
      await moved.getByTestId('case-due-clear').click()
      await expect(moved.getByTestId('case-due')).toHaveCount(0)
      await expect.poll(() => records(dataDir).find((r) => r.id === 't1')!.dueDate).toBeNull()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Sprawy: szybki zapis „!jutro” – podgląd pod polem przed Enter, zadanie zapisane bez słowa w tytule z terminem na jutro', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-quickdate-'))
  const { today } = seedAwake(dataDir, [])
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-requests').click()
      await page.keyboard.press('Control+KeyN')
      const field = page.getByTestId('case-add-title')
      await expect(field).toBeFocused()
      await expect(page.getByTestId('case-add-preview')).toHaveCount(0)
      await field.fill('Napisać raport !jutro @dziś')
      await expect(page.getByTestId('case-add-preview')).toHaveText('Termin: jutro · Wykonać: dziś')
      await field.press('Enter')
      await expect.poll(() => records(dataDir).map((r) => [r.title, r.dueDate, r.doDate])).toEqual([['Napisać raport', addDays(today, 1), today]])
      // The date of doing is today: it stands on „Dziś”, with its badge, the words gone from the title.
      const row = page.getByTestId('cases-today-list').getByTestId('case-row')
      await expect(row).toHaveCount(1)
      await expect(row.getByTestId('case-title')).toHaveValue('Napisać raport')
      await expect(row.getByTestId('case-due')).toHaveText('Termin jutro')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('plan poranny: karta „Terminy” – sprawy po terminie i z terminem w progu; „Pomiń” chowa do końca dnia, „Na Dziś” przenosi na „Dziś”; pusta – bez karty', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-deadlines-'))
  const { today } = seedAwake(dataDir, [])
  putRecord(dataDir, newTask('a', Date.now(), today, { title: 'Zapłacić podatek', dueDate: addDays(today, -1) })!)
  putRecord(dataDir, newTask('b', Date.now() - 1, today, { title: 'Wysłać faktury', dueDate: addDays(today, 1) })!)
  putRecord(dataDir, newTask('c', Date.now() - 2, today, { title: 'Daleki termin', dueDate: addDays(today, 5) })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('morning-plan')).toBeVisible({ timeout: 30_000 })
      if (await page.getByTestId('side-b').isVisible()) await page.getByTestId('side-b-done').click()
      await page.getByTestId('goals-skip').click()
      await page.getByTestId('checkin-skip').click()
      const card = page.getByTestId('deadline-card')
      await expect(card).toBeVisible()
      // The one past its date and the one due tomorrow (the threshold is 2 days) – not the one in 5 days.
      await expect(card.getByTestId('deadline-item')).toHaveCount(2)
      await expect(card).not.toContainText('Daleki termin')
      await expect(card.getByTestId('deadline-item').first()).toContainText('Zapłacić podatek')
      await expect(card.getByTestId('deadline-item').first().getByTestId('case-due')).toHaveText('Po terminie')
      // „Pomiń”: gone from the card, kept in the day's file (every computer), the sprawa itself untouched.
      await card.getByTestId('deadline-item').filter({ hasText: 'Wysłać faktury' }).getByTestId('deadline-skip').click()
      await expect(card.getByTestId('deadline-item')).toHaveCount(1)
      await expect.poll(() => (readJson(join(dataDir, paths.day(today)))?.asked as Record<string, string> | undefined)?.['deadline:b']).toBe('skip')
      expect(records(dataDir).find((r) => r.id === 'b')!.list).toBe('inbox')
      // „Na Dziś”: the list changes, the card is gone (nothing is left on it), the step of tasks offers the sprawa.
      await card.getByTestId('deadline-today').click()
      await expect.poll(() => records(dataDir).find((r) => r.id === 'a')!.list).toBe('today')
      await expect(page.getByTestId('deadline-card')).toHaveCount(0)
      await expect(page.getByTestId('queue-pick')).toContainText('Zapłacić podatek')
      // D454: in the step the sprawa has the badge of its due date (the card no longer says it).
      await expect(page.getByTestId('queue-item').filter({ hasText: 'Zapłacić podatek' }).getByTestId('case-due')).toHaveText('Po terminie')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Ustawienia: sekcja „Sprawy” – próg terminu w planie porannym (domyślnie 2 dni, 1–7), zapisany we wspólnych ustawieniach', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-settings').click()
      await expect(page.getByTestId('settings-cases')).toContainText('Ostrzegaj o terminie na')
      const field = page.getByTestId('setting-deadlineDays')
      await expect(field).toHaveValue('2')
      await field.fill('9')
      await field.press('Enter')
      await expect(page.getByTestId('setting-deadlineDays-error')).toBeVisible()
      await field.fill('5')
      await field.press('Enter')
      await page.getByTestId('nav-today').click()
      await page.getByTestId('nav-settings').click()
      await expect(page.getByTestId('setting-deadlineDays')).toHaveValue('5')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Sprawy: priorytet w wierszu – pasek z lewej i kolejność; przełącznik „Macierz”, przeciągnięcie z „Ważne” do „Ważne i pilne”, wybór pamiętany po zmianie strony', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-priority-'))
  const { today } = seedAwake(dataDir, [])
  putRecord(dataDir, newTask('t1', Date.now(), today, { title: 'Napisać raport' })!)
  putRecord(dataDir, newTask('t2', Date.now() - 1, today, { title: 'Zapłacić czynsz', priority: 'p2' })!)
  putRecord(dataDir, newTask('t3', Date.now() - 2, today, { title: 'Posprzątać biurko' })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await page.getByTestId('nav-requests').click()
      const rows = page.getByTestId('cases-inbox-list').getByTestId('case-row')
      await expect(rows).toHaveCount(3)
      // D450: P2 first (set in the file), then the two without a priority as they were (the newest first); no stripe without one.
      await expect(rows.nth(0).getByTestId('case-title')).toHaveValue('Zapłacić czynsz')
      await expect(rows.nth(0).getByTestId('case-priority')).toHaveAttribute('data-priority', 'p2')
      await expect(rows.nth(1).getByTestId('case-title')).toHaveValue('Napisać raport')
      await expect(rows.nth(1).getByTestId('case-priority')).toHaveCount(0)
      await expect(rows.nth(1).getByTestId('case-priority-choice')).toHaveValue('none')
      // „Ważne i pilne” chosen in the row: the stripe, the record and the place in the list (above P2).
      await rows.nth(1).getByTestId('case-priority-choice').selectOption('p1')
      await expect.poll(() => records(dataDir).find((r) => r.id === 't1')!.priority).toBe('p1')
      await expect(rows.nth(0).getByTestId('case-title')).toHaveValue('Napisać raport')
      await expect(rows.nth(0).getByTestId('case-priority')).toHaveAttribute('aria-label', 'Ważne i pilne')
      await expect(rows.nth(0).getByTestId('case-priority')).toHaveAttribute('data-priority', 'p1')
      await expect(rows.nth(2).getByTestId('case-priority-choice')).toHaveValue('none')

      // The switch „Listy · Macierz”: the matrix in place of the lists.
      await expect(page.getByTestId('cases-view-lists')).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId('cases-view-matrix').click()
      await expect(page.getByTestId('cases-matrix')).toBeVisible()
      await expect(page.getByTestId('cases-inbox-list')).toHaveCount(0)
      const p1 = page.getByTestId('matrix-p1')
      const p2 = page.getByTestId('matrix-p2')
      await expect(p1.getByTestId('matrix-card')).toHaveCount(1)
      await expect(p1).toContainText('Napisać raport')
      await expect(p2).toContainText('Zapłacić czynsz')
      await expect(page.getByTestId('matrix-none')).toContainText('Posprzątać biurko')
      await expect(page.getByTestId('matrix-p3')).toContainText('Pusto.')
      // The filter picks the list: nothing of „Dziś” yet; „wszystkie” brings them back.
      await page.getByTestId('matrix-filter-today').click()
      await expect(page.getByTestId('matrix-card')).toHaveCount(0)
      await page.getByTestId('matrix-filter-all').click()
      await expect(page.getByTestId('matrix-card')).toHaveCount(3)

      // Dragged from „Ważne” to „Ważne i pilne”: one write, the card in its new field.
      await drag(page, await center(page, 'matrix-card', p2), await center(page, 'matrix-p1'), async () => {
        await expect(page.getByTestId('matrix-drag')).toContainText('Zapłacić czynsz')
        await expect(p1).toHaveAttribute('data-over', 'true')
      })
      await expect.poll(() => records(dataDir).find((r) => r.id === 't2')!.priority).toBe('p1')
      await expect(p1.getByTestId('matrix-card')).toHaveCount(2)
      await expect(p2.getByTestId('matrix-card')).toHaveCount(0)
      // Into „Bez priorytetu”: the priority is cleared.
      await drag(page, await center(page, 'matrix-card', p1), await center(page, 'matrix-none'))
      await expect.poll(() => records(dataDir).filter((r) => r.priority == null).length).toBe(2)
      await expect(page.getByTestId('matrix-none').getByTestId('matrix-card')).toHaveCount(2)

      // The choice is remembered by the window: away and back – still the matrix; „Listy” remembered too.
      await page.getByTestId('nav-today').click()
      await page.getByTestId('nav-requests').click()
      await expect(page.getByTestId('cases-matrix')).toBeVisible()
      await page.getByTestId('cases-view-lists').click()
      await expect(page.getByTestId('cases-inbox-list')).toBeVisible()
      await page.getByTestId('nav-today').click()
      await page.getByTestId('nav-requests').click()
      await expect(page.getByTestId('cases-inbox-list')).toBeVisible()
      await expect(page.getByTestId('cases-matrix')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('priorytet: pasek przy sprawie w panelu przy osi „Dziś” i na kafelku jej bloku (kolor bloku dalej z kategorii)', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-priority-axis-'))
  const { today } = seedAwake(dataDir, [])
  putRecord(dataDir, newTask('t1', Date.now(), today, { title: 'Wymienić filtr', list: 'today', priority: 'p1' })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const chip = page.getByTestId('cases-panel-today').getByTestId('case-chip')
      await expect(chip.getByTestId('case-priority')).toHaveAttribute('data-priority', 'p1')
      await expect(chip.getByTestId('case-priority')).toHaveAttribute('aria-label', 'Ważne i pilne')
      await page.getByTestId('timeline-axis').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      const axis = (await page.getByTestId('timeline-axis').boundingBox())!
      const lo = Number(await page.getByTestId('timeline-axis').getAttribute('data-lo'))
      const ppm = Number(await page.getByTestId('timeline-axis').getAttribute('data-ppm'))
      await drag(page, await center(page, 'case-chip'), { x: axis.x + axis.width / 3, y: axis.y + (10 * 60 - lo) * ppm + 1 })
      await expect.poll(() => blocksOf(dataDir, today).length, { timeout: 15_000 }).toBe(1)
      const tile = page.getByTestId(`block-${blocksOf(dataDir, today)[0]!.id}`)
      await expect(tile.getByTestId('block-priority')).toHaveAttribute('data-priority', 'p1')
      await expect(tile.getByTestId('block-priority')).toHaveAttribute('aria-label', 'Ważne i pilne')
      // The colour of the tile stays the category's („Inne”): its edge is not the priority's.
      const edge = await tile.evaluate((el) => getComputedStyle(el).borderLeftColor)
      const stripe = await tile.getByTestId('block-priority').evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(edge).not.toBe(stripe)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('plan poranny: linia „N spraw ważnych i pilnych bez miejsca w planie” – tylko „Dziś” i „W tym tygodniu”, znika z blokiem dziś; „Pokaż w „Sprawach”” otwiera macierz', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-priority-morning-'))
  const { today } = seedAwake(dataDir, [])
  putRecord(dataDir, newTask('a', Date.now(), today, { title: 'Oddać wniosek', list: 'today', priority: 'p1' })!)
  putRecord(dataDir, newTask('b', Date.now() - 1, today, { title: 'Zapłacić podatek', list: 'week', priority: 'p1' })!)
  putRecord(dataDir, newTask('c', Date.now() - 2, today, { title: 'Kiedyś ważne', list: 'someday', priority: 'p1' })!)
  putRecord(dataDir, newTask('d', Date.now() - 3, today, { title: 'Tylko ważne', list: 'today', priority: 'p2' })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('morning-plan')).toBeVisible({ timeout: 30_000 })
      if (await page.getByTestId('side-b').isVisible()) await page.getByTestId('side-b-done').click()
      await page.getByTestId('goals-skip').click()
      await page.getByTestId('checkin-skip').click()
      // „Dziś” and „W tym tygodniu” – not „Kiedyś / Może”, not the P2 one.
      await expect(page.getByTestId('priority-line-text')).toHaveText('2 sprawy ważne i pilne bez miejsca w planie')
      // The tasks of „Dziś” get their blocks (the step chose them at once): the one of the week is left without a place.
      await page.getByTestId('queue-pick').getByTestId('queue-add').click()
      await expect.poll(() => blocksOf(dataDir, today).map((b) => b.task).sort()).toEqual(['a', 'd'])
      await expect(page.getByTestId('priority-line-text')).toHaveText('1 sprawa ważna i pilna bez miejsca w planie')
      // The link: the page „Sprawy” on the matrix, the sprawa under „Ważne i pilne”.
      await page.getByTestId('priority-line-open').click()
      await expect(page.getByTestId('cases-matrix')).toBeVisible()
      await expect(page.getByTestId('matrix-p1')).toContainText('Zapłacić podatek')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('plan poranny: bez spraw „Ważne i pilne” nie ma linii o priorytecie', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-cases-priority-none-'))
  const { today } = seedAwake(dataDir, [])
  putRecord(dataDir, newTask('a', Date.now(), today, { title: 'Zwykłe zadanie', list: 'today' })!)
  putRecord(dataDir, newTask('b', Date.now() - 1, today, { title: 'Tylko ważne', list: 'week', priority: 'p2' })!)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('morning-plan')).toBeVisible({ timeout: 30_000 })
      if (await page.getByTestId('side-b').isVisible()) await page.getByTestId('side-b-done').click()
      await page.getByTestId('goals-skip').click()
      await page.getByTestId('checkin-skip').click()
      await expect(page.getByTestId('queue-pick')).toContainText('Zwykłe zadanie')
      await expect(page.getByTestId('priority-line')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
