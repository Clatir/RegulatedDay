/**
 * Drzewo kategorii w folderze danych na dwóch komputerach (D510, T1390): „Cofnij” usunięcia grupy domyślnej idzie kolejką pole po polu –
 * wpis listy `categoryGroups`, który ta zmiana założyła, znika tylko wtedy, gdy nic poza jej polami w nim nie zostało; pole dopisane w
 * tym czasie na drugim komputerze (nowa nazwa) zostaje, a o wpis kolejka pyta.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { editStands, inverseEdit, recordEdit } from '@shared/data/merge'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { OTHER_GROUP, groupOfCategory, removeGroupRaw, updateGroupRaw } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-11-14'
const IDS = Object.keys(DEFAULT_SETTINGS.categories)
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-tree-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1 }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A computer on the shared folder (its own state – queue, journal). */
async function computer(id: string) {
  const now = placeLogical(DAY, 10 * 60)
  return DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, `state-${id}`),
    computer: id,
    computerName: id.toUpperCase(),
    appVersion: '1.25.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
}
const file = () => JSON.parse(readFileSync(join(dataDir, paths.settings), 'utf8')) as Record<string, unknown>
const settingsOf = async (f: DataFolder) => (await f.recordView(paths.settings)) ?? { schema: 1 }

describe('„Cofnij” usunięcia grupy na dwóch komputerach (T1390)', () => {
  it('B zmienił nazwę usuniętej grupy: po „Cofnij” A nazwa B zostaje, grupa wraca z archiwum, o wpis jest pytanie', async () => {
    const a = await computer('pca')
    const b = await computer('pcb')
    // A removes „Praca” (a default group: its first entry is written, the id first).
    const seen = await settingsOf(a)
    const removal = recordEdit(paths.settings, seen, removeGroupRaw({ ...seen }, 'g-praca', { to: OTHER_GROUP }, IDS))!
    expect((await a.edit([removal])).map((o) => o.status)).toEqual(['applied'])
    // B sees the removal and renames the group (shown in its archive).
    const onB = await settingsOf(b)
    expect(rdFrom(onB).categoryGroups.find((g) => g.id === 'g-praca')!.archived).toBe(true)
    expect((await b.edit([recordEdit(paths.settings, onB, updateGroupRaw({ ...onB }, 'g-praca', { name: 'Job' }))!])).map((o) => o.status)).toEqual(['applied'])
    // A clicks „Cofnij”: its fields still hold, the edit is turned over.
    const now = file()
    expect(editStands(removal, now, null)).toBe(true)
    const out = await a.edit([inverseEdit(removal, now, null)!])
    expect(out.map((o) => o.status)).toEqual(['conflict'])
    // B's name is never lost quietly: the entry stays with it, out of the archive; the subcategories are back.
    expect(file().categoryGroups).toEqual([{ id: 'g-praca', name: 'Job' }])
    const rd = rdFrom(file())
    expect(rd.categoryGroups.find((g) => g.id === 'g-praca')).toMatchObject({ name: 'Job', archived: false })
    expect(groupOfCategory(rd, 'analiza')).toBe('g-praca')
    const [q] = a.queue.questions()
    expect(q!.outcome.status === 'conflict' && q!.outcome.fields.map((f) => f.path)).toEqual([['categoryGroups', '#g-praca']])
    // „Their” answer keeps B's name.
    await a.queue.resolve(q!.edit.id, 'theirs')
    await a.queue.apply(a.records)
    expect(file().categoryGroups).toEqual([{ id: 'g-praca', name: 'Job' }])
    expect(a.queue.questions()).toHaveLength(0)
  })

  it('bez zmiany na drugim komputerze „Cofnij” zdejmuje cały wpis – bez pytania, plik jak przed usunięciem', async () => {
    const a = await computer('pca')
    const seen = await settingsOf(a)
    const removal = recordEdit(paths.settings, seen, removeGroupRaw({ ...seen }, 'g-praca', { to: OTHER_GROUP }, IDS))!
    await a.edit([removal])
    const now = file()
    expect((await a.edit([inverseEdit(removal, now, null)!])).map((o) => o.status)).toEqual(['applied'])
    expect(file().categoryGroups).toEqual([])
    expect(groupOfCategory(rdFrom(file()), 'analiza')).toBe('g-praca')
  })
})
