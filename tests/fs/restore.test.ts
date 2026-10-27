/**
 * Restoring a backup (spec „Przywracanie w aplikacji: wybrane rekordy albo cały folder do nowego folderu”, T117): the
 * records a backup holds, chosen ones taken back as edits (the history keeps what was before), the whole backup into a
 * new folder only – the old one gets the marker „przeniesiono do …”, this computer works in the new one.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { newRequest } from '@shared/model/requests'
import { createDailyBackup, listBackups } from '../../src/main/data/backup'
import { DataHub, MOVED_FILE } from '../../src/main/data/hub'
import { writeZipFile } from '../../src/main/data/zip'

let root: string
let dirA: string
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-restore-'))
  dirA = join(root, 'a')
  await DataHub.createFirst(dirA, [{ rel: 'requests/r1.json', value: newRequest('r1', 0, { person: null, estimateMin: null, note: 'stara' }) }, { rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function hubFor(folders: string[] = []) {
  return new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '0.7.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined,
    onFolder: (dir) => folders.push(dir)
  })
}

async function backupOfA(): Promise<string> {
  const r = await createDailyBackup(dirA, join(dirA, 'backups'), '2026-10-27')
  expect(r.ok).toBe(true)
  return (await listBackups(join(dirA, 'backups')))[0]!.path
}

const note = async (hub: DataHub) => ((await hub.service!.folder.recordView('requests/r1.json')) as { note: string }).note

describe('przywracanie kopii – przypadki z przeglądu', () => {
  it('po przywróceniu całego folderu numery zdarzeń tego komputera idą dalej (nie od zera – identyfikatory się nie powtarzają)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      for (let i = 0; i < 5; i++) hub.service!.folder.append({ day: '2026-10-27', dom: 'meta', k: 'observe.alive', at: Date.now() })
      await hub.service!.folder.log.flush()
      const before = hub.service!.folder.clock.last.n
      const zip = await backupOfA()
      expect(await hub.restoreWhole(zip, join(root, 'c'))).toBe(true)
      expect(hub.service!.folder.clock.last.n).toBeGreaterThan(before)
    } finally {
      await hub.close('quit')
    }
  })

  it('nowy folder nie otworzył się od razu: znacznik w starym i zapis w ustawieniach dopiero po jego otwarciu', async () => {
    const folders: string[] = []
    let failFirst = true
    const hub = new DataHub({
      ...(hubFor(folders) as unknown as { o: ConstructorParameters<typeof DataHub>[0] }).o,
      start: async (o) => {
        if (failFirst && o.dataDir.endsWith('c')) {
          failFirst = false
          throw new Error('OneDrive jeszcze nie gotowy')
        }
        return (await import('../../src/main/data/service')).DataService.start(o)
      }
    })
    const target = join(root, 'c')
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      expect(await hub.restoreWhole(zip, target, 7)).toBe(false)
      expect(existsSync(join(dirA, MOVED_FILE))).toBe(false)
      expect(folders).toEqual([])
      expect(await hub.open(resolve(target))).toBe(true)
      expect(folders).toEqual([resolve(target)])
      expect(JSON.parse(readFileSync(join(dirA, MOVED_FILE), 'utf8'))).toMatchObject({ to: resolve(target), at: 7 })
    } finally {
      await hub.close('quit')
    }
  })

  it('kopia z nazwami wpisów „./…” – rekordy z listy dają się przywrócić', async () => {
    const zip = join(root, 'odd.zip')
    const bytes = Buffer.from(JSON.stringify(newRequest('r1', 0, { person: null, estimateMin: null, note: 'z kopii' })))
    await writeZipFile(zip, [{ name: './requests/r1.json', read: () => ({ data: bytes, mtime: new Date() }) }])
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      expect(await hub.backupRecords(zip)).toEqual(['requests/r1.json'])
      await hub.restoreRecords(zip, ['requests/r1.json'])
      expect(await note(hub)).toBe('z kopii')
    } finally {
      await hub.close('quit')
    }
  })
})

describe('przywracanie kopii', () => {
  it('wybrane rekordy wracają jako Twoja zmiana; rekordu spoza kopii nie ma', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      expect((await hub.backups()).map((b) => b.path)).toEqual([zip])
      expect(await hub.backupRecords(zip)).toEqual(expect.arrayContaining(['rd.json', 'requests/r1.json']))
      await hub.edit([{ rel: 'requests/r1.json', edits: [{ path: ['note'], base: 'stara', value: 'nowa' }] }])
      expect(await note(hub)).toBe('nowa')
      await hub.restoreRecords(zip, ['requests/r1.json'])
      expect(await note(hub)).toBe('stara')
      await expect(hub.restoreRecords(zip, ['requests/r9.json'])).rejects.toThrow('w kopii nie ma rekordu')
    } finally {
      await hub.close('quit')
    }
  })

  it('cały folder do nowego: w starym znacznik „przeniesiono do …”, ten komputer pracuje w nowym; folder z czymkolwiek – odmowa', async () => {
    const folders: string[] = []
    const hub = hubFor(folders)
    const target = join(root, 'c')
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      // A folder with anything in it is never written over.
      const busy = join(root, 'busy')
      mkdirSync(busy)
      writeFileSync(join(busy, 'x.txt'), 'x')
      await expect(hub.restoreWhole(zip, busy)).rejects.toThrow('nie jest pusty')
      expect(existsSync(join(dirA, MOVED_FILE))).toBe(false)
      expect(await hub.restoreWhole(zip, target, 123)).toBe(true)
      expect(hub.folder).toBe(resolve(target))
      expect(folders).toEqual([resolve(target)])
      expect(existsSync(join(target, 'requests', 'r1.json'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dirA, MOVED_FILE), 'utf8'))).toEqual({ to: resolve(target), at: 123, by: 'pca' })
      expect(await hub.movedTo()).toBeNull()
    } finally {
      await hub.close('quit')
    }
    // Another computer still in the old folder sees where it went.
    const other = hubFor()
    try {
      expect(await other.open(dirA)).toBe(true)
      expect(await other.movedTo()).toEqual({ to: resolve(target), at: 123, by: 'pca' })
    } finally {
      await other.close('quit')
    }
  })
})
