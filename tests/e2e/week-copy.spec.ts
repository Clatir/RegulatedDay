/**
 * „Skopiuj tydzień do…” (N16, D630–D634): w „Tygodniu” następny tydzień (wszystkie dni po dziś – nic nie zależy od godziny testu) skopiowany na
 * 2 następne – bloki poniedziałku na poniedziałki, środy na środy, w tych samych godzinach; oba docelowe poniedziałki mają blok w miejscu jednej
 * kopii – pytanie raz, z oboma dniami; „Uzupełnij luki”: kolidująca kopia pominięta; linia „Skopiowano tydzień … · Cofnij”; „Cofnij” przywraca
 * wszystkie dni. Z menu zaznaczenia: dwa bloki (Ctrl+klik) → „Skopiuj do tygodni… → Następny tydzień” – tylko one.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { weekCopyId } from '../../src/shared/engine/weekCopy'
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
const mondayOf = (date: string): string => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))
/** The blocks of a day's file still in the plan, with their hours. */
const planOf = (dir: string, date: string) => {
  const f = dayFileFrom(readJson(join(dir, paths.day(date))) ?? {}, date)
  return f.blocks.filter((b) => !f.cancelled.includes(b.id)).map((b) => ({ id: b.id, startMin: b.startMin }))
}
const block = (id: string, startMin: number, durationMin: number, name: string) => ({ id, categoryId: 'inne', startMin, durationMin, fixed: false, name })
const dotted = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

test('Tydzień: „Skopiuj tydzień do… → 2 następne tygodnie” – pn → pn, śr → śr, kolizja pyta raz, „Uzupełnij luki”, „Cofnij” przywraca wszystkie dni', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-copy-'))
  const { today } = seedAwake(dataDir, [])
  const mon = addDays(mondayOf(today), 7)
  const wed = addDays(mon, 2)
  const [mon1, mon2, wed1, wed2] = [addDays(mon, 7), addDays(mon, 14), addDays(wed, 7), addDays(wed, 14)]
  // After the sessions of a weekday: „Wieczór” 19:00, „Kolidujący” 21:00 (each target Monday has „Mój” 21:15 there), Wednesday's „Środa” 20:00.
  write(dataDir, paths.day(mon), { schema: 1, date: mon, blocks: [block('wieczor', 19 * 60, 30, 'Wieczór'), block('koliduje', 21 * 60, 45, 'Kolidujący')] })
  write(dataDir, paths.day(wed), { schema: 1, date: wed, blocks: [block('sroda', 20 * 60, 30, 'Środa')] })
  for (const d of [mon1, mon2]) write(dataDir, paths.day(d), { schema: 1, date: d, blocks: [block('moj', 21 * 60 + 15, 30, 'Mój')] })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 950 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('nav-week').click()
      await page.getByTestId('week-mode-week').click()
      await page.getByTestId('week-next').click()
      await expect(page.getByTestId('week-title')).toHaveAttribute('data-week', mon)
      await page.getByTestId('week-copy').click()
      await page.getByTestId('week-copy-next-2').click()
      // One question for both Mondays.
      const mode = page.getByTestId('week-copy-mode')
      await expect(mode).toBeVisible({ timeout: 15_000 })
      await expect(mode).toContainText(dotted(mon1))
      await expect(mode).toContainText(dotted(mon2))
      await page.getByTestId('week-copy-fill').click()
      await expect(mode).toBeHidden()
      await expect(page.getByTestId('group-line-week')).toContainText('na 2 tygodnie: dodano 4 bloki · pominięto 2 (kolizja)', { timeout: 15_000 })
      for (const [d, from] of [[mon1, mon], [mon2, mon]] as const) {
        await expect.poll(() => planOf(dataDir, d)).toEqual(expect.arrayContaining([{ id: 'moj', startMin: 21 * 60 + 15 }, { id: weekCopyId(d, from, 'wieczor'), startMin: 19 * 60 }]))
        expect(planOf(dataDir, d).map((b) => b.id)).not.toContain(weekCopyId(d, from, 'koliduje'))
      }
      for (const d of [wed1, wed2]) await expect.poll(() => planOf(dataDir, d)).toEqual([{ id: weekCopyId(d, wed, 'sroda'), startMin: 20 * 60 }])

      // „Cofnij” – every day back as it was.
      await page.getByTestId('group-line-week-undo').click()
      for (const d of [mon1, mon2]) await expect.poll(() => planOf(dataDir, d), { timeout: 15_000 }).toEqual([{ id: 'moj', startMin: 21 * 60 + 15 }])
      for (const d of [wed1, wed2]) await expect.poll(() => planOf(dataDir, d)).toEqual([])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('Tydzień: dwa zaznaczone bloki → „Skopiuj do tygodni… → Następny tydzień” – tylko one, linia „Skopiowano 2 bloki”', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-week-copy-sel-'))
  const { today } = seedAwake(dataDir, [])
  const tue = addDays(mondayOf(today), 8)
  const thu = addDays(tue, 2)
  write(dataDir, paths.day(tue), { schema: 1, date: tue, blocks: [block('w1', 19 * 60, 60, 'Pierwszy'), block('zostaje', 21 * 60, 30, 'Zostaje')] })
  write(dataDir, paths.day(thu), { schema: 1, date: thu, blocks: [block('w2', 19 * 60, 60, 'Drugi')] })
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 950 }).catch(() => undefined)
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
      await page.getByTestId('block-menu-copyweeks').click()
      await page.getByTestId('block-menu-copyweeks-1').click()
      await expect(page.getByTestId('group-line-week')).toContainText('Skopiowano 2 bloki na 1 tydzień: dodano 2 bloki', { timeout: 15_000 })
      await expect.poll(() => planOf(dataDir, addDays(tue, 7))).toEqual([{ id: weekCopyId(addDays(tue, 7), tue, 'w1'), startMin: 19 * 60 }])
      await expect.poll(() => planOf(dataDir, addDays(thu, 7))).toEqual([{ id: weekCopyId(addDays(thu, 7), thu, 'w2'), startMin: 19 * 60 }])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
