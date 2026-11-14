/**
 * Nowy blok zapisuje się sam (D461), stoi na osi jako szkic (D466) i ma godzinę końca (D464). „Dziś” (jutro: pobudka o 12:00
 * w `seedAwake`, pusty plan – bez wymiany, bez rozsuwania): kliknięcie osi tylko otwiera szkic (kafelek z przerywaną ramką, nic w
 * pliku), Esc i każde opuszczenie nietkniętego szkicu go odrzucają (przypadkowy klik nie tworzy bloku); szkic wyciągnięty przeciągnięciem po osi zapisuje się takim, jaki jest, przy „Zamknij”, kliku gdzie indziej, zmianie dnia i ekranu (z „Cofnij”); pierwsze zatwierdzone
 * pole zapisuje blok, a panel edytuje go dalej. Pole „Koniec” zmienia długość (początek zostaje), po północy z dopiskiem „+1 dzień”.
 * „Postaw na osi” w Sprawach i wykłady w ustawieniach mają je też.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { plDate } from '../../src/shared/format'
import { paths } from '../../src/shared/data/paths'
import { dayFileFrom } from '../../src/shared/model/plan'
import { newTask } from '../../src/shared/model/requests'
import { addDays } from '../../src/shared/time/zone'
import { launch, withMainLog } from './app'
import { seedAwake } from './seedAwake'

const blocksOn = (dir: string, date: string) => {
  try {
    return dayFileFrom(JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')), date).blocks
  } catch {
    return []
  }
}
const spans = (dir: string, date: string) => blocksOn(dir, date).map((b) => [b.categoryId, b.startMin, b.durationMin, b.name])

/** A click on the column of hours of the axis (an empty place: nothing is planned on tomorrow). */
async function clickAxis(page: Page, at = 0.5): Promise<void> {
  const hours = page.getByTestId('timeline-hours')
  await hours.scrollIntoViewIfNeeded()
  const box = (await hours.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * at)
}

/** A drag over the column of hours (an hour: 66 px) – a range made on purpose. */
async function dragAxis(page: Page, at = 0.5): Promise<void> {
  const hours = page.getByTestId('timeline-hours')
  await hours.scrollIntoViewIfNeeded()
  const box = (await hours.boundingBox())!
  const x = box.x + box.width / 2
  // Within what is in view (the axis is taller than the window).
  const top = Math.max(box.y, 0) + 10
  const bottom = Math.min(box.y + box.height, page.viewportSize()!.height) - 90
  const y = top + (bottom - top) * at
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 20, { steps: 4 })
  await page.mouse.move(x, y + 66, { steps: 4 })
  await page.mouse.up()
}

