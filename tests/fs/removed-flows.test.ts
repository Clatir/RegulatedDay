/**
 * „Ostatnio usunięte” (N24) on the real ways of changing the data: the series' own changes („Powtarzaj”, „Usuń serię”, „Zakończ
 * serię”) never put a block of yours on the list – one occurrence removed „Tylko to” does; a removal of a series still waiting in
 * the queue is not there yet; a block whose removal its „Cofnij” took back is not there again when its anchor goes later; a series
 * archived keeps its conflict copy when its file is gone (no removal on purpose); the attachments of a group's removal unknown
 * only for the block that had some.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay, templateBlockId } from '@shared/engine/createDay'
import { seriesBlockId } from '@shared/engine/series'
import { RULES_VERSION } from '@shared/model/events'
import { dayFileFrom, planBlock, type PlanBlock } from '@shared/model/plan'
import { seriesJson, seriesPlans, typeOfDays, type Series } from '@shared/model/series'
import { dayStart, logicalDayOf } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { DataService } from '../../src/main/data/service'

// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
interface Toast {
  text: string
  action?: { run: () => void }
}
const { reloadData } = await load<{ reloadData: () => Promise<void> }>('../../src/renderer/store/data')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Toast[] }; setState: (s: { toasts: Toast[] }) => void } }>('../../src/renderer/store/ui')
const { removeDayBlock } = await load<{ removeDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string) => Promise<boolean> }>('../../src/renderer/features/today/dayActions')
const { changeDayGroup } = await load<{ changeDayGroup: (date: string, ids: readonly string[], a: { k: 'remove' }) => Promise<{ status: string }> }>('../../src/renderer/features/today/groupActions')

let root: string
let dir: string
let hub: DataHub
let today: string
// The data folder's files as the app sees them: a write of one held (`held`), the attachments' folder unreadable.
const held = new Set<string>()
let attachmentsUnread = false

const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')
const busy = () => Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
const fs: DataFs = {
  ...nodeFs,
  writeAtomic: (p, t) => ([...held].some((r) => slashed(p).endsWith(`/${r}`)) ? busy() : nodeFs.writeAtomic(p, t)),
  list: (p) => (attachmentsUnread && slashed(p).endsWith('/attachments') ? busy() : nodeFs.list(p))
}

const write = (rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), typeof value === 'string' ? value : JSON.stringify(value))
}
const onDisk = (rel: string) => (existsSync(join(dir, rel)) ? (JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>) : null)
const own = (id: string, at: number, extra: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin: at, durationMin: 45, name: `Blok ${id}`, ...extra })
const dayFileWith = (date: string, blocks: PlanBlock[]) => ({ schema: 1, date, blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) })
const listed = async () => (await hub.historyRemoved()).items.map((x) => `${x.kind}:${x.id}`).sort()

const start = () => addDays(today, -7)
const fizjo = (): Series => ({
  id: 'fizjo',
  root: 'fizjo',
  start: start(),
  until: null,
  count: null,
  versions: [{ from: start(), block: { categoryId: 'inne', variantId: null, startMin: 22 * 60, durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjoterapeuta', routine: null, steps: [] }, rule: { kind: 'daily' }, special: 'ask' }],
  archived: false
})
/** Today made by the leader with the series in its snapshot (its occurrence of today is the log's). */
const todayWithSeries = () => {
  const snapshot = createDay({ date: today, changes: [], templates: [], lectures: [], series: seriesPlans([fizjo()], typeOfDays([], () => null), marketDay), dayFile: null, holidays: marketDay, at: null })
  const t0 = dayStart(today)
  write(paths.log(today, 'pcb'), `${JSON.stringify({ c: 'pcb', v: RULES_VERSION, day: today, dom: 'timer', id: 'pcb-0', n: 0, t: t0, l: t0, k: 'day.create', snapshot })}\n`)
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-removed-flows-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  held.clear()
  attachmentsUnread = false
  hub = await makeHub()
  today = logicalDayOf(Date.now())
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: (date) => hub.day(date),
      edit: (entries) => hub.edit(entries),
      logEvents: (events) => hub.events(events),
      timer: (click) => hub.timer(click),
      requestCounters: () => hub.requestCounters()
    }
  }
  useUi.setState({ toasts: [] })
  await reloadData()
})
afterEach(async () => {
  await hub.close('quit')
  rmSync(root, { recursive: true, force: true })
})

/** The app on the folder (its data service with the test's file system). */
async function makeHub(): Promise<DataHub> {
  const h = new DataHub({
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
    onChange: () => undefined,
    start: (o) => DataService.start({ ...o, fs })
  })
  expect(await h.open(dir)).toBe(true)
  return h
}

