/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619) on a real data folder, through the window's write: the plan of today saved as the template
 * „Roboczy” from tomorrow makes a later workday with the same blocks (hours, names, the template's own block kept by its id), the days before the
 * date stay as they were (the version they take is untouched); „Dołóż” adds the day's own blocks and never doubles the template's; „Cofnij” puts
 * the template back – and, changed since, leaves it with a word; a routine of the blocks' names and lengths, „Cofnij” takes it out.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { DEFAULT_SESSIONS } from '@shared/model/settings'
import { templateBlockId } from '@shared/engine/createDay'
import { plDayMonth } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
interface Toast {
  text: string
  kind?: string
}
type Line = { text: string; undo: () => Promise<string | void> }
type DayModel = { ctx: { plan: PlanBlock[] } }
const { reloadData, updateRecord } = await load<{ reloadData: () => Promise<void>; updateRecord: (rel: string, fn: (raw: RawRecord) => RawRecord) => Promise<unknown> }>('../../src/renderer/store/data')
const { countedDay } = await load<{ countedDay: (date: string, base: RawRecord | null) => Promise<DayModel | null> }>('../../src/renderer/store/day')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Toast[] }; setState: (s: { toasts: Toast[] }) => void } }>('../../src/renderer/store/ui')
const { useGroupLine, clearGroupLine, undoGroupLine } = await load<{
  useGroupLine: { getState: () => { lines: Partial<Record<string, Line>> } }
  clearGroupLine: (view: string) => void
  undoGroupLine: (view: string) => Promise<void>
}>('../../src/renderer/store/groupLine')
const { saveAsTemplate, saveAsRoutine } = await load<{
  saveAsTemplate: (a: { date: string; ids: string[] | null; templateId: string; from: string; mode: 'replace' | 'add'; view: string }) => Promise<{ saved: boolean; added: number; skipped: string[]; inTemplate: number }>
  saveAsRoutine: (o: { name: string; normal: Array<{ id: string; name: string; min: number }>; worse: []; view: string }) => Promise<boolean>
}>('../../src/renderer/features/plan/saveAs')

const TPL = 'roboczy'
const NO_SESSIONS = Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no']))
const OLD_FROM = '2026-01-01'
let root: string
let dir: string
let hub: DataHub

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-save-as-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '1.38.0',
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
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: (date) => hub.day(date),
      edit: (entries) => hub.edit(entries),
      logEvents: (events) => hub.events(events)
    }
  }
  useUi.setState({ toasts: [] })
  // „Roboczy” – the default template of the ordinary day: one block 08:00–09:00 since long ago.
  write(paths.record('template', TPL), {
    schema: 1,
    id: TPL,
    name: 'Roboczy',
    dayType: 'zwykly',
    weekdays: [],
    archived: false,
    versions: { [OLD_FROM]: { blocks: [{ id: 'old', categoryId: 'inne', startMin: 8 * 60, durationMin: 60, fixed: false, origin: 'template' }], budgetMin: null, maxMin: null } }
  })
  // Today: the template's block moved to 07:30 and two blocks of yours, an ordinary day (its sessions answered „nie” – nothing else on it).
  const t = today()
  write(paths.day(t), {
    schema: 1,
    date: t,
    dayType: 'zwykly',
    sessions: NO_SESSIONS,
    blocks: [
      { id: templateBlockId(t, TPL, 'old'), categoryId: 'inne', startMin: 7 * 60 + 30, durationMin: 60, fixed: false, origin: 'template', sourceId: 'old' },
      { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 45, fixed: false, origin: 'user', name: 'Raport' },
      { id: 'b', categoryId: 'inne', startMin: 18 * 60, durationMin: 30, fixed: true, origin: 'user', name: 'Trening', note: 'rozciąganie' }
    ]
  })
  // The days around it: ordinary days without blocks of their own.
  for (const d of [addDays(t, -1), addDays(t, 3)]) write(paths.day(d), { schema: 1, date: d, dayType: 'zwykly', sessions: NO_SESSIONS })
  await reloadData()
})
afterEach(async () => {
  clearGroupLine('today')
  await hub.close('quit')
  delete (globalThis as { window?: unknown }).window
  rmSync(root, { recursive: true, force: true })
})

