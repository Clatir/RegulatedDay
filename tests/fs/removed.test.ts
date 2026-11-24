/**
 * „Ostatnio usunięte” (N24) on a copy of the data folder: a block taken out of a day's plan (yours – out of the file, the
 * template's – cancelled for the day) and a sprawa, routine, template, series or all-day event removed are on the list for
 * 30 days from the removal, with what „Przywróć” puts back; restored – or made again – they are not; a frozen day says so.
 * A block moved to another day is no removal.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RemovedItem } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { dayRaw, putRawBlock, setCancelled, setMovedTo, takeBlock } from '@shared/data/dayEdits'
import { recordEdit } from '@shared/data/merge'
import { sessionBlockId, templateBlockId } from '@shared/engine/createDay'
import { paths } from '@shared/data/paths'
import { removedAgain, restoredDay, REMOVED_MS } from '@shared/data/removed'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'

const TODAY = '2026-10-21'
const TOMORROW = '2026-10-22'
const YESTERDAY = '2026-10-20'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-removed-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(fs: DataFs = nodeFs) {
  let now = placeLogical(TODAY, 10 * 60)
  const folder = await DataFolder.open({
    fs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.2.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, tick: (ms: number) => (now += ms), now: () => now }
}

const write = (rel: string, v: unknown) => {
  mkdirSync(join(dataDir, rel, '..'), { recursive: true })
  writeFileSync(join(dataDir, rel), JSON.stringify(v))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as Record<string, unknown>
const blk = (id: string, extra: Record<string, unknown> = {}) => ({ id, categoryId: 'analiza', startMin: 600, durationMin: 60, fixed: false, ...extra })
const idsOf = (f: Record<string, unknown>) => (Array.isArray(f.blocks) ? f.blocks : Object.values(f.blocks as object)).map((b) => (b as { id: string }).id)
const blockOf = (items: readonly RemovedItem[], id: string) => items.find((x) => x.kind === 'block' && x.id === id)

/** A day's file changed by `fn` through the queue – as the window's edits go. */
async function editDay(folder: DataFolder, date: string, fn: (raw: Record<string, unknown>) => Record<string, unknown>) {
  const rel = paths.day(date)
  const before = (await folder.recordView(rel)) ?? null
  const entry = recordEdit(rel, before, fn(dayRaw(before, date)))
  expect(entry).not.toBeNull()
  const out = await folder.edit([entry!])
  expect(out.map((o) => o.status)).toEqual(['applied'])
}

