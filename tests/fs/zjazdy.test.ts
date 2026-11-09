/**
 * The import of „zjazdy” on a real data folder (D357, 1.1.0): the preview says what „Zapisz” would do to each day (left
 * as it is – today, a day gone; an import before replaced; the day's own type), „Zapisz” writes the days to come through
 * the queue (the same way as every edit of the window, so OneDrive takes it to the other computers), the plan of a saved
 * day has the classes, the commute moved and the template's other blocks; today and the days gone get no file; the same
 * dates imported again replace the import before.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { CLASS_IMPORT } from '@shared/import/zjazdDay'
import type { ZjazdDay } from '@shared/import/zjazdy'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom, planBlock, type Template } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

let root: string
let dir: string
let hub: DataHub

const template: Template = {
  id: 'zjazd-st',
  name: 'Zjazd',
  dayType: 'zjazd-stacjonarny',
  weekdays: [],
  archived: false,
  versions: [
    {
      from: '2020-01-01',
      budgetMin: null,
      maxMin: null,
      blocks: [
        planBlock({ id: 'tam', categoryId: 'dojazd', variantId: 'dojazd', startMin: 7 * 60, durationMin: 60, fixed: true, origin: 'template' }),
        planBlock({ id: 'zaj', categoryId: 'dojazd', variantId: 'zajecia', startMin: 8 * 60, durationMin: 8 * 60, fixed: true, origin: 'template' }),
        planBlock({ id: 'powrot', categoryId: 'dojazd', variantId: 'dojazd', startMin: 16 * 60, durationMin: 60, fixed: true, origin: 'template' }),
        planBlock({ id: 'regen', categoryId: 'regeneracja', startMin: 18 * 60, durationMin: 60, origin: 'template' })
      ]
    }
  ]
}

const write = (rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(value))
}
const onDisk = (date: string) => (existsSync(join(dir, paths.day(date))) ? (JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')) as Record<string, unknown>) : null)
const planOn = (date: string) => {
  const file = dayFileFrom(onDisk(date) ?? {}, date)
  return { file, plan: dayPlan(createDay({ date, changes: [], templates: [template], lectures: [], dayFile: file, holidays: marketDay, at: null }), file) }
}
const clock = (m: number | null) => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
const day = (date: string, kind: ZjazdDay['kind'], rows: Array<[number, number, string, string, string]>): ZjazdDay => ({
  date,
  kind,
  classes: rows.map(([startMin, endMin, room, form, subject]) => ({ startMin, endMin, room, form, subject }))
})

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-zjazdy-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  write(paths.record('template', template.id), templateJson(template))
  hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '1.1.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined
  })
  expect(await hub.open(dir)).toBe(true)
})
afterEach(async () => {
  await hub.close('quit')
  rmSync(root, { recursive: true, force: true })
})

describe('import zjazdów w folderze danych (D357)', () => {
  it('podgląd niczego nie zapisuje i mówi, co „Zapisz” zrobi z każdym dniem', async () => {
    const today = logicalDayOf(Date.now())
    const later = addDays(today, 4)
    // A day an older version marked in the calendar.
    write(paths.day(later), { schema: 1, date: later, dayType: 'zjazd-zdalny' })
    const days = [addDays(today, -2), today, addDays(today, 3), later].map((d) => day(d, 'stacjonarny', [[600, 690, '12B', 'ćwiczenia', 'Ekonomia']]))
    const p = await hub.zjazdyPreview({ file: 'plan.pdf', days, warnings: [] })
    expect(p.today).toBe(today)
    expect(p.days.map((d) => [d.skip, d.replaces, d.ownType, d.unreadable])).toEqual([
      ['past', false, null, false],
      ['today', false, null, false],
      [null, false, null, false],
      [null, false, 'zjazd-zdalny', false]
    ])
    expect(onDisk(addDays(today, 3))).toBeNull()
  })

  it('„Zapisz”: dni od jutra w plikach dni (przez kolejkę), dziś i dni minione bez pliku, dzień błędny pominięty', async () => {
    const today = logicalDayOf(Date.now())
    const [past, next] = [addDays(today, -1), addDays(today, 2)]
    const rows: Array<[number, number, string, string, string]> = [
      [9 * 60 + 45, 11 * 60 + 15, '12B', 'ćwiczenia', 'Ekonomia'],
      [11 * 60 + 30, 13 * 60, 'TEAMS', 'wykład', 'Prawo']
    ]
    const out = await hub.zjazdySave([day(past, 'stacjonarny', rows), day(today, 'stacjonarny', rows), day(next, 'stacjonarny', rows), { date: addDays(today, 5), kind: 'stacjonarny', classes: [] }])
    expect(out.saved).toEqual([next])
    expect(out.questions).toEqual([])
    expect(out.skipped.map((s) => [s.date, s.reason])).toEqual([
      [past, 'past'],
      [today, 'today'],
      [addDays(today, 5), 'invalid']
    ])
    expect(out.skipped[1]!.text).toMatch(/trwa/)
    expect(out.outcomes.map((o) => o.status)).toEqual(['applied'])
    expect(onDisk(past)).toBeNull()
    expect(onDisk(today)).toBeNull()

    const { file, plan } = planOn(next)
    expect(file.dayType).toBe('zjazd-stacjonarny')
    expect(plan.filter((b) => b.origin === 'zjazd').map((b) => [clock(b.startMin), b.name, b.categoryId])).toEqual([
      ['09:45', 'Ekonomia · ćwiczenia', 'dojazd'],
      ['11:30', 'Prawo · wykład', 'zajecia-zdalne']
    ])
    const at = (id: string) => clock(plan.find((b) => b.id === templateBlockId(next, template.id, id))?.startMin ?? null)
    expect([at('tam'), at('zaj'), at('powrot'), at('regen')]).toEqual(['08:45', null, '13:00', '18:00'])
    // The window sees the day as saved (the folder's view of the file).
    expect(dayFileFrom((await hub.dayFiles([next]))[next], next).dayType).toBe('zjazd-stacjonarny')
  })

  it('ponowny import tych samych dat zastępuje poprzedni (podgląd: „zastąpi”)', async () => {
    const next = addDays(logicalDayOf(Date.now()), 2)
    await hub.zjazdySave([day(next, 'stacjonarny', [[8 * 60, 9 * 60 + 30, '19H', 'wykład', 'Marketing']])])
    expect((await hub.zjazdyPreview({ file: 'plan.pdf', days: [day(next, 'zdalny', [[600, 690, 'TEAMS', 'wykład', 'Finanse']])], warnings: [] })).days[0]!.replaces).toBe(true)
    const out = await hub.zjazdySave([day(next, 'zdalny', [[600, 690, 'TEAMS', 'wykład', 'Finanse']])])
    expect(out.saved).toEqual([next])
    const { file, plan } = planOn(next)
    expect(file.dayType).toBe('zjazd-zdalny')
    expect(plan.filter((b) => b.origin === 'zjazd').map((b) => b.name)).toEqual(['Finanse · wykład'])
    // Nothing of the stationary import is left in the file.
    const raw = onDisk(next)!
    expect(JSON.stringify(raw.blocks)).not.toMatch(/Marketing/)
    expect(raw.cancelled).toEqual({})
    expect((raw[CLASS_IMPORT] as { dayType: unknown }).dayType).toBeNull()
  })

  it('„Cofnij” importu: pliki dni jak przed nim (typ sprzed importu, bez zajęć), jednym zapisem; dni bez importu, dziś i minione – pominięte', async () => {
    const today = logicalDayOf(Date.now())
    const [a, b, c] = [addDays(today, 2), addDays(today, 3), addDays(today, 4)]
    // `b` an older version marked in the calendar as a remote „zjazd”, with a block of your own; `a` had no file.
    const own = planBlock({ id: 'moje', categoryId: 'inne', startMin: 20 * 60, durationMin: 30 })
    write(paths.day(b), { schema: 1, date: b, dayType: 'zjazd-zdalny', blocks: [own] })
    const before = { a: planOn(a), b: planOn(b) }
    const rows: Array<[number, number, string, string, string]> = [[9 * 60 + 45, 11 * 60 + 15, '12B', 'ćwiczenia', 'Ekonomia']]
    expect((await hub.zjazdySave([day(a, 'stacjonarny', rows), day(b, 'stacjonarny', rows)])).saved).toEqual([a, b])
    expect(planOn(b).file.dayType).toBe('zjazd-stacjonarny')

    const out = await hub.zjazdyUndo([a, b, c, today, addDays(today, -1), 'nie-data'])
    expect(out.saved).toEqual([a, b])
    expect(out.questions).toEqual([])
    expect(out.outcomes.map((o) => o.status)).toEqual(['applied', 'applied'])
    expect(out.skipped.map((s) => [s.date, s.reason])).toEqual([
      [c, 'noImport'],
      [today, 'today'],
      [addDays(today, -1), 'past'],
      ['nie-data', 'invalid']
    ])
    for (const [d, was] of [
      [a, before.a],
      [b, before.b]
    ] as const) {
      const now = planOn(d)
      expect(now.file).toEqual(was.file)
      expect(now.plan).toEqual(was.plan)
      expect(onDisk(d)![CLASS_IMPORT]).toBeUndefined()
    }
    expect(planOn(b).file.dayType).toBe('zjazd-zdalny')
    expect(planOn(a).plan.filter((x) => x.origin === 'zjazd')).toEqual([])
  })

  it('ten sam import drugi raz: bez zmian w pliku (zapisany), żadnego pytania', async () => {
    const next = addDays(logicalDayOf(Date.now()), 2)
    const d = day(next, 'stacjonarny', [[8 * 60, 9 * 60 + 30, '19H', 'wykład', 'Marketing']])
    await hub.zjazdySave([d])
    const before = readFileSync(join(dir, paths.day(next)), 'utf8')
    const out = await hub.zjazdySave([d])
    expect(out).toMatchObject({ saved: [next], questions: [], skipped: [], outcomes: [] })
    expect(readFileSync(join(dir, paths.day(next)), 'utf8')).toBe(before)
  })
})