const today = () => logicalDayOf(hub.service!.folder.clock.now())
const write = (rel: string, v: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(v))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>
const versions = () => read(paths.record('template', TPL)).versions as Record<string, { blocks: Array<Record<string, unknown>> }>
/** The blocks of a day as it is counted now (its template's version in force on it, its file), by hour. */
async function planOf(date: string): Promise<Array<[number | null, string | null, boolean]>> {
  const day = await countedDay(date, (await hub.dayFiles([date]))[date] ?? null)
  return day!.ctx.plan.map((b) => [b.startMin, b.name, b.fixed] as [number | null, string | null, boolean]).sort((x, y) => (x[0] ?? 0) - (y[0] ?? 0))
}
const line = () => useGroupLine.getState().lines.today

describe('dzień jako szablon od jutra (N15)', () => {
  it('„Zastąp”: przyszły dzień roboczy ma te same bloki; dni przed datą bez zmian; linia z „Cofnij”', async () => {
    const t = today()
    const tomorrow = addDays(t, 1)
    const before = await planOf(t)
    const yesterday = await planOf(addDays(t, -1))
    const r = await saveAsTemplate({ date: t, ids: null, templateId: TPL, from: tomorrow, mode: 'replace', view: 'today' })
    expect(r).toMatchObject({ saved: true, added: 3, skipped: [], inTemplate: 0 })
    // A new version from tomorrow; the one the days before it take is as it was.
    const v = versions()
    expect(Object.keys(v).sort()).toEqual([OLD_FROM, tomorrow])
    expect(v[OLD_FROM]!.blocks.map((b) => [b.id, b.startMin])).toEqual([['old', 8 * 60]])
    // The template's own block keeps its id (its attachments and the days' changes of it go on), at the hour the day had it.
    expect(v[tomorrow]!.blocks.map((b) => [b.id === 'old' ? 'old' : 'new', b.startMin, b.name ?? null])).toEqual([
      ['old', 7 * 60 + 30, null],
      ['new', 10 * 60, 'Raport'],
      ['new', 18 * 60, 'Trening']
    ])
    expect(v[tomorrow]!.blocks[2]).toMatchObject({ fixed: true, note: 'rozciąganie', durationMin: 30, origin: 'template' })
    // A workday later: the same blocks as today.
    expect(await planOf(addDays(t, 3))).toEqual(before)
    // Today and yesterday: as they were.
    expect(await planOf(t)).toEqual(before)
    expect(await planOf(addDays(t, -1))).toEqual(yesterday)
    expect(line()?.text).toBe(`Zapisano 3 bloki w szablonie „Roboczy” od ${plDayMonth(tomorrow)}`)
    // „Cofnij”: the template as it was – no version from tomorrow.
    await undoGroupLine('today')
    expect(Object.keys(versions())).toEqual([OLD_FROM])
    expect(await planOf(addDays(t, 3))).toEqual([[8 * 60, null, false]])
    expect(useUi.getState().toasts.filter((x) => x.kind === 'error')).toEqual([])
  })

  it('„Dołóż” zaznaczonych: własne bloki dochodzą do wersji, blok szablonu nie dwa razy', async () => {
    const t = today()
    const tomorrow = addDays(t, 1)
    const r = await saveAsTemplate({ date: t, ids: [templateBlockId(t, TPL, 'old'), 'b'], templateId: TPL, from: tomorrow, mode: 'add', view: 'today' })
    expect(r).toMatchObject({ saved: true, added: 1, inTemplate: 1 })
    expect(versions()[tomorrow]!.blocks.map((b) => [b.id === 'old' ? 'old' : 'new', b.startMin])).toEqual([
      ['old', 8 * 60],
      ['new', 18 * 60]
    ])
    expect(line()?.text).toBe(`Zapisano 1 blok w szablonie „Roboczy” od ${plDayMonth(tomorrow)} · 1 już w szablonie`)
  })

  it('„Cofnij” po zmianie wersji w międzyczasie – szablon zostaje, komunikat mówi dlaczego', async () => {
    const t = today()
    const tomorrow = addDays(t, 1)
    await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: tomorrow, mode: 'add', view: 'today' })
    // The version changed since in „Szablony” (the window's own write).
    await updateRecord(paths.record('template', TPL), (raw) => {
      const v = structuredClone(raw.versions) as Record<string, { blocks: Array<Record<string, unknown>> }>
      v[tomorrow]!.blocks = v[tomorrow]!.blocks.map((b) => ({ ...b, durationMin: 50 }))
      return { ...raw, versions: v }
    })
    await undoGroupLine('today')
    expect(Object.keys(versions()).sort()).toEqual([OLD_FROM, tomorrow])
    expect(useUi.getState().toasts.map((x) => x.text)).toContain(`Wersja szablonu od ${plDayMonth(tomorrow)} zmieniła się od tego czasu – została, jaka jest.`)
  })

  it('„Cofnij” po zmianie nazwy szablonu (inne pole) – cofa tylko wersję od daty, nazwa zostaje', async () => {
    const t = today()
    const tomorrow = addDays(t, 1)
    await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: tomorrow, mode: 'add', view: 'today' })
    await updateRecord(paths.record('template', TPL), (raw) => ({ ...raw, name: 'Roboczy 2' }))
    await undoGroupLine('today')
    expect(Object.keys(versions())).toEqual([OLD_FROM])
    expect(read(paths.record('template', TPL)).name).toBe('Roboczy 2')
  })
})