describe('Ostatnio usunięte (N24)', () => {
  it('usunięty blok jest na liście z dokładnym zapisem i wraca po „Przywróć” na te same godziny; potem go na liście nie ma', async () => {
    const b = blk('b', { startMin: 630, note: 'telefon', unknownField: 7 })
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('a'), b] })
    const { folder, now } = await make()
    expect((await folder.removedItems()).items).toEqual([])
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'b'))
    expect(idsOf(read(paths.day(TOMORROW)))).toEqual(['a'])
    const list = await folder.removedItems()
    expect(list.complete).toBe(true)
    const item = blockOf(list.items, 'b')
    expect(item).toEqual({ kind: 'block', id: 'b', rel: paths.day(TOMORROW), date: TOMORROW, removedAt: now(), value: b, cancelled: false, frozen: false, anchorGone: false, attachments: null, attachmentsUnknown: false, startMin: 630 })
    // „Przywróć”: the very block, at its hours – the one at 10:00 stays where it is (nothing pushed apart).
    await editDay(folder, TOMORROW, (raw) => restoredDay(raw, item!))
    const file = read(paths.day(TOMORROW))
    expect(file.blocks).toEqual(expect.arrayContaining([blk('a'), b]))
    expect(blockOf((await folder.removedItems()).items, 'b')).toBeUndefined()
    // Its „Cofnij” takes it out again – and the list has it again, from that moment.
    await editDay(folder, TOMORROW, (raw) => removedAgain(raw, item!))
    expect(idsOf(read(paths.day(TOMORROW)))).toEqual(['a'])
    expect(blockOf((await folder.removedItems()).items, 'b')).toBeDefined()
  })

  it('usunięta sprawa jest na liście z rekordem sprzed usunięcia i wraca po „Przywróć”; potem jej na liście nie ma', async () => {
    const rel = paths.record('request', 't1')
    const task = { schema: 1, id: 't1', kind: 'task', title: 'Raport', estimateMin: 30, categoryId: 'inne', list: 'inbox', state: 'queued', createdAt: 1 }
    write(rel, task)
    const { folder, now } = await make()
    const out = await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!])
    expect(out[0]!.status).toBe('applied')
    expect(existsSync(join(dataDir, rel))).toBe(false)
    const item = (await folder.removedItems()).items.find((x) => x.kind === 'request')
    expect(item).toMatchObject({ kind: 'request', id: 't1', rel, date: null, removedAt: now(), cancelled: false, frozen: false })
    expect(item!.value).toMatchObject(task)
    // „Przywróć”: the record made again as it was.
    expect((await folder.edit([recordEdit(rel, null, item!.value!)!]))[0]!.status).toBe('applied')
    expect(read(rel)).toMatchObject(task)
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('po 30 dniach od usunięcia blok i sprawa znikają z listy; zapis usunięć bloków starszy niż 30 dni jest sprzątany', async () => {
    const rel = paths.record('request', 'p1')
    write(rel, { schema: 1, id: 'p1', kind: 'request', person: null, note: 'oddzwonić', state: 'queued', createdAt: 1 })
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('a'), blk('b')] })
    const { folder, tick } = await make()
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'b'))
    await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!])
    expect((await folder.removedItems()).items.map((x) => x.kind).sort()).toEqual(['block', 'request'])
    tick(REMOVED_MS - 60_000)
    expect((await folder.removedItems()).items).toHaveLength(2)
    tick(120_000)
    expect((await folder.removedItems()).items).toEqual([])
    // The next removal of a block sweeps the old note away – the folder keeps only the last 30 days of them.
    const removedDir = join(dataDir, '.history', '.removed')
    expect(readdirSync(removedDir)).toHaveLength(1)
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'a'))
    expect(readdirSync(removedDir)).toHaveLength(1)
    expect((await folder.removedItems()).items.map((x) => x.id)).toEqual(['a'])
  })

  it('blok szablonu odwołany na ten dzień (dzień bez pliku): na liście z nazwą z migawki; „Przywróć” zdejmuje odwołanie', async () => {
    write('templates/t.json', { schema: 1, id: 't', name: 'Zwykły', dayType: 'zwykly', weekdays: [], versions: { '2026-01-01': { blocks: [blk('tb', { name: 'Przegląd tygodnia' })] } }, archived: false })
    const { folder } = await make()
    // The template's block on that day (its id there is the day's own).
    const id = templateBlockId(TOMORROW, 't', 'tb')
    expect(existsSync(join(dataDir, paths.day(TOMORROW)))).toBe(false)
    await editDay(folder, TOMORROW, (raw) => setCancelled(raw, id, true))
    const item = blockOf((await folder.removedItems()).items, id)
    expect(item).toMatchObject({ kind: 'block', id, date: TOMORROW, cancelled: true, frozen: false })
    expect(item!.value).toMatchObject({ id, name: 'Przegląd tygodnia', startMin: 600 })
    await editDay(folder, TOMORROW, (raw) => restoredDay(raw, item!))
    expect(read(paths.day(TOMORROW)).cancelled).toEqual({})
    expect(blockOf((await folder.removedItems()).items, id)).toBeUndefined()
  })

  it('blok przeniesiony na inny dzień nie jest usunięty', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('m')] })
    const { folder } = await make()
    await editDay(folder, TOMORROW, (raw) => setMovedTo(takeBlock(raw, 'm'), 'm', '2026-10-23'))
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('dzień zamrożony: blok na liście z `frozen` (przywrócenie wyłączone w oknie)', async () => {
    write(paths.day(YESTERDAY), { schema: 1, date: YESTERDAY, blocks: [blk('y')] })
    const { folder, now } = await make()
    await editDay(folder, YESTERDAY, (raw) => takeBlock(raw, 'y'))
    expect(blockOf((await folder.removedItems()).items, 'y')!.frozen).toBe(false)
    folder.append({ day: YESTERDAY, dom: 'game', k: 'day.freeze', at: now(), how: 'ready', know: {}, missing: [], grade: {} })
    await folder.log.flush()
    expect(blockOf((await folder.removedItems()).items, 'y')!.frozen).toBe(true)
  })

  it('blok, który stał zaraz po bloku, którego nie ma już w planie: `anchorGone`', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('a'), blk('f', { startMin: null, anchor: 'a' })] })
    const { folder } = await make()
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'f'))
    expect(blockOf((await folder.removedItems()).items, 'f')!.anchorGone).toBe(false)
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'a'))
    const items = (await folder.removedItems()).items
    expect(blockOf(items, 'f')!.anchorGone).toBe(true)
    expect(blockOf(items, 'a')!.anchorGone).toBe(false)
  })

  it('rutyna, szablon, wydarzenie całodniowe i seria usunięte – na liście; rekord odtworzony gdzie indziej – już nie', async () => {
    const recs = {
      routine: { schema: 1, id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'woda', min: 5 }], worse: [], archived: false },
      template: { schema: 1, id: 'tpl', name: 'Sobota', dayType: 'weekend', weekdays: [6], versions: { '2026-01-01': { blocks: [] } }, archived: false },
      allDay: { schema: 1, id: 'ev', title: 'Konferencja', startDate: TOMORROW, endDate: TOMORROW, color: 'sky', note: '', free: false, calendarId: null }
    } as const
    for (const [kind, v] of Object.entries(recs)) write(paths.record(kind as 'routine', v.id), v)
    const series = { schema: 1, id: 's1', root: 's1', start: TODAY, until: null, count: null, archived: false, versions: {} }
    write(paths.record('series', 's1'), series)
    const { folder } = await make()
    for (const [kind, v] of Object.entries(recs)) {
      const rel = paths.record(kind as 'routine', v.id)
      await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!])
    }
    // A series leaves the list by being archived (D381: „Cała seria”) – its record stays.
    const srel = paths.record('series', 's1')
    await folder.edit([recordEdit(srel, (await folder.recordView(srel))!, { ...series, archived: true, until: YESTERDAY })!])
    const items = (await folder.removedItems()).items
    expect(items.map((x) => `${x.kind}:${x.id}`).sort()).toEqual(['allDay:ev', 'routine:r1', 'series:s1', 'template:tpl'])
    expect(items.find((x) => x.kind === 'series')!.value).toMatchObject({ archived: false, until: null })
    // The routine made again (another computer, or by hand): no longer removed.
    write(paths.record('routine', 'r1'), recs.routine)
    expect((await folder.removedItems()).items.map((x) => x.id).sort()).toEqual(['ev', 's1', 'tpl'])
  })
})

