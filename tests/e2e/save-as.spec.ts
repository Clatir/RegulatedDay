/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619): today's plan from the menu „⋯” saved as the template of its day („Dzień zwykły”) from tomorrow –
 * the line „Zapisano 2 bloki w szablonie „Dzień zwykły” od DD.MM · Cofnij”, a later ordinary day has the same blocks at the same hours, the version
 * the days before take stays as it was; „Cofnij” takes the version back and the later day is empty again. Then the same plan as a routine – the
 * steps of the blocks' names and lengths, the line „Zapisano rutynę …”. The days are counted from `logicalToday()` (nothing depends on the hour).
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { paths } from '../../src/shared/data/paths'
import { templateBlockId } from '../../src/shared/engine/createDay'
import { plDayMonth } from '../../src/shared/format'
import { DEFAULT_SESSIONS } from '../../src/shared/model/settings'
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
type Version = { blocks: Array<{ id: string; startMin: number; name?: string | null }> }
const versionsOf = (dir: string) => (readJson(join(dir, paths.record('template', 'zwykly')))?.versions ?? {}) as Record<string, Version>

test('plan dnia jako szablon od jutra: późniejszy dzień zwykły ma te same bloki, dni przed datą bez zmian, „Cofnij”; potem jako rutyna', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-save-as-'))
  const { today, dayFile } = seedAwake(dataDir, [
    { id: 'a', categoryId: 'inne', startMin: 18 * 60, durationMin: 60, fixed: false, name: 'Raport E2E' },
    { id: 'b', categoryId: 'inne', startMin: 20 * 60, durationMin: 30, fixed: false, name: 'Trening E2E' }
  ])
  const tomorrow = addDays(today, 1)
  // A later day of the ordinary type without blocks of its own and without sessions (only the template's blocks stand on it).
  const later = addDays(today, 2)
  write(dataDir, paths.day(later), { schema: 1, date: later, dayType: 'zwykly', sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])) })
  const oldVersions = versionsOf(dataDir)
  const todayBefore = readFileSync(dayFile, 'utf8')
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1400, height: 1000 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('block-a')).toBeVisible({ timeout: 30_000 })

      await page.getByTestId('day-menu').click()
      await page.getByTestId('day-save-template').click()
      const dialog = page.getByTestId('save-template')
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId('save-template-which')).toHaveValue('zwykly')
      await expect(page.getByTestId('save-template-from')).toHaveValue(`${tomorrow.slice(8, 10)}.${tomorrow.slice(5, 7)}.${tomorrow.slice(0, 4)}`)
      await expect(page.getByTestId('save-template-going')).toContainText('2 bloki')
      await page.getByTestId('save-template-apply').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('group-line-today')).toContainText(`Zapisano 2 bloki w szablonie „Dzień zwykły” od ${plDayMonth(tomorrow)}`)

      // The template: a new version from tomorrow with the day's blocks; the versions before it as they were.
      await expect.poll(() => Object.keys(versionsOf(dataDir)).includes(tomorrow), { timeout: 15_000 }).toBe(true)
      const v = versionsOf(dataDir)
      for (const [from, version] of Object.entries(oldVersions)) expect(v[from]).toEqual(version)
      const made = v[tomorrow]!.blocks.filter((b) => b.name === 'Raport E2E' || b.name === 'Trening E2E')
      expect(made.map((b) => [b.name, b.startMin])).toEqual([
        ['Raport E2E', 18 * 60],
        ['Trening E2E', 20 * 60]
      ])
      // Today (before the date) as it was.
      expect(readFileSync(dayFile, 'utf8')).toBe(todayBefore)

      // The later day: the same blocks, made by the template.
      await page.getByTestId('day-next').click()
      await page.getByTestId('day-next').click()
      const tiles = made.map((b) => page.getByTestId(`block-${templateBlockId(later, 'zwykly', b.id)}`))
      for (const t of tiles) await expect(t).toBeVisible({ timeout: 30_000 })
      await expect(tiles[0]!).toContainText('Raport E2E')
      await expect(tiles[1]!).toContainText('Trening E2E')

      // „Cofnij”: the version from tomorrow is gone, the later day without the blocks.
      await page.getByTestId('group-line-today-undo').click()
      await expect.poll(() => Object.keys(versionsOf(dataDir)).includes(tomorrow), { timeout: 15_000 }).toBe(false)
      for (const t of tiles) await expect(t).toHaveCount(0, { timeout: 30_000 })

      // Today's plan as a routine: its steps are the blocks' names and lengths.
      await page.getByTestId('day-today').click()
      await expect(page.getByTestId('block-a')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('day-menu').click()
      await page.getByTestId('day-save-routine').click()
      await expect(page.getByTestId('new-routine-name')).toHaveValue('Raport E2E')
      await page.getByTestId('new-thing-save').click()
      await expect(page.getByTestId('group-line-today')).toContainText('Zapisano rutynę „Raport E2E” · 2 kroki')
      const routineDir = join(dataDir, 'routines')
      const files = () => (existsSync(routineDir) ? readdirSync(routineDir).filter((f) => f.endsWith('.json')) : [])
      await expect.poll(() => files().length, { timeout: 15_000 }).toBe(1)
      const routine = readJson(join(routineDir, files()[0]!))!
      expect((routine.normal as Array<{ name: string; min: number }>).map((s) => [s.name, s.min])).toEqual([
        ['Raport E2E', 60],
        ['Trening E2E', 30]
      ])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
