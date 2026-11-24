/**
 * Zaznaczanie wielu (D527–D529, ciąg Z): oś dnia („Dziś” – tu jutro, żeby nic nie zależało od godziny testu): Ctrl+klik A i C, Shift+klik E → obwódka
 * A, C, D, E i napis „Zaznaczone: 4”; klik B → tylko B i panel; Esc zamyka panel i zdejmuje obwódkę; Ctrl+klik bez ruchu nie kopiuje, Ctrl+przeciągnięcie
 * kopiuje (D513); prawy przycisk na zaznaczonym – menu „Zmień N bloków”, Esc je zamyka. „Tydzień”: Ctrl+klik dwóch bloków z różnych dni nie otwiera dnia.
 * Kalendarz: Ctrl+klik pierwszego dnia, Shift+klik siódmego, prawy przycisk → „Wolne”: linia „Zmieniono 7 dni · Cofnij”, „Cofnij” przywraca.
 * Działania menu bloków: na osi jutra „Przesuń o… → później 15 min” i w „Tygodniu” „Koszt…” dwóch dni – linia i „Cofnij” (Z4-B, Z5).
 * Przeciąganie grupy (D531): na osi jutra dwa zaznaczone o godzinę później (w trakcie drugi na nowym miejscu, kolejny rozsunięty), linia
 * „Przeniesiono 2 bloki · Cofnij”, „Cofnij” przywraca; w „Tygodniu” dwa bloki wtorku na czwartek – miejsce drugiego widać w trakcie, oba dni jedną
 * zmianą, „Cofnij” przywraca oba.
 * „Przesuń resztę dnia o…” (N17, D584): z menu jednego bloku na osi jutra i w „Tygodniu” +30 min – 4 elastyczne przesunięte (jeden przeskakuje
 * stały), stały na miejscu, linia „Przesunięto 4 bloki” z ostrzeżeniem maksimum (D72), „Cofnij” przywraca plik dnia.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
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
const blocksOf = (dir: string, date: string) => dayFileFrom(readJson(join(dir, paths.day(date))) ?? {}, date).blocks
const mondayOf = (date: string): string => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))

test('oś dnia: Ctrl+klik, Shift+klik, klik, Esc, Ctrl bez ruchu nie kopiuje, Ctrl+przeciągnięcie kopiuje, menu prawego przycisku', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-select-day-'))
  const { today } = seedAwake(dataDir, [])
  // Tomorrow evening (after any session of its template): five blocks of half an hour, A–E, an hour apart.
  const tomorrow = addDays(today, 1)
  const blocks = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, categoryId: 'inne', startMin: (18 + i) * 60, durationMin: 30, fixed: false, name: id.toUpperCase() }))
  write(dataDir, paths.day(tomorrow), { schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const tile = (id: string) => page.getByTestId(`block-${id}`)
      await expect(tile('e')).toBeVisible({ timeout: 30_000 })
      await tile('a').evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const marked = page.locator('[data-testid^="block-"][data-marked="true"]')

      // The example of the specification: Ctrl+click A and C, Shift+click E – A, C, D, E, the line over the axis, no panel.
      await tile('a').click({ modifiers: ['Control'] })
      await tile('c').click({ modifiers: ['Control'] })
      await tile('e').click({ modifiers: ['Shift'] })
      await expect(marked).toHaveCount(4)
      for (const id of ['a', 'c', 'd', 'e']) await expect(tile(id)).toHaveAttribute('data-marked', 'true')
      await expect(tile('b')).not.toHaveAttribute('data-marked', 'true')
      await expect(page.getByTestId('axis-selection')).toContainText('Zaznaczone: 4')
      await expect(page.getByTestId('block-editor')).toHaveCount(0)

      // A click on B: only B, its panel opens; the line is gone.
      await tile('b').click()
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(marked).toHaveCount(1)
      await expect(tile('b')).toHaveAttribute('data-marked', 'true')
      await expect(page.getByTestId('axis-selection')).toHaveCount(0)
      // Esc closes the panel and takes the selection of one with it (D462).
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('block-editor')).toHaveCount(0)
      await expect(marked).toHaveCount(0)

      // Ctrl+click without a move only selects – no copy; then the menu of the right button for the selection, Esc closes it.
      await tile('a').click({ modifiers: ['Control'] })
      await tile('b').click({ modifiers: ['Control'] })
      await expect(marked).toHaveCount(2)
      expect(blocksOf(dataDir, tomorrow)).toHaveLength(5)
      await tile('b').click({ button: 'right' })
      await expect(page.getByTestId('block-menu')).toHaveAttribute('aria-label', 'Zmień 2 bloki')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('block-menu')).toHaveCount(0)
      await expect(marked).toHaveCount(2)
      await page.keyboard.press('Escape')
      await expect(marked).toHaveCount(0)

      // Ctrl held while the block is dragged and let go: the original stays, its copy stands there (D513) – the selection is not touched.
      const box = (await tile('a').boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + 10
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y - 12, { steps: 3 })
      await page.keyboard.down('Control')
      // An hour up (1.1 px a minute): 17:00, an empty place.
      await page.mouse.move(x, y - 66, { steps: 6 })
      await expect(page.getByTestId('copy-ghost')).toHaveAttribute('data-start', String(17 * 60))
      await page.mouse.up()
      await page.keyboard.up('Control')
      await expect.poll(() => blocksOf(dataDir, tomorrow).length, { timeout: 15_000 }).toBe(6)
      expect(blocksOf(dataDir, tomorrow).find((b) => b.id === 'a')!.startMin).toBe(18 * 60)
      expect(blocksOf(dataDir, tomorrow).filter((b) => b.startMin === 17 * 60)).toHaveLength(1)
      await expect(marked).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień: Ctrl+klik dwóch bloków z różnych dni zaznacza je bez otwierania dnia, napis „Zaznaczone: 2”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-select-week-'))
  const { today } = seedAwake(dataDir, [])
  // The next week: none of its days gone, none today.
  const tue = addDays(mondayOf(today), 8)
  const thu = addDays(tue, 2)
  write(dataDir, paths.day(tue), { schema: 1, date: tue, blocks: [{ id: 'w1', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false }] })
  write(dataDir, paths.day(thu), { schema: 1, date: thu, blocks: [{ id: 'w2', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false }] })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      const first = page.getByTestId(`week-block-${tue}-w1`)
      const second = page.getByTestId(`week-block-${thu}-w2`)
      await expect(first).toBeVisible({ timeout: 30_000 })
      await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await first.click({ modifiers: ['Control'] })
      await second.click({ modifiers: ['Control'] })
      await expect(first).toHaveAttribute('data-marked', 'true')
      await expect(second).toHaveAttribute('data-marked', 'true')
      await expect(page.getByTestId('week-selection')).toContainText('Zaznaczone: 2')
      // The days stayed closed: still the page of the week.
      await expect(page.getByTestId('week')).toBeVisible()
      await expect(page.getByTestId('today')).toHaveCount(0)
      // Esc clears.
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('week-selection')).toHaveCount(0)
      await expect(first).not.toHaveAttribute('data-marked', 'true')
      // Del with one block selected (UX17, F8): the question names the block; Esc leaves it, a second Del and „Usuń” remove it – only it.
      await first.click({ modifiers: ['Control'] })
      await expect(first).toHaveAttribute('data-marked', 'true')
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-ask')).toContainText('Usunąć „')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('delete-ask')).toHaveCount(0)
      await expect(first).toBeVisible()
      await page.keyboard.press('Delete')
      await page.getByTestId('delete-ask-yes').click()
      await expect(first).toHaveCount(0)
      await expect(second).toBeVisible()
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Kalendarz: Ctrl+klik pierwszego dnia, Shift+klik siódmego, prawy przycisk → „Wolne”: linia „Zmieniono 7 dni · Cofnij”, „Cofnij” przywraca typ', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-select-calendar-'))
  const { today } = seedAwake(dataDir, [])
  // Days of the next month (all to come, whatever the day of the test): the 7th to the 13th.
  const next = addDays(`${today.slice(0, 7)}-01`, 32).slice(0, 7)
  const days = [7, 8, 9, 10, 11, 12, 13].map((n) => `${next}-${String(n).padStart(2, '0')}`)
  const typeOf = (d: string) => readJson(join(dataDir, paths.day(d)))?.dayType ?? null
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-calendar').click()
      await expect(page.getByTestId('calendar')).toBeVisible()
      await page.getByTestId('month-next').click()
      await expect(page.getByTestId('calendar')).toHaveAttribute('data-counted', 'true', { timeout: 30_000 })
      const cell = (d: string) => page.getByTestId(`day-${d}`)
      await cell(days[0]!).click({ modifiers: ['Control'] })
      await cell(days[6]!).click({ modifiers: ['Shift'] })
      for (const d of days) await expect(cell(d)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('calendar-selection')).toContainText('Zaznaczone dni: 7')
      await cell(days[6]!).click({ button: 'right' })
      await expect(page.getByTestId('calendar-menu')).toHaveAttribute('aria-label', 'Zmień 7 dni')
      await page.getByTestId('calendar-menu-type').click()
      await page.getByTestId('calendar-menu-type-wolne').click()
      await expect.poll(() => days.map(typeOf), { timeout: 15_000 }).toEqual(Array(7).fill('wolne'))
      await expect(page.getByTestId('group-line-calendar')).toContainText('Zmieniono 7 dni')
      await expect(page.getByTestId('group-line-calendar-undo')).toHaveText('Cofnij')
      await page.getByTestId('group-line-calendar-undo').click()
      await expect.poll(() => days.map(typeOf), { timeout: 15_000 }).toEqual(Array(7).fill(null))
      await expect(page.getByTestId('group-line-calendar')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('oś dnia (jutro): zaznaczone dwa bloki → menu „Przesuń o… → Później o… → 15 min”: 18:15 i 19:15, linia „Zmieniono 2 bloki · Cofnij”, „Cofnij” przywraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-group-day-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const blocks = ['a', 'b', 'c'].map((id, i) => ({ id, categoryId: 'inne', startMin: (18 + i) * 60, durationMin: 30, fixed: false, name: id.toUpperCase() }))
  write(dataDir, paths.day(tomorrow), { schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks })
  const starts = () => Object.fromEntries(blocksOf(dataDir, tomorrow).map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const tile = (id: string) => page.getByTestId(`block-${id}`)
      await expect(tile('c')).toBeVisible({ timeout: 30_000 })
      await tile('a').evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await tile('a').click({ modifiers: ['Control'] })
      await tile('b').click({ modifiers: ['Control'] })
      await tile('b').click({ button: 'right' })
      await expect(page.getByTestId('block-menu')).toHaveAttribute('aria-label', 'Zmień 2 bloki')
      await page.getByTestId('block-menu-shift').click()
      await page.getByTestId('block-menu-later').click()
      await page.getByTestId('block-menu-later-15').click()
      await expect.poll(starts, { timeout: 15_000 }).toEqual({ a: 18 * 60 + 15, b: 19 * 60 + 15, c: 20 * 60 })
      await expect(page.getByTestId('group-line-today')).toContainText('Zmieniono 2 bloki')
      await page.getByTestId('group-line-today-undo').click()
      await expect.poll(starts, { timeout: 15_000 }).toEqual({ a: 18 * 60, b: 19 * 60, c: 20 * 60 })
      await expect(page.getByTestId('group-line-today')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień: dwa bloki z różnych dni → menu „Koszt…” → głowa +1, bodźce wpisane 40 (D568) → „Zastosuj”: oba dni jedną zmianą, linia „Zmieniono 2 bloki”, „Cofnij” przywraca oba', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-group-week-'))
  const { today } = seedAwake(dataDir, [])
  const tue = addDays(mondayOf(today), 8)
  const thu = addDays(tue, 2)
  write(dataDir, paths.day(tue), { schema: 1, date: tue, blocks: [{ id: 'w1', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false }] })
  write(dataDir, paths.day(thu), { schema: 1, date: thu, blocks: [{ id: 'w2', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false }] })
  const costs = () => [...blocksOf(dataDir, tue), ...blocksOf(dataDir, thu)].map((b) => b.costs)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      const first = page.getByTestId(`week-block-${tue}-w1`)
      const second = page.getByTestId(`week-block-${thu}-w2`)
      await expect(first).toBeVisible({ timeout: 30_000 })
      await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await first.click({ modifiers: ['Control'] })
      await second.click({ modifiers: ['Control'] })
      await second.click({ button: 'right' })
      await expect(page.getByTestId('block-menu')).toHaveAttribute('aria-label', 'Zmień 2 bloki')
      await page.getByTestId('block-menu-cost').click()
      const head = Number(await page.getByTestId('group-cost-head-value').inputValue())
      await page.getByTestId('group-cost-head-plus').click()
      // D568: a cost past the old ±5, typed in the field (it saves on leaving it).
      await page.getByTestId('group-cost-senses-value').fill('40')
      await page.getByTestId('group-cost-senses-value').press('Tab')
      await expect(page.getByTestId('group-cost-senses-value')).toHaveValue('40')
      await page.getByTestId('group-cost-apply').click()
      await expect.poll(() => costs().map((c) => (c ? [c.head, c.senses] : null)), { timeout: 15_000 }).toEqual([
        [head + 1, 40],
        [head + 1, 40]
      ])
      await expect(page.getByTestId('group-line-week')).toContainText('Zmieniono 2 bloki')
      await page.getByTestId('group-line-week-undo').click()
      await expect.poll(costs, { timeout: 15_000 }).toEqual([null, null])
      await expect(page.getByTestId('group-line-week')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** The evening of N17's examples: b would end on the fixed F once 30 min later – it jumps behind it; c follows b; d has room (after the sessions of a weekday). */