describe('Ostatnio usunięte (N24) – po przeglądzie', () => {
  const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')
  const tpl = (blocks: unknown[]) => write('templates/t.json', { schema: 1, id: 't', name: 'Zwykły', dayType: 'zwykly', weekdays: [], versions: { '2026-01-01': { blocks } }, archived: false })

  it('blok usunięty, przywrócony i potem przeniesiony na inny dzień nie jest usunięty', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('b')] })
    const { folder } = await make()
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'b'))
    const item = blockOf((await folder.removedItems()).items, 'b')!
    await editDay(folder, TOMORROW, (raw) => restoredDay(raw, item))
    await editDay(folder, TOMORROW, (raw) => setMovedTo(takeBlock(raw, 'b'), 'b', '2026-10-23'))
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('zdjęty sam wpis bloku migawki (blok zostaje z szablonu) nie jest usunięciem – także gdy blok zejdzie potem z planu inną drogą', async () => {
    tpl([blk('tb', { name: 'Przegląd' })])
    const id = templateBlockId(TOMORROW, 't', 'tb')
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk(id, { origin: 'template', sourceId: 'tb', durationMin: 90, name: 'Przegląd' })] })
    const { folder } = await make()
    // „Cofnij” of a change: the day's own entry goes, the block stays as the template has it.
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, id))
    expect((await folder.removedItems()).items).toEqual([])
    // Cancelled another way (another computer, an older version – no note of it): still nothing „Przywróć” could bring back.
    write(paths.day(TOMORROW), { ...read(paths.day(TOMORROW)), cancelled: { [id]: true } })
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('godziny bloku szablonu odwołanego – tak, jak stanie po zdjęciu odwołania (z pobudką dnia, D334)', async () => {
    // Early in the morning – before the first fixed block of the day (its sessions): it moves with the wake.
    tpl([blk('tb', { name: 'Przegląd', startMin: 390, durationMin: 30 })])
    const id = templateBlockId(TOMORROW, 't', 'tb')
    // The day's wake an hour after the type's (06:00): the template's morning moves with it.
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, wakeMin: 7 * 60 })
    const { folder } = await make()
    await editDay(folder, TOMORROW, (raw) => setCancelled(raw, id, true))
    const item = blockOf((await folder.removedItems()).items, id)!
    expect(item.value).toMatchObject({ id, startMin: 450 })
  })

  it('seria: przywracana z rekordu takiego, jak teraz (bez archiwum, koniec sprzed usunięcia), usunięta w chwili archiwizacji', async () => {
    const series = { schema: 1, id: 's1', root: 's1', start: TODAY, until: null, count: null, archived: false, versions: {} }
    const srel = paths.record('series', 's1')
    write(srel, series)
    const { folder, tick, now } = await make()
    // A change, and the removal 10 s later: one version of the minute – from before the change.
    await folder.edit([recordEdit(srel, (await folder.recordView(srel))!, { ...series, note: 'nowe' })!])
    tick(10_000)
    const cur = (await folder.recordView(srel))!
    await folder.edit([recordEdit(srel, cur, { ...cur, archived: true, until: YESTERDAY })!])
    const item = (await folder.removedItems()).items.find((x) => x.kind === 'series')!
    expect(item.removedAt).toBe(now())
    expect(item.value).toMatchObject({ note: 'nowe', archived: false, until: null, count: null })
  })

  it('historia nieczytelna w tej chwili: lista niepełna (`complete: false`), nie „nic nie usunięto”', async () => {
    const rel = paths.record('request', 't1')
    write(rel, { schema: 1, id: 't1', kind: 'task', title: 'Raport', state: 'queued', createdAt: 1 })
    let held = false
    const fs: DataFs = { ...nodeFs, read: (abs) => (held && slashed(abs).includes('/.history/') ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.read(abs)) }
    const { folder } = await make(fs)
    await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!])
    held = true
    const list = await folder.removedItems()
    expect(list.items).toEqual([])
    expect(list.complete).toBe(false)
    held = false
    expect((await folder.removedItems()).complete).toBe(true)
  })

  it('zapis dnia ponowiony przez kolejkę (folder chwilowo niedostępny) zostawia jedną notatkę usunięcia', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('a'), blk('b')] })
    let away = false
    const day = slashed(join(dataDir, paths.day(TOMORROW)))
    const fs: DataFs = { ...nodeFs, writeAtomic: (p, t) => (away && slashed(p) === day ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.writeAtomic(p, t)) }
    const { folder } = await make(fs)
    away = true
    const before = (await folder.recordView(paths.day(TOMORROW)))!
    const out = await folder.edit([recordEdit(paths.day(TOMORROW), before, takeBlock(dayRaw(before, TOMORROW), 'b'))!])
    expect(out[0]!.status).toBe('waiting')
    await folder.queue.apply(folder.records)
    away = false
    await folder.queue.apply(folder.records)
    expect(idsOf(read(paths.day(TOMORROW)))).toEqual(['a'])
    expect(readdirSync(join(dataDir, '.history', '.removed'))).toHaveLength(1)
  })
})

