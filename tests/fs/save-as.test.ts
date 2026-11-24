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
  saveAsTemplate: (a: { date: string; ids: string[] | null; templateId: string; from: string; mode: 'replace' | 'add'; view: string }) => Promise<{ saved: boolean; fate: string; added: number; skipped: string[]; inTemplate: number }>
  saveAsRoutine: (o: { name: string; normal: Array<{ id: string; name: string; min: number }>; worse: []; view: string }) => Promise<string>
}>('../../src/renderer/features/plan/saveAs')

const TPL = 'roboczy'
const NO_SESSIONS = Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no']))
const OLD_FROM = '2026-01-01'
let root: string
let dir: string
let hub: DataHub
// The list of attachments cannot be read now (the view says so).
let unread = false
// The edits meet a change on another computer (a question) instead of being written.
let asked = false

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
      dataView: async () => ({ ...(await hub.view()), ...(unread ? { attachmentsUnread: true } : {}) }),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: (date) => hub.day(date),
      edit: async (entries) => (asked ? entries.map(() => ({ status: 'conflict' as const })) : hub.edit(entries)),
      logEvents: (events) => hub.events(events)
    }
  }
  unread = false
  asked = false
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

describe('godziny szablonu przy pobudce dnia innej niż szablonu (D617, jak „Szablony”)', () => {
  it('pobudka dziś 09:00 (szablonu 06:00): poranne bloki w godzinach szablonu; dzień z tą samą pobudką pokazuje je jak dziś, dzień bez niej – godziny szablonu', async () => {
    const t = today()
    const tomorrow = addDays(t, 1)
    // Today woken at 09:00: the template's 08:00 shown at 11:00; yours at 10:00 before the first fixed block (18:00).
    const file = read(paths.day(t))
    write(paths.day(t), { ...file, wakeMin: 9 * 60, blocks: (file.blocks as Array<Record<string, unknown>>).filter((b) => b.origin !== 'template') })
    write(paths.day(addDays(t, 2)), { schema: 1, date: addDays(t, 2), dayType: 'zwykly', sessions: NO_SESSIONS, wakeMin: 9 * 60 })
    await reloadData()
    const before = await planOf(t)
    expect(before).toEqual([
      [10 * 60, 'Raport', false],
      [11 * 60, null, false],
      [18 * 60, 'Trening', true]
    ])
    expect((await saveAsTemplate({ date: t, ids: null, templateId: TPL, from: tomorrow, mode: 'replace', view: 'today' })).saved).toBe(true)
    expect(versions()[tomorrow]!.blocks.map((b) => [b.startMin, b.name ?? null]).sort((x, y) => (x[0] as number) - (y[0] as number))).toEqual([
      [7 * 60, 'Raport'],
      [8 * 60, null],
      [18 * 60, 'Trening']
    ])
    expect(await planOf(addDays(t, 2))).toEqual(before)
    expect(await planOf(addDays(t, 3))).toEqual([
      [7 * 60, 'Raport', false],
      [8 * 60, null, false],
      [18 * 60, 'Trening', true]
    ])
  })
})

describe('dzień nietknięty, pytanie o zmianę z innego komputera (przegląd r2)', () => {
  it('„Zastąp” własnego szablonu na dniu, którego nic nie zmieniło (pobudka +3 h przesunęła blok za stały) – „bez zmian”, żadnej nowej wersji', async () => {
    const t = today()
    // The template: 11:00 flexible, 13:00 fixed; today woken at 09:00 (3 h after the template's 06:00) and nothing else changed – 11:00 shows at 14:00.
    await updateRecord(paths.record('template', TPL), (raw) => ({
      ...raw,
      versions: {
        [OLD_FROM]: {
          blocks: [
            { id: 'late', categoryId: 'inne', startMin: 11 * 60, durationMin: 60, fixed: false, origin: 'template' },
            { id: 'fx', categoryId: 'inne', startMin: 13 * 60, durationMin: 30, fixed: true, origin: 'template' }
          ],
          budgetMin: null,
          maxMin: null
        }
      }
    }))
    write(paths.day(t), { schema: 1, date: t, dayType: 'zwykly', sessions: NO_SESSIONS, wakeMin: 9 * 60 })
    expect(await planOf(t)).toEqual([
      [13 * 60, null, true],
      [14 * 60, null, false]
    ])
    const r = await saveAsTemplate({ date: t, ids: null, templateId: TPL, from: addDays(t, 1), mode: 'replace', view: 'today' })
    expect([r.saved, r.fate]).toEqual([false, 'unchanged'])
    expect(Object.keys(versions())).toEqual([OLD_FROM])
    expect(line()).toBeUndefined()
  })

  it('zapis spotkał zmianę z innego komputera – los „asked” (okno się zamyka, odpowiedź rozstrzyga), bez linii; rutyna tak samo', async () => {
    const t = today()
    asked = true
    const r = await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: addDays(t, 1), mode: 'add', view: 'today' })
    expect([r.saved, r.fate]).toEqual([false, 'asked'])
    expect(line()).toBeUndefined()
    expect(await saveAsRoutine({ name: 'Poranek', normal: [{ id: 's1', name: 'Raport', min: 45 }], worse: [], view: 'today' })).toBe('asked')
    expect(line()).toBeUndefined()
  })
})

describe('zapis od daty i nieczytelne załączniki', () => {
  it('„Od” sprzed jutra (okno otwarte przez 04:00) – wersja od jutra, nigdy od dziś', async () => {
    const t = today()
    const r = await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: t, mode: 'add', view: 'today' })
    expect(r.saved).toBe(true)
    expect(Object.keys(versions()).sort()).toEqual([OLD_FROM, addDays(t, 1)])
    expect(line()?.text).toBe(`Zapisano 1 blok w szablonie „Roboczy” od ${plDayMonth(addDays(t, 1))}`)
  })

  it('lista załączników nieczytelna: „Zastąp”, które zdejmuje blok z wersji (choć późniejsza wersja go ma) – odmowa, nic nie zapisane (T848)', async () => {
    const t = today()
    const later = addDays(t, 30)
    // A later version keeps „old”: the save would take it out of its own version only.
    await updateRecord(paths.record('template', TPL), (raw) => ({ ...raw, versions: { ...(raw.versions as object), [later]: { blocks: [{ id: 'old', categoryId: 'inne', startMin: 8 * 60, durationMin: 60, fixed: false, origin: 'template' }], budgetMin: null, maxMin: null } } }))
    unread = true
    await reloadData()
    const r = await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: addDays(t, 1), mode: 'replace', view: 'today' })
    expect(r.saved).toBe(false)
    expect(Object.keys(versions()).sort()).toEqual([OLD_FROM, later])
    expect(useUi.getState().toasts.map((x) => x.text)).toContain('Listy załączników nie da się teraz odczytać – nic nie zostało zapisane, spróbuj za chwilę.')
    // „Dołóż” takes nothing out: saved.
    expect((await saveAsTemplate({ date: t, ids: ['a'], templateId: TPL, from: addDays(t, 1), mode: 'add', view: 'today' })).saved).toBe(true)
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
    expect(await saveAsRoutine({ name: 'Poranek', normal: [{ id: 's1', name: 'Raport', min: 45 }, { id: 's2', name: 'Trening', min: 30 }], worse: [], view: 'today' })).toBe('saved')
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