const restDay = (date: string) => ({
  schema: 1,
  date,
  wakeMin: 12 * 60,
  blocks: [
    { id: 'a', categoryId: 'inne', startMin: 18 * 60, durationMin: 60, fixed: false, name: 'A' },
    { id: 'b', categoryId: 'inne', startMin: 19 * 60, durationMin: 75, fixed: false, name: 'B' },
    { id: 'f', categoryId: 'inne', startMin: 20 * 60 + 30, durationMin: 60, fixed: true, name: 'F' },
    { id: 'c', categoryId: 'inne', startMin: 21 * 60 + 30, durationMin: 30, fixed: false, name: 'C' },
    { id: 'd', categoryId: 'inne', startMin: 23 * 60, durationMin: 30, fixed: false, name: 'D' }
  ]
})
const REST_BEFORE = { a: 18 * 60, b: 19 * 60, f: 20 * 60 + 30, c: 21 * 60 + 30, d: 23 * 60 }
const REST_AFTER = { a: 18 * 60 + 30, b: 21 * 60 + 30, f: 20 * 60 + 30, c: 22 * 60 + 45, d: 23 * 60 + 30 }

test('„Przesuń resztę dnia o…” (N17): oś jutra – menu jednego bloku „Później o… → 30 min”: 4 elastyczne, stały na miejscu, linia z ostrzeżeniem; „Cofnij” przywraca plik dnia', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-group-rest-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  write(dataDir, paths.day(tomorrow), restDay(tomorrow))
  // The plan of the day's file as read (its blocks with every field): what „Cofnij” brings back.
  const before = blocksOf(dataDir, tomorrow)
  const starts = () => Object.fromEntries(blocksOf(dataDir, tomorrow).map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const tile = page.getByTestId('block-a')
      await expect(tile).toBeVisible({ timeout: 30_000 })
      await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await tile.click({ button: 'right' })
      await expect(page.getByTestId('block-menu')).toHaveAttribute('aria-label', 'Zmień 1 blok')
      await page.getByTestId('block-menu-rest').click()
      await page.getByTestId('block-menu-rest-later').click()
      await page.getByTestId('block-menu-rest-later-30').click()
      await expect.poll(starts, { timeout: 15_000 }).toEqual(REST_AFTER)
      await expect(page.getByTestId('group-line-today')).toContainText('Przesunięto 4 bloki')
      // The work of the evening ends later past the day's maximum: said, written all the same (D72).
      await expect(page.getByTestId('group-line-today')).toContainText('praca kończy się po maksimum')
      await page.getByTestId('group-line-today-undo').click()
      await expect.poll(starts, { timeout: 15_000 }).toEqual(REST_BEFORE)
      expect(blocksOf(dataDir, tomorrow)).toEqual(before)
      await expect(page.getByTestId('group-line-today')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('„Przesuń resztę dnia o…” (N17): „Tydzień” – prawy przycisk na bloku wtorku „Później o… → 30 min”: ten sam wynik, linia „Przesunięto 4 bloki”, „Cofnij” przywraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-group-rest-week-'))
  const { today } = seedAwake(dataDir, [])
  const tue = addDays(mondayOf(today), 8)
  write(dataDir, paths.day(tue), restDay(tue))
  const starts = () => Object.fromEntries(blocksOf(dataDir, tue).map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      const box = page.getByTestId(`week-block-${tue}-a`)
      await expect(box).toBeVisible({ timeout: 30_000 })
      await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await box.click({ button: 'right' })
      await expect(page.getByTestId('block-menu')).toHaveAttribute('aria-label', 'Zmień 1 blok')
      await page.getByTestId('block-menu-rest').click()
      await page.getByTestId('block-menu-rest-later').click()
      await page.getByTestId('block-menu-rest-later-30').click()
      await expect.poll(starts, { timeout: 15_000 }).toEqual(REST_AFTER)
      await expect(page.getByTestId('group-line-week')).toContainText('Przesunięto 4 bloki')
      await page.getByTestId('group-line-week-undo').click()
      await expect.poll(starts, { timeout: 15_000 }).toEqual(REST_BEFORE)
      await expect(page.getByTestId('group-line-week')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('przeciąganie grupy (D531): oś jutra – dwa zaznaczone o godzinę później, kolejny rozsunięty; „Cofnij” przywraca', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-group-drag-day-'))
  const { today } = seedAwake(dataDir, [])
  // Tomorrow evening (after any session of its template): A 18:00, B 19:00, C 20:15 – half an hour each.
  const tomorrow = addDays(today, 1)
  const blocks = [
    { id: 'a', categoryId: 'inne', startMin: 18 * 60, durationMin: 30, fixed: false, name: 'A' },
    { id: 'b', categoryId: 'inne', startMin: 19 * 60, durationMin: 30, fixed: false, name: 'B' },
    { id: 'c', categoryId: 'inne', startMin: 20 * 60 + 15, durationMin: 30, fixed: false, name: 'C' }
  ]
  write(dataDir, paths.day(tomorrow), { schema: 1, date: tomorrow, wakeMin: 12 * 60, blocks })
  const startOf = (id: string) => blocksOf(dataDir, tomorrow).find((b) => b.id === id)?.startMin
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-next').click()
      const tile = (id: string) => page.getByTestId(`block-${id}`)
      await expect(tile('c')).toBeVisible({ timeout: 30_000 })
      await tile('a').evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await tile('a').click({ modifiers: ['Control'] })
      await tile('b').click({ modifiers: ['Control'] })
      await expect(page.getByTestId('axis-selection')).toContainText('Zaznaczone: 2')

      // A held an hour lower (1.1 px a minute): B stands at its new place dashed, C pushed on.
      const box = (await tile('a').boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + 10
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y + 12, { steps: 3 })
      await page.mouse.move(x, y + 66, { steps: 6 })
      await expect(tile('b')).toHaveAttribute('data-group-moved', 'true')
      await expect(tile('c')).toHaveAttribute('data-pushed', 'true')
      await page.mouse.up()
      await expect.poll(() => [startOf('a'), startOf('b')], { timeout: 15_000 }).toEqual([19 * 60, 20 * 60])
      expect(startOf('c')!).toBeGreaterThanOrEqual(20 * 60 + 30)
      await expect(page.getByTestId('group-line-today')).toContainText('Przeniesiono 2 bloki')
      await page.getByTestId('group-line-today-undo').click()
      await expect.poll(() => [startOf('a'), startOf('b'), startOf('c')], { timeout: 15_000 }).toEqual([18 * 60, 19 * 60, 20 * 60 + 15])
      await expect(page.getByTestId('group-line-today')).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('przeciąganie grupy (D531): „Tydzień” – dwa bloki wtorku na czwartek, miejsce drugiego widać w trakcie; „Cofnij” przywraca oba dni', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-group-drag-week-'))
  const { today } = seedAwake(dataDir, [])
  // The next week: none of its days gone, none today.
  const tue = addDays(mondayOf(today), 8)
  const thu = addDays(tue, 2)
  write(dataDir, paths.day(tue), {
    schema: 1,
    date: tue,
    blocks: [
      { id: 'w1', categoryId: 'inne', startMin: 19 * 60, durationMin: 60, fixed: false },
      { id: 'w2', categoryId: 'inne', startMin: 20 * 60 + 30, durationMin: 30, fixed: false }
    ]
  })
  write(dataDir, paths.day(thu), { schema: 1, date: thu, blocks: [{ id: 't1', categoryId: 'inne', startMin: 19 * 60 + 30, durationMin: 30, fixed: false }] })
  const startsOn = (date: string) => Object.fromEntries(blocksOf(dataDir, date).map((b) => [b.id, b.startMin]))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      const first = page.getByTestId(`week-block-${tue}-w1`)
      const second = page.getByTestId(`week-block-${tue}-w2`)
      await expect(first).toBeVisible({ timeout: 30_000 })
      await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await first.click({ modifiers: ['Control'] })
      await second.click({ modifiers: ['Control'] })
      await expect(page.getByTestId('week-selection')).toContainText('Zaznaczone: 2')

      // W1 held at the same hour of Thursday: the band of W2 stands in Thursday's column too.
      const box = (await first.boundingBox())!
      const col = (await page.getByTestId(`week-col-${thu}`).boundingBox())!
      const y = box.y + 6
      await page.mouse.move(box.x + box.width / 2, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 10, y, { steps: 3 })
      await page.mouse.move(col.x + col.width / 2, y, { steps: 8 })
      const band = page.getByTestId('week-group-drop')
      await expect(band).toHaveAttribute('data-of', `${tue}|w2`)
      await expect(band).toHaveAttribute('data-start', String(20 * 60 + 30))
      await page.mouse.up()
      await expect.poll(() => startsOn(thu), { timeout: 15_000 }).toEqual({ t1: 20 * 60, w1: 19 * 60, w2: 20 * 60 + 30 })
      expect(startsOn(tue)).toEqual({})
      await expect(page.getByTestId('group-line-week')).toContainText('Przeniesiono 2 bloki')
      await page.getByTestId('group-line-week-undo').click()
      await expect.poll(() => startsOn(tue), { timeout: 15_000 }).toEqual({ w1: 19 * 60, w2: 20 * 60 + 30 })
      // The two files of one „Cofnij” are written one after the other: Thursday waited for too (T1972).
      await expect.poll(() => startsOn(thu), { timeout: 15_000 }).toEqual({ t1: 19 * 60 + 30 })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