describe('„Zastąp” zdejmuje z szablonu bloki, których dzień nie zapisał – z ich załącznikami (D415)', () => {
  it('blok szablonu spoza zaznaczenia: jego załącznik do kosza tą samą zmianą; „Cofnij” przywraca wersję i załącznik', async () => {
    const t = today()
    const tomorrow = addDays(t, 1)
    const rel = paths.record('attachment', 'zal1')
    write(rel, { schema: 1, id: 'zal1', kind: 'link', name: '', file: null, link: { url: 'https://example.org/', title: null, iconDataUrl: null, domain: 'example.org' }, owner: { scope: 'template', templateId: TPL, blockId: 'old' }, addedAt: 1, removedAt: null })
    await reloadData()
    const r = await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: tomorrow, mode: 'replace', view: 'today' })
    expect(r.saved).toBe(true)
    expect(versions()[tomorrow]!.blocks.map((b) => b.name)).toEqual(['Raport'])
    expect(read(rel).removedAt).toEqual(expect.any(Number))
    await undoGroupLine('today')
    expect(Object.keys(versions())).toEqual([OLD_FROM])
    expect(read(rel).removedAt).toBeNull()
  })
})

describe('bloki jako rutyna (N15)', () => {
  it('nowa rutyna z krokami; bloki dnia bez zmian; „Cofnij” ją usuwa', async () => {
    const t = today()
    const before = read(paths.day(t))
    expect(await saveAsRoutine({ name: 'Poranek', normal: [{ id: 's1', name: 'Raport', min: 45 }, { id: 's2', name: 'Trening', min: 30 }], worse: [], view: 'today' })).toBe(true)
    const routines = (await hub.view()).routines
    expect(routines.map((r) => [r.name, r.normal])).toEqual([
      [
        'Poranek',
        [
          { id: 's1', name: 'Raport', min: 45 },
          { id: 's2', name: 'Trening', min: 30 }
        ]
      ]
    ])
    expect(read(paths.day(t))).toEqual(before)
    expect(line()?.text).toBe('Zapisano rutynę „Poranek” · 2 kroki')
    await undoGroupLine('today')
    expect((await hub.view()).routines).toEqual([])
  })
})