describe('Ostatnio usunięte – zmiany serii (N24)', () => {
  it('„Powtarzaj”: blok staje się pierwszym wystąpieniem – nie jest usuniętym blokiem', async () => {
    const d = addDays(today, 2)
    write(paths.day(d), dayFileWith(d, [own('ang', 18 * 60)]))
    expect((await hub.seriesCreate({ date: d, blockId: 'ang', rule: { kind: 'daily' }, count: 3 })).ok).toBe(true)
    expect(await listed()).toEqual([])
  })

  it('„Usuń serię” z dzisiejszym wystąpieniem w migawce dnia: na liście seria, żadnego bloku', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(fizjo()))
    todayWithSeries()
    expect((await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')).ok).toBe(true)
    expect(await listed()).toEqual(['series:fizjo'])
  })

  it('„Tylko to” (jedno wystąpienie odwołane na jego dzień) – blok jest na liście', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(fizjo()))
    const d = addDays(today, 3)
    expect((await hub.seriesRemove({ date: d, blockId: seriesBlockId(d, 'fizjo') }, 'only')).ok).toBe(true)
    expect(await listed()).toEqual([`block:${seriesBlockId(d, 'fizjo')}`])
  })

  it('„Zakończ serię” zdejmuje dzisiejsze wystąpienie z migawki – żadnego bloku na liście', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(fizjo()))
    todayWithSeries()
    expect((await hub.seriesEnd('fizjo', addDays(today, -1))).ok).toBe(true)
    expect(await listed()).toEqual([])
  })

  it('„Usuń serię” czekające w kolejce (plik serii trzymany): seria jeszcze nie jest na liście; po zapisie – jest', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(fizjo()))
    held.add(paths.record('series', 'fizjo'))
    await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')
    expect((await hub.view()).series.find((s) => s.id === 'fizjo')?.archived).toBe(true)
    expect(await listed()).toEqual([])
    held.clear()
    await hub.service!.folder.queue.apply(hub.service!.folder.records)
    expect(onDisk(paths.record('series', 'fizjo'))!.archived).toBe(true)
    expect(await listed()).toEqual(['series:fizjo'])
  })

  it('seria usunięta (w archiwum), jej plik zniknął, a jest kopia konfliktowa: kopia wraca jako plik (to nie usunięcie celowe)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(fizjo()))
    expect((await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')).ok).toBe(true)
    const archived = onDisk(paths.record('series', 'fizjo'))!
    unlinkSync(join(dir, paths.record('series', 'fizjo')))
    write('series/fizjo-PCB.json', archived)
    const r = await hub.service!.folder.records.joinCopy('series/fizjo-PCB.json', paths.record('series', 'fizjo'))
    expect(r.joined).toBe(true)
    expect(onDisk(paths.record('series', 'fizjo'))).toMatchObject({ id: 'fizjo', archived: true })
    // The version kept at the archive says „przed usunięciem” in „Historia” and is read by the list.
    expect((await hub.historyVersions('series', 'fizjo'))[0]!.reason).toBe('archive')
    expect(await listed()).toEqual(['series:fizjo'])
  })
})

describe('Ostatnio usunięte – „Cofnij” i grupy (N24)', () => {
  it('blok, którego usunięcie cofnięto z dymka, nie wraca na listę, gdy potem zniknie jego kotwica', async () => {
    const d = addDays(today, 2)
    const a = own('a', 10 * 60)
    const f = own('f', 0, { startMin: null, anchor: 'a' })
    write(paths.day(d), dayFileWith(d, [a, f]))
    await reloadData()
    expect(await removeDayBlock(d, null, f, false, 'Blok f')).toBe(true)
    useUi.getState().toasts.find((t) => t.text === 'Usunięty: Blok f')!.action!.run()
    await vi.waitFor(() => expect(dayFileFrom(onDisk(paths.day(d)), d).blocks.map((b) => b.id)).toContain('f'), { timeout: 10_000 })
    expect(await removeDayBlock(d, null, a, false, 'Blok a')).toBe(true)
    expect(await listed()).toEqual(['block:a'])
  })

  it('blok szablonu odwołany i przywrócony z dymka nie wraca na listę, gdy potem odwołasz jego kotwicę', async () => {
    const d = addDays(today, 2)
    write('templates/t.json', { schema: 1, id: 't', name: 'Mój', dayType: 'zwykly', weekdays: [weekday(d)], versions: { '2026-01-01': { blocks: [own('t1', 9 * 60), own('t2', 0, { startMin: null, anchor: 't1' })] } }, archived: false })
    write(paths.day(d), { schema: 1, date: d, dayType: 'zwykly' })
    await reloadData()
    const [t1, t2] = [templateBlockId(d, 't', 't1'), templateBlockId(d, 't', 't2')]
    expect(await removeDayBlock(d, null, own(t2, 0, { startMin: null, anchor: t1, origin: 'template' }), true, 'T2')).toBe(true)
    useUi.getState().toasts.find((t) => t.text === 'Odwołany: T2')!.action!.run()
    await vi.waitFor(() => expect(Object.keys((onDisk(paths.day(d))!.cancelled as object) ?? {})).not.toContain(t2), { timeout: 10_000 })
    expect(await removeDayBlock(d, null, own(t1, 9 * 60, { origin: 'template' }), true, 'T1')).toBe(true)
    expect(await listed()).toEqual([`block:${t1}`])
  })

  it('usunięcie grupy, lista załączników nieczytelna: „nieznane załączniki” tylko przy bloku, który je miał', async () => {
    const d = addDays(today, 2)
    write(paths.day(d), dayFileWith(d, [own('b', 10 * 60), own('c', 12 * 60)]))
    write(paths.record('attachment', 'a1'), { schema: 1, id: 'a1', kind: 'link', name: 'spec', link: { url: 'https://example.com/a1' }, owner: { scope: 'day', date: d, blockId: 'b' }, addedAt: 1, removedAt: null })
    await reloadData()
    expect((await changeDayGroup(d, ['b', 'c'], { k: 'remove' })).status).not.toBe('refused')
    expect(onDisk(paths.record('attachment', 'a1'))!.removedAt).toEqual(expect.any(Number))
    // The app started again with the attachments' folder unreadable (a list once read is trusted as known – `cachedDir`).
    await hub.close('quit')
    attachmentsUnread = true
    hub = await makeHub()
    const list = await hub.historyRemoved()
    const by = (id: string) => list.items.find((x) => x.id === id)!
    expect(list.complete).toBe(false)
    expect([by('b').attachmentsUnknown, by('c').attachmentsUnknown]).toEqual([true, false])
  })
})