describe('Ostatnio usunięte (N24) – runda 2', () => {
  const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')
  const att = (id: string, owner: Record<string, unknown>) => {
    const v = { schema: 1, id, kind: 'link', name: id, link: { url: `https://example.com/${id}` }, owner, addedAt: 1, removedAt: null }
    write(paths.record('attachment', id), v)
    return v
  }
  /** An attachment removed (soft, D410) in an edit – `at` is the instant written into it (the window's). */
  const gone = async (folder: DataFolder, id: string, at: number) => {
    const rel = paths.record('attachment', id)
    const cur = (await folder.recordView(rel))!
    return recordEdit(rel, cur, { ...cur, removedAt: at })!
  }

  it('załączniki: dokładnie te zdjęte tym usunięciem bloku (też blok przeniesiony z innego dnia); osobno wcześniej usunięty zostaje w koszu', async () => {
    write(paths.day(TODAY), { schema: 1, date: TODAY, blocks: [], movedTo: { m: TOMORROW } })
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('b'), blk('m', { movedFrom: TODAY })] })
    att('a1', { scope: 'day', date: TOMORROW, blockId: 'b' })
    att('old', { scope: 'day', date: TOMORROW, blockId: 'b' })
    att('mv', { scope: 'day', date: TODAY, blockId: 'm' })
    const { folder, tick, now } = await make()
    await folder.edit([await gone(folder, 'old', now())])
    tick(5_000)
    const at = now() - 7
    const before = (await folder.recordView(paths.day(TOMORROW)))!
    const day = recordEdit(paths.day(TOMORROW), before, takeBlock(takeBlock(dayRaw(before, TOMORROW), 'b'), 'm'))!
    const out = await folder.edit([day, { ...(await gone(folder, 'a1', at)), after: [0] }, { ...(await gone(folder, 'mv', at)), after: [0] }])
    expect(out.map((o) => o.status)).toEqual(['applied', 'applied', 'applied'])
    const items = (await folder.removedItems()).items
    expect(blockOf(items, 'b')!.attachments).toEqual({ ids: ['a1'], removedAt: at })
    expect(blockOf(items, 'm')!.attachments).toEqual({ ids: ['mv'], removedAt: at })
  })

  it('załączniki szablonu: jego własne i bloków jego dni (także sesji) zdjęte tą samą edycją', async () => {
    const tpl = { schema: 1, id: 'tp', name: 'Sobota', dayType: 'weekend', weekdays: [6], versions: { '2026-01-01': { blocks: [blk('tb')] } }, archived: false }
    write(paths.record('template', 'tp'), tpl)
    att('t1', { scope: 'template', templateId: 'tp', blockId: 'tb' })
    att('s1', { scope: 'day', date: '2026-10-24', blockId: sessionBlockId('2026-10-24', 'ny') })
    att('t2', { scope: 'template', templateId: 'zz', blockId: 'tb' })
    const { folder, now } = await make()
    const at = now() - 3
    const rel = paths.record('template', 'tp')
    await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!, { ...(await gone(folder, 't1', at)), after: [0] }, { ...(await gone(folder, 's1', at)), after: [0] }])
    const item = (await folder.removedItems()).items.find((x) => x.kind === 'template')!
    expect(item.attachments!.removedAt).toBe(at)
    expect([...item.attachments!.ids].sort()).toEqual(['s1', 't1'])
  })

  it('seria bez pliku (np. „Cofnij” jej utworzenia) nie jest na liście', async () => {
    const srel = paths.record('series', 's2')
    write(srel, { schema: 1, id: 's2', root: 's2', start: TODAY, until: null, count: null, archived: false, versions: {} })
    const { folder } = await make()
    await folder.edit([recordEdit(srel, (await folder.recordView(srel))!, null)!])
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('chwila usunięcia rekordu to chwila Twojej edycji, nie zapisu przez kolejkę po powrocie folderu', async () => {
    const rel = paths.record('request', 't1')
    write(rel, { schema: 1, id: 't1', kind: 'task', title: 'Raport', state: 'queued', createdAt: 1 })
    let away = false
    const fs: DataFs = { ...nodeFs, remove: (p) => (away ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.remove(p)) }
    const { folder, tick, now } = await make(fs)
    away = true
    const removedAt = now()
    expect((await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!]))[0]!.status).toBe('waiting')
    tick(5 * 60_000)
    away = false
    await folder.queue.apply(folder.records)
    expect(existsSync(join(dataDir, rel))).toBe(false)
    expect((await folder.removedItems()).items.find((x) => x.kind === 'request')!.removedAt).toBe(removedAt)
  })

  it('cofnięte przeniesienie (blok wraca na dzień, z którego go przeniesiono) nie jest usunięciem na dniu docelowym', async () => {
    write(paths.day(TODAY), { schema: 1, date: TODAY, blocks: [], movedTo: { mv: TOMORROW } })
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('mv', { movedFrom: TODAY, moves: 1 })] })
    const { folder } = await make()
    const src = (await folder.recordView(paths.day(TODAY)))!
    const dst = (await folder.recordView(paths.day(TOMORROW)))!
    await folder.edit([recordEdit(paths.day(TODAY), src, setMovedTo(putRawBlock(dayRaw(src, TODAY), blk('mv')), 'mv', null))!, recordEdit(paths.day(TOMORROW), dst, takeBlock(dayRaw(dst, TOMORROW), 'mv'))!])
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('seria zmieniona i usunięta w tej samej minucie: koniec do przywrócenia – ten tuż sprzed usunięcia', async () => {
    const series = { schema: 1, id: 's1', root: 's1', start: TODAY, until: null, count: null, archived: false, versions: {} }
    const srel = paths.record('series', 's1')
    write(srel, series)
    const { folder, tick } = await make()
    await folder.edit([recordEdit(srel, (await folder.recordView(srel))!, { ...series, until: '2026-11-30' })!])
    tick(10_000)
    const cur = (await folder.recordView(srel))!
    await folder.edit([recordEdit(srel, cur, { ...cur, archived: true, until: YESTERDAY })!])
    expect((await folder.removedItems()).items.find((x) => x.kind === 'series')!.value).toMatchObject({ archived: false, until: '2026-11-30' })
  })

  it('nieczytelny folder historii innego rodzaju (np. dni) nie robi listy niepełnej – lista patrzy tylko na swoje rodzaje', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('a'), blk('b')] })
    let held = false
    const fs: DataFs = { ...nodeFs, list: (abs) => (held && slashed(abs).endsWith('/.history/day') ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.list(abs)) }
    const { folder } = await make(fs)
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'b'))
    held = true
    const list = await folder.removedItems()
    expect(list.complete).toBe(true)
    expect(list.items.map((x) => x.id)).toEqual(['b'])
  })

  it('godziny odwołanego bloku szablonu na dniu bez pliku – z dnia policzonego od nowa po zdjęciu odwołania (miejsce serii, D401)', async () => {
    write('templates/t.json', { schema: 1, id: 't', name: 'Zwykły', dayType: 'zwykly', weekdays: [], versions: { '2026-01-01': { blocks: [blk('tb', { name: 'Przegląd', startMin: 390, durationMin: 30 })] } }, archived: false })
    // A series on Thursdays at 06:30 – the template's block makes room for it (pushed after it) on that day.
    write(paths.record('series', 'sr'), { schema: 1, id: 'sr', root: 'sr', start: '2026-10-01', until: null, count: null, archived: false, versions: { '2026-10-01': { block: { categoryId: 'inne', startMin: 390, durationMin: 60, fixed: false, name: 'Fizjo' }, rule: { kind: 'weekly', every: 1, days: [4] } } } })
    const { folder } = await make()
    const id = templateBlockId(TOMORROW, 't', 'tb')
    await editDay(folder, TOMORROW, (raw) => setCancelled(raw, id, true))
    // Not at the template's 06:30 under the series: where the day without the cancel has it – after the series' end (07:30).
    const shown = blockOf((await folder.removedItems()).items, id)!.value as { startMin: number }
    expect(shown.startMin).toBeGreaterThanOrEqual(450)
  })
})