async function tomorrowPage(prefix: string) {
  const dataDir = mkdtempSync(join(tmpdir(), prefix))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  const run = await launch({ env: { RD_DATA_DIR: dataDir } })
  await run.page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
  await expect(run.page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
  await run.page.getByTestId('day-next').click()
  await expect(run.page.getByTestId('day-title')).not.toContainText('Dziś')
  return { ...run, dataDir, today, tomorrow }
}

test('nowy blok (D461, D466): kliknięcie osi to tylko szkic na osi (przerywana ramka, godziny), Esc go odrzuca; „Zamknij” zapisuje; „Dodaj” nie ma', async () => {
  const { app, page, userData, errors, dataDir, tomorrow } = await tomorrowPage('rd-e2e-autosave-draft-')
  try {
    await withMainLog(userData, async () => {
      await clickAxis(page)
      await expect(page.getByTestId('block-editor')).toBeVisible()
      const tile = page.getByTestId('draft-tile')
      await expect(tile).toBeVisible()
      await expect(tile).toHaveCSS('border-top-style', 'dashed')
      await expect(page.getByTestId('block-add')).toHaveCount(0)
      // The tile says the hours of the panel's start and length.
      const start = await page.getByTestId('block-start').inputValue()
      const end = await page.getByTestId('block-end').inputValue()
      await expect(page.getByTestId('draft-tile-hours')).toContainText(`${start}–${end}`)
      // A bare click creates no block.
      expect(spans(dataDir, tomorrow)).toEqual([])
      // Esc on a draft not touched throws it away: no tile, no panel, nothing in the file.
      await page.keyboard.press('Escape')
      await expect(tile).toHaveCount(0)
      await expect(page.getByTestId('block-editor')).toHaveCount(0)
      expect(spans(dataDir, tomorrow)).toEqual([])

      // A bare click and a click elsewhere: nothing was made – no block, the draft is gone (a stray click creates nothing).
      await clickAxis(page)
      await expect(tile).toBeVisible()
      await page.getByTestId('day-title').click()
      await expect(tile).toHaveCount(0)
      await expect(page.getByTestId('block-editor')).toHaveCount(0)
      // „+ Blok” untouched and „Zamknij”: thrown away too.
      await page.getByTestId('day-add').click()
      await expect(tile).toBeVisible()
      await page.getByTestId('block-editor-close').click()
      await expect(tile).toHaveCount(0)
      expect(spans(dataDir, tomorrow)).toEqual([])

      // A range dragged over the axis is on purpose: „Zamknij” saves it as it stands (an hour of „Inne”), the dashed tile becomes the block.
      await dragAxis(page)
      await expect(tile).toBeVisible()
      const first = await page.getByTestId('block-start').inputValue()
      await page.getByTestId('block-editor-close').click()
      await expect.poll(() => spans(dataDir, tomorrow).length, { timeout: 15_000 }).toBe(1)
      expect(spans(dataDir, tomorrow)[0]!.slice(0, 3)).toEqual(['inne', expect.any(Number), 60])
      await expect(tile).toHaveCount(0)
      await expect(page.getByTestId('block-editor')).toHaveCount(0)
      await expect(page.locator(`[data-testid="block-${blocksOn(dataDir, tomorrow)[0]!.id}"]`)).toContainText(first)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('nowy blok (D461, D464): pierwsze zatwierdzone pole zapisuje blok, panel edytuje go dalej; „Koniec” zmienia długość, po północy „+1 dzień”', async () => {
  const { app, page, userData, errors, dataDir, tomorrow } = await tomorrowPage('rd-e2e-autosave-fields-')
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      // The first committed field – the start – saves the block (the tile is the block's now, no draft).
      await page.getByTestId('block-start').fill('20:00')
      await page.getByTestId('block-start').press('Enter')
      await expect.poll(() => spans(dataDir, tomorrow), { timeout: 15_000 }).toEqual([['inne', 20 * 60, 60, null]])
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      // The panel stays on the block and goes on: the next fields save as those of any block.
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(page.getByTestId('block-start')).toHaveValue('20:00')
      await expect(page.getByTestId('block-end')).toHaveValue('21:00')
      // D464: the end typed changes the length, the start stays.
      await page.getByTestId('block-end').fill('22:30')
      await page.getByTestId('block-end').press('Enter')
      await expect.poll(() => spans(dataDir, tomorrow), { timeout: 15_000 }).toEqual([['inne', 20 * 60, 150, null]])
      await expect(page.getByTestId('block-duration')).toHaveValue('2 h 30 min')
      await expect(page.getByTestId('block-end-day')).toHaveCount(0)
      // The length changes the end.
      await page.getByTestId('block-duration').fill('4h')
      await page.getByTestId('block-duration').press('Enter')
      await expect(page.getByTestId('block-end')).toHaveValue('00:00 +1')
      await expect(page.getByTestId('block-end-day')).toHaveText('+1 dzień')
      // An end at or before the start is the next day's.
      await page.getByTestId('block-end').fill('9:00')
      await page.getByTestId('block-end').press('Enter')
      await expect.poll(() => spans(dataDir, tomorrow), { timeout: 15_000 }).toEqual([['inne', 20 * 60, 13 * 60, null]])
      await expect(page.getByTestId('block-end-day')).toHaveText('+1 dzień')
      // Too short an end is refused, with the reason under the field, and nothing changes.
      await page.getByTestId('block-end').fill('20:02')
      await page.getByTestId('block-end').press('Enter')
      await expect(page.getByTestId('block-end-error')).toHaveText('Blok trwa najkrócej 5 min.')
      expect(spans(dataDir, tomorrow)).toEqual([['inne', 20 * 60, 13 * 60, null]])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('nowy blok (D461): klik gdzie indziej, zmiana dnia i zmiana ekranu zapisują szkic z tym, co wpisano; Esc po wpisaniu nazwy cofa najpierw wpis', async () => {
  const { app, page, userData, errors, dataDir, tomorrow } = await tomorrowPage('rd-e2e-autosave-leave-')
  try {
    await withMainLog(userData, async () => {
      // A click elsewhere: the name typed (not left yet) is committed and saved with the block.
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('block-name')).toBeFocused()
      await page.keyboard.type('Wypad')
      await page.getByTestId('day-title').click()
      await expect.poll(() => spans(dataDir, tomorrow).map((b) => b[3]), { timeout: 15_000 }).toEqual(['Wypad'])
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)

      // Esc while the name is being typed throws the typed text away; the next Esc throws the draft away.
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await page.keyboard.type('Nie zapisuj')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await expect(page.getByTestId('block-name')).toHaveValue('')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      expect(spans(dataDir, tomorrow)).toHaveLength(1)

      // A drag and a click elsewhere saves it (on purpose); another day too.
      await dragAxis(page, 0.2)
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await page.getByTestId('day-title').click()
      await expect.poll(() => spans(dataDir, tomorrow).length, { timeout: 15_000 }).toBe(2)
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      await dragAxis(page, 0.7)
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await page.getByTestId('day-next').click()
      await expect.poll(() => spans(dataDir, tomorrow).length, { timeout: 15_000 }).toBe(3)
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      expect(blocksOn(dataDir, addDays(tomorrow, 1))).toEqual([])

      // Another screen (the menu): the same – and with the keyboard (Ctrl 2: the calendar) too.
      await page.getByTestId('day-prev').click()
      await dragAxis(page, 0.4)
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await page.keyboard.press('Control+Digit2')
      await expect.poll(() => spans(dataDir, tomorrow).length, { timeout: 15_000 }).toBe(4)
      // „+ Blok” untouched, another screen: nothing is made.
      await page.getByTestId('nav-today').click()
      await page.getByTestId('day-add').click()
      await expect(page.getByTestId('draft-tile')).toBeVisible()
      await page.keyboard.press('Control+Digit2')
      await page.keyboard.press('Control+Digit1')
      await expect(page.getByTestId('day-add')).toBeVisible()
      await expect(page.getByTestId('draft-tile')).toHaveCount(0)
      expect(spans(dataDir, tomorrow)).toHaveLength(4)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('nowy blok (D461): po zapisie „Dodano blok · Cofnij” zdejmuje blok; w „Tygodniu” to samo, a goły klik po siatce nic nie zostawia', async () => {
  const { app, page, userData, errors, dataDir, tomorrow } = await tomorrowPage('rd-e2e-autosave-undo-')
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('day-add').click()
      await page.getByTestId('block-start').fill('20:00')
      await page.getByTestId('block-start').press('Enter')
      await expect.poll(() => spans(dataDir, tomorrow), { timeout: 15_000 }).toEqual([['inne', 20 * 60, 60, null]])
      const toast = page.getByTestId('toast-action')
      await expect(toast).toHaveText('Cofnij')
      await expect(page.getByRole('status').filter({ hasText: 'Dodano blok' })).toBeVisible()
      await toast.click()
      await expect.poll(() => spans(dataDir, tomorrow), { timeout: 15_000 }).toEqual([])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('„Postaw na osi” w Sprawach (D464): koniec zmienia długość bloku, szacunek sprawy zostaje; wykład w ustawieniach ma „Koniec”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-autosave-cases-'))
  const { today } = seedAwake(dataDir, [])
  const tomorrow = addDays(today, 1)
  mkdirSync(join(dataDir, 'requests'), { recursive: true })
  const task = newTask('t1', Date.now(), today, { title: 'Napisać raport', list: 'today', estimateMin: 30 })!
  writeFileSync(join(dataDir, 'requests', 't1.json'), JSON.stringify(task))
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined)
      await expect(page.getByTestId('day-add')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-requests').click()
      await page.getByTestId('case-plan-open').first().click()
      const form = page.getByTestId('case-plan-form')
      await expect(form).toBeVisible()
      await form.getByTestId('case-plan-date').fill(plDate(tomorrow))
      await form.getByTestId('case-plan-date').press('Enter')
      // The day counted (the proposal of the start is there) before the start is typed.
      await expect(form.getByTestId('case-plan-date')).toHaveValue(plDate(tomorrow))
      await expect(form.getByTestId('case-plan-end')).toBeVisible()
      await form.getByTestId('case-plan-start').fill('10:00')
      await form.getByTestId('case-plan-start').press('Enter')
      await expect(form.getByTestId('case-plan-end')).toHaveValue('10:30')
      await form.getByTestId('case-plan-end').fill('11:30')
      await form.getByTestId('case-plan-end').press('Enter')
      await expect(form.getByTestId('case-plan-length')).toHaveText('1 h 30 min')
      await form.getByTestId('case-plan-save').click()
      await expect.poll(() => spans(dataDir, tomorrow).map((b) => [b[1], b[2]]), { timeout: 15_000 }).toEqual([[600, 90]])
      const record = JSON.parse(readFileSync(join(dataDir, 'requests', readdirSync(join(dataDir, 'requests'))[0]!), 'utf8')) as { estimateMin: number }
      expect(record.estimateMin).toBe(30)

      // Lectures in the settings: the end beside the hour, the length follows it.
      await page.getByTestId('nav-settings').click()
      const lectures = page.getByTestId('settings-lectures')
      await lectures.scrollIntoViewIfNeeded()
      await lectures.getByTestId('lecture-new').click()
      const end = lectures.getByTestId('lecture-end')
      await expect(end).toHaveValue('19:30')
      await end.fill('21:00')
      await end.press('Enter')
      await expect(lectures.getByLabel('Długość')).toHaveValue('3 h')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
