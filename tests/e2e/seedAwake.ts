/**
 * A data folder whose today is an ordinary day with the blocks given and no night's quiet in it (the bar's lines are
 * not there then – D346): the day's wake 04:00, tomorrow's 12:00 and the ordinary day's bedtime 03:59 of the night after.
 * No sessions (the ordinary template has no blocks): nothing else stands between the blocks. A test
 * that needs the bar's lines runs at any hour but the end of the logical day (it says how much of it it needs).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SESSIONS, DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { paths } from '../../src/shared/data/paths'
import { addDays } from '../../src/shared/time/zone'
import { logicalToday } from './app'

export function seedAwake(dir: string, blocks: ReadonlyArray<Record<string, unknown>>): { today: string; dayFile: string } {
  const today = logicalToday()
  const settings = { ...DEFAULT_SETTINGS, dayTypes: { ...DEFAULT_SETTINGS.dayTypes, zwykly: { ...DEFAULT_SETTINGS.dayTypes.zwykly, bedtimeMin: 27 * 60 + 59 } } }
  const records = firstComputerRecords(
    { settings, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  const write = (rel: string, value: unknown) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), JSON.stringify(value, null, 2))
  }
  for (const r of records) write(r.rel, r.value)
  write(paths.day(today), { schema: 1, date: today, dayType: 'zwykly', wakeMin: 4 * 60, sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])), blocks })
  const tomorrow = addDays(today, 1)
  write(paths.day(tomorrow), { schema: 1, date: tomorrow, wakeMin: 12 * 60 })
  return { today, dayFile: join(dir, paths.day(today)) }
}