describe('Ostatnio usunięte (N24) – runda 3', () => {
  const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')
  const att = (id: string, owner: Record<string, unknown>, more: Record<string, unknown> = {}) => {
    const v = { schema: 1, id, kind: 'link', name: id, link: { url: `https://example.com/${id}` }, owner, addedAt: 1, removedAt: null, ...more }
    write(paths.record('attachment', id), v)
    return v
  }
  const gone = async (folder: DataFolder, id: string, at: number) => {
    const rel = paths.record('attachment', id)
    const cur = (await folder.recordView(rel))!
    return recordEdit(rel, cur, { ...cur, removedAt: at })!
  }
  const dayEdit = async (folder: DataFolder, date: string, fn: (raw: Record<string, unknown>) => Record<string, unknown>) => {
    const before = (await folder.recordView(paths.day(date))) ?? null
    return recordEdit(paths.day(date), before, fn(dayRaw(before, date)))!
  }
  const DAY3 = '2026-10-23'

  it('przeniesienie cofnięte, a potem blok przeniesiony gdzie indziej: stara notatka dnia docelowego nie wraca (blok nie stoi na dwóch dniach)', async () => {
    write(paths.day(TODAY), { schema: 1, date: TODAY, blocks: [], movedTo: { mv: TOMORROW } })
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('mv', { movedFrom: TODAY, moves: 1 })] })
    const { folder } = await make()
    // The move taken back: the block home again, out of the target.
    await folder.edit([await dayEdit(folder, TODAY, (raw) => setMovedTo(putRawBlock(raw, blk('mv')), 'mv', null)), await dayEdit(folder, TOMORROW, (raw) => takeBlock(raw, 'mv'))])
    // Then moved on to another day: it is there, not removed anywhere.
    await folder.edit([await dayEdit(folder, TODAY, (raw) => setMovedTo(takeBlock(raw, 'mv'), 'mv', DAY3)), await dayEdit(folder, DAY3, (raw) => putRawBlock(raw, blk('mv', { movedFrom: TODAY, moves: 1 })))])
    expect((await folder.removedItems()).items).toEqual([])
  })

  it('załączniki – po ich id zapisanych z usunięciem, nie po znaczniku pliku (`updatedAt` załącznika z przyszłości)', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('b')] })
    // Written last by a computer whose clock is ahead: the queue keeps its later stamp.
    att('a1', { scope: 'day', date: TOMORROW, blockId: 'b' }, { updatedAt: placeLogical(TOMORROW, 20 * 60) })
    const { folder, now } = await make()
    const at = now() - 5
    await folder.edit([await dayEdit(folder, TOMORROW, (raw) => takeBlock(raw, 'b')), { ...(await gone(folder, 'a1', at)), after: [0] }])
    expect(blockOf((await folder.removedItems()).items, 'b')!.attachments).toEqual({ ids: ['a1'], removedAt: at })
  })

  it('lista załączników nieczytelna: blok z załącznikami ma `attachmentsUnknown`, lista niepełna', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('b'), blk('c')] })
    att('a1', { scope: 'day', date: TOMORROW, blockId: 'b' })
    let held = false
    const fs: DataFs = { ...nodeFs, list: (abs) => (held && slashed(abs).endsWith('/attachments') ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.list(abs)) }
    const { folder, now } = await make(fs)
    await folder.edit([await dayEdit(folder, TOMORROW, (raw) => takeBlock(raw, 'b')), { ...(await gone(folder, 'a1', now())), after: [0] }])
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'c'))
    held = true
    const list = await folder.removedItems()
    expect(list.complete).toBe(false)
    expect(blockOf(list.items, 'b')).toMatchObject({ attachments: null, attachmentsUnknown: true })
    // One whose removal took none: nothing unknown about it.
    expect(blockOf(list.items, 'c')).toMatchObject({ attachments: null, attachmentsUnknown: false })
  })

  it('zmiana serii zdejmująca jej wystąpienia z dni (ta sama edycja) nie daje usuniętych bloków; odwołanie jednego wystąpienia – tak', async () => {
    const srel = paths.record('series', 's1')
    const series = { schema: 1, id: 's1', root: 's1', start: TODAY, until: null, count: null, archived: false, versions: {} }
    write(srel, series)
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('occ', { origin: 'series', sourceId: 's1', durationMin: 90 })] })
    write(paths.day(DAY3), { schema: 1, date: DAY3, blocks: [blk('occ4', { origin: 'series', sourceId: 's1' })] })
    const { folder } = await make()
    // „Usuń serię”: the record archived, its occurrences out of the days – one edit.
    const cur = (await folder.recordView(srel))!
    await folder.edit([recordEdit(srel, cur, { ...cur, archived: true, until: YESTERDAY })!, await dayEdit(folder, TOMORROW, (raw) => takeBlock(raw, 'occ')), await dayEdit(folder, DAY3, (raw) => ({ ...setCancelled(raw, 'occ3', true), seriesOff: { occ3: true } }))])
    expect((await folder.removedItems()).items.map((x) => x.kind)).toEqual(['series'])
    // A block taken out by itself (no change of the series in that edit): removed.
    await editDay(folder, DAY3, (raw) => takeBlock(raw, 'occ4'))
    expect((await folder.removedItems()).items.map((x) => `${x.kind}:${x.id}`).sort()).toEqual(['block:occ4', 'series:s1'])
  })

  it('seria zarchiwizowana przez starszą wersję (bez wersji „przed usunięciem”) po wcześniejszym usunięciu i przywróceniu: chwila z rekordu, koniec z najnowszej wersji sprzed archiwum', async () => {
    const srel = paths.record('series', 's1')
    const series = { schema: 1, id: 's1', root: 's1', start: TODAY, until: null, count: null, archived: false, versions: {} }
    write(srel, series)
    const { folder, tick, now } = await make()
    const put = async (fn: (v: Record<string, unknown>) => Record<string, unknown>) => {
      const cur = (await folder.recordView(srel))!
      await folder.edit([recordEdit(srel, cur, fn(cur))!])
    }
    await put((v) => ({ ...v, archived: true, until: YESTERDAY }))
    tick(61_000)
    await put((v) => ({ ...v, archived: false, until: null }))
    tick(61_000)
    await put((v) => ({ ...v, count: 5 }))
    tick(61_000)
    // Archived by an older version on another computer: the file only, no version kept for it.
    const archivedAt = now()
    write(srel, { ...read(srel), archived: true, until: YESTERDAY, updatedAt: archivedAt })
    const item = (await folder.removedItems()).items.find((x) => x.kind === 'series')!
    expect(item.removedAt).toBe(archivedAt)
    expect(item.value).toMatchObject({ archived: false, until: null })
  })

  it('nieczytelny dzień źródłowy przeniesionego bloku pomija tylko ten blok (lista niepełna)', async () => {
    // A day this run never read (one it read before is trusted as known – `cachedJson`).
    const SRC = '2026-10-25'
    write(paths.day(SRC), { schema: 1, date: SRC, blocks: [], movedTo: { mv: TOMORROW } })
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('mv', { movedFrom: SRC, moves: 1 }), blk('x')] })
    let held = true
    const src = slashed(join(dataDir, paths.day(SRC)))
    const busy = () => Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
    const fs: DataFs = { ...nodeFs, read: (abs) => (held && slashed(abs) === src ? busy() : nodeFs.read(abs)), stat: (abs) => (held && slashed(abs) === src ? busy() : nodeFs.stat(abs)) }
    const { folder } = await make(fs)
    await editDay(folder, TOMORROW, (raw) => takeBlock(takeBlock(raw, 'mv'), 'x'))
    const list = await folder.removedItems()
    expect(list.complete).toBe(false)
    expect(list.items.map((x) => x.id)).toEqual(['x'])
    held = false
    expect((await folder.removedItems()).items.map((x) => x.id).sort()).toEqual(['mv', 'x'])
  })

  it('seria z częściami: dzienne załączniki innej części (zdjęte osobno) nie wracają z tą', async () => {
    const srel = paths.record('series', 's1')
    write(srel, { schema: 1, id: 's1', root: 'r', start: TODAY, until: null, count: null, archived: false, versions: {} })
    att('own', { scope: 'series', root: 'r' })
    att('d1', { scope: 'day', date: TOMORROW, blockId: 'occ1' })
    att('other', { scope: 'day', date: DAY3, blockId: 'occ2' })
    const { folder, tick, now } = await make()
    await folder.edit([await gone(folder, 'other', now())])
    tick(1)
    const at = now()
    const cur = (await folder.recordView(srel))!
    await folder.edit([recordEdit(srel, cur, { ...cur, archived: true, until: YESTERDAY })!, { ...(await gone(folder, 'own', at)), after: [0] }, { ...(await gone(folder, 'd1', at)), after: [0] }])
    const item = (await folder.removedItems()).items.find((x) => x.kind === 'series')!
    expect([...item.attachments!.ids].sort()).toEqual(['d1', 'own'])
  })

  it('blok zakotwiczony: godzina, od której stanie po przywróceniu (`startMin`)', async () => {
    write(paths.day(TOMORROW), { schema: 1, date: TOMORROW, blocks: [blk('a'), blk('f', { startMin: null, anchor: 'a', durationMin: 30 })] })
    const { folder } = await make()
    await editDay(folder, TOMORROW, (raw) => takeBlock(raw, 'f'))
    expect(blockOf((await folder.removedItems()).items, 'f')).toMatchObject({ startMin: 660, anchorGone: false })
  })

  it('rekord, którego usunięcie czeka w kolejce (plik jeszcze jest), nie jest na liście – także z wcześniejszym usunięciem w historii', async () => {
    const rel = paths.record('request', 't1')
    const task = { schema: 1, id: 't1', kind: 'task', title: 'Raport', state: 'queued', createdAt: 1 }
    write(rel, task)
    let away = false
    const fs: DataFs = { ...nodeFs, remove: (p) => (away ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.remove(p)) }
    const { folder, tick } = await make(fs)
    await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!])
    tick(1_000)
    // Made again, then removed while the folder holds the file: the removal waits.
    await folder.edit([recordEdit(rel, null, task)!])
    away = true
    expect((await folder.edit([recordEdit(rel, (await folder.recordView(rel))!, null)!]))[0]!.status).toBe('waiting')
    expect((await folder.removedItems()).items).toEqual([])
  })
})
